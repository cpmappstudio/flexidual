import { redirect as nextRedirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { requireLocale } from "@/i18n/locale";
import type { TenantParams } from "@/i18n/params";
import { ROUTES } from "@/lib/navigation/routes";

export default async function TenantRootRedirectPage({
  params,
}: {
  params: TenantParams;
}) {
  const { locale: requestedLocale, tenant } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);

  nextRedirect(ROUTES.tenant.root(tenant));
}
