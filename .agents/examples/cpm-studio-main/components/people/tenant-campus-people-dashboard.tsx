"use client";

import { usePaginatedQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TenantCreatePersonDialog } from "@/components/people/tenant-create-person-dialog";
import { TenantPeopleTable } from "@/components/people/tenant-people-table";
import {
  getLoadedCountLabel,
  PEOPLE_PAGE_SIZE,
} from "@/components/people/tenant-people-utils";
import { Button } from "@/components/ui/button";
import { useTenantPersonActiveState } from "@/hooks/people/use-tenant-person-active-state";

export function TenantCampusPeopleDashboard({
  slug,
  campusId,
  campusName,
}: {
  slug: string;
  campusId: Id<"campuses">;
  campusName: string;
}) {
  const t = useTranslations("TenantPeople");
  const { setActive } = useTenantPersonActiveState({ slug });
  const {
    results: campusPeople,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.platform.people.listOrganizationPeopleByCampus,
    { slug, campusId },
    { initialNumItems: PEOPLE_PAGE_SIZE },
  );

  const people = campusPeople.map((record) => record.person);
  const peopleCount = getLoadedCountLabel(people.length, status);

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {campusName}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("campus.title")}
        </h1>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-muted-foreground">
          {t("resultsCount", { count: peopleCount })}
        </span>
        <TenantCreatePersonDialog slug={slug} campusId={campusId} />
      </div>

      <TenantPeopleTable
        variant="campus"
        people={people}
        isLoading={status === "LoadingFirstPage"}
        onSetActive={setActive}
      />

      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(PEOPLE_PAGE_SIZE)}
          >
            {status === "LoadingMore" ? t("loadingMore") : t("loadMore")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
