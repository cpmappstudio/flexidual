import type { ReactNode } from "react";
import { TenantAcademicManagementSectionLayout } from "@/components/academic-management/tenant-academic-management-section-layout";

export default function TenantAcademicManagementSectionsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <TenantAcademicManagementSectionLayout>
      {children}
    </TenantAcademicManagementSectionLayout>
  );
}
