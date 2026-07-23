"use client";

import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";

export function TenantUnsavedChangesToast({
  isSaving,
  message,
  resetLabel,
  saveLabel,
  onReset,
  onSave,
}: {
  isSaving: boolean;
  message: string;
  resetLabel: string;
  saveLabel: string;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-xl border border-border/70 bg-popover p-2 text-popover-foreground shadow-lg"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
        <HugeiconsIcon
          icon={InformationCircleIcon}
          strokeWidth={2}
          aria-hidden="true"
          data-icon="inline-start"
        />
        <span className="truncate text-sm">{message}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={isSaving}
          onClick={onReset}
        >
          {resetLabel}
        </Button>
        <Button type="button" size="sm" disabled={isSaving} onClick={onSave}>
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
