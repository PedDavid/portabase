"use client";

import {Plus, X} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {cn} from "@/lib/utils";
import {
    BACKUP_LABEL_KEY_MAX_LENGTH,
    BACKUP_LABEL_VALUE_MAX_LENGTH,
    BACKUP_LABELS_MAX_COUNT,
    BackupLabelKeySchema,
    BackupLabels,
    BackupLabelsSchema,
    BackupLabelValueSchema,
} from "@/features/database/schemas/backup-labels.schema";

export type LabelRow = { id: string; key: string; value: string };
export type LabelRowErrors = Record<string, { key?: string; value?: string }>;
export type LabelRowsValidation = { labels: BackupLabels | null; errors: LabelRowErrors; formError?: string };

let nextRowId = 0;

export function newLabelRow(key = "", value = ""): LabelRow {
    nextRowId += 1;
    return {id: `label-row-${nextRowId}`, key, value};
}

export function labelRowsFromLabels(labels: BackupLabels): LabelRow[] {
    return Object.entries(labels)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => newLabelRow(key, value));
}

/** Validates the rows with the shared label schemas. Rows left completely blank are ignored. */
export function validateLabelRows(rows: LabelRow[]): LabelRowsValidation {
    const errors: LabelRowErrors = {};
    const labels: BackupLabels = {};
    const filled = rows.filter((row) => row.key.trim() !== "" || row.value.trim() !== "");

    for (const row of filled) {
        const key = row.key.trim();
        const rowErrors: { key?: string; value?: string } = {};

        const keyResult = BackupLabelKeySchema.safeParse(key);
        if (key === "") rowErrors.key = "Key is required";
        else if (!keyResult.success) rowErrors.key = keyResult.error.issues[0]?.message;
        else if (Object.hasOwn(labels, key)) rowErrors.key = "Duplicate key";

        const valueResult = BackupLabelValueSchema.safeParse(row.value);
        if (!valueResult.success) rowErrors.value = valueResult.error.issues[0]?.message;

        if (rowErrors.key || rowErrors.value) {
            errors[row.id] = rowErrors;
        } else if (valueResult.success) {
            labels[key] = valueResult.data;
        }
    }

    if (Object.keys(errors).length > 0) return {labels: null, errors};

    if (filled.length > BACKUP_LABELS_MAX_COUNT) {
        return {labels: null, errors, formError: `At most ${BACKUP_LABELS_MAX_COUNT} labels per backup`};
    }

    const result = BackupLabelsSchema.safeParse(labels);
    return result.success
        ? {labels: result.data, errors}
        : {labels: null, errors, formError: result.error.issues[0]?.message};
}

type BackupLabelsEditorProps = {
    rows: LabelRow[];
    onChange: (rows: LabelRow[]) => void;
    /** Errors to show inline, usually from validateLabelRows after a submit attempt. */
    validation?: LabelRowsValidation;
    /** Smaller inputs for tight spaces such as a popover. */
    compact?: boolean;
    disabled?: boolean;
};

export function BackupLabelsEditor({rows, onChange, validation, compact, disabled}: BackupLabelsEditorProps) {
    const inputClassName = compact ? "h-8 text-sm" : undefined;
    const lastRowId = rows[rows.length - 1]?.id;

    const updateRow = (id: string, patch: Partial<LabelRow>) =>
        onChange(rows.map((row) => (row.id === id ? {...row, ...patch} : row)));

    return (
        <div className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2")}>
            {rows.length > 0 && (
                <div className={cn("grid grid-cols-[1fr_1fr_auto] gap-x-2 text-muted-foreground", compact ? "text-xs" : "text-sm")}>
                    <span>Key</span>
                    <span>Value</span>
                    <span className={compact ? "w-8" : "w-9"}/>
                </div>
            )}
            {rows.length === 0 && !compact && (
                <p className="text-sm text-muted-foreground">This backup has no labels.</p>
            )}
            {rows.map((row) => {
                const errors = validation?.errors[row.id];
                return (
                    <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] items-start gap-x-2" data-testid="label-row">
                        <div className="min-w-0">
                            <Input
                                aria-label="Label key"
                                placeholder="key"
                                className={inputClassName}
                                value={row.key}
                                maxLength={BACKUP_LABEL_KEY_MAX_LENGTH}
                                disabled={disabled}
                                autoFocus={row.id === lastRowId && row.key === "" && row.value === ""}
                                aria-invalid={!!errors?.key}
                                onChange={(e) => updateRow(row.id, {key: e.target.value})}
                            />
                            {errors?.key && <p className="mt-1 text-xs text-destructive">{errors.key}</p>}
                        </div>
                        <div className="min-w-0">
                            <Input
                                aria-label="Label value"
                                placeholder="value"
                                className={inputClassName}
                                value={row.value}
                                maxLength={BACKUP_LABEL_VALUE_MAX_LENGTH}
                                disabled={disabled}
                                aria-invalid={!!errors?.value}
                                onChange={(e) => updateRow(row.id, {value: e.target.value})}
                            />
                            {errors?.value && <p className="mt-1 text-xs text-destructive">{errors.value}</p>}
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={compact ? "size-8" : undefined}
                            aria-label={`Remove label ${row.key}`.trim()}
                            disabled={disabled}
                            onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
                        >
                            <X/>
                        </Button>
                    </div>
                );
            })}
            {validation?.formError && <p className="text-xs text-destructive">{validation.formError}</p>}
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                disabled={disabled || rows.length >= BACKUP_LABELS_MAX_COUNT}
                onClick={() => onChange([...rows, newLabelRow()])}
            >
                <Plus/> Add label
            </Button>
        </div>
    );
}
