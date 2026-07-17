"use client";

import { useTranslations } from "next-intl";
import { ProgramIconAvatar } from "@/components/sections/shell/programs/program-icon-avatar";
import {
  PROGRAM_ICON_OPTIONS,
  getProgramIconOption,
} from "@/lib/programs/icon-catalog";
import { cn } from "@/lib/utils";

interface ProgramIconOptionGridProps {
  selectedIconKey?: string | null;
  onSelect: (iconKey: string) => void;
}

export function ProgramIconOptionGrid({
  selectedIconKey,
  onSelect,
}: ProgramIconOptionGridProps) {
  const t = useTranslations("Programs.create.header.iconPicker");
  const selectedIcon = getProgramIconOption(selectedIconKey);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {PROGRAM_ICON_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          className={cn(
            "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent",
            option.key === selectedIcon.key && "border-primary bg-primary/5",
          )}
          onClick={() => onSelect(option.key)}
        >
          <ProgramIconAvatar
            iconKey={option.key}
            className="h-12 w-12 rounded-lg"
            iconClassName="size-6"
          />
          <span className="min-w-0 truncate text-sm font-medium">
            {t(`options.${option.labelKey}`)}
          </span>
        </button>
      ))}
    </div>
  );
}
