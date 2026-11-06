"use client";

import { useEffect, useMemo } from "react";
import { usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { ColumnDef } from "@tanstack/react-table";
import { Video } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/components/table/data-table";
import { ProgressPercentage } from "@/components/ui/progress-percentage";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Course = { classId: Id<"classes">; className: string; timeZone: string };
type Row = FunctionReturnType<
  typeof api.videoViewingProgress.courseReport
>["page"][number];
type Props = { course: Course; studentId?: string; orgSlug: string };
const PAGE_SIZE = 10;

function Report({ course, studentId, orgSlug }: Props) {
  const t = useTranslations("recordings");
  const common = useTranslations("common");
  const format = useFormatter();
  const { results, status, loadMore } = usePaginatedQuery(
    api.videoViewingProgress.courseReport,
    { classId: course.classId, ...(studentId ? { studentId, orgSlug } : {}) },
    { initialNumItems: PAGE_SIZE },
  );
  // Stale/cancelled assets can leave a native page empty; never strand the reader there.
  useEffect(() => {
    if (results.length === 0 && status === "CanLoadMore") loadMore(PAGE_SIZE);
  }, [results.length, status, loadMore]);
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        accessorKey: "scheduledStart",
        header: t("session"),
        cell: ({ row }) => (
          <div>
            <time
              dateTime={new Date(row.original.scheduledStart).toISOString()}
            >
              {format.dateTime(row.original.scheduledStart, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: course.timeZone,
              })}
            </time>
            <p className="text-xs text-muted-foreground break-words">
              {row.original.name}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "percentage",
        header: t("watched"),
        cell: ({ row }) =>
          row.original.percentage === null ? (
            <span className="text-xs text-muted-foreground">
              {t("progressUnavailable")}
            </span>
          ) : (
            <ProgressPercentage
              value={row.original.percentage}
              label={`${row.original.name}: ${t("watched")}`}
            />
          ),
      },
      {
        accessorKey: "lastProgressAt",
        header: t("lastProgressSaved"),
        cell: ({ row }) =>
          row.original.lastProgressAt === null ? (
            "—"
          ) : (
            <time
              dateTime={new Date(row.original.lastProgressAt).toISOString()}
              className="text-xs"
            >
              {format.dateTime(row.original.lastProgressAt, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: course.timeZone,
              })}
            </time>
          ),
      },
    ],
    [course.timeZone, format, t],
  );
  if (results.length === 0 && status !== "Exhausted")
    return <Spinner aria-label={common("loading")} />;
  return (
    <div className="min-w-0 ph-mask">
      <DataTable
        data={results}
        columns={columns}
        paginate={false}
        emptyMessage={t("noProgressVideos")}
      />
      {status !== "Exhausted" && (
        <Button
          variant="outline"
          className="mt-3"
          disabled={status !== "CanLoadMore"}
          onClick={() => loadMore(PAGE_SIZE)}
        >
          {common(status === "CanLoadMore" ? "loadMore" : "loading")}
        </Button>
      )}
    </div>
  );
}

export function PrerecordedProgressReport(props: Props) {
  const t = useTranslations("recordings");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${t("viewingProgress")} · ${props.course.className}`}
          title={t("viewingProgress")}
        >
          <Video aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85dvh] overflow-y-auto">
        <DialogTitle>
          {t("viewingProgress")} · {props.course.className}
        </DialogTitle>
        <DialogDescription>{t("viewingProgressHint")}</DialogDescription>
        <Report {...props} />
      </DialogContent>
    </Dialog>
  );
}
