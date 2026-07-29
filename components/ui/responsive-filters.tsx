"use client";

import { Check, X } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterButton } from "@/components/ui/filter-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ALL = "all";

export type ResponsiveFilter = {
  key: string;
  label: string;
  allLabel: string;
  value: string | null;
  options: {
    value: string;
    label: string;
  }[];
  onChange: (value: string | null) => void;
};

export function ResponsiveFilters({
  filters,
  menuLabel,
  clearLabel,
  desktopClassName,
  mobileClassName,
  selectClassName,
}: {
  filters: ResponsiveFilter[];
  menuLabel: string;
  clearLabel: string;
  desktopClassName?: string;
  mobileClassName?: string;
  selectClassName?: string;
}) {
  const hasActiveFilters = filters.some((filter) => filter.value);

  return (
    <>
      <div
        className={cn(
          "items-center gap-2",
          desktopClassName ?? "hidden md:flex",
        )}
      >
        {filters.map((filter) => (
          <Select
            key={filter.key}
            value={filter.value ?? ALL}
            onValueChange={(value) =>
              filter.onChange(value === ALL ? null : value)
            }
          >
            <SelectTrigger
              className={cn("w-44 bg-sidebar", selectClassName)}
              aria-label={filter.label}
            >
              <SelectValue placeholder={filter.allLabel} />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value={ALL}>{filter.allLabel}</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <FilterButton
            active={hasActiveFilters}
            label={menuLabel}
            className={mobileClassName ?? "md:hidden"}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="max-h-[70vh] w-64 overflow-y-auto"
        >
          <DropdownMenuLabel>{menuLabel}</DropdownMenuLabel>
          <DropdownMenuSeparator />

          <div className="space-y-2">
            {filters.map((filter) => (
              <div
                key={filter.key}
                className="border-b pb-2 last:border-b-0 last:pb-0"
              >
                <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {filter.label}
                </p>
                <DropdownMenuItem
                  onSelect={() => filter.onChange(null)}
                  className="justify-between gap-3"
                >
                  <span>{filter.allLabel}</span>
                  {!filter.value && <Check className="size-4" />}
                </DropdownMenuItem>
                {filter.options.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onSelect={() => filter.onChange(option.value)}
                    className="justify-between gap-3"
                  >
                    <span>{option.label}</span>
                    {filter.value === option.value && (
                      <Check className="size-4" />
                    )}
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </div>

          {hasActiveFilters && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  filters.forEach((filter) => filter.onChange(null))
                }
              >
                <X className="mr-2 size-4" />
                {clearLabel}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
