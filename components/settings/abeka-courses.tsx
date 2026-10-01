"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useFormatter, useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Combobox as MultipleCombobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox-multiple";
import { Spinner } from "@/components/ui/spinner";
import { DataTable } from "@/components/table/data-table";
import {
  createSearchColumn,
  createSortableHeader,
} from "@/components/table/column-helpers";
import { AbekaLoading } from "./abeka-integration-item";

type Course = FunctionReturnType<
  typeof api.abekaCurriculumLinks.courses
>["page"][number];
const CourseContext = createContext<{
  schoolId: Id<"schools">;
  save: (
    course: Course,
    curriculumId: Id<"curriculums">,
    remove?: boolean,
  ) => Promise<void>;
  disabled: boolean;
  saving: string | null;
} | null>(null);

export function AbekaCourses({
  schoolId,
  running,
  connection,
  onCount,
}: {
  schoolId: Id<"schools">;
  running: boolean;
  connection: Doc<"abekaConnections">;
  onCount: (count: number | null) => void;
}) {
  const t = useTranslations("settings.integrations");
  const common = useTranslations("common");
  const format = useFormatter();
  const { results, status, loadMore } = usePaginatedQuery(
    api.abekaCurriculumLinks.courses,
    { schoolId },
    { initialNumItems: 25 },
  );
  const link = useMutation(api.abekaCurriculumLinks.link);
  const refresh = useMutation(api.abekaCatalog.refresh);
  const [saving, setSaving] = useState<string | null>(null);
  const pending = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (status === "CanLoadMore") loadMore(25);
  }, [status, loadMore]);
  useEffect(() => {
    if (status !== "Exhausted") onCount(null);
  }, [status, onCount]);
  const migrationPending = connection.curriculumLinksMigratedAt === undefined;
  async function save(
    course: Course,
    curriculumId: Id<"curriculums">,
    remove = false,
  ) {
    if (pending.current || running) return;
    pending.current = true;
    setSaving(course._id);
    try {
      await link({
        courseId: course._id,
        curriculumId,
        ...(remove ? { remove: true } : {}),
      });
    } catch {
      toast.error(t("courses.linkError"));
    } finally {
      pending.current = false;
      setSaving(null);
    }
  }
  const columns: ColumnDef<Course>[] = [
    createSearchColumn<Course>(["name", "subjectId"]),
    {
      accessorKey: "name",
      header: createSortableHeader("Abeka"),
      cell: ({ row: { original: c } }) => (
        <div>
          <div className="font-medium">{c.name}</div>
          <div className="text-xs text-muted-foreground">
            {c.subjectId} · {t("courses.lessons", { count: c.totalLessons })}
            {!c.available && ` · ${t("inactive")}`}
          </div>
        </div>
      ),
    },
    { id: "flexidual", header: t("courses.flexidual"), cell: CourseLinkCell },
  ];
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3">
      {migrationPending && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("courses.migrationPending")}
        </p>
      )}
      {connection.catalogSyncedAt && (
        <p className="text-sm text-muted-foreground">
          {t("courses.lastSync", {
            date: format.dateTime(connection.catalogSyncedAt, {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          })}
        </p>
      )}
      {connection.catalogError && (
        <p role="alert" className="text-sm text-destructive">
          {t("courses.refreshError")} {t(`errors.${connection.catalogError}`)}
        </p>
      )}
      {status !== "Exhausted" ? (
        <AbekaLoading />
      ) : (
        <CourseContext.Provider
          value={{
            schoolId,
            save,
            disabled: running || saving !== null || migrationPending,
            saving,
          }}
        >
          <DataTable
            data={results}
            columns={columns}
            filterColumn="search"
            filterPlaceholder={t("courses.search")}
            emptyMessage={
              results.length ? common("noResults") : t("courses.empty")
            }
            onFilteredRowCountChange={onCount}
            createAction={
              <Button
                variant="outline"
                aria-label={t("courses.refresh")}
                disabled={
                  running ||
                  refreshing ||
                  !["connected", "error"].includes(connection.status)
                }
                onClick={async () => {
                  if (refreshing) return;
                  setRefreshing(true);
                  try {
                    await refresh({ schoolId });
                  } catch {
                    toast.error(t("syncActionError"));
                  } finally {
                    setRefreshing(false);
                  }
                }}
              >
                {refreshing || running ? (
                  <Spinner aria-hidden="true" />
                ) : (
                  <RefreshCw aria-hidden="true" />
                )}
                <span className="hidden md:inline">{t("courses.refresh")}</span>
              </Button>
            }
          />
        </CourseContext.Provider>
      )}
    </div>
  );
}

function CourseLinkCell({ row }: CellContext<Course, unknown>) {
  const { schoolId, disabled, saving, save } = useContext(CourseContext)!;
  const t = useTranslations("settings.integrations");
  const common = useTranslations("common");
  const course = row.original;
  const anchor = useComboboxAnchor();
  const [open, setOpen] = useState(false);
  const canQuery = open && !disabled && course.available;
  const { results, status, loadMore } = usePaginatedQuery(
    api.abekaCurriculumLinks.candidates,
    canQuery ? { schoolId } : "skip",
    { initialNumItems: 50 },
  );
  useEffect(() => {
    if (canQuery && status === "CanLoadMore") loadMore(50);
  }, [canQuery, status, loadMore]);
  const candidates = canQuery && status === "Exhausted" ? results : [];
  const labels = new Map([
    ...candidates.map(
      (c) =>
        [
          c.id,
          `${c.name}${c.code ? ` · ${c.code}` : ""} · ${c.id.slice(-6)}`,
        ] as const,
    ),
    ...course.links.map((link) => [link.curriculumId, link.name] as const),
  ]);
  const selected = course.links.map((link) => link.curriculumId);
  return (
    <div className="flex items-center gap-2">
      <MultipleCombobox
        multiple
        autoHighlight
        items={candidates.map((c) => c.id)}
        value={selected}
        itemToStringLabel={(id) => labels.get(id) ?? id}
        onValueChange={(next) => {
          const removed = selected.find((id) => !next.includes(id));
          const added = next.find((id) => !selected.includes(id));
          if (removed) void save(course, removed, true);
          else if (added && course.available) void save(course, added);
        }}
        onOpenChange={setOpen}
        disabled={disabled}
      >
        <ComboboxChips ref={anchor} className="w-72 max-w-xs">
          <ComboboxValue>
            {() =>
              course.links.map((link) => (
                <ComboboxChip
                  key={link.curriculumId}
                  removeLabel={`${t("unlink")} · ${link.name}`}
                >
                  <span
                    className={`min-w-0 whitespace-normal break-words ${link.active ? "" : "text-muted-foreground"}`}
                  >
                    {labels.get(link.curriculumId)}
                  </span>
                </ComboboxChip>
              ))
            }
          </ComboboxValue>
          <ComboboxChipsInput
            disabled={disabled || !course.available}
            aria-label={`${t("courses.flexidual")} · ${course.name}`}
            placeholder={t("courses.choose")}
          />
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          {canQuery && status !== "Exhausted" ? (
            <div
              role="status"
              className="flex items-center justify-center gap-2 p-4 text-sm"
            >
              <Spinner aria-hidden="true" role="presentation" />
              {t("loading")}
            </div>
          ) : (
            <ComboboxEmpty>{common("noResults")}</ComboboxEmpty>
          )}
          <ComboboxList>
            {(id: Id<"curriculums">) => (
              <ComboboxItem key={id} value={id}>
                {labels.get(id)}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </MultipleCombobox>
      {saving === course._id && <Spinner aria-label={t("loading")} />}
    </div>
  );
}
