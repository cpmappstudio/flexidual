import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Id } from "@/convex/_generated/dataModel";
import { TenantStudentProfilePage } from "@/components/people/tenant-student-profile-page";
import { requireLocale } from "@/i18n/locale";

type TenantStudentProfileParams = Promise<{
  locale: string;
  tenant: string;
  organizationPersonId: string;
}>;

export async function generateMetadata({
  params,
}: {
  params: TenantStudentProfileParams;
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  const t = await getTranslations({ locale, namespace: "TenantPeople" });

  return {
    title: t("profile.metadataTitle"),
  };
}

export default async function TenantAcademicManagementStudentProfileRoute({
  params,
}: {
  params: TenantStudentProfileParams;
}) {
  const {
    locale: requestedLocale,
    tenant,
    organizationPersonId,
  } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);

  return (
    <TenantStudentProfilePage
      slug={tenant}
      organizationPersonId={organizationPersonId as Id<"organizationPeople">}
    />
  );
}
