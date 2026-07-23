import type { Metadata } from "next";
import { CalendarRange } from "lucide-react";
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
    section: "academicPeriods",
  });
}

export default async function TenantAcademicPeriodsPage({
  params,
}: {
  params: TenantParams;
}) {
  return renderTenantAcademicManagementPlaceholderSectionPage({
    params,
    section: "academicPeriods",
    icon: CalendarRange,
  });
}
