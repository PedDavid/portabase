import {z} from "zod";
import {
    BaseChannelFormSchema,
    NotificationChannelFormSchema,
    StorageChannelFormSchema,
} from "@/features/channel/schemas/channel-form.schema";

const ChannelOwnershipFields = z.object({
    organizationId: z
        .uuid()
        .nullable()
        .optional()
        .describe("Owning organization. Omit or null to create a system channel (admins only)."),
    organizationIds: z
        .array(z.uuid())
        .optional()
        .describe("System channels only: organizations the channel is shared with."),
});

export const CreateStorageChannelSchema = z.intersection(StorageChannelFormSchema, ChannelOwnershipFields);
export const CreateNotificationChannelSchema = z.intersection(NotificationChannelFormSchema, ChannelOwnershipFields);

export const UpdateChannelSchema = z.strictObject({
    name: BaseChannelFormSchema.shape.name.optional(),
    enabled: z.boolean().optional(),
    config: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Full provider configuration; replaces the stored one and is validated against the channel's provider."),
    organizationIds: z
        .array(z.uuid())
        .optional()
        .describe("System channels only: replaces the set of organizations the channel is shared with."),
});
