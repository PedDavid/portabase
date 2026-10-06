import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { err, ok } from "@/lib/mcp/tools/response";
import { apiV1Fetch } from "@/lib/mcp/http-client";

// The API validates keys and values (see backup-labels.schema); these schemas only describe them.
const labelsParam = z
  .record(z.string(), z.string())
  .describe(
    'Key/value labels, e.g. {"app": "homebox", "version": "0.26.2"}. Keys are lowercase ' +
      "letters, digits, '.', '_' or '-' (max 63 chars); values are non-empty strings (max 255 chars); at most 32 labels.",
  );

export function registerBackupTools(server: McpServer, apiKey: string) {
  server.tool(
    "list_backups",
    "List all backups for a specific database, ordered by most recent first. Optionally filter by labels.",
    {
      databaseId: z.string().describe("Database ID"),
      label: z
        .array(z.string())
        .optional()
        .describe(
          'Label filters, combined with AND: "key=value" matches that exact value, "key" matches any backup that has the label',
        ),
    },
    async ({ databaseId, label }) => {
      const query = new URLSearchParams((label ?? []).map((l) => ["label", l]));
      const result = await apiV1Fetch(
        `/api/v1/databases/${databaseId}/backup${query.size ? `?${query}` : ""}`,
        { method: "GET" },
        apiKey,
      );
      return result.ok ? ok(result.data) : err(result.error);
    },
  );

  server.tool(
    "get_backup",
    "Get details for a specific backup, including its storage locations",
    {
      databaseId: z.string().describe("Database ID"),
      backupId: z.string().describe("Backup ID"),
    },
    async ({ databaseId, backupId }) => {
      const result = await apiV1Fetch(
        `/api/v1/databases/${databaseId}/backup/${backupId}`,
        { method: "GET" },
        apiKey,
      );
      return result.ok ? ok(result.data) : err(result.error);
    },
  );

  server.tool(
    "trigger_backup",
    "Trigger an immediate backup for a database. Returns 409 if a backup is already running.",
    {
      databaseId: z.string().describe("Database ID"),
      labels: labelsParam.optional(),
    },
    async ({ databaseId, labels }) => {
      const result = await apiV1Fetch(
        `/api/v1/databases/${databaseId}/backup`,
        { method: "POST", body: JSON.stringify({ labels }) },
        apiKey,
      );
      return result.ok ? ok(result.data) : err(result.error);
    },
  );

  server.tool(
    "update_backup_labels",
    "Update a backup's labels with JSON merge patch semantics: a string value sets the label, null removes it, and labels not mentioned are kept.",
    {
      databaseId: z.string().describe("Database ID"),
      backupId: z.string().describe("Backup ID"),
      labels: z
        .record(z.string(), z.string().nullable())
        .describe('Labels to set or remove, e.g. {"version": "0.26.3", "note": null}'),
    },
    async ({ databaseId, backupId, labels }) => {
      const result = await apiV1Fetch(
        `/api/v1/databases/${databaseId}/backup/${backupId}`,
        { method: "PATCH", body: JSON.stringify({ labels }) },
        apiKey,
      );
      return result.ok ? ok(result.data) : err(result.error);
    },
  );

  server.tool(
    "trigger_restore",
    "Trigger a database restore from a specific backup storage. Use get_backup to find available backupStorageId values. Returns 409 if a restore is already running.",
    {
      databaseId: z.string().describe("Database ID"),
      backupId: z.string().uuid().describe("Backup ID"),
      backupStorageId: z
        .uuid()
        .describe("Backup storage ID (from get_backup storages list)"),
    },
    async ({ databaseId, backupId, backupStorageId }) => {
      const result = await apiV1Fetch(
        `/api/v1/databases/${databaseId}/restore`,
        {
          method: "POST",
          body: JSON.stringify({ backupId, backupStorageId }),
        },
        apiKey,
      );
      return result.ok ? ok(result.data) : err(result.error);
    },
  );
}
