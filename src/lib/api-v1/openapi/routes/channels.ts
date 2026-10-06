import { z } from "zod";
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import "@/lib/api-v1/openapi/registry";
import { providerStorageKindEnum } from "@/db/schema/12_storage-channel";
import { providerKindEnum } from "@/db/schema/09_notification-channel";
import {
  CreateNotificationChannelSchema,
  CreateStorageChannelSchema,
  UpdateChannelSchema,
} from "@/lib/api-v1/validation/channels";

const datetimeNullable = z.string().datetime().nullable();
const datetime = z.string().datetime();
const commonTimestamps = {
  createdAt: datetime,
  updatedAt: datetimeNullable,
  deletedAt: datetimeNullable,
};

const channelFields = {
  id: z.uuid(),
  organizationId: z
    .uuid()
    .nullable()
    .describe("Owning organization, or null for a system channel"),
  name: z.string(),
  enabled: z.boolean(),
  organizationIds: z
    .array(z.uuid())
    .describe("Organizations the channel is attached to (for system channels: the organizations it is shared with)"),
  ...commonTimestamps,
};

const StorageChannelSchema = z
  .object({ ...channelFields, provider: z.enum(providerStorageKindEnum.enumValues) })
  .describe("Storage channel. The provider config is never returned since it contains credentials.")
  .openapi("StorageChannel");

const NotificationChannelSchema = z
  .object({ ...channelFields, provider: z.enum(providerKindEnum.enumValues) })
  .describe("Notification channel. The provider config is never returned since it contains credentials.")
  .openapi("NotificationChannel");

const ChannelTestResultSchema = z
  .object({ success: z.boolean(), error: z.string().optional() })
  .openapi("ChannelTestResult");

const UuidParam = z
  .uuid()
  .openapi({ example: "123e4567-e89b-12d3-a456-426614174000" });

const security = [{ apiKeyAuth: [] }];
const tags = ["Channels"];

const ErrorSchema = z.object({ error: z.string() });

const errors = {
  401: {
    description: "Missing or invalid API key",
    content: { "application/json": { schema: ErrorSchema } },
  },
  403: {
    description:
      "Forbidden: system channels require a system admin; organization channels require an owner/admin of that organization",
    content: { "application/json": { schema: ErrorSchema } },
  },
  500: {
    description: "Internal server error",
    content: { "application/json": { schema: ErrorSchema } },
  },
};

const notFound = {
  description: "Channel not found",
  content: { "application/json": { schema: ErrorSchema } },
};

export function registerChannelRoutes(registry: OpenAPIRegistry) {
  registry.register("StorageChannel", StorageChannelSchema);
  registry.register("NotificationChannel", NotificationChannelSchema);

  const kinds = [
    {
      base: "/storage-channels",
      label: "storage channel",
      channel: StorageChannelSchema,
      create: CreateStorageChannelSchema,
      localNote:
        " The built-in `local` channel cannot be created, deleted or edited (only its organization sharing can change).",
      testNote: "Ping the storage backend with the stored configuration.",
    },
    {
      base: "/notification-channels",
      label: "notification channel",
      channel: NotificationChannelSchema,
      create: CreateNotificationChannelSchema,
      localNote: "",
      testNote: "Send a test notification through the channel.",
    },
  ];

  for (const kind of kinds) {
    registry.registerPath({
      method: "get",
      path: kind.base,
      tags,
      summary: `List ${kind.label}s you can manage`,
      description:
        "Returns system channels (system admins only) and channels owned by organizations where you are owner or admin.",
      security,
      responses: {
        200: {
          description: `List of ${kind.label}s`,
          content: {
            "application/json": { schema: z.object({ data: z.array(kind.channel) }) },
          },
        },
        401: errors[401],
        500: errors[500],
      },
    });

    registry.registerPath({
      method: "post",
      path: kind.base,
      tags,
      summary: `Create a ${kind.label}`,
      description:
        "Creates an organization channel when `organizationId` is set (owner/admin of that organization), " +
        "otherwise a system channel (system admins only), optionally shared with `organizationIds`." +
        kind.localNote,
      security,
      request: {
        body: {
          required: true,
          content: { "application/json": { schema: kind.create } },
        },
      },
      responses: {
        201: {
          description: `Created ${kind.label}`,
          content: { "application/json": { schema: z.object({ data: kind.channel }) } },
        },
        401: errors[401],
        403: errors[403],
        404: {
          description: "Organization not found",
          content: { "application/json": { schema: ErrorSchema } },
        },
        422: {
          description: "Invalid request body or unknown organization",
          content: { "application/json": { schema: ErrorSchema } },
        },
        500: errors[500],
      },
    });

    registry.registerPath({
      method: "get",
      path: `${kind.base}/{id}`,
      tags,
      summary: `Get a ${kind.label}`,
      security,
      request: { params: z.object({ id: UuidParam }) },
      responses: {
        200: {
          description: `The ${kind.label}`,
          content: { "application/json": { schema: z.object({ data: kind.channel }) } },
        },
        401: errors[401],
        403: errors[403],
        404: notFound,
        500: errors[500],
      },
    });

    registry.registerPath({
      method: "patch",
      path: `${kind.base}/{id}`,
      tags,
      summary: `Update a ${kind.label}`,
      description:
        "Only the fields provided are changed. `config` replaces the stored configuration and is validated " +
        "against the channel's provider. The provider itself cannot be changed." +
        kind.localNote,
      security,
      request: {
        params: z.object({ id: UuidParam }),
        body: {
          required: true,
          content: { "application/json": { schema: UpdateChannelSchema } },
        },
      },
      responses: {
        200: {
          description: `Updated ${kind.label}`,
          content: { "application/json": { schema: z.object({ data: kind.channel }) } },
        },
        401: errors[401],
        403: errors[403],
        404: notFound,
        422: {
          description: "Invalid request body or unknown organization",
          content: { "application/json": { schema: ErrorSchema } },
        },
        500: errors[500],
      },
    });

    registry.registerPath({
      method: "delete",
      path: `${kind.base}/{id}`,
      tags,
      summary: `Delete a ${kind.label}`,
      description: `Deletes the channel and every policy that uses it.${kind.localNote}`,
      security,
      request: { params: z.object({ id: UuidParam }) },
      responses: {
        200: {
          description: `Deleted ${kind.label}`,
          content: { "application/json": { schema: z.object({ data: kind.channel }) } },
        },
        401: errors[401],
        403: errors[403],
        404: notFound,
        422: {
          description: "The channel cannot be deleted",
          content: { "application/json": { schema: ErrorSchema } },
        },
        500: errors[500],
      },
    });

    registry.registerPath({
      method: "post",
      path: `${kind.base}/{id}/test`,
      tags,
      summary: `Test a ${kind.label}`,
      description: `${kind.testNote} A failed test is reported with \`success: false\`, not an error status.`,
      security,
      request: { params: z.object({ id: UuidParam }) },
      responses: {
        200: {
          description: "Test result",
          content: { "application/json": { schema: z.object({ data: ChannelTestResultSchema }) } },
        },
        401: errors[401],
        403: errors[403],
        404: notFound,
        500: errors[500],
      },
    });
  }
}
