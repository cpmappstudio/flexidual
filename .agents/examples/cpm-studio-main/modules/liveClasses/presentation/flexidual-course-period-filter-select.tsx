"use client";

import { FilterHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TENANT_PEOPLE_TABLE_CONTROL_CLASS_NAME } from "@/components/people/tenant-people-table-styles";
import { cn } from "@/lib/utils";

export function FlexidualCoursePeriodFilterSelect({
  value,
  periods,
  onValueChange,
  allLabel,
  ariaLabel,
}: {
  value: string;
  periods: readonly string[];
  onValueChange: (value: string) => void;
  allLabel: string;
  ariaLabel: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          "size-7 shrink-0 justify-center gap-0 px-0 sm:h-7 sm:w-44 sm:max-w-44 sm:justify-between sm:gap-1.5 sm:px-2",
          TENANT_PEOPLE_TABLE_CONTROL_CLASS_NAME,
        )}
        iconClassName="hidden sm:block"
      >
        <HugeiconsIcon
          icon={FilterHorizontalIcon}
          strokeWidth={2}
          aria-hidden="true"
          className="size-3.5 text-muted-foreground sm:hidden"
        />
        <span className="hidden min-w-0 sm:flex">
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="all">{allLabel}</SelectItem>
          {periods.map((period) => (
            <SelectItem key={period} value={period}>
              {period}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
