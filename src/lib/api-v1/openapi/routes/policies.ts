import { z } from "zod";
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import "@/lib/api-v1/openapi/registry";
import { storagePolicySchema } from "@/db/schema/13_storage-policy";
import { alertPolicySchema } from "@/db/schema/10_alert-policy";
import { retentionPolicySchema } from "@/db/schema/07_database";
import {
  AlertPoliciesSchema,
  RetentionPolicySchema,
  StoragePoliciesSchema,
} from "@/lib/api-v1/validation/policies";

const datetimeNullable = z.string().datetime().nullable();
const datetime = z.string().datetime();
const commonTimestamps = {
  createdAt: datetime,
  updatedAt: datetimeNullable,
  deletedAt: datetimeNullable,
};

const StoragePolicySchema = z
  .object({ ...storagePolicySchema.shape, ...commonTimestamps })
  .openapi("StoragePolicy");

const AlertPolicySchema = z
  .object({ ...alertPolicySchema.shape, ...commonTimestamps })
  .openapi("AlertPolicy");

const RetentionPolicyRecordSchema = z
  .object({ ...retentionPolicySchema.shape, ...commonTimestamps })
  .openapi("RetentionPolicy");

const UuidParam = z
  .uuid()
  .openapi({ example: "123e4567-e89b-12d3-a456-426614174000" });

const security = [{ apiKeyAuth: [] }];
const tags = ["Policies"];

const ErrorSchema = z.object({ error: z.string() });

export function registerPolicyRoutes(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "patch",
    path: "/databases/{id}",
    tags,
    summary: "Attach the database to a project, or detach it (projectId: null)",
    security,
    request: {
      params: z.object({ id: UuidParam }),
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              projectId: z
                .uuid()
                .nullable()
                .describe("Target project id to attach to, or null to detach"),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Updated database",
        content: {
          "application/json": { schema: z.object({ data: z.any() }) },
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
        description: "Database or project not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
      422: {
        description: "Invalid request body, or agent is not attached to the project's organization",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Internal server error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });

  registry.registerPath({
    method: "put",
    path: "/databases/{id}/backup-policy",
    tags,
    summary: "Set or clear the backup schedule for a database",
    security,
    request: {
      params: z.object({ id: UuidParam }),
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              backupPolicy: z
                .string()
                .describe("A valid cron expression, or \"\" to clear the schedule"),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Updated database record",
        content: {
          "application/json": { schema: z.object({ data: z.any() }) },
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
        description: "Invalid request body",
        content: { "application/json": { schema: ErrorSchema } },
      },
      500: {
        description: "Internal server error",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  });

  registry.register("StoragePolicy", StoragePolicySchema);
  registry.register("AlertPolicy", AlertPolicySchema);
  registry.register("RetentionPolicy", RetentionPolicyRecordSchema);

  const errorResponses = (owner: string) => ({
    401: {
      description: "Missing or invalid API key",
      content: { "application/json": { schema: ErrorSchema } },
    },
    403: {
      description: "Forbidden",
      content: { "application/json": { schema: ErrorSchema } },
    },
    404: {
      description: `${owner} not found`,
      content: { "application/json": { schema: ErrorSchema } },
    },
    500: {
      description: "Internal server error",
      content: { "application/json": { schema: ErrorSchema } },
    },
  });

  const invalid = (description: string) => ({
    422: {
      description,
      content: { "application/json": { schema: ErrorSchema } },
    },
  });

  const replaceNote =
    "Replace semantics: after the call, the policies on channels selectable for the organization " +
    "(its own and system channels, enabled only) are exactly the ones listed. Existing policies are " +
    "updated in place and keep their ids; policies on disabled or unavailable channels are left untouched.";

  const owners = [
    {
      owner: "Database",
      base: "/databases/{id}",
      inheritNote:
        " A database with no policies of a kind inherits its project's; set an empty list to fall back to them.",
      access: "",
    },
    {
      owner: "Project",
      base: "/projects/{id}",
      inheritNote: " Project policies are the defaults for every database in the project.",
      access: " Requires an owner or admin of the project's organization.",
    },
  ];

  for (const { owner, base, inheritNote, access } of owners) {
    const params = z.object({ id: UuidParam });
    const lower = owner.toLowerCase();

    registry.registerPath({
      method: "get",
      path: `${base}/storage-policies`,
      tags,
      summary: `List the ${lower}'s storage policies`,
      description: access.trim() || undefined,
      security,
      request: { params },
      responses: {
        200: {
          description: "Storage policies",
          content: { "application/json": { schema: z.object({ data: z.array(StoragePolicySchema) }) } },
        },
        ...errorResponses(owner),
      },
    });

    registry.registerPath({
      method: "put",
      path: `${base}/storage-policies`,
      tags,
      summary: `Replace the ${lower}'s storage policies`,
      description: replaceNote + inheritNote + access,
      security,
      request: {
        params,
        body: { required: true, content: { "application/json": { schema: StoragePoliciesSchema } } },
      },
      responses: {
        200: {
          description: "Storage policies after the update",
          content: { "application/json": { schema: z.object({ data: z.array(StoragePolicySchema) }) } },
        },
        ...errorResponses(owner),
        ...invalid("Invalid request body, duplicate channel, or channel not available to the organization"),
      },
    });

    registry.registerPath({
      method: "get",
      path: `${base}/alert-policies`,
      tags,
      summary: `List the ${lower}'s alert policies`,
      description: access.trim() || undefined,
      security,
      request: { params },
      responses: {
        200: {
          description: "Alert policies",
          content: { "application/json": { schema: z.object({ data: z.array(AlertPolicySchema) }) } },
        },
        ...errorResponses(owner),
      },
    });

    registry.registerPath({
      method: "put",
      path: `${base}/alert-policies`,
      tags,
      summary: `Replace the ${lower}'s alert policies`,
      description:
        replaceNote +
        inheritNote +
        " Each policy needs at least one event kind; Redis and Valkey databases only accept backup-related kinds." +
        access,
      security,
      request: {
        params,
        body: { required: true, content: { "application/json": { schema: AlertPoliciesSchema } } },
      },
      responses: {
        200: {
          description: "Alert policies after the update",
          content: { "application/json": { schema: z.object({ data: z.array(AlertPolicySchema) }) } },
        },
        ...errorResponses(owner),
        ...invalid(
          "Invalid request body, duplicate channel, unsupported event kind, or channel not available to the organization"
        ),
      },
    });

    registry.registerPath({
      method: "get",
      path: `${base}/retention-policy`,
      tags,
      summary: `Get the ${lower}'s retention policy`,
      description: access.trim() || undefined,
      security,
      request: { params },
      responses: {
        200: {
          description: "Retention policy, or null when none is set",
          content: { "application/json": { schema: z.object({ data: RetentionPolicyRecordSchema.nullable() }) } },
        },
        ...errorResponses(owner),
      },
    });

    registry.registerPath({
      method: "put",
      path: `${base}/retention-policy`,
      tags,
      summary: `Set the ${lower}'s retention policy`,
      description:
        "Creates or replaces the retention policy; omitted settings take their defaults. " +
        `The ${lower} must have a backup schedule. Clearing the schedule removes the retention policy.` +
        access,
      security,
      request: {
        params,
        body: { required: true, content: { "application/json": { schema: RetentionPolicySchema } } },
      },
      responses: {
        200: {
          description: "Retention policy after the update",
          content: { "application/json": { schema: z.object({ data: RetentionPolicyRecordSchema }) } },
        },
        ...errorResponses(owner),
        ...invalid(`Invalid request body, or the ${lower} has no backup schedule`),
      },
    });
  }

  registry.registerPath({
    method: "put",
    path: "/projects/{id}/backup-policy",
    tags,
    summary: "Set or clear the default backup schedule for a project",
    description: "Requires an owner or admin of the project's organization.",
    security,
    request: {
      params: z.object({ id: UuidParam }),
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              schedule: z
                .string()
                .describe("A valid cron expression, or \"\" to clear the schedule"),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Updated project record",
        content: {
          "application/json": { schema: z.object({ data: z.any() }) },
        },
      },
      ...errorResponses("Project"),
      ...invalid("Invalid request body"),
    },
  });
}
