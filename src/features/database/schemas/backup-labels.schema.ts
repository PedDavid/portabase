import {z} from "zod";

/**
 * Key/value labels attached to a backup, e.g. {"app": "homebox", "version": "0.26.2"}.
 * Shared by the REST API, MCP tools, server actions and the UI editor.
 */

export const BACKUP_LABEL_KEY_PATTERN = /^[a-z0-9]([a-z0-9._-]{0,62})$/;
export const BACKUP_LABEL_KEY_MAX_LENGTH = 63;
export const BACKUP_LABEL_VALUE_MAX_LENGTH = 255;
export const BACKUP_LABELS_MAX_COUNT = 32;

/** Label set the agent's scheduled (cron) backups are created with. */
export const SCHEDULED_BACKUP_LABELS: BackupLabels = {trigger: "schedule"};

export type BackupLabels = Record<string, string>;
/** JSON merge patch (RFC 7396) on a label set: a string sets a label, null removes it. */
export type BackupLabelsPatch = Record<string, string | null>;
/** `key=value` matches the exact value, a bare `key` matches any backup that has the key. */
export type BackupLabelFilter = { key: string; value?: string };

const KEY_RULE =
    `keys must be lowercase letters, digits, '.', '_' or '-', start with a letter or digit, ` +
    `and be at most ${BACKUP_LABEL_KEY_MAX_LENGTH} characters`;

// Field-level schemas, used as-is by the UI row editor for inline errors.
export const BackupLabelKeySchema = z
    .string()
    .regex(
        BACKUP_LABEL_KEY_PATTERN,
        `Use lowercase letters, digits, '.', '_' or '-', starting with a letter or digit (max ${BACKUP_LABEL_KEY_MAX_LENGTH})`,
    );

export const BackupLabelValueSchema = z
    .string()
    .trim()
    .min(1, "Value is required")
    .max(BACKUP_LABEL_VALUE_MAX_LENGTH, `Value must be at most ${BACKUP_LABEL_VALUE_MAX_LENGTH} characters`);

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLabelEntries(
    input: unknown,
    allowNull: boolean,
    ctx: z.RefinementCtx,
): Record<string, string | null> | null {
    if (input === undefined) {
        ctx.addIssue({code: "custom", message: "labels is required"});
        return null;
    }
    if (!isPlainObject(input)) {
        ctx.addIssue({
            code: "custom",
            message: `labels must be an object mapping label keys to string values${allowNull ? " (or null to remove a label)" : ""}`,
        });
        return null;
    }

    const result: Record<string, string | null> = {};
    let valid = true;

    for (const [key, raw] of Object.entries(input)) {
        const fail = (message: string) => {
            ctx.addIssue({code: "custom", message, path: [key]});
            valid = false;
        };

        if (!BACKUP_LABEL_KEY_PATTERN.test(key)) {
            fail(`Invalid label key "${key}": ${KEY_RULE}`);
            continue;
        }
        if (raw === null && allowNull) {
            result[key] = null;
            continue;
        }
        if (typeof raw !== "string") {
            fail(`Invalid value for label "${key}": must be a string${allowNull ? " or null" : ""}`);
            continue;
        }

        const value = raw.trim();
        if (value === "") {
            fail(`Invalid value for label "${key}": must not be empty`);
        } else if (value.length > BACKUP_LABEL_VALUE_MAX_LENGTH) {
            fail(`Invalid value for label "${key}": must be at most ${BACKUP_LABEL_VALUE_MAX_LENGTH} characters`);
        } else {
            result[key] = value;
        }
    }

    return valid ? result : null;
}

/** A complete label set. Values are trimmed. */
export const BackupLabelsSchema = z.unknown().transform((input, ctx): BackupLabels => {
    const labels = parseLabelEntries(input, false, ctx) as BackupLabels | null;
    if (!labels) return z.NEVER;

    const count = Object.keys(labels).length;
    if (count > BACKUP_LABELS_MAX_COUNT) {
        ctx.addIssue({
            code: "custom",
            message: `Too many labels: a backup can have at most ${BACKUP_LABELS_MAX_COUNT} (got ${count})`,
        });
        return z.NEVER;
    }
    return labels;
});

/** A JSON merge patch on a label set. Validate the merged result with BackupLabelsSchema. */
export const BackupLabelsPatchSchema = z
    .unknown()
    .transform((input, ctx): BackupLabelsPatch => parseLabelEntries(input, true, ctx) ?? z.NEVER);

export function applyBackupLabelsPatch(current: BackupLabels, patch: BackupLabelsPatch): BackupLabels {
    const merged: BackupLabels = {...current};
    for (const [key, value] of Object.entries(patch)) {
        if (value === null) {
            delete merged[key];
        } else {
            merged[key] = value;
        }
    }
    return merged;
}

/** Parses `?label=` query values: `key=value` (exact match) or `key` (key exists). */
export function parseBackupLabelFilters(
    raw: string[],
): { ok: true; filters: BackupLabelFilter[] } | { ok: false; error: string } {
    const filters: BackupLabelFilter[] = [];

    for (const item of raw) {
        const separator = item.indexOf("=");
        const key = separator === -1 ? item : item.slice(0, separator);
        const value = separator === -1 ? undefined : item.slice(separator + 1);

        if (!BACKUP_LABEL_KEY_PATTERN.test(key)) {
            return {ok: false, error: `Invalid label filter "${item}": ${KEY_RULE}`};
        }
        if (value === "") {
            return {
                ok: false,
                error: `Invalid label filter "${item}": value must not be empty (use "${key}" to match any value)`,
            };
        }
        filters.push(value === undefined ? {key} : {key, value});
    }

    return {ok: true, filters};
}

export const BackupLabelFilterSchema = z.object({
    key: z.string().regex(BACKUP_LABEL_KEY_PATTERN),
    value: z.string().min(1).optional(),
});
