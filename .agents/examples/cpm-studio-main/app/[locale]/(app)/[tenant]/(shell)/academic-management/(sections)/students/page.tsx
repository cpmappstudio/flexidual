import type { Metadata } from "next";
import type { TenantParams } from "@/i18n/params";
import {
  generateTenantAcademicManagementSectionMetadata,
  renderTenantAcademicManagementSectionPage,
} from "@/app/[locale]/(app)/[tenant]/(shell)/academic-management/(sections)/_lib/tenant-academic-management-section-page";

export function generateMetadata({
  params,
}: {
  params: TenantParams;
}): Promise<Metadata> {
  return generateTenantAcademicManagementSectionMetadata({
    params,
    section: "students",
  });
}

export default function TenantAcademicManagementStudentsPage({
  params,
}: {
  params: TenantParams;
}) {
  return renderTenantAcademicManagementSectionPage({
    params,
    section: "students",
    roleFilter: "student",
  });
}
