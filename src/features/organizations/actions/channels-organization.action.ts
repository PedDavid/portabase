"use server"
import {userAction} from "@/lib/safe-actions/actions";
import {z} from "zod";
import {ServerActionResult} from "@/types/action-type";
import {
    setNotificationChannelOrganizationsService,
    setStorageChannelOrganizationsService,
} from "@/features/channel/services/channel.service";


export const updateNotificationChannelsOrganizationAction = userAction
    .inputSchema(
        z.object({
            data: z.array(z.string()),
            id: z.string(),
        })
    )
    .action(async ({parsedInput}): Promise<ServerActionResult<null>> => {
        try {
            const organizationsIds = parsedInput.data;
            const notificationChannelId = parsedInput.id;

            const found = await setNotificationChannelOrganizationsService(notificationChannelId, organizationsIds);

            if (!found) {
                return {
                    success: false,
                    actionError: {
                        message: "Notification channel not found.",
                        status: 404,
                        cause: "not_found",
                    },
                };
            }

            return {
                success: true,
                value: null,
                actionSuccess: {
                    message: "Notification channel organizations has been successfully updated.",
                    messageParams: {notificationChannelId: notificationChannelId},
                },
            };
        } catch (error) {
            return {
                success: false,
                actionError: {
                    message: "Failed to update notification channel.",
                    status: 500,
                    cause: "server_error",
                    messageParams: {message: "Error updating the notification channel"},
                },
            };
        }
    });


export const updateStorageChannelsOrganizationAction = userAction
    .inputSchema(
        z.object({
            data: z.array(z.string()),
            id: z.string(),
        })
    )
    .action(async ({parsedInput}): Promise<ServerActionResult<null>> => {
        try {
            const organizationsIds = parsedInput.data;
            const storageChannelId = parsedInput.id;

            const found = await setStorageChannelOrganizationsService(storageChannelId, organizationsIds);

            if (!found) {
                return {
                    success: false,
                    actionError: {
                        message: "Storage channel not found.",
                        status: 404,
                        cause: "not_found",
                    },
                };
            }

            return {
                success: true,
                value: null,
                actionSuccess: {
                    message: "Storage channel organizations has been successfully updated.",
                    messageParams: {storageChannelId: storageChannelId},
                },
            };
        } catch (error) {
            return {
                success: false,
                actionError: {
                    message: "Failed to update storage channel.",
                    status: 500,
                    cause: "server_error",
                    messageParams: {message: "Error updating the storage channel"},
                },
            };
        }
    });
