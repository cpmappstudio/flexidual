"use client";

import { usePaginatedQuery } from "convex/react";
import { useTranslations } from "next-intl";
import {
  ResourceCollectionGrid,
  ResourceCollectionSection,
} from "@/components/resources/resource-collection";
import { PlatformCreateOrganizationDialog } from "@/components/platform/platform-create-organization-dialog";
import { PlatformOrganizationTile } from "@/components/platform/platform-organization-tile";
import { api } from "@/convex/_generated/api";
import type { AppLocale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type PlatformAdminDashboardProps = {
  canManage: boolean;
  locale: AppLocale;
  rootDomain: string;
};

const PLATFORM_ORGANIZATION_PAGE_SIZE = 24;
const EMPTY_PAGINATION_ARGS = {};

function PlatformOrganizationTileSkeleton() {
  return (
    <Card className="gap-0 rounded-3xl border-border/70 bg-card pt-0 shadow-sm">
      <div className="mx-auto h-0.5 w-3/5 rounded-b-full bg-border/70" />
      <CardHeader className="flex min-h-24 flex-row items-start justify-between gap-4 px-5 pt-5">
        <Skeleton className="size-8 rounded-md" />
        <Skeleton className="h-4 w-28" />
      </CardHeader>
      <CardContent className="flex min-h-24 flex-col justify-end px-5 pb-5 pt-0">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-5 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

export function PlatformAdminDashboard({
  canManage,
  locale,
  rootDomain,
}: PlatformAdminDashboardProps) {
  const t = useTranslations("PlatformAdmin");
  const {
    results: organizations,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.organizations.listForPlatform,
    EMPTY_PAGINATION_ARGS,
    { initialNumItems: PLATFORM_ORGANIZATION_PAGE_SIZE },
  );
  const isLoadingFirstPage = status === "LoadingFirstPage";
  const loadingSkeletonCount = canManage ? 3 : 4;

  return (
    <ResourceCollectionSection title={t("title")}>
      {isLoadingFirstPage ? (
        <span className="sr-only" aria-live="polite">
          {t("loadingFirstPage")}
        </span>
      ) : null}

      <ResourceCollectionGrid>
        {canManage ? (
          <li className="h-full">
            <PlatformCreateOrganizationDialog />
          </li>
        ) : null}
        {isLoadingFirstPage ? (
          <>
            {Array.from({ length: loadingSkeletonCount }).map((_, index) => (
              <li key={index}>
                <PlatformOrganizationTileSkeleton />
              </li>
            ))}
          </>
        ) : (
          organizations.map((organization) => (
            <li key={organization._id}>
              <PlatformOrganizationTile
                canManage={canManage}
                locale={locale}
                organization={organization}
                rootDomain={rootDomain}
              />
            </li>
          ))
        )}
      </ResourceCollectionGrid>
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(PLATFORM_ORGANIZATION_PAGE_SIZE)}
          >
            {status === "LoadingMore" ? t("loadingMore") : t("loadMore")}
          </Button>
        </div>
      ) : null}
    </ResourceCollectionSection>
  );
}
