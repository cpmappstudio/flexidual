"use client";
import { useCallback, useEffect, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { ColumnFiltersState, SortingState } from "@tanstack/react-table";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDebouncedValue } from "./use-debounced-value";
import { reportRuntimeError } from "@/lib/error-tracking";

const PAGE_SIZE = 25;

export function usePeopleDirectory(
  scope: { campusId: Id<"campuses">; role: "student" | "teacher" } | undefined,
) {
  const campusId = scope?.campusId;
  const role = scope?.role;
  const [sorting, setSorting] = useState<SortingState>([
    { id: "fullName", desc: false },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const search = useDebouncedValue(
    String(columnFilters.find((f) => f.id === "search")?.value ?? "").trim(),
  );
  const ready = useQuery(api.people.isReady, scope ?? "skip");
  const prepare = useMutation(api.people.prepare);
  const [preparationFailed, setPreparationFailed] = useState(false);
  const initialize = useCallback(() => {
    if (!campusId || !role) return;
    setPreparationFailed(false);
    void prepare({ campusId, role }).catch((error) => {
      setPreparationFailed(true);
      reportRuntimeError(error, { operation: "people.prepare" });
    });
  }, [campusId, role, prepare]);
  useEffect(() => {
    if (ready === false) initialize();
  }, [ready, initialize]);
  const sort = sorting[0];
  const sortBy: "fullName" | "email" | "grade" | "isActive" =
    sort?.id === "email" || sort?.id === "grade" || sort?.id === "isActive"
      ? sort.id
      : "fullName";
  const grade = (
    columnFilters.find((f) => f.id === "grade")?.value as string[] | undefined
  )?.[0];
  const active = (
    columnFilters.find((f) => f.id === "isActive")?.value as
      | string[]
      | undefined
  )?.[0];
  // Search results use the native relevance order, not a sort of the visible page.
  const args = scope
    ? {
        ...scope,
        search: search || undefined,
        grade,
        isActive: active ? active === "active" : undefined,
        sortBy,
        direction: sort?.desc ? ("desc" as const) : ("asc" as const),
      }
    : undefined;
  const key = JSON.stringify(args);
  const searchInvalid =
    search.length > 256 || (search ? search.split(/\s+/).length : 0) > 16;
  const [view, setView] = useState({ key, index: 0 });
  const requestedPageIndex = view.key === key ? view.index : 0;
  const { results, status, loadMore } = usePaginatedQuery(
    api.people.list,
    args && ready && !searchInvalid ? args : "skip",
    { initialNumItems: PAGE_SIZE },
  );
  const lastLoadedPage = Math.max(0, Math.ceil(results.length / PAGE_SIZE) - 1);
  const pageIndex =
    status === "CanLoadMore" || status === "Exhausted"
      ? Math.min(requestedPageIndex, lastLoadedPage)
      : requestedPageIndex;
  const end = (pageIndex + 1) * PAGE_SIZE;
  useEffect(() => {
    setView((current) => (current.key === key ? current : { key, index: 0 }));
  }, [key]);
  useEffect(() => {
    if (status === "LoadingFirstPage")
      setView((current) => (current.index === 0 ? current : { key, index: 0 }));
    if (status === "CanLoadMore" || status === "Exhausted") {
      setView((current) =>
        current.key === key && current.index <= lastLoadedPage
          ? current
          : { key, index: pageIndex },
      );
    }
  }, [status, lastLoadedPage, key, pageIndex]);
  return {
    enabled: Boolean(scope),
    ready,
    initialize,
    preparationFailed,
    data: results.slice(pageIndex * PAGE_SIZE, end),
    searching: Boolean(search),
    searchInvalid,
    server: {
      sorting,
      columnFilters,
      onSortingChange: setSorting,
      onColumnFiltersChange: setColumnFilters,
      pageIndex,
      hasNext:
        results.length > end ||
        status === "CanLoadMore" ||
        status === "LoadingMore",
      isLoading:
        !searchInvalid &&
        (status === "LoadingFirstPage" ||
          (status === "LoadingMore" && results.length < end)),
      onPrevious: () => setView({ key, index: Math.max(0, pageIndex - 1) }),
      onNext: () => {
        // Sparse permission/filter matches must not auto-scan the whole campus.
        if (results.length <= end && status === "CanLoadMore")
          loadMore(PAGE_SIZE);
        if (results.length >= end) setView({ key, index: pageIndex + 1 });
      },
    },
  };
}
