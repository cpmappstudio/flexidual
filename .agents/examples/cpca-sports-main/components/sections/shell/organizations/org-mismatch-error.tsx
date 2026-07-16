"use client";

import { OrganizationList } from "@clerk/nextjs";
import { useLocale, useTranslations } from "next-intl";
import { routing } from "@/i18n/routing";
import { ROUTES } from "@/lib/navigation/routes";
import { DEFAULT_TENANT_SLUG, isSingleTenantMode } from "@/lib/tenancy/config";

interface OrgMismatchErrorProps {
  urlSlug: string;
}

export function OrgMismatchError({ urlSlug }: OrgMismatchErrorProps) {
  const locale = useLocale();
  const t = useTranslations("Common.organizations.mismatch");

  // Build locale-aware URL for OrganizationList
  const localePrefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  const afterSelectOrgUrl = `${localePrefix}/:slug/applications`;

  if (isSingleTenantMode()) {
    const canonicalWorkspace = DEFAULT_TENANT_SLUG;
    const destination = `${localePrefix}${ROUTES.org.applications.list(canonicalWorkspace)}`;

    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground">
            {t("description", { organization: urlSlug })}
          </p>
          <a href={destination} className="text-sm font-medium underline">
            /{canonicalWorkspace}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground">
            {t("description", { organization: urlSlug })}
          </p>
        </div>

        <OrganizationList
          hidePersonal
          afterSelectOrganizationUrl={afterSelectOrgUrl}
          afterCreateOrganizationUrl={afterSelectOrgUrl}
        />
      </div>
    </div>
  );
}
