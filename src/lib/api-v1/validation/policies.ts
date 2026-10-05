import {z} from "zod";
import {EVENT_KIND_OPTIONS, PolicyEventKindSchema} from "@/features/database/schemas/channels-policy.schema";
import {GFSSettingsSchema} from "@/features/database/schemas/retention-policy.schema";

/** Event kinds selectable in the dashboard (excludes kinds the UI does not offer). */
export const SELECTABLE_EVENT_KINDS = EVENT_KIND_OPTIONS.map((o) => o.value) as z.infer<typeof PolicyEventKindSchema>[];

const uniqueChannels = (policies: { channelId: string }[]) =>
    new Set(policies.map((p) => p.channelId)).size === policies.length;

export const StoragePoliciesSchema = z.object({
    policies: z
        .array(
            z.object({
                channelId: z.uuid().describe("Storage channel ID"),
                enabled: z.boolean().default(true),
            })
        )
        .refine(uniqueChannels, {message: "Each channel may appear only once"}),
});

export const AlertPoliciesSchema = z.object({
    policies: z
        .array(
            z.object({
                channelId: z.uuid().describe("Notification channel ID"),
                eventKinds: z
                    .array(PolicyEventKindSchema)
                    .min(1, "Select at least one event kind"),
                enabled: z.boolean().default(true),
            })
        )
        .refine(uniqueChannels, {message: "Each channel may appear only once"}),
});

export const RetentionPolicySchema = z.object({
    type: z.enum(["count", "days", "gfs"]),
    count: z.number().int().min(1).max(100).default(7).describe("Backups to keep (type \"count\")"),
    days: z.number().int().min(1).max(3650).default(30).describe("Days to keep backups (type \"days\")"),
    gfs: GFSSettingsSchema.default({hourly: 0, daily: 7, weekly: 4, monthly: 12, yearly: 3})
        .describe("Grandfather-father-son buckets (type \"gfs\")"),
});
