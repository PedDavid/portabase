import { NextResponse } from "next/server";
import { withApiKey } from "@/lib/api-v1/middleware";
import { db } from "@/db";
import * as drizzleDb from "@/db";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { ApiKeyContext } from "@/lib/api-v1/types";
import {requireDatabaseAccess} from "@/lib/api-v1/services/databases";
import { parseJsonBody } from "@/lib/api-v1/validation/json-body";
import {
  applyBackupLabelsPatch,
  BackupLabels,
  BackupLabelsPatchSchema,
  BackupLabelsSchema,
} from "@/features/database/schemas/backup-labels.schema";
import { withUpdatedAt } from "@/db/utils";

const log = logger.child({
  module: "api/v1/databases/[id]/backup/[backupId]",
});

// `labels` is a JSON merge patch (RFC 7396): a string sets a label, null removes it,
// and `labels: null` removes them all.
const UpdateBackupSchema = z.object({
  labels: BackupLabelsPatchSchema.nullable(),
});

function sameLabels(a: BackupLabels, b: BackupLabels) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

export const GET = withApiKey(
    async (_req: Request, ctx: ApiKeyContext, params?: Record<string, string>) => {
      try {
        const guard = await requireDatabaseAccess(params, ctx.user);

        if (!guard.ok) {
          return guard.response;
        }

        const { id } = guard.data;
        const backupId = params?.backupId;

        if (!backupId) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const backup = await db.query.backup.findFirst({
          where: and(
              eq(drizzleDb.schemas.backup.id, backupId),
              eq(drizzleDb.schemas.backup.databaseId, id),
              isNull(drizzleDb.schemas.backup.deletedAt)
          ),
          with: {
            storages: {
              where: (backupStorage, { isNull }) =>
                  isNull(backupStorage.deletedAt),
            },
          },
        });

        if (!backup) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        return NextResponse.json({ data: backup });
      } catch (error) {
        log.error(
            { error },
            "Error in GET /api/v1/databases/[id]/backup/[backupId]"
        );

        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
      }
    }
);

export const PATCH = withApiKey(
    async (req: Request, ctx: ApiKeyContext, params?: Record<string, string>) => {
      try {
        const guard = await requireDatabaseAccess(params, ctx.user);

        if (!guard.ok) {
          return guard.response;
        }

        const { id } = guard.data;
        const backupId = params?.backupId;

        if (!backupId) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const body = await parseJsonBody(req, UpdateBackupSchema);

        if (!body.ok) {
          return body.response;
        }

        const patch = body.data.labels;

        const result = await db.transaction(async (tx) => {
          const [current] = await tx
              .select()
              .from(drizzleDb.schemas.backup)
              .where(
                  and(
                      eq(drizzleDb.schemas.backup.id, backupId),
                      eq(drizzleDb.schemas.backup.databaseId, id),
                      isNull(drizzleDb.schemas.backup.deletedAt)
                  )
              )
              .for("update");

          if (!current) {
            return { status: 404 as const };
          }

          const merged = BackupLabelsSchema.safeParse(
              patch === null ? {} : applyBackupLabelsPatch(current.labels, patch)
          );

          if (!merged.success) {
            return {
              status: 422 as const,
              error: merged.error.issues[0]?.message ?? "Invalid labels",
            };
          }

          if (sameLabels(current.labels, merged.data)) {
            return { status: 200 as const, backup: current };
          }

          const [updated] = await tx
              .update(drizzleDb.schemas.backup)
              .set(withUpdatedAt({ labels: merged.data }))
              .where(eq(drizzleDb.schemas.backup.id, current.id))
              .returning();

          return { status: 200 as const, backup: updated };
        });

        if (result.status === 404) {
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        if (result.status === 422) {
          return NextResponse.json({ error: result.error }, { status: 422 });
        }

        return NextResponse.json({ data: result.backup });
      } catch (error) {
        log.error(
            { error },
            "Error in PATCH /api/v1/databases/[id]/backup/[backupId]"
        );

        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
      }
    }
);
