"use client";

import { FilterHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslations } from "next-intl";
import type { TenantPeopleActiveFilter } from "@/components/people/tenant-people.types";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function TenantPeopleActiveFilterSelect({
  value,
  disabled,
  iconOnlyOnMobile = false,
  onValueChange,
  className,
  triggerId,
  ariaLabel,
}: {
  value: TenantPeopleActiveFilter;
  disabled?: boolean;
  iconOnlyOnMobile?: boolean;
  onValueChange: (value: TenantPeopleActiveFilter) => void;
  className?: string;
  triggerId?: string;
  ariaLabel?: string;
}) {
  const t = useTranslations("TenantPeople");

  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(nextValue) =>
        onValueChange(nextValue as TenantPeopleActiveFilter)
      }
    >
      <SelectTrigger
        id={triggerId}
        aria-label={ariaLabel ?? t("filters.status")}
        className={cn(
          iconOnlyOnMobile
            ? "size-7 shrink-0 justify-center gap-0 px-0 sm:h-7 sm:w-40 sm:max-w-40 sm:justify-between sm:gap-1.5 sm:px-2"
            : "w-full max-w-40",
          className,
        )}
        iconClassName={iconOnlyOnMobile ? "hidden sm:block" : undefined}
      >
        {iconOnlyOnMobile ? (
          <HugeiconsIcon
            icon={FilterHorizontalIcon}
            strokeWidth={2}
            aria-hidden="true"
            className="size-3.5 text-muted-foreground sm:hidden"
          />
        ) : null}
        {iconOnlyOnMobile ? (
          <span className="hidden min-w-0 sm:flex">
            <SelectValue />
          </span>
        ) : (
          <SelectValue />
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="all">{t("filters.allStatuses")}</SelectItem>
          <SelectItem value="active">{t("status.active")}</SelectItem>
          <SelectItem value="inactive">{t("status.inactive")}</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
