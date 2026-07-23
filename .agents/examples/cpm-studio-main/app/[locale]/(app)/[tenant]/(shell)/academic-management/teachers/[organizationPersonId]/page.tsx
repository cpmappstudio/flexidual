import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TenantTeacherProfilePage } from "@/components/people/tenant-teacher-profile-page";
import type { Id } from "@/convex/_generated/dataModel";
import { requireLocale } from "@/i18n/locale";

type TenantTeacherProfileParams = Promise<{
  locale: string;
  tenant: string;
  organizationPersonId: string;
}>;

export async function generateMetadata({
  params,
}: {
  params: TenantTeacherProfileParams;
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = requireLocale(requestedLocale);
  const t = await getTranslations({ locale, namespace: "TenantPeople" });

  return {
    title: t("profile.teacherMetadataTitle"),
  };
}

export default async function TenantAcademicManagementTeacherProfileRoute({
  params,
}: {
  params: TenantTeacherProfileParams;
}) {
  const {
    locale: requestedLocale,
    tenant,
    organizationPersonId,
  } = await params;
  const locale = requireLocale(requestedLocale);
  setRequestLocale(locale);

  return (
    <TenantTeacherProfilePage
      slug={tenant}
      organizationPersonId={organizationPersonId as Id<"organizationPeople">}
    />
  );
}
