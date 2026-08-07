"use client";

import { Bug, ChevronDown, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export type ClassroomPreviewOption = {
  id: string;
  label: string;
  group: "Dialogs" | "Overlays" | "Controls" | "Notifications";
  onSelect: () => void;
  isActive?: boolean;
};

type ClassroomUiPreviewProps = {
  roleLabel: string;
  options: ClassroomPreviewOption[];
  onReset: () => void;
};

const GROUPS: ClassroomPreviewOption["group"][] = [
  "Dialogs",
  "Overlays",
  "Controls",
  "Notifications",
];

export function ClassroomUiPreview({
  roleLabel,
  options,
  onReset,
}: ClassroomUiPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <Button
        type="button"
        size="icon"
        className="fixed bottom-4 right-4 z-[2000] size-11 rounded-full shadow-xl"
        title="Open classroom UI preview"
        onClick={() => setIsOpen(true)}
      >
        <Bug className="size-5" />
      </Button>
    );
  }

  return (
    <aside className="fixed bottom-3 right-3 z-[2000] flex max-h-[calc(100dvh-1.5rem)] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-2xl">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Bug className="size-4 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Classroom UI preview</p>
          <p className="truncate text-xs text-muted-foreground">
            Development only · {roleLabel}
          </p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8"
          title="Reset preview"
          onClick={onReset}
        >
          <X className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8"
          title="Collapse preview"
          onClick={() => setIsOpen(false)}
        >
          <ChevronDown className="size-4" />
        </Button>
      </div>

      <div className="overflow-y-auto p-3">
        {GROUPS.map((group) => {
          const groupOptions = options.filter(
            (option) => option.group === group,
          );
          if (groupOptions.length === 0) return null;

          return (
            <section key={group} className="mb-4 last:mb-0">
              <h2 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {group}
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {groupOptions.map((option) => (
                  <Button
                    key={option.id}
                    type="button"
                    size="sm"
                    variant={option.isActive ? "default" : "outline"}
                    className="h-auto min-h-9 whitespace-normal px-2 py-1.5 text-xs"
                    onClick={option.onSelect}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
