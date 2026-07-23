"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  getTenantAccountTypeLabel,
  TenantAccountTypeBadge,
} from "@/components/people/tenant-account-type-badge";
import { TenantPersonActionsMenu } from "@/components/people/tenant-person-actions-menu";
import {
  TableActionsCell,
  TableStateRow,
  TableSurface,
} from "@/components/tables/table-primitives";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  TenantOrganizationPerson,
  TenantOrganizationPersonListRecord,
} from "@/components/people/tenant-people.types";
import { Link } from "@/i18n/navigation";
import { getInitials, getOptionalImageSrc } from "@/lib/files/image";
import { cn } from "@/lib/utils";

function TenantPeopleTableCellLink({
  href,
  children,
}: {
  href?: string;
  children: ReactNode;
}) {
  if (!href) {
    return <>{children}</>;
  }

  return (
    <Link
      href={href}
      className="block p-2 text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {children}
    </Link>
  );
}

function TenantPeopleLinkedCell({
  href,
  children,
}: {
  href?: string;
  children: ReactNode;
}) {
  return (
    <TableCell className={href ? "p-0" : undefined}>
      <TenantPeopleTableCellLink href={href}>
        {children}
      </TenantPeopleTableCellLink>
    </TableCell>
  );
}

function TenantPeopleAccountBadge({
  account,
  guardianLabel,
  selfIcon,
  selfLabel,
  noEmailLabel,
}: {
  account: TenantOrganizationPersonListRecord["account"];
  guardianLabel: string;
  selfIcon: "student" | "teacher";
  selfLabel: string;
  noEmailLabel: string;
}) {
  const email =
    account.kind === "none" || !account.email ? noEmailLabel : account.email;
  const accountTypeLabel = getTenantAccountTypeLabel(account.kind, {
    guardian: guardianLabel,
    none: noEmailLabel,
    self: selfLabel,
  });

  return (
    <TenantAccountTypeBadge
      type={account.kind}
      selfIcon={selfIcon}
      ariaLabel={`${accountTypeLabel}: ${email}`}
    >
      {email}
    </TenantAccountTypeBadge>
  );
}

function TenantPeoplePersonCell({
  href,
  person,
  unnamedLabel,
}: {
  href?: string;
  person: TenantOrganizationPerson;
  unnamedLabel: string;
}) {
  return (
    <TenantPeopleLinkedCell href={href}>
      <div className="flex items-center gap-3">
        <Avatar className="size-9 rounded-lg">
          <AvatarImage
            src={getOptionalImageSrc(person.avatarUrl)}
            alt={person.name}
          />
          <AvatarFallback className="rounded-lg text-xs font-semibold">
            {getInitials(person.name, "PP")}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-medium text-foreground">
            {person.name || unnamedLabel}
          </span>
          {person.displayName && person.displayName !== person.name ? (
            <span className="truncate text-muted-foreground">
              {person.displayName}
            </span>
          ) : null}
        </div>
      </div>
    </TenantPeopleLinkedCell>
  );
}

function TenantPeopleRolesCell({
  href,
  person,
  noRolesLabel,
  getRoleLabel,
}: {
  href?: string;
  person: TenantOrganizationPerson;
  noRolesLabel: string;
  getRoleLabel: (role: TenantOrganizationPerson["roles"][number]) => string;
}) {
  return (
    <TenantPeopleLinkedCell href={href}>
      <div className="flex flex-wrap gap-2">
        {person.roles.length ? (
          person.roles.map((role) => (
            <Badge key={role} variant="secondary" className="rounded-full">
              {getRoleLabel(role)}
            </Badge>
          ))
        ) : (
          <span className="text-muted-foreground">{noRolesLabel}</span>
        )}
      </div>
    </TenantPeopleLinkedCell>
  );
}

function TenantPeopleCampusCell({
  href,
  primaryCampus,
  noCampusLabel,
}: {
  href?: string;
  primaryCampus: TenantOrganizationPersonListRecord["primaryCampus"];
  noCampusLabel: string;
}) {
  return (
    <TenantPeopleLinkedCell href={href}>
      {primaryCampus ? (
        <span className="truncate font-medium text-foreground">
          {primaryCampus.name}
        </span>
      ) : (
        <span className="text-muted-foreground">{noCampusLabel}</span>
      )}
    </TenantPeopleLinkedCell>
  );
}

function TenantPeopleAccountCell({
  href,
  account,
  noEmailLabel,
  guardianLabel,
  selfIcon,
  selfLabel,
}: {
  href?: string;
  account: TenantOrganizationPersonListRecord["account"];
  noEmailLabel: string;
  guardianLabel: string;
  selfIcon: "student" | "teacher";
  selfLabel: string;
}) {
  return (
    <TenantPeopleLinkedCell href={href}>
      <div className="flex min-w-0">
        <TenantPeopleAccountBadge
          account={account}
          guardianLabel={guardianLabel}
          selfIcon={selfIcon}
          selfLabel={selfLabel}
          noEmailLabel={noEmailLabel}
        />
      </div>
    </TenantPeopleLinkedCell>
  );
}

function TenantPeopleStatusCell({
  href,
  person,
  activeLabel,
  inactiveLabel,
}: {
  href?: string;
  person: TenantOrganizationPerson;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <TenantPeopleLinkedCell href={href}>
      <Badge
        variant={person.isActive ? "secondary" : "outline"}
        className="rounded-full"
      >
        {person.isActive ? activeLabel : inactiveLabel}
      </Badge>
    </TenantPeopleLinkedCell>
  );
}

function TenantPeopleActionsCell({
  person,
  onSetActive,
}: {
  person: TenantOrganizationPerson;
  onSetActive: (
    organizationPersonId: TenantOrganizationPerson["_id"],
    isActive: boolean,
  ) => void;
}) {
  return (
    <TableActionsCell>
      <TenantPersonActionsMenu person={person} onSetActive={onSetActive} />
    </TableActionsCell>
  );
}

function TenantPeopleTableFrame({
  header,
  rows,
  isLoading,
  hasRows,
  colSpan,
  loadingLabel,
  emptyLabel,
}: {
  header: ReactNode;
  rows: ReactNode;
  isLoading: boolean;
  hasRows: boolean;
  colSpan: number;
  loadingLabel: string;
  emptyLabel?: string;
}) {
  return (
    <TableSurface>
      <Table>
        <TableHeader className="bg-card">{header}</TableHeader>
        <TableBody>
          {isLoading ? (
            <TableStateRow colSpan={colSpan}>{loadingLabel}</TableStateRow>
          ) : hasRows ? (
            rows
          ) : (
            <TableStateRow colSpan={colSpan}>{emptyLabel}</TableStateRow>
          )}
        </TableBody>
      </Table>
    </TableSurface>
  );
}

type TenantPeopleTableCommonProps = {
  accountSelfIcon?: "student" | "teacher";
  accountSelfLabel?: string;
  isLoading: boolean;
  emptyLabel?: string;
  personProfileHrefBase?: string;
  onSetActive: (
    organizationPersonId: TenantOrganizationPerson["_id"],
    isActive: boolean,
  ) => void;
};

type TenantPeopleTableProps =
  | (TenantPeopleTableCommonProps & {
      variant?: "academic";
      people: TenantOrganizationPersonListRecord[];
    })
  | (TenantPeopleTableCommonProps & {
      variant: "campus";
      people: TenantOrganizationPerson[];
    });

export function TenantPeopleTable(props: TenantPeopleTableProps) {
  const t = useTranslations("TenantPeople");

  if (props.variant === "campus") {
    return (
      <TenantPeopleTableFrame
        colSpan={4}
        isLoading={props.isLoading}
        hasRows={props.people.length > 0}
        loadingLabel={t("table.loading")}
        emptyLabel={props.emptyLabel ?? t("table.empty")}
        header={
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("table.person")}</TableHead>
            <TableHead>{t("table.roles")}</TableHead>
            <TableHead>{t("table.status")}</TableHead>
            <TableHead className="w-12 pr-5 text-right" />
          </TableRow>
        }
        rows={props.people.map((person) => {
          const href = props.personProfileHrefBase
            ? `${props.personProfileHrefBase}/${person._id}`
            : undefined;

          return (
            <TableRow
              key={person._id}
              className={cn(
                "bg-card hover:bg-card",
                href && "hover:bg-muted/30",
              )}
            >
              <TenantPeoplePersonCell
                href={href}
                person={person}
                unnamedLabel={t("table.unnamedPerson")}
              />
              <TenantPeopleRolesCell
                href={href}
                person={person}
                noRolesLabel={t("table.noRoles")}
                getRoleLabel={(role) => t(`roles.${role}`)}
              />
              <TenantPeopleStatusCell
                href={href}
                person={person}
                activeLabel={t("status.active")}
                inactiveLabel={t("status.inactive")}
              />
              <TenantPeopleActionsCell
                person={person}
                onSetActive={props.onSetActive}
              />
            </TableRow>
          );
        })}
      />
    );
  }

  return (
    <TenantPeopleTableFrame
      colSpan={5}
      isLoading={props.isLoading}
      hasRows={props.people.length > 0}
      loadingLabel={t("table.loading")}
      emptyLabel={props.emptyLabel ?? t("table.empty")}
      header={
        <TableRow className="hover:bg-transparent">
          <TableHead>{t("table.person")}</TableHead>
          <TableHead>{t("table.campus")}</TableHead>
          <TableHead>{t("table.email")}</TableHead>
          <TableHead>{t("table.status")}</TableHead>
          <TableHead className="w-12 pr-5 text-right" />
        </TableRow>
      }
      rows={props.people.map((record) => {
        const { account, person, primaryCampus } = record;
        const href = props.personProfileHrefBase
          ? `${props.personProfileHrefBase}/${person._id}`
          : undefined;

        return (
          <TableRow
            key={person._id}
            className={cn("bg-card hover:bg-card", href && "hover:bg-muted/30")}
          >
            <TenantPeoplePersonCell
              href={href}
              person={person}
              unnamedLabel={t("table.unnamedPerson")}
            />
            <TenantPeopleCampusCell
              href={href}
              primaryCampus={primaryCampus}
              noCampusLabel={t("table.noCampus")}
            />
            <TenantPeopleAccountCell
              href={href}
              account={account}
              noEmailLabel={t("table.noEmail")}
              guardianLabel={t("table.guardianProfile")}
              selfIcon={props.accountSelfIcon ?? "student"}
              selfLabel={props.accountSelfLabel ?? t("table.studentProfile")}
            />
            <TenantPeopleStatusCell
              href={href}
              person={person}
              activeLabel={t("status.active")}
              inactiveLabel={t("status.inactive")}
            />
            <TenantPeopleActionsCell
              person={person}
              onSetActive={props.onSetActive}
            />
          </TableRow>
        );
      })}
    />
  );
}
