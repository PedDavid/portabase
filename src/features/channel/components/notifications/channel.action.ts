"use server";

import { z } from "zod";
import { ServerActionResult } from "@/types/action-type";
import { userAction } from "@/lib/safe-actions/actions";
import { NotificationChannel } from "@/db/schema/09_notification-channel";
import { NotificationChannelFormSchema } from "@/features/channel/schemas/channel-form.schema";
import {
  createNotificationChannelService,
  deleteNotificationChannelService,
  updateNotificationChannelService,
} from "@/features/channel/services/channel.service";

export const addNotificationChannelAction = userAction
  .inputSchema(
    z.object({
      organizationId: z.string().optional(),
      data: NotificationChannelFormSchema,
    }),
  )
  .action(
    async ({
      parsedInput,
    }): Promise<ServerActionResult<NotificationChannel>> => {
      const { organizationId, data } = parsedInput;
      try {
        const channel = await createNotificationChannelService(
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
            message: "Notification channel has been successfully created.",
            messageParams: { notificationChannelId: channel.id },
          },
        };
      } catch (_error) {
        const error = _error;
        return {
          success: false,
          actionError: {
            message: "Failed to create notification channel.",
            status: 500,
            cause: error instanceof Error ? error.message : "Unknown error",
            messageParams: { notificationChannelId: "" },
          },
        };
      }
    },
  );

export const removeNotificationChannelAction = userAction
  .inputSchema(
    z.object({
      organizationId: z.string().optional(),
      notificationChannelId: z.string(),
    }),
  )
  .action(
    async ({
      parsedInput,
    }): Promise<ServerActionResult<NotificationChannel>> => {
      const { organizationId, notificationChannelId } = parsedInput;

      try {
        const deletedChannel = await deleteNotificationChannelService(
          notificationChannelId,
          organizationId,
        );

        if (!deletedChannel) {
          return {
            success: false,
            actionError: {
              message: "Notification channel not found.",
              status: 404,
              messageParams: { notificationChannelId: notificationChannelId },
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
            message: "Notification channel has been successfully removed.",
            messageParams: { notificationChannelId: notificationChannelId },
          },
        };
      } catch (_error) {
        const error = _error;
        return {
          success: false,
          actionError: {
            message: "Failed to remove notification channel.",
            status: 500,
            cause: error instanceof Error ? error.message : "Unknown error",
            messageParams: { notificationChannelId: notificationChannelId },
          },
        };
      }
    },
  );

export const updateNotificationChannelAction = userAction
  .inputSchema(
    z.object({
      id: z.string(),
      data: NotificationChannelFormSchema,
    }),
  )
  .action(
    async ({
      parsedInput,
    }): Promise<ServerActionResult<NotificationChannel>> => {
      const { id, data } = parsedInput;

      try {
        const channel = (await updateNotificationChannelService(id, data))!;

        return {
          success: true,
          value: {
            ...channel,
            config: channel.config as JSON,
          },
          actionSuccess: {
            message: `Notification channel "${channel.name}" has been successfully updated.`,
            messageParams: { id: channel.id },
          },
        };
      } catch (_error) {
        const error = _error;
        return {
          success: false,
          actionError: {
            message: "Failed to update notification channel.",
            status: 500,
            cause: error instanceof Error ? error.message : "Unknown error",
            messageParams: { id: "" },
          },
        };
      }
    },
  );
