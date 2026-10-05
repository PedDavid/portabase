import {NextResponse} from "next/server";
import {and, eq, isNull} from "drizzle-orm";
import {db} from "@/db";
import * as drizzleDb from "@/db";
import {withApiKey} from "@/lib/api-v1/middleware";
import {logger} from "@/lib/logger";
import {ApiKeyContext} from "@/lib/api-v1/types";
import {parseJsonBody} from "@/lib/api-v1/validation/json-body";
import {requireDatabaseAccess} from "@/lib/api-v1/services/databases";
import {requireProjectAccess} from "@/lib/api-v1/services/projects";
import {requireOrg} from "@/lib/api-v1/services/organizations";
import {
    AlertPoliciesSchema,
    RetentionPolicySchema,
    SELECTABLE_EVENT_KINDS,
    StoragePoliciesSchema,
} from "@/lib/api-v1/validation/policies";
import {backupScheduleInput} from "@/lib/api-v1/validation/cron";
import {z} from "zod";
import {PolicyScope} from "@/features/database/schemas/policy-scope.schema";
import {backupOnly, EVENT_KIND_BACKUP_ONLY_OPTIONS} from "@/features/database/schemas/channels-policy.schema";
import {
    listAlertPolicies,
    listStoragePolicies,
    replaceAlertPolicies,
    replaceStoragePolicies,
} from "@/features/database/services/channels-policy.service";
import {getRetentionPolicy, upsertRetentionPolicyService} from "@/features/database/services/retention-policy.service";
import {updateBackupPolicyService} from "@/features/database/actions/cron.action";
import {getOrganizationStorageChannels} from "@/db/services/storage-channel";
import {getOrganizationChannels} from "@/db/services/notification-channel";

export type PolicyOwnerType = PolicyScope["type"];

type ResolvedScope = {
    scope: PolicyScope;
    organizationId: string;
    dbms: string | null;
    hasBackupPolicy: boolean;
};

type GuardResult<T> =
    | { ok: true; data: T }
    | { ok: false; response: NextResponse };

function jsonError(message: string, status: number) {
    return NextResponse.json({error: message}, {status});
}

/**
 * Resolves and authorizes the policy owner. Databases use the same guard as the other
 * database routes; projects require an owner/admin of the project's organization, like
 * the dashboard which hides policy controls from plain members.
 */
async function resolveScope(
    ctx: ApiKeyContext,
    type: PolicyOwnerType,
    params: Record<string, string> | undefined
): Promise<GuardResult<ResolvedScope>> {
    if (type === "database") {
        const guard = await requireDatabaseAccess(params, ctx.user);
        if (!guard.ok) return guard;

        const database = await db.query.database.findFirst({
            where: and(
                eq(drizzleDb.schemas.database.id, guard.data.id),
                isNull(drizzleDb.schemas.database.deletedAt)
            ),
            columns: {id: true, dbms: true, backupPolicy: true},
            with: {project: {columns: {organizationId: true}}},
        });
        if (!database?.project) return {ok: false, response: jsonError("Not found", 404)};

        return {
            ok: true,
            data: {
                scope: {type: "database", id: database.id},
                organizationId: database.project.organizationId,
                dbms: database.dbms,
                hasBackupPolicy: database.backupPolicy !== null,
            },
        };
    }

    const guard = await requireProjectAccess(ctx, params?.id);
    if (!guard.ok) return guard;
    const project = guard.data.project;
    if (project.isArchived) return {ok: false, response: jsonError("Not found", 404)};

    const org = await requireOrg(ctx, project.organizationId, "canManageSettings");
    if (!org.ok) return org;

    return {
        ok: true,
        data: {
            scope: {type: "project", id: project.id},
            organizationId: project.organizationId,
            dbms: null,
            hasBackupPolicy: project.backupPolicy !== null,
        },
    };
}

/** Channels the dashboard lets you pick for this organization: its own and system channels, enabled only. */
async function selectableChannelIds(kind: "storage" | "notification", organizationId: string) {
    const channels = kind === "storage"
        ? await getOrganizationStorageChannels(organizationId)
        : await getOrganizationChannels(organizationId);
    return channels.filter((c) => c.enabled).map((c) => c.id);
}

function unavailableChannelsError(ids: string[]) {
    return jsonError(
        `Channel(s) not available to this organization or disabled: ${ids.join(", ")}`,
        422
    );
}

export function storagePolicyHandlers(type: PolicyOwnerType) {
    const path = `/api/v1/${type}s/[id]/storage-policies`;
    const log = logger.child({module: path});

    const GET = withApiKey(async (_req: Request, ctx: ApiKeyContext, params?: Record<string, string>) => {
        try {
            const resolved = await resolveScope(ctx, type, params);
            if (!resolved.ok) return resolved.response;
            return NextResponse.json({data: await listStoragePolicies(resolved.data.scope)});
        } catch (error) {
            log.error({error}, `Error in GET ${path}`);
            return jsonError("Internal server error", 500);
        }
    });

    const PUT = withApiKey(async (req: Request, ctx: ApiKeyContext, params?: Record<string, string>) => {
        try {
            const resolved = await resolveScope(ctx, type, params);
            if (!resolved.ok) return resolved.response;

            const body = await parseJsonBody(req, StoragePoliciesSchema);
            if (!body.ok) return body.response;

            const selectable = await selectableChannelIds("storage", resolved.data.organizationId);
            const unavailable = body.data.policies.filter((p) => !selectable.includes(p.channelId));
            if (unavailable.length > 0) return unavailableChannelsError(unavailable.map((p) => p.channelId));

            const policies = await replaceStoragePolicies(resolved.data.scope, selectable, body.data.policies);
            return NextResponse.json({data: policies});
        } catch (error) {
            log.error({error}, `Error in PUT ${path}`);
            return jsonError("Internal server error", 500);
        }
    });

    return {GET, PUT};
}

export function alertPolicyHandlers(type: PolicyOwnerType) {
    const path = `/api/v1/${type}s/[id]/alert-policies`;
    const log = logger.child({module: path});

    const GET = withApiKey(async (_req: Request, ctx: ApiKeyContext, params?: Record<string, string>) => {
        try {
            const resolved = await resolveScope(ctx, type, params);
            if (!resolved.ok) return resolved.response;
            return NextResponse.json({data: await listAlertPolicies(resolved.data.scope)});
        } catch (error) {
            log.error({error}, `Error in GET ${path}`);
            return jsonError("Internal server error", 500);
        }
    });

    const PUT = withApiKey(async (req: Request, ctx: ApiKeyContext, params?: Record<string, string>) => {
        try {
            const resolved = await resolveScope(ctx, type, params);
            if (!resolved.ok) return resolved.response;

            const body = await parseJsonBody(req, AlertPoliciesSchema);
            if (!body.ok) return body.response;

            const {dbms} = resolved.data;
            const allowedKinds: string[] = dbms && backupOnly.includes(dbms)
                ? EVENT_KIND_BACKUP_ONLY_OPTIONS.map((o) => o.value)
                : SELECTABLE_EVENT_KINDS;
            const invalidKinds = [...new Set(body.data.policies.flatMap((p) => p.eventKinds))]
                .filter((k) => !allowedKinds.includes(k));
            if (invalidKinds.length > 0) {
                return jsonError(
                    `Event kind(s) not supported here: ${invalidKinds.join(", ")}. Allowed: ${allowedKinds.join(", ")}`,
                    422
                );
            }

            const selectable = await selectableChannelIds("notification", resolved.data.organizationId);
            const unavailable = body.data.policies.filter((p) => !selectable.includes(p.channelId));
            if (unavailable.length > 0) return unavailableChannelsError(unavailable.map((p) => p.channelId));

            const policies = await replaceAlertPolicies(
                resolved.data.scope,
                selectable,
                body.data.policies.map((p) => ({...p, eventKinds: [...new Set(p.eventKinds)]}))
            );
            return NextResponse.json({data: policies});
        } catch (error) {
            log.error({error}, `Error in PUT ${path}`);
            return jsonError("Internal server error", 500);
        }
    });

    return {GET, PUT};
}

export function retentionPolicyHandlers(type: PolicyOwnerType) {
    const path = `/api/v1/${type}s/[id]/retention-policy`;
    const log = logger.child({module: path});

    const GET = withApiKey(async (_req: Request, ctx: ApiKeyContext, params?: Record<string, string>) => {
        try {
            const resolved = await resolveScope(ctx, type, params);
            if (!resolved.ok) return resolved.response;
            return NextResponse.json({data: await getRetentionPolicy(resolved.data.scope)});
        } catch (error) {
            log.error({error}, `Error in GET ${path}`);
            return jsonError("Internal server error", 500);
        }
    });

    const PUT = withApiKey(async (req: Request, ctx: ApiKeyContext, params?: Record<string, string>) => {
        try {
            const resolved = await resolveScope(ctx, type, params);
            if (!resolved.ok) return resolved.response;

            const body = await parseJsonBody(req, RetentionPolicySchema);
            if (!body.ok) return body.response;

            if (!resolved.data.hasBackupPolicy) {
                return jsonError(`Set a backup schedule on this ${type} before configuring retention`, 422);
            }

            const policy = await upsertRetentionPolicyService(resolved.data.scope, body.data);
            return NextResponse.json({data: policy});
        } catch (error) {
            log.error({error}, `Error in PUT ${path}`);
            return jsonError("Internal server error", 500);
        }
    });

    return {GET, PUT};
}

const BackupPolicySchema = z.object({
    schedule: backupScheduleInput,
});

/** PUT /projects/{id}/backup-policy, the project counterpart of the database route. */
export function projectBackupPolicyHandler() {
    const log = logger.child({module: "api/v1/projects/[id]/backup-policy"});

    return withApiKey(async (req: Request, ctx: ApiKeyContext, params?: Record<string, string>) => {
        try {
            const resolved = await resolveScope(ctx, "project", params);
            if (!resolved.ok) return resolved.response;

            const body = await parseJsonBody(req, BackupPolicySchema);
            if (!body.ok) return body.response;

            const updated = await updateBackupPolicyService(resolved.data.scope, body.data.schedule);
            return NextResponse.json({data: updated});
        } catch (error) {
            log.error({error}, "Error in PUT backup-policy");
            return jsonError("Internal server error", 500);
        }
    });
}
