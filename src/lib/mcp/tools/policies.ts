import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiV1Fetch } from "@/lib/mcp/http-client";
import { err, ok } from "@/lib/mcp/tools/response";
import {
  AlertPoliciesSchema,
  RetentionPolicySchema,
  StoragePoliciesSchema,
} from "@/lib/api-v1/validation/policies";

const scopeParams = {
  scope: z
    .enum(["database", "project"])
    .describe("Whether the policies belong to a database or to a project (project policies are the defaults for its databases)"),
  id: z.string().describe("Database or project ID"),
};

const basePath = (scope: "database" | "project", id: string) =>
  `/api/v1/${scope === "database" ? "databases" : "projects"}/${id}`;

const replaceNote =
  "Replaces the list: policies on enabled channels available to the organization end up exactly as given " +
  "(existing ones keep their ids); policies on disabled or unavailable channels are left untouched.";

export function registerPolicyTools(server: McpServer, apiKey: string) {
  server.tool(
    "get_storage_policies",
    "List the storage policies (backup destinations) of a database or project",
    scopeParams,
    async ({ scope, id }) => {
      const result = await apiV1Fetch(`${basePath(scope, id)}/storage-policies`, { method: "GET" }, apiKey);
      return result.ok ? ok(result.data) : err(result.error);
    },
  );

  server.tool(
    "set_storage_policies",
    `Set the storage policies (backup destinations) of a database or project. ${replaceNote}`,
    { ...scopeParams, policies: StoragePoliciesSchema.shape.policies },
    async ({ scope, id, policies }) => {
      const result = await apiV1Fetch(
        `${basePath(scope, id)}/storage-policies`,
        { method: "PUT", body: JSON.stringify({ policies }) },
        apiKey,
      );
      return result.ok ? ok(result.data) : err(result.error);
    },
  );

  server.tool(
    "get_alert_policies",
    "List the alert policies (notification channels and event kinds) of a database or project",
    scopeParams,
    async ({ scope, id }) => {
      const result = await apiV1Fetch(`${basePath(scope, id)}/alert-policies`, { method: "GET" }, apiKey);
      return result.ok ? ok(result.data) : err(result.error);
    },
  );

  server.tool(
    "set_alert_policies",
    `Set the alert policies of a database or project. Each policy needs at least one event kind. ${replaceNote}`,
    { ...scopeParams, policies: AlertPoliciesSchema.shape.policies },
    async ({ scope, id, policies }) => {
      const result = await apiV1Fetch(
        `${basePath(scope, id)}/alert-policies`,
        { method: "PUT", body: JSON.stringify({ policies }) },
        apiKey,
      );
      return result.ok ? ok(result.data) : err(result.error);
    },
  );

  server.tool(
    "get_retention_policy",
    "Get the backup retention policy of a database or project (null when none is set)",
    scopeParams,
    async ({ scope, id }) => {
      const result = await apiV1Fetch(`${basePath(scope, id)}/retention-policy`, { method: "GET" }, apiKey);
      return result.ok ? ok(result.data) : err(result.error);
    },
  );

  server.tool(
    "set_retention_policy",
    "Create or replace the backup retention policy of a database or project. Requires a backup schedule; omitted settings take their defaults.",
    { ...scopeParams, ...RetentionPolicySchema.shape },
    async ({ scope, id, ...settings }) => {
      const result = await apiV1Fetch(
        `${basePath(scope, id)}/retention-policy`,
        { method: "PUT", body: JSON.stringify(settings) },
        apiKey,
      );
      return result.ok ? ok(result.data) : err(result.error);
    },
  );

  server.tool(
    "set_project_backup_policy",
    "Set or clear a project's default backup schedule. Provide a cron expression, or an empty string to clear it (which also drops the project's retention policy).",
    {
      id: z.string().describe("Project ID"),
      schedule: z
        .string()
        .describe("A valid cron expression, or an empty string to clear the schedule"),
    },
    async ({ id, schedule }) => {
      const result = await apiV1Fetch(
        `/api/v1/projects/${id}/backup-policy`,
        { method: "PUT", body: JSON.stringify({ schedule }) },
        apiKey,
      );
      return result.ok ? ok(result.data) : err(result.error);
    },
  );
}
