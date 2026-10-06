"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { backupButtonAction } from "@/features/database/actions/backup-button.action";
import { Check, DatabaseZap, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { ButtonWithConfirm } from "@/components/common/button-with-confirm";
import {
  BackupLabelsEditor,
  LabelRow,
  validateLabelRows,
} from "@/features/database/components/backup-labels-editor";
import { BackupLabels } from "@/features/database/schemas/backup-labels.schema";

export type BackupButtonProps = {
  databaseId: string;
  disable: boolean;
};

export const BackupButton = (props: BackupButtonProps) => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<LabelRow[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const validation = validateLabelRows(rows);

  const resetLabels = () => {
    setRows([]);
    setSubmitted(false);
  };

  const mutation = useMutation({
    mutationFn: async (labels: BackupLabels) => {
      const backup = await backupButtonAction({
        databaseId: props.databaseId,
        labels,
      });
      if (backup?.data?.success) {
        resetLabels();
        toast.success(
          backup.data.actionSuccess?.message || "Backup created successfully!",
        );
        queryClient.invalidateQueries({
          queryKey: ["database-data", props.databaseId],
        });
        queryClient.invalidateQueries({
          queryKey: ["backups", props.databaseId],
        });
        router.refresh();
      } else {
        toast.error(backup?.serverError || "Failed to create backup.");
      }
    },
  });

  return (
    <ButtonWithConfirm
      title="Create Backup"
      description={"Are you sure you want to create a backup?"}
      content={
        <BackupLabelsEditor
          compact
          rows={rows}
          onChange={setRows}
          validation={submitted ? validation : undefined}
        />
      }
      canConfirm={() => {
        setSubmitted(true);
        return validation.labels !== null;
      }}
      button={{
        main: {
          disabled: props.disable,
          text: isMobile ? "" : "Backup",
          variant: "default",
          icon: <DatabaseZap />,
        },
        confirm: {
          className: "w-full",
          text: "Yes, create backup",
          icon: <Check />,
          variant: "default",
          onClick: () => {
            if (validation.labels) mutation.mutate(validation.labels);
          },
        },
        cancel: {
          className: "w-full",
          text: "No, cancel",
          icon: <X />,
          variant: "outline",
          onClick: resetLabels,
        },
      }}
      isPending={mutation.isPending}
    />
  );
};
