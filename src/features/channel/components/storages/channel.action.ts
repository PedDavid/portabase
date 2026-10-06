"use server";

import { z } from "zod";
import { ServerActionResult } from "@/types/action-type";
import { userAction } from "@/lib/safe-actions/actions";
import { StorageChannelFormSchema } from "@/features/channel/schemas/channel-form.schema";
import { StorageChannel } from "@/db/schema/12_storage-channel";
import {
  createStorageChannelService,
  deleteStorageChannelService,
  updateStorageChannelService,
} from "@/features/channel/services/channel.service";

export const addStorageChannelAction = userAction
  .inputSchema(
    z.object({
      organizationId: z.string().optional(),
      data: StorageChannelFormSchema,
    }),
  )
  .action(
    async ({ parsedInput }): Promise<ServerActionResult<StorageChannel>> => {
      const { organizationId, data } = parsedInput;

      try {
        const channel = await createStorageChannelService(
          data,
          organizationId ?? null,
        );

        return {
          success: true,
          value: {
            ...channel,
            config: channel.config as JSON,
          },
          actionSuccess: {
            message: "Storage channel has been successfully created.",
            messageParams: { id: channel.id },
          },
        };
      } catch (_error) {
        const error = _error;
        return {
          success: false,
          actionError: {
            message: "Failed to create storage channel.",
            status: 500,
            cause: error instanceof Error ? error.message : "Unknown error",
            messageParams: { id: "" },
          },
        };
      }
    },
  );

export const removeStorageChannelAction = userAction
  .inputSchema(
    z.object({
      organizationId: z.string().optional(),
      id: z.string(),
    }),
  )
  .action(
    async ({ parsedInput }): Promise<ServerActionResult<StorageChannel>> => {
      const { organizationId, id } = parsedInput;

      try {
        const deletedChannel = await deleteStorageChannelService(
          id,
          organizationId,
        );

        if (!deletedChannel) {
          return {
            success: false,
            actionError: {
              message: "Storage channel not found.",
              status: 404,
              messageParams: { id: id },
            },
          };
        }

        return {
          success: true,
          value: {
            ...deletedChannel,
            config: deletedChannel.config as JSON,
          },
          actionSuccess: {
            message: "Storage channel has been successfully removed.",
            messageParams: { id: id },
          },
        };
      } catch (_error) {
        const error = _error;
        return {
          success: false,
          actionError: {
            message: "Failed to remove storage channel.",
            status: 500,
            cause: error instanceof Error ? error.message : "Unknown error",
            messageParams: { id: id },
          },
        };
      }
    },
  );

export const updateStorageChannelAction = userAction
  .inputSchema(
    z.object({
      id: z.string(),
      data: StorageChannelFormSchema,
    }),
  )
  .action(
    async ({ parsedInput }): Promise<ServerActionResult<StorageChannel>> => {
      const { id, data } = parsedInput;

      try {
        const channel = (await updateStorageChannelService(id, data))!;

        return {
          success: true,
          value: {
            ...channel,
            config: channel.config as JSON,
          },
          actionSuccess: {
            message: `Storage channel "${channel.name}" has been successfully updated.`,
            messageParams: { id: channel.id },
          },
        };
      } catch (_error) {
        const error = _error;
        return {
          success: false,
          actionError: {
            message: "Failed to update storage channel.",
            status: 500,
            cause: error instanceof Error ? error.message : "Unknown error",
            messageParams: { id: "" },
          },
        };
      }
    },
  );
