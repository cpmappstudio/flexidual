import { useMemo, useState } from "react";
import { useQueries, type RequestForQueries } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { COURSE_PROGRESS_PAGE_SIZE } from "@/lib/academic-settings";

const progressQuery = api.adminSessionDashboard.getCourseProgress;
type CourseOptions = FunctionReturnType<
  typeof api.adminSessionDashboard.listCourses
>;
type ProgressProps = Omit<FunctionArgs<typeof progressQuery>, "classIds">;

export function AdminCourseProgress({
  scope,
  today,
  courses,
  classId,
}: {
  scope: Omit<ProgressProps, "today">;
  today: string;
  courses: CourseOptions | Error | undefined;
  classId?: Id<"classes">;
}) {
  const t = useTranslations("adminDashboard");
  return (
    <Card>
      <CardHeader className="px-3 sm:px-6">
        <h2 className="text-lg font-semibold">{t("academicProgress")}</h2>
      </CardHeader>
      <CardContent className="space-y-4 px-3 sm:px-6">
        {courses instanceof Error ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t("progressLoadError")}
          </p>
        ) : !courses ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <CourseProgressPage
            key={classId ?? "all"}
            scope={scope}
            today={today}
            courses={courses}
            classId={classId}
          />
        )}
      </CardContent>
    </Card>
  );
}

function CourseProgressPage({
  scope,
  today,
  courses,
  classId,
}: {
  scope: Omit<ProgressProps, "today">;
  today: string;
  courses: CourseOptions;
  classId?: Id<"classes">;
}) {
  const t = useTranslations("adminDashboard");
  const format = useFormatter();
  const [page, setPage] = useState(0);
  const options = useMemo(
    () =>
      classId
        ? courses.filter((course) => course.classId === classId)
        : courses,
    [classId, courses],
  );
  const pageCount = Math.ceil(options.length / COURSE_PROGRESS_PAGE_SIZE);
  const visiblePage = Math.max(0, Math.min(page, pageCount - 1));
  const visibleCourses = useMemo(() => {
    const start = visiblePage * COURSE_PROGRESS_PAGE_SIZE;
    return options.slice(start, start + COURSE_PROGRESS_PAGE_SIZE);
  }, [options, visiblePage]);
  const requests = useMemo((): RequestForQueries => {
    if (!visibleCourses.length) return {};
    return {
      progress: {
        query: progressQuery,
        args: {
          ...scope,
          today,
          classIds: visibleCourses.map((course) => course.classId),
        },
      },
    };
  }, [scope, today, visibleCourses]);
  const { progress } = useQueries(requests) as {
    progress?: FunctionReturnType<typeof progressQuery> | Error;
  };

  if (!pageCount)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("progressNoCourses")}
      </p>
    );

  return (
    <>
      <p className="text-sm text-muted-foreground">{t("progressReference")}</p>
      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {t("progressPage", { page: visiblePage + 1, total: pageCount })}
          </span>
          <Button
            size="icon"
            variant="outline"
            aria-label={t("reviewPrevious")}
            disabled={visiblePage === 0}
            onClick={() => setPage(visiblePage - 1)}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            size="icon"
            variant="outline"
            aria-label={t("reviewNext")}
            disabled={visiblePage + 1 >= pageCount}
            onClick={() => setPage(visiblePage + 1)}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      )}
      {progress instanceof Error ? (
        <p role="alert" className="text-sm text-muted-foreground">
          {t("progressLoadError")}
        </p>
      ) : !progress ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <ul className="divide-y">
          {visibleCourses.map(({ classId, name }) => {
            const row = progress.find((item) => item.classId === classId);
            if (!row) return null;
            const { lessons, timetable } = row;
            return (
              <li key={classId} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <h3 className="break-words font-medium">{name}</h3>
                <ProgressLine
                  label={t("progressLessons")}
                  ratio={
                    lessons?.totalLessons
                      ? lessons.taughtLessons / lessons.totalLessons
                      : undefined
                  }
                  detail={
                    lessons
                      ? lessons.totalLessons
                        ? t("progressLessonCount", {
                            count: lessons.taughtLessons,
                            total: lessons.totalLessons,
                          })
                        : t("progressNoLessons")
                      : t("notReady")
                  }
                />
                <ProgressLine
                  label={t("progressTime")}
                  ratio={
                    timetable
                      ? timetable.elapsedMs / timetable.totalMs
                      : undefined
                  }
                  detail={
                    timetable
                      ? t("progressHours", {
                          elapsed: format.number(
                            timetable.elapsedMs / 3_600_000,
                            { maximumFractionDigits: 1 },
                          ),
                          total: format.number(timetable.totalMs / 3_600_000, {
                            maximumFractionDigits: 1,
                          }),
                        })
                      : t("notReady")
                  }
                  indicatorClassName="bg-chart-2"
                />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function ProgressLine({
  label,
  ratio,
  detail,
  indicatorClassName,
}: {
  label: string;
  ratio?: number;
  detail: string;
  indicatorClassName?: string;
}) {
  const format = useFormatter();
  const percent =
    ratio === undefined
      ? undefined
      : format.number(ratio, { style: "percent", maximumFractionDigits: 1 });
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {detail}
          {percent && ` · ${percent}`}
        </span>
      </div>
      {ratio !== undefined && (
        <Progress
          value={ratio * 100}
          aria-label={label}
          aria-valuetext={`${detail} · ${percent}`}
          indicatorClassName={indicatorClassName}
        />
      )}
    </div>
  );
}
