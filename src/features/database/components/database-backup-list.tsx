"use client"
import {backupColumns} from "@/features/database/components/backup-columns";
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
import {ButtonWithLoading} from "@/components/common/button-with-loading";
import {MoreHorizontal, Trash2} from "lucide-react";
import {FilterItem, FiltersDropdown} from "@/components/common/table-filters";
import {DataTable} from "@/components/common/data-table";
import {useCallback, useMemo, useState} from "react";
import {Backup, BackupWith, DatabaseWith} from "@/db/schema/07_database";
import {Setting} from "@/db/schema/01_setting";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {MemberWithUser} from "@/db/schema/03_organization";
import {deleteBackupAction} from "@/features/database/actions/backup-actions.action";
import {ButtonWithConfirm} from "@/components/common/button-with-confirm";
import {useServerDataTable} from "@/hooks/use-server-data-table";
import {fetchBackupsAction} from "@/features/database/actions/backup-list.action";
import type {FetchBackupsSchema} from "@/features/database/actions/backup-list.schema";
import {BackupLabelFilterPills} from "@/features/database/components/backup-label-chips";
import type {BackupLabelFilter} from "@/features/database/schemas/backup-labels.schema";

const sameLabelFilter = (a: BackupLabelFilter, b: BackupLabelFilter) => a.key === b.key && a.value === b.value;

type DatabaseBackupListProps = {
    isAlreadyRestore: boolean;
    settings: Setting;
    database: DatabaseWith;
    activeMember: MemberWithUser;
}

export const DatabaseBackupList = (props: DatabaseBackupListProps) => {
    const items = [
        {label: "Deleted", value: "deleted"},
        {label: "Available", value: "available"},
    ];

    const [selectedFilters, setSelectedFilters] = useState<FilterItem[]>([items[1]]);
    const [isActionsOpen, setIsActionsOpen] = useState(false);
    const [labelFilters, setLabelFilters] = useState<BackupLabelFilter[]>([]);
    const queryClient = useQueryClient();

    const addLabelFilter = useCallback((filter: BackupLabelFilter) => {
        setLabelFilters((prev) => prev.some((f) => sameLabelFilter(f, filter)) ? prev : [...prev, filter]);
    }, []);

    const removeLabelFilter = (filter: BackupLabelFilter) =>
        setLabelFilters((prev) => prev.filter((f) => !sameLabelFilter(f, filter)));

    const columns = useMemo(() => {
        return backupColumns(props.isAlreadyRestore, props.settings, props.database, props.activeMember, addLabelFilter);
    }, [props.isAlreadyRestore, props.activeMember.id, props.activeMember.role, addLabelFilter]);

    const filter = useMemo<"available" | "deleted" | undefined>(() => {
        const values = selectedFilters.map((f) => f.value);
        if (values.length === 1) return values[0] as "available" | "deleted";
        return undefined;
    }, [selectedFilters]);

    const {data, tableProps, isFetching, isLoading} = useServerDataTable<BackupWith, FetchBackupsSchema>({
        fetchAction: fetchBackupsAction,
        queryKey: ["backups", props.database.id],
        extraParams: {databaseId: props.database.id, filter, labelFilters},
        initialPageSize: 20,
        refetchInterval: 4000,
    });

    const handleSelectFilter = (item: FilterItem) => {
        setSelectedFilters(prev =>
            prev.some(f => f.value === item.value)
                ? prev.filter(f => f.value !== item.value)
                : [...prev, item]
        );
    };

    const clearFilters = () => setSelectedFilters([]);

    const mutationDeleteBackups = useMutation({
        mutationFn: async (backups: Backup[]) => {
            const results = await Promise.all(
                backups.map(async (backup) => {
                    if (backup.deletedAt == null || backup.status == "ongoing") {
                        const backupDeleted = await deleteBackupAction({
                            databaseId: backup.databaseId,
                            backupId: backup.id,
                        });
                        return {
                            success: backupDeleted?.data?.success,
                            message: backupDeleted?.data?.success
                                ? backupDeleted?.data?.actionSuccess?.message
                                : "Failed to delete backup.",
                        };
                    }
                    return {
                        success: true,
                        message: `Already deleted this backup (ref: ${backup.id}).`,
                    };
                })
            );
            results.forEach((result) => {
                if (result.success) {
                    toast.success(result.message);
                } else {
                    toast.error(result.message);
                }
            });
            queryClient.invalidateQueries({queryKey: ["backups", props.database.id]});
        },
    });

    const isMember = props.activeMember.role === "member";

    return (
        <DataTable
            enableSelect={!isMember}
            columns={columns}
            data={data}
            enablePagination
            isFetching={isFetching || isLoading}
            {...tableProps}
            selectedActions={(rows) => (
                <>
                    <div className="flex justify-start md:justify-between gap-3 md:gap-0 items-center w-full ml-0">
                        <div className="flex gap-2">
                            {!isMember && (
                                <DropdownMenu open={isActionsOpen} onOpenChange={setIsActionsOpen}>
                                    <DropdownMenuTrigger asChild>
                                        <ButtonWithLoading
                                            variant="outline"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsActionsOpen(true);
                                            }}
                                            disabled={rows.length === 0 || mutationDeleteBackups.isPending}
                                            icon={<MoreHorizontal/>}
                                            isPending={mutationDeleteBackups.isPending}
                                            size="sm"
                                            type="button"
                                        >Actions</ButtonWithLoading>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                        <ButtonWithConfirm
                                            onConfirm={() => {
                                                mutationDeleteBackups.mutate(rows);
                                                setIsActionsOpen(false);
                                            }}
                                            onCancel={() => setIsActionsOpen(false)}
                                            title="Delete backups?"
                                            description="Are you sure you want to delete the selected backups? This action cannot be undone."
                                            confirmButtonText="Yes, delete"
                                            cancelButtonText="Cancel"
                                        >
                                            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                                <Trash2 className="me-2 h-4 w-4 text-red-600"/>
                                                <span className="text-red-600">Delete Selected</span>
                                            </DropdownMenuItem>
                                        </ButtonWithConfirm>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                            <FiltersDropdown
                                items={items}
                                selectedItems={selectedFilters}
                                onSelect={handleSelectFilter}
                                clearFilters={clearFilters}
                            />
                            <BackupLabelFilterPills
                                filters={labelFilters}
                                onRemove={removeLabelFilter}
                                onClear={() => setLabelFilters([])}
                            />
                        </div>
                    </div>
                </>
            )}
        />
    );
};
