import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import IntlMessagesProvider from "@/components/i18n/intl-messages-provider";
import { requireLocale } from "@/i18n/locale";
import type { TenantParams } from "@/i18n/params";
import { requireManageableTenantWorkspace } from "@/lib/tenancy/workspace.server";

export default async function TenantAcademicManagementLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: TenantParams;
}) {
  const { locale: requestedLocale, tenant } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);

  await requireManageableTenantWorkspace(tenant);

  return (
    <IntlMessagesProvider
      namespaces={["Common", "TenantAcademicManagement", "TenantPeople"]}
    >
      {children}
    </IntlMessagesProvider>
  );
}
