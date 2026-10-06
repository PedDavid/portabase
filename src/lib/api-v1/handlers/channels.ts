import {NextResponse} from "next/server";
import {z} from "zod";
import {and, desc, eq, inArray, isNull, or} from "drizzle-orm";
import {db} from "@/db";
import * as drizzleDb from "@/db";
import {withApiKey} from "@/lib/api-v1/middleware";
import {logger} from "@/lib/logger";
import {ApiKeyContext} from "@/lib/api-v1/types";
import {parseJsonBody} from "@/lib/api-v1/validation/json-body";
import {requireOrg} from "@/lib/api-v1/services/organizations";
import {
    CreateNotificationChannelSchema,
    CreateStorageChannelSchema,
    UpdateChannelSchema,
} from "@/lib/api-v1/validation/channels";
import {
    NotificationChannelFormSchema,
    NotificationChannelFormType,
    StorageChannelFormSchema,
    StorageChannelFormType,
} from "@/features/channel/schemas/channel-form.schema";
import {
    createNotificationChannelService,
    createStorageChannelService,
    deleteNotificationChannelService,
    deleteStorageChannelService,
    setNotificationChannelOrganizationsService,
    setStorageChannelOrganizationsService,
    updateNotificationChannelService,
    updateStorageChannelService,
} from "@/features/channel/services/channel.service";
import {StorageChannelWith} from "@/db/schema/12_storage-channel";
import {NotificationChannelWith} from "@/db/schema/09_notification-channel";
import {dispatchStorage} from "@/features/storages/utils/storages.dispatch";
import {dispatchNotification} from "@/features/notifications/utils/notifications.dispatch";

export type ChannelKind = "storage" | "notification";

type ChannelWith = StorageChannelWith | NotificationChannelWith;

type GuardResult<T> =
    | { ok: true; data: T }
    | { ok: false; response: NextResponse };

const KIND = {
    storage: {capability: "canManageStorages"},
    notification: {capability: "canManageNotifications"},
} as const;

function jsonError(message: string, status: number) {
    return NextResponse.json({error: message}, {status});
}

function isSystemAdmin(ctx: ApiKeyContext) {
    return ctx.user.permissions.isAdmin || ctx.user.permissions.isSuperAdmin;
}

function isLocalStorage(kind: ChannelKind, channel: { provider: string }) {
    return kind === "storage" && channel.provider === "local";
}

/** API representation of a channel. `config` is never returned: it holds provider credentials. */
export function toApiChannel(channel: ChannelWith) {
    const {config: _config, organizations, ...rest} = channel;
    return {
        ...rest,
        organizationIds: organizations.map((o) => o.organizationId),
    };
}

async function findChannel(kind: ChannelKind, id: string): Promise<ChannelWith | undefined> {
    if (kind === "storage") {
        return (await db.query.storageChannel.findFirst({
            where: eq(drizzleDb.schemas.storageChannel.id, id),
            with: {organizations: true},
        })) as StorageChannelWith | undefined;
    }
    return (await db.query.notificationChannel.findFirst({
        where: eq(drizzleDb.schemas.notificationChannel.id, id),
        with: {organizations: true},
    })) as NotificationChannelWith | undefined;
}

/**
 * Channels the caller may manage, mirroring the dashboard: system channels (no owning
 * organization) for system admins, organization channels for that organization's owners/admins.
 */
async function listManageableChannels(ctx: ApiKeyContext, kind: ChannelKind): Promise<ChannelWith[]> {
    const capability = KIND[kind].capability;
    const memberOrgIds = ctx.organizations.filter((o) => o.permissions[capability]).map((o) => o.id);
    const orgIds = memberOrgIds.length === 0
        ? []
        : (await db.query.organization.findMany({
            where: and(
                inArray(drizzleDb.schemas.organization.id, memberOrgIds),
                isNull(drizzleDb.schemas.organization.deletedAt)
            ),
            columns: {id: true},
        })).map((o) => o.id);

    const table = kind === "storage" ? drizzleDb.schemas.storageChannel : drizzleDb.schemas.notificationChannel;
    const conditions = [
        ...(isSystemAdmin(ctx) ? [isNull(table.organizationId)] : []),
        ...(orgIds.length > 0 ? [inArray(table.organizationId, orgIds)] : []),
    ];
    if (conditions.length === 0) return [];

    if (kind === "storage") {
        return (await db.query.storageChannel.findMany({
            where: or(...conditions),
            with: {organizations: true},
            orderBy: desc(drizzleDb.schemas.storageChannel.createdAt),
        })) as StorageChannelWith[];
    }
    return (await db.query.notificationChannel.findMany({
        where: or(...conditions),
        with: {organizations: true},
        orderBy: desc(drizzleDb.schemas.notificationChannel.createdAt),
    })) as NotificationChannelWith[];
}

async function requireChannel(
    ctx: ApiKeyContext,
    kind: ChannelKind,
    id: string | undefined
): Promise<GuardResult<ChannelWith>> {
    if (!id || !z.uuid().safeParse(id).success) return {ok: false, response: jsonError("Not found", 404)};

    const channel = await findChannel(kind, id);
    if (!channel) return {ok: false, response: jsonError("Not found", 404)};

    if (channel.organizationId === null) {
        if (!isSystemAdmin(ctx)) {
            return {ok: false, response: jsonError("Only administrators can manage system channels", 403)};
        }
    } else {
        const org = await requireOrg(ctx, channel.organizationId, KIND[kind].capability);
        if (!org.ok) return org;
    }

    return {ok: true, data: channel};
}

/** Returns a 422 response when any id is not an active organization. */
async function checkOrganizationIds(ids: string[]): Promise<NextResponse | null> {
    if (new Set(ids).size !== ids.length) return jsonError("organizationIds must not contain duplicates", 422);
    if (ids.length === 0) return null;

    const found = await db.query.organization.findMany({
        where: and(
            inArray(drizzleDb.schemas.organization.id, ids),
            isNull(drizzleDb.schemas.organization.deletedAt)
        ),
        columns: {id: true},
    });
    const missing = ids.filter((id) => !found.some((o) => o.id === id));
    return missing.length > 0 ? jsonError(`Unknown organization(s): ${missing.join(", ")}`, 422) : null;
}

async function reloadApiChannel(kind: ChannelKind, id: string) {
    const channel = await findChannel(kind, id);
    return channel ? toApiChannel(channel) : null;
}

export function channelCollectionHandlers(kind: ChannelKind) {
    const log = logger.child({module: `api/v1/${kind}-channels`});

    const GET = withApiKey(async (_req: Request, ctx: ApiKeyContext) => {
        try {
            const channels = await listManageableChannels(ctx, kind);
            return NextResponse.json({data: channels.map(toApiChannel)});
        } catch (error) {
            log.error({error}, `Error in GET /api/v1/${kind}-channels`);
            return jsonError("Internal server error", 500);
        }
    });

    const POST = withApiKey(async (req: Request, ctx: ApiKeyContext) => {
        try {
            const body = kind === "storage"
                ? await parseJsonBody(req, CreateStorageChannelSchema)
                : await parseJsonBody(req, CreateNotificationChannelSchema);
            if (!body.ok) return body.response;

            const {organizationId, organizationIds, ...data} = body.data;

            if (isLocalStorage(kind, data)) {
                return jsonError("The local storage channel is managed by Portabase and cannot be created", 422);
            }

            if (organizationId) {
                if (organizationIds !== undefined) {
                    return jsonError("organizationIds only applies to system channels", 422);
                }
                const org = await requireOrg(ctx, organizationId, KIND[kind].capability);
                if (!org.ok) return org.response;
            } else {
                if (!isSystemAdmin(ctx)) {
                    return jsonError("Only administrators can manage system channels", 403);
                }
                const invalid = await checkOrganizationIds(organizationIds ?? []);
                if (invalid) return invalid;
            }

            const created = kind === "storage"
                ? await createStorageChannelService(data as StorageChannelFormType, organizationId ?? null, organizationIds)
                : await createNotificationChannelService(data as NotificationChannelFormType, organizationId ?? null, organizationIds);

            return NextResponse.json({data: await reloadApiChannel(kind, created.id)}, {status: 201});
        } catch (error) {
            log.error({error}, `Error in POST /api/v1/${kind}-channels`);
            return jsonError("Internal server error", 500);
        }
    });

    return {GET, POST};
}

export function channelItemHandlers(kind: ChannelKind) {
    const log = logger.child({module: `api/v1/${kind}-channels/[id]`});

    const GET = withApiKey(async (_req: Request, ctx: ApiKeyContext, params?: Record<string, string>) => {
        try {
            const guard = await requireChannel(ctx, kind, params?.id);
            if (!guard.ok) return guard.response;
            return NextResponse.json({data: toApiChannel(guard.data)});
        } catch (error) {
            log.error({error}, `Error in GET /api/v1/${kind}-channels/[id]`);
            return jsonError("Internal server error", 500);
        }
    });

    const PATCH = withApiKey(async (req: Request, ctx: ApiKeyContext, params?: Record<string, string>) => {
        try {
            const guard = await requireChannel(ctx, kind, params?.id);
            if (!guard.ok) return guard.response;
            const channel = guard.data;

            const body = await parseJsonBody(req, UpdateChannelSchema);
            if (!body.ok) return body.response;
            const {organizationIds, ...changes} = body.data;
            const hasChanges = changes.name !== undefined || changes.enabled !== undefined || changes.config !== undefined;

            if (hasChanges && isLocalStorage(kind, channel)) {
                return jsonError("Only organization sharing can be changed on the local storage channel", 422);
            }

            if (organizationIds !== undefined) {
                if (channel.organizationId !== null) {
                    return jsonError("organizationIds only applies to system channels", 422);
                }
                const invalid = await checkOrganizationIds(organizationIds);
                if (invalid) return invalid;
            }

            if (hasChanges) {
                const candidate = {
                    provider: channel.provider,
                    name: changes.name ?? channel.name,
                    enabled: changes.enabled ?? channel.enabled,
                    config: changes.config ?? channel.config,
                };

                if (changes.config !== undefined) {
                    const parsed = (kind === "storage" ? StorageChannelFormSchema : NotificationChannelFormSchema)
                        .safeParse(candidate);
                    if (!parsed.success) {
                        const issue = parsed.error.issues[0];
                        return jsonError(
                            issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid config",
                            422
                        );
                    }
                    candidate.config = parsed.data.config;
                }

                if (kind === "storage") {
                    await updateStorageChannelService(channel.id, candidate as StorageChannelFormType);
                } else {
                    await updateNotificationChannelService(channel.id, candidate as NotificationChannelFormType);
                }
            }

            if (organizationIds !== undefined) {
                if (kind === "storage") {
                    await setStorageChannelOrganizationsService(channel.id, organizationIds);
                } else {
                    await setNotificationChannelOrganizationsService(channel.id, organizationIds);
                }
            }

            return NextResponse.json({data: await reloadApiChannel(kind, channel.id)});
        } catch (error) {
            log.error({error}, `Error in PATCH /api/v1/${kind}-channels/[id]`);
            return jsonError("Internal server error", 500);
        }
    });

    const DELETE = withApiKey(async (_req: Request, ctx: ApiKeyContext, params?: Record<string, string>) => {
        try {
            const guard = await requireChannel(ctx, kind, params?.id);
            if (!guard.ok) return guard.response;
            const channel = guard.data;

            if (isLocalStorage(kind, channel)) {
                return jsonError("The local storage channel is managed by Portabase and cannot be deleted", 422);
            }

            if (kind === "storage") {
                await deleteStorageChannelService(channel.id, channel.organizationId ?? undefined);
            } else {
                await deleteNotificationChannelService(channel.id, channel.organizationId ?? undefined);
            }

            return NextResponse.json({data: toApiChannel(channel)});
        } catch (error) {
            log.error({error}, `Error in DELETE /api/v1/${kind}-channels/[id]`);
            return jsonError("Internal server error", 500);
        }
    });

    return {GET, PATCH, DELETE};
}

export function channelTestHandler(kind: ChannelKind) {
    const log = logger.child({module: `api/v1/${kind}-channels/[id]/test`});

    return withApiKey(async (_req: Request, ctx: ApiKeyContext, params?: Record<string, string>) => {
        try {
            const guard = await requireChannel(ctx, kind, params?.id);
            if (!guard.ok) return guard.response;
            const channel = guard.data;

            // Same calls as the dashboard's test button: the channel is passed inline, so no
            // notification log entry is written.
            const result = kind === "storage"
                ? await dispatchStorage({action: "ping"}, undefined, undefined, channel as unknown as StorageChannelFormType)
                : await dispatchNotification(
                    {title: "Test Channel", message: `We are testing channel ${channel.name}`, level: "info"},
                    undefined,
                    undefined,
                    channel.organizationId ?? undefined,
                    channel as unknown as NotificationChannelFormType
                );

            return NextResponse.json({
                data: result.success
                    ? {success: true}
                    : {
                        success: false,
                        error: result.error ?? (typeof result.response === "string" ? result.response : "Test failed"),
                    },
            });
        } catch (error) {
            log.error({error}, `Error in POST /api/v1/${kind}-channels/[id]/test`);
            return jsonError("Internal server error", 500);
        }
    });
}
