"use client";

import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { TENANT_PEOPLE_TABLE_CONTROL_CLASS_NAME } from "@/components/people/tenant-people-table-styles";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function TenantPeopleSearchField({
  ariaLabel,
  className,
  inputClassName,
  name,
  onValueChange,
  placeholder,
  value,
}: {
  ariaLabel: string;
  className?: string;
  inputClassName?: string;
  name: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div
      className={cn("relative min-w-0 flex-1 sm:w-64 sm:flex-none", className)}
    >
      <HugeiconsIcon
        icon={Search01Icon}
        strokeWidth={2}
        aria-hidden="true"
        className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        name={name}
        aria-label={ariaLabel}
        autoComplete="off"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-7 pl-7",
          TENANT_PEOPLE_TABLE_CONTROL_CLASS_NAME,
          inputClassName,
        )}
      />
    </div>
  );
}
