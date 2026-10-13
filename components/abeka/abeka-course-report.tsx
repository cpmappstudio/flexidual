"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { createSortableHeader } from "@/components/table/column-helpers";
import { DataTable } from "@/components/table/data-table";
import { Progress } from "@/components/ui/progress";
import type { Doc } from "@/convex/_generated/dataModel";

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
            <div className="flex min-w-36 items-center gap-2 sm:min-w-52">
              <Progress
                value={lesson.percentage}
                aria-label={`${t("lesson")} ${lesson.lessonNumber}: ${t("progress")}`}
                aria-valuetext={percentage}
                className="h-2 flex-1 bg-[#86338a]/10"
                indicatorClassName="bg-[#86338a] motion-reduce:transition-none"
              />
              <span className="w-14 text-right text-xs font-medium tabular-nums">
                {percentage}
              </span>
              <span className="w-4 shrink-0">
                {lesson.completed && (
                  <CheckCircle2
                    className="size-4 text-green-600"
                    aria-label={t("lessonCompleted")}
                    role="img"
                  />
                )}
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
          ? "min-w-0 rounded-lg border p-3 ph-mask"
          : "min-w-0 ph-mask"
      }
    >
      <Heading className={collapsible ? "cursor-pointer" : "pr-6 text-lg"}>
        <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-medium">{report.subjectName}</span>
          <span className="text-sm text-muted-foreground">
            {t("completed", {
              count: report.lessons.filter((lesson) => lesson.completed).length,
              total: report.lessons.length,
            })}
          </span>
        </span>
      </Heading>
      <p className="my-2 text-xs text-muted-foreground">
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
