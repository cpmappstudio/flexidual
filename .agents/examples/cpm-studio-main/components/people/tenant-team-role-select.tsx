"use client";

import { useTranslations } from "next-intl";
import type { TenantTeamRole } from "@/components/people/tenant-people.types";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function TenantTeamRoleSelect({
  value,
  disabled,
  allowOwner,
  onValueChange,
  className,
  triggerId,
  ariaLabel,
}: {
  value: TenantTeamRole;
  disabled?: boolean;
  allowOwner: boolean;
  onValueChange: (value: TenantTeamRole) => void;
  className?: string;
  triggerId?: string;
  ariaLabel?: string;
}) {
  const t = useTranslations("TenantTeam");

  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(nextValue) => onValueChange(nextValue as TenantTeamRole)}
    >
      <SelectTrigger
        id={triggerId}
        aria-label={ariaLabel}
        className={className ?? "w-full max-w-40"}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="owner" disabled={!allowOwner}>
            {t("roles.owner")}
          </SelectItem>
          <SelectItem value="admin">{t("roles.admin")}</SelectItem>
          <SelectItem value="member">{t("roles.member")}</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
