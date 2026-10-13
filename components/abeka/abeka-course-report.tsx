"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { createSortableHeader } from "@/components/table/column-helpers";
import { DataTable } from "@/components/table/data-table";
import { Progress } from "@/components/ui/progress";
import type { Doc } from "@/convex/_generated/dataModel";
import { AbekaProgressTrend } from "./abeka-progress-trend";

type ReportLesson = Pick<
  Doc<"abekaProgress">["lessons"][number],
  "lessonNumber" | "percentage" | "completed" | "lastViewed"
>;

export function AbekaCourseReport({
  report,
  collapsible = true,
  timeZone,
}: {
  report: Pick<Doc<"abekaProgress">, "subjectName" | "syncedAt"> & {
    lessons: ReportLesson[];
    history?: { date: string; percentage: number }[];
  };
  collapsible?: boolean;
  timeZone?: string;
}) {
  const t = useTranslations("settings.integrations");
  const format = useFormatter();
  const columns = useMemo<ColumnDef<ReportLesson>[]>(
    () => [
      {
        accessorKey: "lessonNumber",
        header: createSortableHeader(t("lesson")),
        sortingFn: "basic",
        meta: { className: "w-20 tabular-nums" },
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            {row.original.lessonNumber}
            {row.original.completed && (
              <CheckCircle2
                className="size-4 text-green-600"
                aria-label={t("lessonCompleted")}
                role="img"
              />
            )}
          </span>
        ),
      },
      {
        accessorKey: "percentage",
        header: createSortableHeader(t("progress")),
        sortingFn: "basic",
        cell: ({ row }) => {
          const lesson = row.original;
          const percentage = format.number(lesson.percentage / 100, {
            style: "percent",
            maximumFractionDigits: 2,
          });
          return (
            <div className="flex min-w-36 items-center gap-1.5 sm:min-w-52">
              <Progress
                value={lesson.percentage}
                aria-label={`${t("lesson")} ${lesson.lessonNumber}: ${t("progress")}`}
                aria-valuetext={percentage}
                className="h-2 flex-1 bg-muted"
                indicatorClassName={`motion-reduce:transition-none ${
                  lesson.percentage >= 100
                    ? "bg-green-600"
                    : lesson.percentage >= 50
                      ? "bg-primary"
                      : "bg-amber-500"
                }`}
              />
              <span className="w-12 shrink-0 text-xs font-medium tabular-nums">
                {percentage}
              </span>
            </div>
          );
        },
      },
      {
        id: "lastViewed",
        accessorFn: (lesson) => lesson.lastViewed ?? undefined,
        header: createSortableHeader(t("lastViewed")),
        sortingFn: "text",
        sortUndefined: "last",
        cell: ({ row }) =>
          row.original.lastViewed ? (
            <time dateTime={row.original.lastViewed} className="text-xs">
              {format.dateTime(
                Date.parse(`${row.original.lastViewed}T00:00:00Z`),
                {
                  dateStyle: "medium",
                  // Abeka sends a calendar date, not a timestamp to shift by time zone.
                  timeZone: "UTC",
                },
              )}
            </time>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],
    [format, t],
  );
  const Container = collapsible ? "details" : "div";
  const Heading = collapsible ? "summary" : "h2";
  return (
    <Container
      className={
        collapsible
          ? "relative min-w-0 rounded-lg border p-3 ph-mask"
          : "relative min-w-0 ph-mask"
      }
    >
      <Heading
        className={
          collapsible
            ? "cursor-pointer pr-28 sm:pr-40"
            : "pr-28 text-lg sm:pr-40"
        }
      >
        <span className="inline-flex flex-wrap items-baseline gap-x-1 gap-y-1 sm:gap-x-2">
          <span className="font-medium">{report.subjectName}</span>
          <span className="text-xs text-muted-foreground sm:text-sm">
            {t("completed", {
              count: report.lessons.filter((lesson) => lesson.completed).length,
              total: report.lessons.length,
            })}
          </span>
        </span>
      </Heading>
      <AbekaProgressTrend history={report.history ?? []} />
      <p className="my-2 min-h-4 text-xs text-muted-foreground sm:pr-40">
        {t("lastSync")}:{" "}
        {format.dateTime(report.syncedAt, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone,
        })}
      </p>
      <div className="max-h-[50dvh] overflow-auto">
        <DataTable
          data={report.lessons}
          columns={columns}
          initialSorting={[{ id: "lessonNumber", desc: false }]}
          pageSize={10}
          paginate={report.lessons.length > 10}
          emptyMessage={t("noReports")}
        />
      </div>
    </Container>
  );
}
