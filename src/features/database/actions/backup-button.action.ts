"use server";

import {z} from "zod";
import {db} from "@/db";
import {ServerActionResult} from "@/types/action-type";
import * as drizzleDb from "@/db";
import {Backup} from "@/db/schema/07_database";
import {withUpdatedAt} from "@/db/utils";
import {userAction} from "@/lib/safe-actions/actions";
import {BackupLabelsSchema} from "@/features/database/schemas/backup-labels.schema";

export const backupButtonAction = userAction.inputSchema(
    z.object({
        databaseId: z.string(),
        labels: BackupLabelsSchema.optional(),
    })
).action(async ({parsedInput}): Promise<ServerActionResult<Backup>> => {
  const {databaseId, labels} = parsedInput;


  console.log("Creating backup for databaseId:", databaseId);

  try {
        const [createdBackup] = await db
            .insert(drizzleDb.schemas.backup)
            .values({
                databaseId,
                status: "waiting",
                labels,
            })
            .returning();

        return {
            success: true,
            value: createdBackup,
            actionSuccess: {
                message: "Backup has been successfully created.",
                messageParams: {databaseId},
            },
        };
    } catch (error) {
        console.error("Error creating backup:", error);

        return {
            success: false,
            actionError: {
                message: "Failed to create backup.",
                status: 500,
                cause: error instanceof Error ? error.message : "Unknown error",
                messageParams: {databaseId},
            },
        };
    }
});
