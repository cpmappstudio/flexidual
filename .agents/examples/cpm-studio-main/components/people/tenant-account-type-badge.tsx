import type { ReactNode } from "react";
import {
  StudentIcon,
  TeacherIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@/components/ui/badge";
import {
  TENANT_ACCOUNT_TYPE_TONE_CLASS_NAMES,
  type TenantAccountType,
} from "@/lib/people/account-type-theme";
import { cn } from "@/lib/utils";

export type { TenantAccountType };

export function getTenantAccountTypeLabel(
  type: TenantAccountType,
  labels: Record<TenantAccountType, string>,
) {
  return labels[type];
}

export function TenantAccountTypeBadge({
  ariaLabel,
  children,
  className,
  selfIcon = "student",
  type,
}: {
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  selfIcon?: "student" | "teacher";
  type: TenantAccountType;
}) {
  const icon =
    type === "guardian"
      ? UserGroupIcon
      : selfIcon === "teacher"
        ? TeacherIcon
        : StudentIcon;
  const showIcon = type !== "none";

  return (
    <Badge
      variant="outline"
      aria-label={ariaLabel}
      className={cn(
        "max-w-full justify-start",
        TENANT_ACCOUNT_TYPE_TONE_CLASS_NAMES[type],
        className,
      )}
    >
      {showIcon ? (
        <HugeiconsIcon
          icon={icon}
          strokeWidth={2}
          data-icon="inline-start"
          aria-hidden="true"
        />
      ) : null}
      <span className="truncate">{children}</span>
    </Badge>
  );
}
