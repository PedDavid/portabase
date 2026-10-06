"use client";

import {X} from "lucide-react";
import {cn} from "@/lib/utils";
import type {BackupLabelFilter, BackupLabels} from "@/features/database/schemas/backup-labels.schema";

const chipClassName =
    "inline-flex max-w-full items-stretch overflow-hidden rounded-md border text-xs leading-5 whitespace-nowrap";

type BackupLabelChipProps = {
    labelKey: string;
    value: string;
    onClick?: () => void;
    title?: string;
};

/** One label as a two-segment chip: muted key, then value. */
export function BackupLabelChip({labelKey, value, onClick, title}: BackupLabelChipProps) {
    const content = (
        <>
            <span className="bg-muted px-1.5 text-muted-foreground">{labelKey}</span>
            <span className="truncate px-1.5 font-medium">{value}</span>
        </>
    );

    if (!onClick) {
        return <span className={chipClassName} title={title}>{content}</span>;
    }

    return (
        <button
            type="button"
            className={cn(chipClassName, "cursor-pointer transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
            onClick={onClick}
            title={title}
        >
            {content}
        </button>
    );
}

type BackupLabelChipsProps = {
    labels: BackupLabels;
    onSelect?: (filter: BackupLabelFilter) => void;
};

/** All labels of a backup, sorted by key, wrapping onto several lines when needed. */
export function BackupLabelChips({labels, onSelect}: BackupLabelChipsProps) {
    const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));

    if (entries.length === 0) return <span className="text-muted-foreground">-</span>;

    return (
        <div className="flex max-w-md flex-wrap gap-1">
            {entries.map(([key, value]) => (
                <BackupLabelChip
                    key={key}
                    labelKey={key}
                    value={value}
                    title={onSelect ? `Filter by ${key}=${value}` : `${key}=${value}`}
                    onClick={onSelect ? () => onSelect({key, value}) : undefined}
                />
            ))}
        </div>
    );
}

type BackupLabelFilterPillsProps = {
    filters: BackupLabelFilter[];
    onRemove: (filter: BackupLabelFilter) => void;
    onClear: () => void;
};

/** Active label filters shown above the backups table; each one can be removed. */
export function BackupLabelFilterPills({filters, onRemove, onClear}: BackupLabelFilterPillsProps) {
    if (filters.length === 0) return null;

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {filters.map((filter) => {
                const text = filter.value === undefined ? filter.key : `${filter.key}=${filter.value}`;
                return (
                    <span
                        key={text}
                        className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs"
                    >
                        <span className="text-muted-foreground">{filter.key}</span>
                        {filter.value !== undefined && <span className="font-medium">= {filter.value}</span>}
                        <button
                            type="button"
                            aria-label={`Remove filter ${text}`}
                            className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20"
                            onClick={() => onRemove(filter)}
                        >
                            <X className="size-3"/>
                        </button>
                    </span>
                );
            })}
            {filters.length > 1 && (
                <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={onClear}>
                    Clear all
                </button>
            )}
        </div>
    );
}
