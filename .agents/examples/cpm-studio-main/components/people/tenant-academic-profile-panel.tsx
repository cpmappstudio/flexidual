import type { ReactNode } from "react";
import { SettingsCard } from "@/components/layout/settings-card";

export function TenantAcademicProfilePanel({
  action,
  title,
  children,
  className,
  contentClassName,
}: {
  action?: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <SettingsCard
      action={action}
      title={title}
      className={className}
      contentClassName={contentClassName}
    >
      {children}
    </SettingsCard>
  );
}
