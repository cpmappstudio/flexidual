import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { requireLocale } from "@/i18n/locale";
import type { TenantParams } from "@/i18n/params";
import { renderTenantShellLayout } from "@/lib/tenancy/shell-layout";

export default async function TenantShellLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: TenantParams;
}) {
  const { locale: requestedLocale, tenant } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);

  return renderTenantShellLayout({
    tenantSlug: tenant,
    locale,
    children,
  });
}
