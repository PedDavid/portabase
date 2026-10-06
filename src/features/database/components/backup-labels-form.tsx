"use client";

import {useState} from "react";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {ButtonWithLoading} from "@/components/common/button-with-loading";
import {BackupWith} from "@/db/schema/07_database";
import {updateBackupLabelsAction} from "@/features/database/actions/backup-actions.action";
import {useBackupModal} from "@/features/database/components/backup-modal-context";
import {
    BackupLabelsEditor,
    labelRowsFromLabels,
    LabelRow,
    validateLabelRows,
} from "@/features/database/components/backup-labels-editor";
import {BackupLabels} from "@/features/database/schemas/backup-labels.schema";

type BackupLabelsFormProps = {
    backup: BackupWith;
};

export const BackupLabelsForm = ({backup}: BackupLabelsFormProps) => {
    const {closeModal} = useBackupModal();
    const queryClient = useQueryClient();
    const router = useRouter();
    const [rows, setRows] = useState<LabelRow[]>(() => labelRowsFromLabels(backup.labels));
    const [submitted, setSubmitted] = useState(false);
    const validation = validateLabelRows(rows);

    const mutation = useMutation({
        mutationFn: async (labels: BackupLabels) => {
            const result = await updateBackupLabelsAction({
                backupId: backup.id,
                databaseId: backup.databaseId,
                labels,
            });
            const inner = result?.data;

            if (inner?.success) {
                toast.success(inner.actionSuccess?.message);
                queryClient.invalidateQueries({
                    queryKey: ["backups", backup.databaseId],
                });
                router.refresh();
                closeModal();
            } else {
                toast.error(
                    inner?.actionError?.message ??
                    (result?.validationErrors ? "Invalid labels." : undefined) ??
                    result?.serverError ??
                    "An error occurred."
                );
            }
        },
    });

    return (
        <form
            className="flex flex-col gap-4 mb-1"
            onSubmit={async (e) => {
                e.preventDefault();
                setSubmitted(true);
                if (validation.labels) await mutation.mutateAsync(validation.labels);
            }}
        >
            <BackupLabelsEditor
                rows={rows}
                onChange={setRows}
                validation={submitted ? validation : undefined}
                disabled={mutation.isPending}
            />
            <ButtonWithLoading type="submit" isPending={mutation.isPending} disabled={mutation.isPending} className="ml-auto">
                Save
            </ButtonWithLoading>
        </form>
    );
};
