import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import type { TenantParams } from "@/i18n/params";
import {
  generateTenantAcademicManagementPlaceholderSectionMetadata,
  renderTenantAcademicManagementPlaceholderSectionPage,
} from "@/app/[locale]/(app)/[tenant]/(shell)/academic-management/(sections)/_lib/tenant-academic-management-section-page";

export async function generateMetadata({
  params,
}: {
  params: TenantParams;
}): Promise<Metadata> {
  return generateTenantAcademicManagementPlaceholderSectionMetadata({
    params,
    section: "curriculumOfferings",
  });
}

export default async function TenantCurriculumOfferingsPage({
  params,
}: {
  params: TenantParams;
}) {
  return renderTenantAcademicManagementPlaceholderSectionPage({
    params,
    section: "curriculumOfferings",
    icon: BookOpen,
  });
}
