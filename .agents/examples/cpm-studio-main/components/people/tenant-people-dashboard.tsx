"use client";

import { useDeferredValue, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { TenantPeopleActiveFilterSelect } from "@/components/people/tenant-people-active-filter-select";
import { TenantCreateAcademicPersonDialog } from "@/components/people/tenant-create-academic-person-dialog";
import { TenantPeopleSearchField } from "@/components/people/tenant-people-search-field";
import { TENANT_PEOPLE_TABLE_CONTROL_CLASS_NAME } from "@/components/people/tenant-people-table-styles";
import { TenantPeopleTable } from "@/components/people/tenant-people-table";
import {
  filterOrganizationPeopleBySearchQuery,
  getLoadedCountLabel,
  PEOPLE_PAGE_SIZE,
} from "@/components/people/tenant-people-utils";
import type {
  TenantOrganizationPersonRole,
  TenantPeopleActiveFilter,
} from "@/components/people/tenant-people.types";
import { Button } from "@/components/ui/button";
import { useTenantPersonActiveState } from "@/hooks/people/use-tenant-person-active-state";

export function TenantPeopleDashboard({
  accountSelfIcon,
  accountSelfLabel,
  slug,
  title,
  roleFilter,
  createPersonLabel,
  personProfileHrefBase,
}: {
  accountSelfIcon?: "student" | "teacher";
  accountSelfLabel?: string;
  slug: string;
  title: string;
  roleFilter: Extract<TenantOrganizationPersonRole, "student" | "teacher">;
  createPersonLabel: string;
  personProfileHrefBase?: string;
}) {
  const t = useTranslations("TenantPeople");
  const { setActive } = useTenantPersonActiveState({ slug });
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [activeFilter, setActiveFilter] =
    useState<TenantPeopleActiveFilter>("active");
  const {
    results: people,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.platform.people.listOrganizationPeople,
    {
      slug,
      roleFilter,
      activeFilter,
    },
    { initialNumItems: PEOPLE_PAGE_SIZE },
  );

  const peopleCount = getLoadedCountLabel(people.length, status);
  const filteredPeople = filterOrganizationPeopleBySearchQuery(
    people,
    deferredSearchQuery,
  );
  const isSearching = deferredSearchQuery.trim().length > 0;
  const displayedCount = isSearching ? `${filteredPeople.length}` : peopleCount;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        <span className="shrink-0 text-sm text-muted-foreground">
          {t("resultsCount", { count: displayedCount })}
        </span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <TenantPeopleSearchField
            ariaLabel={t("filters.search")}
            name="tenant-people-search"
            placeholder={t("filters.searchPlaceholder")}
            value={searchQuery}
            onValueChange={setSearchQuery}
          />

          <TenantPeopleActiveFilterSelect
            value={activeFilter}
            onValueChange={setActiveFilter}
            iconOnlyOnMobile
            className={TENANT_PEOPLE_TABLE_CONTROL_CLASS_NAME}
          />
        </div>

        <TenantCreateAcademicPersonDialog
          slug={slug}
          role={roleFilter}
          triggerLabel={createPersonLabel}
          title={createPersonLabel}
        />
      </div>

      <TenantPeopleTable
        accountSelfIcon={accountSelfIcon}
        accountSelfLabel={accountSelfLabel}
        people={filteredPeople}
        isLoading={status === "LoadingFirstPage"}
        emptyLabel={isSearching ? t("table.noSearchResults") : undefined}
        personProfileHrefBase={personProfileHrefBase}
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
