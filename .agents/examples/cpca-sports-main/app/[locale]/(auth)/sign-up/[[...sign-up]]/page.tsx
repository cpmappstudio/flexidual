import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/navigation/routes";
import { routing } from "@/i18n/routing";
import { DEFAULT_TENANT_SLUG, isSingleTenantMode } from "@/lib/tenancy/config";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function SignUpPage({ params }: PageProps) {
  const { locale } = await params;
  const localePrefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  if (isSingleTenantMode()) {
    redirect(`${localePrefix}/${DEFAULT_TENANT_SLUG}/sign-up`);
  }
  redirect(`${localePrefix}${ROUTES.auth.signIn}`);
}
