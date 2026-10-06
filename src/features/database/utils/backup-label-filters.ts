import {SQL, sql} from "drizzle-orm";
import * as drizzleDb from "@/db";
import type {BackupLabelFilter} from "@/features/database/schemas/backup-labels.schema";

/**
 * Conditions to AND together for label filters. Only jsonb containment (`@>`) and key
 * existence (`?`) are used, so the GIN index on backups.labels (default jsonb_ops) applies;
 * `labels->>'key' = ...` or jsonb_exists() would bypass it.
 *
 * All `key=value` filters are merged into one containment object. A key repeated with a
 * different value can't share that object, so it goes into another one (still ANDed).
 */
export function backupLabelFilterConditions(filters: BackupLabelFilter[]): SQL[] {
    const labels = drizzleDb.schemas.backup.labels;
    const containments: Record<string, string>[] = [];
    const conditions: SQL[] = [];

    for (const {key, value} of filters) {
        if (value === undefined) {
            conditions.push(sql`${labels} ? ${key}`);
            continue;
        }
        const target = containments.find((c) => !Object.hasOwn(c, key) || c[key] === value);
        if (target) {
            target[key] = value;
        } else {
            containments.push({[key]: value});
        }
    }

    return [
        ...containments.map((c) => sql`${labels} @> ${JSON.stringify(c)}::jsonb`),
        ...conditions,
    ];
}
