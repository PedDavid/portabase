import {and, asc, eq, inArray, isNull} from "drizzle-orm";
import {db} from "@/db";
import * as drizzleDb from "@/db";
import {withUpdatedAt} from "@/db/utils";
import {AlertPolicy} from "@/db/schema/10_alert-policy";
import {StoragePolicy} from "@/db/schema/13_storage-policy";
import {PolicyScope, scopeOwner} from "@/features/database/schemas/policy-scope.schema";

export const alertOwnerWhere = (scope: PolicyScope) =>
    scope.type === "database"
        ? and(eq(drizzleDb.schemas.alertPolicy.databaseId, scope.id), isNull(drizzleDb.schemas.alertPolicy.projectId))
        : and(eq(drizzleDb.schemas.alertPolicy.projectId, scope.id), isNull(drizzleDb.schemas.alertPolicy.databaseId));

export const storageOwnerWhere = (scope: PolicyScope) =>
    scope.type === "database"
        ? and(eq(drizzleDb.schemas.storagePolicy.databaseId, scope.id), isNull(drizzleDb.schemas.storagePolicy.projectId))
        : and(eq(drizzleDb.schemas.storagePolicy.projectId, scope.id), isNull(drizzleDb.schemas.storagePolicy.databaseId));

export type StoragePolicyInput = {
    channelId: string;
    enabled: boolean;
};

export type AlertPolicyInput = StoragePolicyInput & {
    eventKinds: AlertPolicy["eventKinds"];
};

export async function listStoragePolicies(scope: PolicyScope): Promise<StoragePolicy[]> {
    return db
        .select()
        .from(drizzleDb.schemas.storagePolicy)
        .where(storageOwnerWhere(scope))
        .orderBy(asc(drizzleDb.schemas.storagePolicy.createdAt));
}

export async function listAlertPolicies(scope: PolicyScope): Promise<AlertPolicy[]> {
    return db
        .select()
        .from(drizzleDb.schemas.alertPolicy)
        .where(alertOwnerWhere(scope))
        .orderBy(asc(drizzleDb.schemas.alertPolicy.createdAt));
}

const sameEventKinds = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

/**
 * Makes the scope's storage policies on `manageableChannelIds` match `policies` exactly:
 * existing rows are updated in place (ids kept), missing ones inserted, the rest deleted.
 * Policies on channels outside `manageableChannelIds` are left untouched, mirroring the
 * dashboard which only shows enabled channels available to the organization.
 */
export async function replaceStoragePolicies(
    scope: PolicyScope,
    manageableChannelIds: string[],
    policies: StoragePolicyInput[]
): Promise<StoragePolicy[]> {
    await db.transaction(async (tx) => {
        const existing = (await tx
            .select()
            .from(drizzleDb.schemas.storagePolicy)
            .where(storageOwnerWhere(scope))
            .orderBy(asc(drizzleDb.schemas.storagePolicy.createdAt)))
            .filter((p) => manageableChannelIds.includes(p.storageChannelId));

        const toDelete: string[] = [];
        const kept = new Set<string>();

        for (const row of existing) {
            const desired = policies.find((p) => p.channelId === row.storageChannelId);
            if (!desired || kept.has(row.storageChannelId)) {
                toDelete.push(row.id);
                continue;
            }
            kept.add(row.storageChannelId);
            if (row.enabled !== desired.enabled) {
                await tx
                    .update(drizzleDb.schemas.storagePolicy)
                    .set(withUpdatedAt({enabled: desired.enabled}))
                    .where(eq(drizzleDb.schemas.storagePolicy.id, row.id));
            }
        }

        if (toDelete.length > 0) {
            await tx
                .delete(drizzleDb.schemas.storagePolicy)
                .where(inArray(drizzleDb.schemas.storagePolicy.id, toDelete));
        }

        const toInsert = policies.filter((p) => !kept.has(p.channelId));
        if (toInsert.length > 0) {
            const owner = scopeOwner(scope);
            await tx.insert(drizzleDb.schemas.storagePolicy).values(
                toInsert.map((p) => ({...owner, storageChannelId: p.channelId, enabled: p.enabled}))
            );
        }
    });

    return listStoragePolicies(scope);
}

/**
 * Alert-policy counterpart of {@link replaceStoragePolicies}.
 */
export async function replaceAlertPolicies(
    scope: PolicyScope,
    manageableChannelIds: string[],
    policies: AlertPolicyInput[]
): Promise<AlertPolicy[]> {
    await db.transaction(async (tx) => {
        const existing = (await tx
            .select()
            .from(drizzleDb.schemas.alertPolicy)
            .where(alertOwnerWhere(scope))
            .orderBy(asc(drizzleDb.schemas.alertPolicy.createdAt)))
            .filter((p) => manageableChannelIds.includes(p.notificationChannelId));

        const toDelete: string[] = [];
        const kept = new Set<string>();

        for (const row of existing) {
            const desired = policies.find((p) => p.channelId === row.notificationChannelId);
            if (!desired || kept.has(row.notificationChannelId)) {
                toDelete.push(row.id);
                continue;
            }
            kept.add(row.notificationChannelId);
            if (row.enabled !== desired.enabled || !sameEventKinds(row.eventKinds, desired.eventKinds)) {
                await tx
                    .update(drizzleDb.schemas.alertPolicy)
                    .set(withUpdatedAt({enabled: desired.enabled, eventKinds: desired.eventKinds}))
                    .where(eq(drizzleDb.schemas.alertPolicy.id, row.id));
            }
        }

        if (toDelete.length > 0) {
            await tx
                .delete(drizzleDb.schemas.alertPolicy)
                .where(inArray(drizzleDb.schemas.alertPolicy.id, toDelete));
        }

        const toInsert = policies.filter((p) => !kept.has(p.channelId));
        if (toInsert.length > 0) {
            const owner = scopeOwner(scope);
            await tx.insert(drizzleDb.schemas.alertPolicy).values(
                toInsert.map((p) => ({
                    ...owner,
                    notificationChannelId: p.channelId,
                    eventKinds: p.eventKinds,
                    enabled: p.enabled,
                }))
            );
        }
    });

    return listAlertPolicies(scope);
}
