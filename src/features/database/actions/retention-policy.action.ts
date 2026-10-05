"use server"

import {z} from "zod"
import {
    RetentionSettingsSchema
} from "@/features/database/schemas/retention-policy.schema";
import {PolicyScopeSchema} from "@/features/database/schemas/policy-scope.schema";
import {userAction} from "@/lib/safe-actions/actions";
import {upsertRetentionPolicyService} from "@/features/database/services/retention-policy.service";


export const updateOrCreateBackupRetentionPolicyAction = userAction
    .inputSchema(
        z.object({
            scope: PolicyScopeSchema,
            settings: RetentionSettingsSchema,
        })
    )
    .action(async ({parsedInput}) => {
        const {scope, settings} = parsedInput;
        const updated = await upsertRetentionPolicyService(scope, settings);
        return {data: updated};
    });
