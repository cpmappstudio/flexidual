"use client";

import type { ReactNode } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  getTenantAccountTypeLabel,
  TenantAccountTypeBadge,
} from "@/components/people/tenant-account-type-badge";
import { TenantAcademicPasswordPanel } from "@/components/people/tenant-academic-password-panel";
import { TenantAcademicPersonalInformationPanel } from "@/components/people/tenant-academic-personal-information-panel";
import { TenantAcademicProfilePanel as ProfilePanel } from "@/components/people/tenant-academic-profile-panel";
import { TenantOrganizationPersonActivityPanel } from "@/components/people/tenant-organization-person-activity-panel";
import type { TenantAcademicPersonProfile } from "@/components/people/tenant-people.types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDateTimeFormatter } from "@/hooks/use-date-time-formatter";
import { useTenantOrganizationPersonActivity } from "@/hooks/people/use-tenant-organization-person-activity";
import { Link } from "@/i18n/navigation";
import { getInitials, getOptionalImageSrc } from "@/lib/files/image";

function getAccountEmail(profile: TenantAcademicPersonProfile) {
  return profile.account.kind === "none" ? null : profile.account.email;
}

function getAccountUserId(profile: TenantAcademicPersonProfile) {
  return profile.account.kind === "none" ? null : profile.account.userId;
}

function getAccountUserSince(profile: TenantAcademicPersonProfile) {
  return profile.account.kind === "none" ? null : profile.account.userSince;
}

function TenantAcademicProfileFacts({
  accountSelfLabel,
  accountSelfIcon,
  profile,
  formatDate,
}: {
  accountSelfLabel: string;
  accountSelfIcon: "student" | "teacher";
  profile: TenantAcademicPersonProfile;
  formatDate: (timestamp: number | null | undefined) => string;
}) {
  const t = useTranslations("TenantPeople");
  const accountTypeLabel = getTenantAccountTypeLabel(profile.account.kind, {
    guardian: t("table.guardianProfile"),
    none: t("profile.notLinked"),
    self: accountSelfLabel,
  });
  const facts: Array<{
    label: string;
    value: ReactNode;
  }> = [
    {
      label: t("profile.personId"),
      value: profile.person._id,
    },
    {
      label: t("profile.accountId"),
      value: getAccountUserId(profile) ?? t("profile.notLinked"),
    },
    {
      label: t("profile.accountType"),
      value: (
        <TenantAccountTypeBadge
          type={profile.account.kind}
          selfIcon={accountSelfIcon}
          ariaLabel={`${t("profile.accountType")}: ${accountTypeLabel}`}
        >
          {accountTypeLabel}
        </TenantAccountTypeBadge>
      ),
    },
    {
      label: t("profile.primaryEmail"),
      value: getAccountEmail(profile) ?? t("profile.notLinked"),
    },
    {
      label: t("profile.userSince"),
      value: formatDate(getAccountUserSince(profile)),
    },
  ];

  return (
    <aside className="h-fit rounded-3xl border border-border/70 bg-card p-5 lg:border-0 lg:bg-transparent lg:p-0">
      <dl className="divide-y divide-border/70">
        {facts.map((fact) => (
          <div key={fact.label} className="py-4 first:pt-0 last:pb-0">
            <dt className="text-xs font-medium text-muted-foreground">
              {fact.label}
            </dt>
            <dd className="mt-1 min-w-0 text-sm text-foreground">
              {typeof fact.value === "string" ? (
                <span className="block truncate">{fact.value}</span>
              ) : (
                fact.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

function EmailAddressesPanel({
  profile,
}: {
  profile: TenantAcademicPersonProfile;
}) {
  const t = useTranslations("TenantPeople");
  const email = getAccountEmail(profile);
  const accountKind = profile.account.kind;

  return (
    <ProfilePanel title={t("profile.emailAddresses")}>
      {email ? (
        <Item variant="outline" className="h-[42px] flex-nowrap">
          <ItemMedia variant="icon">
            <Mail
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle className="max-w-full truncate text-sm text-foreground">
              {email}
            </ItemTitle>
          </ItemContent>
          <ItemActions>
            <Badge variant="secondary" className="rounded-full">
              {accountKind === "guardian"
                ? t("profile.guardianAccount")
                : t("profile.primary")}
            </Badge>
          </ItemActions>
        </Item>
      ) : (
        <p className="text-sm text-muted-foreground">{t("profile.noEmail")}</p>
      )}
    </ProfilePanel>
  );
}

function AcademicPanel() {
  const t = useTranslations("TenantPeople");

  return (
    <ProfilePanel title={t("profile.tabs.academic")}>
      <p className="text-sm text-muted-foreground">
        {t("profile.academicPlaceholder")}
      </p>
    </ProfilePanel>
  );
}

export function TenantAcademicPersonProfileSkeleton() {
  return (
    <section className="flex min-w-0 max-w-full flex-col gap-6 overflow-x-hidden">
      <Skeleton className="h-8 w-32" />
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-2xl" />
        <div className="grid gap-2">
          <Skeleton className="h-6 w-72 max-w-[70vw]" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <Skeleton className="h-8 w-80 max-w-full" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="grid gap-6">
          <Skeleton className="h-56 rounded-3xl" />
          <Skeleton className="h-64 rounded-3xl" />
        </div>
        <Skeleton className="h-52 rounded-3xl" />
      </div>
    </section>
  );
}

export function TenantAcademicPersonProfileShell({
  accountSelfLabel,
  actions,
  avatarFallback,
  backHref,
  backLabel,
  campusesTab,
  childrenTab,
  fieldNamePrefix,
  fieldPrefix,
  profile,
  profileRoleLabel,
  slug,
}: {
  accountSelfLabel: string;
  actions: ReactNode;
  avatarFallback: string;
  backHref: string;
  backLabel: string;
  campusesTab: ReactNode;
  childrenTab?: ReactNode;
  fieldNamePrefix: string;
  fieldPrefix: string;
  profile: TenantAcademicPersonProfile;
  profileRoleLabel: string;
  slug: string;
}) {
  const t = useTranslations("TenantPeople");
  const locale = useLocale();
  const formatter = useDateTimeFormatter(locale, "date");
  const accountSelfIcon =
    profile.profileOwnerKind === "teacher" ? "teacher" : "student";
  const profileActivityState = useTenantOrganizationPersonActivity({
    slug,
    organizationPersonId: profile.person._id,
    personCreatedAt: profile.person.createdAt,
  });
  const profileDisplayName = profile.person.name || t("table.unnamedPerson");

  function formatDate(timestamp: number | null | undefined) {
    return timestamp ? formatter.format(timestamp) : t("profile.notLinked");
  }

  function formatLastActive(timestamp: number | null | undefined) {
    return timestamp
      ? t("profile.lastActiveAt", {
          date: formatter.format(timestamp),
        })
      : t("profile.lastActiveUnavailable");
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="w-fit -translate-x-2"
        >
          <Link href={backHref}>
            <ArrowLeft aria-hidden="true" data-icon="inline-start" />
            {backLabel}
          </Link>
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="size-14 rounded-2xl">
              <AvatarImage
                src={getOptionalImageSrc(profile.person.avatarUrl)}
                alt={profileDisplayName}
              />
              <AvatarFallback className="rounded-2xl text-sm font-semibold">
                {getInitials(profileDisplayName, avatarFallback)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                {profileDisplayName}
              </h1>
              <p className="text-sm text-muted-foreground">
                {formatLastActive(profileActivityState.lastSeenAt)}
              </p>
            </div>
          </div>

          {actions}
        </div>
      </div>

      <Tabs defaultValue="profile" className="min-w-0 max-w-full">
        <TabsList
          variant="line"
          className="h-10 w-full justify-start overflow-visible border-b border-border/70 pb-0"
        >
          <TabsTrigger value="profile">{t("profile.tabs.profile")}</TabsTrigger>
          {childrenTab ? (
            <TabsTrigger value="children">
              {t("profile.tabs.children")}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="campuses">
            {t("profile.tabs.campuses")}
          </TabsTrigger>
          <TabsTrigger value="academic">
            {t("profile.tabs.academic")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6 min-w-0">
          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_16rem] xl:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="order-2 grid min-w-0 gap-6 lg:order-1">
              <TenantOrganizationPersonActivityPanel
                activityDays={profileActivityState.activityDays}
                selectedYear={profileActivityState.selectedYear}
                yearOptions={profileActivityState.yearOptions}
                onYearChange={profileActivityState.setSelectedYear}
              />
              <TenantAcademicPersonalInformationPanel
                avatarFallback={avatarFallback}
                canManageProfile={profile.canManageProfile}
                fieldNamePrefix={fieldNamePrefix}
                fieldPrefix={fieldPrefix}
                person={profile.person}
                roleLabel={profileRoleLabel}
                slug={slug}
              />
              <EmailAddressesPanel profile={profile} />
              <ProfilePanel title={t("profile.password")}>
                <TenantAcademicPasswordPanel
                  fieldPrefix={fieldPrefix}
                  organizationPersonId={profile.person._id}
                  password={{
                    canManage: profile.canManagePassword,
                    hasLinkedAccount: profile.account.kind !== "none",
                  }}
                  passwordResetAccountScope={
                    profile.profileOwnerKind === "teacher"
                      ? "self"
                      : "withGuardianFallback"
                  }
                  pin={{
                    canManage: profile.canManagePin,
                    hasPin: profile.hasPin,
                  }}
                  slug={slug}
                />
              </ProfilePanel>
            </div>
            <div className="order-1 lg:order-2">
              <TenantAcademicProfileFacts
                accountSelfLabel={accountSelfLabel}
                accountSelfIcon={accountSelfIcon}
                profile={profile}
                formatDate={formatDate}
              />
            </div>
          </div>
        </TabsContent>

        {childrenTab ? (
          <TabsContent value="children" className="mt-6 min-w-0">
            {childrenTab}
          </TabsContent>
        ) : null}

        <TabsContent value="campuses" className="mt-6 min-w-0">
          {campusesTab}
        </TabsContent>

        <TabsContent value="academic" className="mt-6">
          <AcademicPanel />
        </TabsContent>
      </Tabs>
    </section>
  );
}
