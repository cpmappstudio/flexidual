"use client";

import { useTranslations } from "next-intl";
import type { PlatformTeamRole } from "@/components/platform/platform-team.types";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function PlatformTeamRoleSelect({
  value,
  disabled,
  onValueChange,
  className,
  triggerId,
  ariaLabel,
}: {
  value: PlatformTeamRole;
  disabled?: boolean;
  onValueChange: (value: PlatformTeamRole) => void;
  className?: string;
  triggerId?: string;
  ariaLabel?: string;
}) {
  const t = useTranslations("PlatformTeam");

  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(nextValue) => onValueChange(nextValue as PlatformTeamRole)}
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
          <SelectItem value="superadmin">{t("roles.superadmin")}</SelectItem>
          <SelectItem value="viewer">{t("roles.viewer")}</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
