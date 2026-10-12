"use client";

import { useCallback, useEffect, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";

import { StudentHistorySurface } from "@/components/dashboards/student-history-surface";
import { CurriculumIcon } from "@/components/teaching/curriculums/curriculum-icon";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRetainedQueryResult } from "@/hooks/use-retained-query-result";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type StudentTaskCourse = {
  classId: Id<"classes">;
  className: string;
  timeZone: string;
  curriculumIconKey: string;
};

const PAGE_SIZE = 10;
const ALL_COURSES = "all";
type TaskStatusFilter = NonNullable<
  FunctionArgs<typeof api.courseTasks.listStudentTasksForClass>["status"]
>;
type CoursePresence = "loading" | "hasTasks" | "empty";

function CourseTasks({
  course,
  now,
  orgSlug,
  studentId,
  statusFilter,
  showEmpty,
  onPresenceChange,
  onNavigate,
}: {
  course: StudentTaskCourse;
  now: number;
  orgSlug: string;
  studentId?: string;
  statusFilter: TaskStatusFilter;
  showEmpty: boolean;
  onPresenceChange: (classId: Id<"classes">, presence: CoursePresence) => void;
  onNavigate: () => void;
}) {
  const t = useTranslations("courseTasks");
  const formatter = useFormatter();
  const [targetCount, setTargetCount] = useState(1);
  const { results, status, loadMore } = usePaginatedQuery(
    api.courseTasks.listStudentTasksForClass,
    {
      classId: course.classId,
      now,
      status: statusFilter,
      ...(studentId ? { studentId, orgSlug } : {}),
    },
    { initialNumItems: PAGE_SIZE },
  );
  const isSeeking = results.length < targetCount && status !== "Exhausted";
  const isSettled = !isSeeking;
  const retained = useRetainedQueryResult(
    isSettled ? { results, status } : undefined,
    `${orgSlug}:${studentId ?? "self"}:${course.classId}:${statusFilter}`,
  );
  const visibleResults = isSettled ? results : (retained?.results ?? results);
  const visibleStatus = isSettled ? status : (retained?.status ?? status);

  useEffect(() => {
    if (isSeeking && status === "CanLoadMore") loadMore(PAGE_SIZE);
  }, [isSeeking, loadMore, status]);

  useEffect(() => {
    onPresenceChange(
      course.classId,
      visibleResults.length > 0
        ? "hasTasks"
        : visibleStatus === "Exhausted"
          ? "empty"
          : "loading",
    );
  }, [course.classId, onPresenceChange, visibleResults.length, visibleStatus]);

  if (
    !showEmpty &&
    visibleStatus === "Exhausted" &&
    visibleResults.length === 0
  )
    return null;

  return (
    <section className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm">
      <h3 className="flex min-w-0 items-center gap-3 border-b pb-3 text-base font-semibold text-foreground">
        <CurriculumIcon
          iconKey={course.curriculumIconKey}
          className="size-11"
          size={44}
        />
        <span className="min-w-0 break-words">{course.className}</span>
      </h3>

      {visibleResults.length === 0 && visibleStatus !== "Exhausted" ? (
        <div className="space-y-2 pt-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      ) : visibleResults.length === 0 && visibleStatus === "Exhausted" ? (
        <p className="pt-4 text-sm text-muted-foreground">
          {t(
            statusFilter === "all" ? "historyEmptyCourse" : "historyNoMatches",
          )}
        </p>
      ) : (
        <div className="divide-y">
          {visibleResults.map((task) => {
            const statusLabel =
              task.status === "submitted"
                ? t(task.submittedLate ? "submittedLate" : "submittedOnTime")
                : task.status === "pending"
                  ? t("historyPending")
                  : t("historyClosed");
            const date = task.submittedAt ?? task.dueAt;
            return (
              <Link
                key={task.taskId}
                href={`/${orgSlug}/classes/${course.classId}?task=${task.taskId}`}
                onClick={onNavigate}
                className="group flex min-w-0 items-start justify-between gap-3 rounded-lg px-1 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 space-y-1">
                  <span className="block min-w-0 break-words font-medium text-foreground group-hover:text-primary">
                    {task.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {date === undefined
                      ? t("noDeadline")
                      : `${t(task.submittedAt === undefined ? "deadlineLabel" : "submittedAt")}: ${formatter.dateTime(
                          date,
                          {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: course.timeZone,
                          },
                        )}`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      task.status === "submitted"
                        ? "bg-success/15 text-success"
                        : task.status === "pending"
                          ? "bg-warning/15 text-warning-foreground"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {statusLabel}
                  </span>
                  <ArrowUpRight
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <div className="flex justify-center pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSeeking || status === "LoadingMore"}
            onClick={() => setTargetCount(results.length + 1)}
          >
            {(isSeeking || status === "LoadingMore") && (
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
            )}
            {t("historyLoadMore")}
          </Button>
        </div>
      )}
    </section>
  );
}

export function StudentTaskHistory({
  open,
  onOpenChange,
  courses,
  now,
  orgSlug,
  studentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: StudentTaskCourse[];
  now: number;
  orgSlug: string;
  studentId?: string;
}) {
  const t = useTranslations("courseTasks");
  const locale = useLocale();
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>("all");
  const [courseFilter, setCourseFilter] = useState<string>(ALL_COURSES);
  const [presence, setPresence] = useState<Record<string, CoursePresence>>({});
  const sortedCourses = [...courses].sort(
    (first, second) =>
      first.className.localeCompare(second.className, locale, {
        sensitivity: "base",
      }) || first.classId.localeCompare(second.classId),
  );
  const selectedCourseId = courses.some(
    (course) => course.classId === courseFilter,
  )
    ? courseFilter
    : ALL_COURSES;
  const visibleCourses =
    selectedCourseId === ALL_COURSES
      ? sortedCourses
      : sortedCourses.filter((course) => course.classId === selectedCourseId);
  const allCoursesEmpty =
    visibleCourses.length === 0 ||
    visibleCourses.every((course) => presence[course.classId] === "empty");
  const reportPresence = useCallback(
    (classId: Id<"classes">, next: CoursePresence) => {
      setPresence((current) =>
        current[classId] === next ? current : { ...current, [classId]: next },
      );
    },
    [],
  );
  const changeStatus = (value: TaskStatusFilter) => {
    setPresence({});
    setStatusFilter(value);
  };
  const changeCourse = (value: string) => {
    setPresence({});
    setCourseFilter(value || ALL_COURSES);
  };
  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen) {
      setStatusFilter("all");
      setCourseFilter(ALL_COURSES);
      setPresence({});
    }
    onOpenChange(nextOpen);
  };

  return (
    <StudentHistorySurface
      open={open}
      onOpenChange={changeOpen}
      title={t("historyTitle")}
      description={t("historyDescription")}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="grid shrink-0 gap-3 border-b px-4 py-3 sm:grid-cols-2 sm:px-6">
          <div className="space-y-1.5">
            <Label htmlFor="task-status-filter">
              {t("historyStatusFilter")}
            </Label>
            <Select
              value={statusFilter}
              onValueChange={(value) => changeStatus(value as TaskStatusFilter)}
            >
              <SelectTrigger id="task-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("historyAllStatuses")}</SelectItem>
                <SelectItem value="pending">{t("historyPending")}</SelectItem>
                <SelectItem value="submitted">
                  {t("historySubmitted")}
                </SelectItem>
                <SelectItem value="closed">
                  {t("historyClosedFilter")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("historyCourseFilter")}</Label>
            <Combobox
              options={[
                { value: ALL_COURSES, label: t("historyAllCourses") },
                ...sortedCourses.map((course) => ({
                  value: course.classId,
                  label: course.className,
                })),
              ]}
              value={selectedCourseId}
              onValueChange={changeCourse}
              placeholder={t("historyAllCourses")}
              searchPlaceholder={t("historySearchCourses")}
              emptyText={t("historyNoCourses")}
              ariaLabel={t("historyCourseFilter")}
              className="h-9 bg-sidebar font-normal"
            />
          </div>
        </div>
        <ScrollArea
          key={`${statusFilter}:${selectedCourseId}`}
          className="min-h-0 min-w-0 flex-1 touch-pan-y overscroll-contain"
        >
          {open && (
            <div className="min-w-0 space-y-4 p-4 sm:p-6">
              {visibleCourses.map((course) => (
                <CourseTasks
                  key={course.classId}
                  course={course}
                  now={now}
                  orgSlug={orgSlug}
                  studentId={studentId}
                  statusFilter={statusFilter}
                  showEmpty={selectedCourseId !== ALL_COURSES}
                  onPresenceChange={reportPresence}
                  onNavigate={() => changeOpen(false)}
                />
              ))}
              {(visibleCourses.length === 0 ||
                (selectedCourseId === ALL_COURSES && allCoursesEmpty)) && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t(
                    statusFilter === "all"
                      ? "historyEmpty"
                      : "historyNoMatches",
                  )}
                </p>
              )}
            </div>
          )}
        </ScrollArea>
      </div>
    </StudentHistorySurface>
  );
}
