import {and, eq, inArray} from "drizzle-orm";
import {db} from "@/db";
import * as drizzleDb from "@/db";
import {withUpdatedAt} from "@/db/utils";
import {StorageChannelWith} from "@/db/schema/12_storage-channel";
import {NotificationChannelWith} from "@/db/schema/09_notification-channel";
import {
    NotificationChannelFormType,
    StorageChannelFormType,
} from "@/features/channel/schemas/channel-form.schema";

type StorageChannelRow = typeof drizzleDb.schemas.storageChannel.$inferSelect;
type NotificationChannelRow = typeof drizzleDb.schemas.notificationChannel.$inferSelect;

/**
 * Shared channel persistence used by the dashboard server actions and the v1 API.
 * Callers are responsible for authorization.
 */

export async function createStorageChannelService(
    data: StorageChannelFormType,
    organizationId: string | null,
    sharedOrganizationIds: string[] = []
): Promise<StorageChannelRow> {
    return db.transaction(async (tx) => {
        const [channel] = await tx
            .insert(drizzleDb.schemas.storageChannel)
            .values({
                provider: data.provider,
                name: data.name,
                config: data.config,
                enabled: data.enabled ?? true,
                organizationId,
            })
            .returning();

        const organizationIds = organizationId ? [organizationId] : sharedOrganizationIds;
        if (organizationIds.length > 0) {
            await tx.insert(drizzleDb.schemas.organizationStorageChannel).values(
                organizationIds.map((id) => ({organizationId: id, storageChannelId: channel.id}))
            );
        }

        return channel;
    });
}

export async function updateStorageChannelService(
    id: string,
    data: StorageChannelFormType
): Promise<StorageChannelRow | undefined> {
    const [channel] = await db
        .update(drizzleDb.schemas.storageChannel)
        .set(
            withUpdatedAt({
                provider: data.provider,
                name: data.name,
                config: data.config,
                enabled: data.enabled ?? true,
            })
        )
        .where(eq(drizzleDb.schemas.storageChannel.id, id))
        .returning();

    return channel;
}

export async function deleteStorageChannelService(
    id: string,
    organizationId?: string
): Promise<StorageChannelRow | undefined> {
    if (organizationId) {
        await db
            .delete(drizzleDb.schemas.organizationStorageChannel)
            .where(
                and(
                    eq(drizzleDb.schemas.organizationStorageChannel.organizationId, organizationId),
                    eq(drizzleDb.schemas.organizationStorageChannel.storageChannelId, id)
                )
            );
    }

    const [deleted] = await db
        .delete(drizzleDb.schemas.storageChannel)
        .where(eq(drizzleDb.schemas.storageChannel.id, id))
        .returning();

    return deleted;
}

/**
 * Replaces the set of organizations a storage channel is shared with.
 * Returns false when the channel does not exist.
 */
export async function setStorageChannelOrganizationsService(
    id: string,
    organizationIds: string[]
): Promise<boolean> {
    const channel = await db.query.storageChannel.findFirst({
        where: eq(drizzleDb.schemas.storageChannel.id, id),
        with: {organizations: true},
    }) as StorageChannelWith | undefined;
    if (!channel) return false;

    const existing = channel.organizations.map((o) => o.organizationId);
    const toAdd = organizationIds.filter((orgId) => !existing.includes(orgId));
    const toRemove = existing.filter((orgId) => !organizationIds.includes(orgId));

    if (toAdd.length > 0) {
        await db
            .insert(drizzleDb.schemas.organizationStorageChannel)
            .values(toAdd.map((orgId) => ({organizationId: orgId, storageChannelId: id})));
    }

    if (toRemove.length > 0) {
        await db
            .delete(drizzleDb.schemas.organizationStorageChannel)
            .where(
                and(
                    inArray(drizzleDb.schemas.organizationStorageChannel.organizationId, toRemove),
                    eq(drizzleDb.schemas.organizationStorageChannel.storageChannelId, id)
                )
            );
    }

    return true;
}

export async function createNotificationChannelService(
    data: NotificationChannelFormType,
    organizationId: string | null,
    sharedOrganizationIds: string[] = []
): Promise<NotificationChannelRow> {
    return db.transaction(async (tx) => {
        const [channel] = await tx
            .insert(drizzleDb.schemas.notificationChannel)
            .values({
                provider: data.provider,
                name: data.name,
                config: data.config,
                enabled: data.enabled ?? true,
                organizationId,
            })
            .returning();

        const organizationIds = organizationId ? [organizationId] : sharedOrganizationIds;
        if (organizationIds.length > 0) {
            await tx.insert(drizzleDb.schemas.organizationNotificationChannel).values(
                organizationIds.map((id) => ({organizationId: id, notificationChannelId: channel.id}))
            );
        }

        return channel;
    });
}

export async function updateNotificationChannelService(
    id: string,
    data: NotificationChannelFormType
): Promise<NotificationChannelRow | undefined> {
    const [channel] = await db
        .update(drizzleDb.schemas.notificationChannel)
        .set(
            withUpdatedAt({
                provider: data.provider,
                name: data.name,
                config: data.config,
                enabled: data.enabled ?? true,
            })
        )
        .where(eq(drizzleDb.schemas.notificationChannel.id, id))
        .returning();

    return channel;
}

export async function deleteNotificationChannelService(
    id: string,
    organizationId?: string
): Promise<NotificationChannelRow | undefined> {
    if (organizationId) {
        await db
            .delete(drizzleDb.schemas.organizationNotificationChannel)
            .where(
                and(
                    eq(drizzleDb.schemas.organizationNotificationChannel.organizationId, organizationId),
                    eq(drizzleDb.schemas.organizationNotificationChannel.notificationChannelId, id)
                )
            );
    }

    const [deleted] = await db
        .delete(drizzleDb.schemas.notificationChannel)
        .where(eq(drizzleDb.schemas.notificationChannel.id, id))
        .returning();

    return deleted;
}

/**
 * Replaces the set of organizations a notification channel is shared with.
 * Returns false when the channel does not exist.
 */
export async function setNotificationChannelOrganizationsService(
    id: string,
    organizationIds: string[]
): Promise<boolean> {
    const channel = await db.query.notificationChannel.findFirst({
        where: eq(drizzleDb.schemas.notificationChannel.id, id),
        with: {organizations: true},
    }) as NotificationChannelWith | undefined;
    if (!channel) return false;

    const existing = channel.organizations.map((o) => o.organizationId);
    const toAdd = organizationIds.filter((orgId) => !existing.includes(orgId));
    const toRemove = existing.filter((orgId) => !organizationIds.includes(orgId));

    if (toAdd.length > 0) {
        await db
            .insert(drizzleDb.schemas.organizationNotificationChannel)
            .values(toAdd.map((orgId) => ({organizationId: orgId, notificationChannelId: id})));
    }

    if (toRemove.length > 0) {
        await db
            .delete(drizzleDb.schemas.organizationNotificationChannel)
            .where(
                and(
                    inArray(drizzleDb.schemas.organizationNotificationChannel.organizationId, toRemove),
                    eq(drizzleDb.schemas.organizationNotificationChannel.notificationChannelId, id)
                )
            );
    }

    return true;
}
