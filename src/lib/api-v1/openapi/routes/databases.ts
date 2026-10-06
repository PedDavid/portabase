import { z } from "zod";
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import "@/lib/api-v1/openapi/registry";
import { databaseSchema, backupSchema, restorationSchema } from "@/db/schema/07_database";
import { backupStorageSchema } from "@/db/schema/14_storage-backup";
import {
  BACKUP_LABEL_KEY_PATTERN,
  BACKUP_LABEL_VALUE_MAX_LENGTH,
  BACKUP_LABELS_MAX_COUNT,
} from "@/features/database/schemas/backup-labels.schema";

const datetimeNullable = z.string().datetime().nullable();
const datetime = z.string().datetime();
const commonTimestamps = {
  createdAt: datetime,
  updatedAt: datetimeNullable,
  deletedAt: datetimeNullable,
};

const DatabaseSchema = z
  .object({
    ...databaseSchema.shape,
    lastContact: datetimeNullable,
    ...commonTimestamps,
  })
  .openapi("Database");

const BackupStorageSchema = z
  .object({
    ...backupStorageSchema.shape,
    ...commonTimestamps,
  })
  .openapi("BackupStorage");

const BackupLabelKey = z.string().regex(BACKUP_LABEL_KEY_PATTERN);
const BackupLabelValue = z.string().min(1).max(BACKUP_LABEL_VALUE_MAX_LENGTH);

const BackupLabels = z.record(BackupLabelKey, BackupLabelValue).openapi("BackupLabels", {
  description:
    `Key/value labels. Keys are lowercase letters, digits, '.', '_' or '-', start with a letter ` +
    `or digit and are at most 63 characters; values are trimmed, non-empty and at most ` +
    `${BACKUP_LABEL_VALUE_MAX_LENGTH} characters; at most ${BACKUP_LABELS_MAX_COUNT} labels per backup. ` +
    `Backups created by the agent's schedule get {"trigger": "schedule"}.`,
  example: { app: "homebox", version: "0.26.2", trigger: "pre-deploy" },
});

const BackupLabelsPatch = z
  .record(BackupLabelKey, BackupLabelValue.nullable())
  .nullable()
  .openapi({
    description:
      "JSON merge patch (RFC 7396) applied to the backup's labels: a string sets the label, " +
      "null removes it, labels not mentioned are kept, and {} changes nothing. " +
      "`labels: null` removes all labels. The merged result must still be a valid label set.",
    example: { version: "0.26.3", note: null },
  });

const BackupSchema = z
  .object({
    ...backupSchema.shape,
    labels: BackupLabels,
    ...commonTimestamps,
  })
  .openapi("Backup");

const BackupWithStoragesSchema = BackupSchema.extend({
  storages: z.array(BackupStorageSchema),
}).openapi("BackupWithStorages");

const RestorationSchema = z
  .object({
    ...restorationSchema.shape,
    ...commonTimestamps,
  })
  .openapi("Restoration");

const UuidParam = z
  .string()
  .uuid()
  .openapi({ example: "123e4567-e89b-12d3-a456-426614174000" });

const security = [{ apiKeyAuth: [] }];
const tags = ["Databases"];

const ErrorSchema = z.object({ error: z.string() });

export function registerDatabaseRoutes(registry: OpenAPIRegistry) {
  registry.register("Database", DatabaseSchema);
  registry.register("Backup", BackupSchema);
  registry.register("BackupStorage", BackupStorageSchema);
  registry.register("BackupWithStorages", BackupWithStoragesSchema);
  registry.register("Restoration", RestorationSchema);

  registry.registerPath({
    method: "get",
    path: "/databases",
    tags,
    summary: "List databases",
    security,
    responses: {
      200: {
        description: "List of accessible databases",
        content: {
          "application/json": {
            schema: z.object({ data: z.array(DatabaseSchema) }),
          },
        },
      },
      401: {
        description: "Missing or invalid API key",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Internal server error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/databases/{id}",
    tags,
    summary: "Get database by ID",
    security,
    request: { params: z.object({ id: UuidParam }) },
    responses: {
      200: {
        description: "Database details",
        content: {
          "application/json": {
            schema: z.object({ data: DatabaseSchema }),
          },
        },
      },
      401: {
        description: "Missing or invalid API key",
        content: { "application/json": { schema: ErrorSchema } },
      },
      403: {
        description: "Forbidden",
        content: { "application/json": { schema: ErrorSchema } },
      },
      404: {
        description: "Database not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Internal server error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/databases/{id}/status",
    tags,
    summary: "Get database status",
    security,
    request: { params: z.object({ id: UuidParam }) },
    responses: {
      200: {
        description: "Database status with latest backup and restoration",
        content: {
          "application/json": {
            schema: z.object({
              data: z.object({
                isWaitingForBackup: z.boolean().nullable(),
                lastContact: datetimeNullable,
                latestBackup: BackupSchema.nullable(),
                latestRestoration: RestorationSchema.nullable(),
              }),
            }),
          },
        },
      },
      401: {
        description: "Missing or invalid API key",
        content: { "application/json": { schema: ErrorSchema } },
      },
      403: {
        description: "Forbidden",
        content: { "application/json": { schema: ErrorSchema } },
      },
      404: {
        description: "Database not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Internal server error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/databases/{id}/backup",
    tags,
    summary: "List backups for a database",
    description:
      "Filter by labels with `label`, repeatable and combined with AND: `label=key=value` " +
      "matches backups whose label `key` equals `value`, `label=key` matches backups that have " +
      "the label `key`. Example: `?label=app=homebox&label=version`.",
    security,
    request: {
      params: z.object({ id: UuidParam }),
      query: z.object({
        label: z
          .array(z.string())
          .optional()
          .openapi({
            description: "Label filter: `key=value` (exact match) or `key` (label exists). Repeatable.",
            example: ["app=homebox", "version"],
          }),
      }),
    },
    responses: {
      200: {
        description: "List of backups ordered by creation date descending",
        content: {
          "application/json": {
            schema: z.object({ data: z.array(BackupSchema) }),
          },
        },
      },
      401: {
        description: "Missing or invalid API key",
        content: { "application/json": { schema: ErrorSchema } },
      },
      403: {
        description: "Forbidden",
        content: { "application/json": { schema: ErrorSchema } },
      },
      404: {
        description: "Database not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
      422: {
        description: "Invalid label filter",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Internal server error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/databases/{id}/backup",
    tags,
    summary: "Trigger a backup for a database",
    security,
    request: {
      params: z.object({ id: UuidParam }),
      body: {
        required: false,
        content: {
          "application/json": {
            schema: z.object({ labels: BackupLabels.optional() }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Backup job created with status 'waiting'",
        content: {
          "application/json": { schema: z.object({ data: BackupSchema }) },
        },
      },
      401: {
        description: "Missing or invalid API key",
        content: { "application/json": { schema: ErrorSchema } },
      },
      403: {
        description: "Forbidden",
        content: { "application/json": { schema: ErrorSchema } },
      },
      404: {
        description: "Database not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
      409: {
        description: "A backup is already waiting or ongoing for this database",
        content: { "application/json": { schema: ErrorSchema } },
      },
      422: {
        description: "Invalid request body",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Internal server error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/databases/{id}/backup/{backupId}",
    tags,
    summary: "Get a specific backup with storage details",
    security,
    request: {
      params: z.object({ id: UuidParam, backupId: UuidParam }),
    },
    responses: {
      200: {
        description: "Backup with associated storage records",
        content: {
          "application/json": {
            schema: z.object({ data: BackupWithStoragesSchema }),
          },
        },
      },
      401: {
        description: "Missing or invalid API key",
        content: { "application/json": { schema: ErrorSchema } },
      },
      403: {
        description: "Forbidden",
        content: { "application/json": { schema: ErrorSchema } },
      },
      404: {
        description: "Database or backup not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Internal server error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });

  registry.registerPath({
    method: "patch",
    path: "/databases/{id}/backup/{backupId}",
    tags,
    summary: "Update a backup's labels (JSON merge patch)",
    security,
    request: {
      params: z.object({ id: UuidParam, backupId: UuidParam }),
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({ labels: BackupLabelsPatch }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Updated backup",
        content: {
          "application/json": { schema: z.object({ data: BackupSchema }) },
        },
      },
      401: {
        description: "Missing or invalid API key",
        content: { "application/json": { schema: ErrorSchema } },
      },
      403: {
        description: "Forbidden",
        content: { "application/json": { schema: ErrorSchema } },
      },
      404: {
        description: "Database or backup not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
      422: {
        description: "Invalid request body",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Internal server error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/databases/{id}/restore",
    tags,
    summary: "Restore a database from a backup",
    security,
    request: {
      params: z.object({ id: UuidParam }),
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              backupId: z.uuid(),
              backupStorageId: z.uuid(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Restoration job created with status 'waiting'",
        content: {
          "application/json": {
            schema: z.object({ data: RestorationSchema }),
          },
        },
      },
      401: {
        description: "Missing or invalid API key",
        content: { "application/json": { schema: ErrorSchema } },
      },
      403: {
        description: "Forbidden",
        content: { "application/json": { schema: ErrorSchema } },
      },
      404: {
        description: "Database, backup, or backup storage not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
      409: {
        description:
          "A restoration is already waiting or ongoing for this database, or the backup file is missing",
        content: { "application/json": { schema: ErrorSchema } },
      },
      422: {
        description:
          "Invalid request body, or backup storage is not in 'success' state",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Internal server error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });
}
