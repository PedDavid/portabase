"use client"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {Separator} from "@/components/ui/separator";
import {BackupActionsForm} from "@/features/database/components/backup-actions-form";
import {BackupPresenceDetails} from "@/features/database/components/backup-presence-details";
import {BackupLabelsForm} from "@/features/database/components/backup-labels-form";
import {
    getBackupActionTextBasedOnActionKind,
    useBackupModal
} from "@/features/database/components/backup-modal-context";


type DatabaseActionsModalProps = {}


export const DatabaseBackupActionsModal = ({}: DatabaseActionsModalProps) => {
    const {open, action, backup, closeModal} = useBackupModal();
    if (!backup || !action) return null;
    const text = getBackupActionTextBasedOnActionKind(action);
    const isPresence = action === "presence";
    const isLabels = action === "labels";


    return (
        <Dialog open={open} onOpenChange={closeModal}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{isPresence || isLabels ? text : `${text} backup ?`}</DialogTitle>
                    <DialogDescription>
                        {isPresence
                            ? "Backup file presence per storage"
                            : isLabels
                                ? "Key/value labels to identify this backup, e.g. app=homebox, version=0.26.2"
                                : "Select the backup storage"}
                    </DialogDescription>
                    <Separator className="mt-3 mb-3"/>
                </DialogHeader>
                {isPresence
                    ? <BackupPresenceDetails backup={backup}/>
                    : isLabels
                        ? <BackupLabelsForm key={backup.id} backup={backup}/>
                        : <BackupActionsForm backup={backup} action={action}/>}
            </DialogContent>
        </Dialog>
    )
}