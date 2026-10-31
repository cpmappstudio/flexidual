"use client";

import { useEffect, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getCurrentMinute } from "@/hooks/use-current-minute";
import { useSettingsContext } from "@/hooks/use-settings-context";

export function useEventDirectory(orgSlug: string, search: string) {
  // shortcut: upcoming dates refresh on reopening, add live refresh when pagination can retain loaded pages.
  const [now] = useState(getCurrentMinute);
  const { context } = useSettingsContext();
  const org = useQuery(
    api.organizations.resolveSlug,
    context ? { slug: orgSlug } : "skip",
  );
  const schoolId = context?.institution._id;
  const campusId =
    org?.type === "campus" ? (org._id as Id<"campuses">) : undefined;
  const { results, status, loadMore } = usePaginatedQuery(
    api.events.list,
    schoolId && org
      ? {
          schoolId,
          campusId,
          now,
          ...(search && { search }),
        }
      : "skip",
    { initialNumItems: 30 },
  );

  useEffect(() => {
    if (results.length === 0 && status === "CanLoadMore") loadMore(30);
  }, [results.length, status, loadMore]);

  return { context, org, results, status, loadMore };
}
