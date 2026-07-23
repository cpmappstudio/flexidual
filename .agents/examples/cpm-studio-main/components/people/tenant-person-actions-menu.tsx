"use client";

import type { ReactNode } from "react";
import { Ban, ChevronDown, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import type { TenantOrganizationPerson } from "@/components/people/tenant-people.types";
import { TableActionsMenuButton } from "@/components/tables/table-primitives";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type TenantPersonActionsMenuTrigger = "icon" | "button";

export function TenantPersonActionsMenu({
  person,
  trigger = "icon",
  children,
  footerActions,
  className,
  contentClassName,
  isSetActiveDisabled = false,
  onSetActive,
}: {
  person: TenantOrganizationPerson;
  trigger?: TenantPersonActionsMenuTrigger;
  children?: ReactNode;
  footerActions?: ReactNode;
  className?: string;
  contentClassName?: string;
  isSetActiveDisabled?: boolean;
  onSetActive: (
    organizationPersonId: TenantOrganizationPerson["_id"],
    isActive: boolean,
  ) => void | Promise<unknown>;
}) {
  const t = useTranslations("TenantPeople");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger === "button" ? (
          <Button
            type="button"
            className={cn("shrink-0", className)}
            onClick={(event) => event.stopPropagation()}
          >
            {t("profile.actions")}
            <ChevronDown aria-hidden="true" data-icon="inline-end" />
          </Button>
        ) : (
          <TableActionsMenuButton
            label={t("table.actionsMenu")}
            className={className}
            onClick={(event) => event.stopPropagation()}
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn("w-44", contentClassName)}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
        <DropdownMenuItem
          variant={person.isActive ? "destructive" : "default"}
          className="justify-between"
          disabled={isSetActiveDisabled}
          onClick={() => void onSetActive(person._id, !person.isActive)}
        >
          <span>
            {person.isActive ? t("table.deactivate") : t("table.reactivate")}
          </span>
          {person.isActive ? (
            <Ban aria-hidden="true" className="size-4" />
          ) : (
            <RotateCcw aria-hidden="true" className="size-4" />
          )}
        </DropdownMenuItem>
        {footerActions}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
