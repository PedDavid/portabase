import {and, eq, isNull} from "drizzle-orm";
import {db} from "@/db";
import * as drizzleDb from "@/db";
import {RetentionPolicy} from "@/db/schema/07_database";
import {RetentionSettings} from "@/features/database/schemas/retention-policy.schema";
import {PolicyScope, scopeOwner} from "@/features/database/schemas/policy-scope.schema";

const retentionOwnerWhere = (scope: PolicyScope) =>
    scope.type === "database"
        ? and(eq(drizzleDb.schemas.retentionPolicy.databaseId, scope.id), isNull(drizzleDb.schemas.retentionPolicy.projectId))
        : and(eq(drizzleDb.schemas.retentionPolicy.projectId, scope.id), isNull(drizzleDb.schemas.retentionPolicy.databaseId));

export async function getRetentionPolicy(scope: PolicyScope): Promise<RetentionPolicy | null> {
    const [existing] = await db
        .select()
        .from(drizzleDb.schemas.retentionPolicy)
        .where(retentionOwnerWhere(scope))
        .limit(1);
    return existing ?? null;
}

export async function upsertRetentionPolicyService(
    scope: PolicyScope,
    settings: RetentionSettings
): Promise<RetentionPolicy> {
    const existing = await getRetentionPolicy(scope);

    const values = {
        type: settings.type ?? "gfs",
        count: settings.count,
        days: settings.days,
        gfsHourly: settings.gfs.hourly,
        gfsDaily: settings.gfs.daily,
        gfsWeekly: settings.gfs.weekly,
        gfsMonthly: settings.gfs.monthly,
        gfsYearly: settings.gfs.yearly,
    };

    if (existing) {
        const [updated] = await db
            .update(drizzleDb.schemas.retentionPolicy)
            .set(values)
            .where(retentionOwnerWhere(scope))
            .returning();
        return updated;
    }

    const [created] = await db
        .insert(drizzleDb.schemas.retentionPolicy)
        .values({...scopeOwner(scope), ...values})
        .returning();
    return created;
}
