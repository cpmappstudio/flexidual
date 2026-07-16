"use client";

import { Authenticated, Preloaded, usePreloadedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import CpcaHeader from "@/components/common/cpca-header";
import { ApplicationsTable } from "./applications-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Archive, Inbox } from "lucide-react";
import { useTranslations } from "next-intl";
import { ApplicationsAnalytics } from "./applications-analytics";

interface ApplicationsTableAdminWrapperProps {
  preloadedApplications: Preloaded<
    typeof api.applications.listByOrganizationSummary
  >;
  preloadedArchivedApplications: Preloaded<
    typeof api.applications.listByOrganizationSummary
  >;
  organizationSlug: string;
  initialTab?: "active" | "archived";
  title: string;
  subtitle: string;
  logoUrl?: string;
  analyticsNow: number;
}

function ApplicationsTableContent({
  preloadedApplications,
  preloadedArchivedApplications,
  organizationSlug,
  initialTab = "active",
  title,
  subtitle,
  logoUrl,
  analyticsNow,
}: ApplicationsTableAdminWrapperProps) {
  const applications = usePreloadedQuery(preloadedApplications);
  const archivedApplications = usePreloadedQuery(preloadedArchivedApplications);
  const t = useTranslations("Applications");

  return (
    <>
      <CpcaHeader
        title={title}
        subtitle={subtitle}
        logoUrl={logoUrl}
        action={
          <ApplicationsAnalytics
            applications={applications}
            now={analyticsNow}
          />
        }
      />
      <Tabs defaultValue={initialTab} className="w-full">
        <ScrollArea className="w-full whitespace-nowrap">
          <TabsList>
            <TabsTrigger
              value="active"
              className="gap-1 px-2 text-xs md:px-3 md:text-sm"
            >
              <Inbox className="hidden h-4 w-4 md:block" />
              <span>{t("tabs.active")}</span>
              <span className="text-muted-foreground">
                ({applications.length})
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="archived"
              className="gap-1 px-2 text-xs md:px-3 md:text-sm"
            >
              <Archive className="hidden h-4 w-4 md:block" />
              <span>{t("tabs.archived")}</span>
              <span className="text-muted-foreground">
                ({archivedApplications.length})
              </span>
            </TabsTrigger>
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <TabsContent value="active" className="mt-0">
          <ApplicationsTable
            applications={applications}
            organizationSlug={organizationSlug}
            isAdmin={true}
            totalCountLabel={(count) => t("table.totalCountAdmin", { count })}
          />
        </TabsContent>
        <TabsContent value="archived" className="mt-0">
          <ApplicationsTable
            applications={archivedApplications}
            organizationSlug={organizationSlug}
            isAdmin={true}
            emptyMessage={t("emptyMessageArchived")}
            totalCountLabel={(count) =>
              t("table.totalCountArchivedAdmin", { count })
            }
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

export function ApplicationsTableAdminWrapper(
  props: ApplicationsTableAdminWrapperProps,
) {
  return (
    <Authenticated>
      <ApplicationsTableContent {...props} />
    </Authenticated>
  );
}
