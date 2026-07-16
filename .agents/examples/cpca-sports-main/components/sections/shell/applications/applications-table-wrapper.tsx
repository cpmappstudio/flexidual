"use client";

import { Authenticated, Preloaded, usePreloadedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import CpcaHeader from "@/components/common/cpca-header";
import { ApplicationsTable } from "./applications-table";

interface ApplicationsTableWrapperProps {
  preloadedApplications: Preloaded<
    typeof api.applications.listMineByOrganizationSummary
  >;
  organizationSlug: string;
  title: string;
  subtitle: string;
  logoUrl?: string;
}

function ApplicationsTableContent({
  preloadedApplications,
  organizationSlug,
  title,
  subtitle,
  logoUrl,
}: ApplicationsTableWrapperProps) {
  const applications = usePreloadedQuery(preloadedApplications);

  return (
    <>
      <CpcaHeader title={title} subtitle={subtitle} logoUrl={logoUrl} />
      <ApplicationsTable
        applications={applications}
        organizationSlug={organizationSlug}
        isAdmin={false}
      />
    </>
  );
}

export function ApplicationsTableWrapper(props: ApplicationsTableWrapperProps) {
  return (
    <Authenticated>
      <ApplicationsTableContent {...props} />
    </Authenticated>
  );
}
