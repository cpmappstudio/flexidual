"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQueries, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Users,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarProviderMark } from "@/components/calendar/calendar-provider-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/table/data-table";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useStaffAccess } from "@/hooks/use-staff-access";
import { DASHBOARD_WINDOW_DAYS } from "@/lib/academic-settings";
import {
  addCivilDays,
  civilDayNumber,
  isValidTimeZone,
  mondayOfCivilWeek,
  todayInTimeZone,
} from "@/lib/time-zone";
import { AdminCourseProgress } from "./admin-course-progress";
import { AdminSessionReview } from "./admin-session-review";

const indicators = ["scheduled", "completed", "cancelled", "noStart"] as const;
const sessionColors = {
  scheduled: "var(--chart-2)",
  completed: "var(--chart-1)",
};
const attendanceColors = {
  present: "var(--chart-1)",
  partial: "var(--chart-2)",
  absent: "var(--chart-5)",
  excused: "var(--chart-3)",
};
const attendanceStatuses = Object.keys(
  attendanceColors,
) as (keyof typeof attendanceColors)[];
const fields = [...indicators, "other"] as const;
const periodQuery = api.academicSettings.get;
const summaryQuery = api.adminSessionDashboard.getWeeklySessions;
const peopleQuery = api.adminSessionDashboard.getPeopleSnapshot;

type Scope = {
  schoolId: Id<"schools">;
  campusId?: Id<"campuses">;
};
type Period = NonNullable<
  FunctionReturnType<typeof periodQuery>
>["periods"][number];
type Week = FunctionReturnType<typeof summaryQuery>["weeks"][number];

function MetricCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="min-w-0 gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{title}</h2>
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
        >
          {icon}
        </span>
      </div>
      {children}
    </Card>
  );
}

function AbekaWeeklyMetric({
  schoolId,
  timeZone,
}: {
  schoolId: Id<"schools">;
  timeZone: string;
}) {
  const t = useTranslations("adminDashboard.abekaActivity");
  const format = useFormatter();
  const requests = useMemo(
    () => ({
      activity: { query: api.abeka.getWeeklyActivity, args: { schoolId } },
    }),
    [schoolId],
  );
  const { activity } = useQueries(requests) as {
    activity?: FunctionReturnType<typeof api.abeka.getWeeklyActivity> | Error;
  };
  if (!activity || activity instanceof Error) return null;
  const snapshot = activity.snapshot;
  const current = snapshot?.timeZone === timeZone ? snapshot : null;
  const syncedAt = current?.syncedAt ?? activity.lastSyncedAt;
  const share =
    current && current.students > 0 ? current.viewers / current.students : null;
  return (
    <MetricCard
      title={t("title")}
      icon={
        <CalendarProviderMark
          sessionType="abeka"
          className="size-6"
          sizes="24px"
        />
      }
    >
      <div className="flex items-center gap-3 sm:gap-5">
        {share !== null && (
          <div className="relative grid size-20 shrink-0 place-items-center">
            <svg
              aria-hidden="true"
              viewBox="0 0 80 80"
              className="absolute inset-0 size-full -rotate-90"
              fill="none"
              strokeWidth={7}
            >
              <circle
                cx={40}
                cy={40}
                r={35}
                className="stroke-muted-foreground/20"
              />
              <circle
                cx={40}
                cy={40}
                r={35}
                pathLength={100}
                strokeDasharray={`${share * 100} 100`}
                stroke="#92278f"
              />
            </svg>
            <span className="text-sm font-semibold tabular-nums">
              {format.number(share, {
                style: "percent",
                maximumFractionDigits: 1,
              })}
            </span>
          </div>
        )}
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs text-muted-foreground">{t("scope")}</p>
          {current && (
            <p className="text-xs text-muted-foreground">
              {format.dateTimeRange(
                new Date(current.fromDate),
                new Date(current.throughDate),
                { timeZone: "UTC", dateStyle: "medium" },
              )}
            </p>
          )}
          {current && share !== null ? (
            <p className="text-sm font-semibold tabular-nums sm:text-base">
              {t("viewers", {
                viewers: current.viewers,
                students: current.students,
              })}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("pending")}</p>
          )}
          {syncedAt !== null && (
            <p className="text-xs text-muted-foreground">
              {t(current ? "summarySync" : "lastSync", {
                date: format.dateTime(syncedAt, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone,
                }),
              })}
            </p>
          )}
        </div>
      </div>
    </MetricCard>
  );
}

function PeopleMetric({ schoolId, campusId }: Scope) {
  const t = useTranslations("adminDashboard");
  const requests = useMemo(
    () => ({
      people: {
        query: peopleQuery,
        args: { schoolId, ...(campusId ? { campusId } : {}) },
      },
    }),
    [schoolId, campusId],
  );
  const { people } = useQueries(requests) as {
    people?: FunctionReturnType<typeof peopleQuery> | Error;
  };
  const counts = people instanceof Error ? undefined : people;
  return (
    <MetricCard title={t("peopleOnline")} icon={<Users className="size-4" />}>
      <div
        aria-live="polite"
        aria-busy={people === undefined}
        className="space-y-3"
      >
        {counts ? (
          <>
            <p className="text-2xl font-semibold tabular-nums">
              {t("onlineOutOfTotal", counts)}
            </p>
            {counts.total > 0 && (
              <Progress
                value={(counts.online / counts.total) * 100}
                aria-label={t("peopleOnline")}
                aria-valuetext={t("onlineOutOfTotal", counts)}
                className="bg-muted-foreground/20"
                indicatorClassName="bg-success"
              />
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-success"
                />
                {t("onlineUsers", { count: counts.online })}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-muted-foreground/50"
                />
                {t("offlineUsers", { count: counts.total - counts.online })}
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t(people === undefined ? "peopleLoading" : "peopleUnavailable")}
          </p>
        )}
      </div>
    </MetricCard>
  );
}

function WeeklyChart({
  config,
  data,
  formatWeek,
  kind,
}: {
  config: ChartConfig;
  data: ({ weekStart: string } & Record<string, string | number | null>)[];
  formatWeek: (date: string) => string;
  kind: "areas" | "stackedBars";
}) {
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full sm:h-64">
      <ComposedChart
        accessibilityLayer
        data={data}
        maxBarSize={64}
        margin={{ left: 0, right: 12 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="weekStart"
          tickFormatter={formatWeek}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          allowDecimals={false}
          width={36}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip
          content={<ChartTooltipContent labelFormatter={formatWeek} />}
        />
        <ChartLegend
          content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />}
        />
        {Object.keys(config).map((key) => {
          const color = `var(--color-${key})`;
          return kind === "areas" ? (
            <Area
              key={key}
              dataKey={key}
              type="linear"
              stroke={color}
              strokeWidth={2}
              fill={color}
              fillOpacity={0.14}
              dot={{ r: 3, fill: color }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ) : (
            <Bar
              key={key}
              dataKey={key}
              stackId="total"
              fill={color}
              isAnimationActive={false}
            />
          );
        })}
      </ComposedChart>
    </ChartContainer>
  );
}

function WeeklyAttendance({
  weeks,
  formatWeek,
}: {
  weeks: Week[];
  formatWeek: (date: string) => string;
}) {
  const t = useTranslations("adminDashboard");
  const missingWeeks = new Set(
    weeks
      .filter(({ attendance }) => attendance == null)
      .map(({ weekStart }) => weekStart),
  );
  const hasRecords = weeks.some(({ attendance }) =>
    attendanceStatuses.some((status) => (attendance?.[status] ?? 0) > 0),
  );
  const hasSummary = missingWeeks.size < weeks.length;
  const config = Object.fromEntries(
    attendanceStatuses.map((status) => [
      status,
      { label: t(`attendance.${status}`), color: attendanceColors[status] },
    ]),
  );
  return (
    <Card>
      <CardHeader className="px-3 sm:px-6">
        <h2 className="text-lg font-semibold">{t("attendance.title")}</h2>
      </CardHeader>
      <CardContent className="space-y-3 px-3 sm:px-6">
        <p className="text-sm text-muted-foreground">{t("attendance.scope")}</p>
        {!hasSummary ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t("noSummaries")}
          </p>
        ) : (
          <>
            {missingWeeks.size > 0 && (
              <p role="status" className="text-sm text-muted-foreground">
                {t(
                  hasRecords
                    ? "attendance.missingInChart"
                    : "attendance.incomplete",
                )}
              </p>
            )}
            {hasRecords ? (
              <WeeklyChart
                kind="stackedBars"
                config={config}
                formatWeek={(date) =>
                  `${formatWeek(date)}${missingWeeks.has(date) ? " *" : ""}`
                }
                data={weeks.map(({ weekStart, attendance }) => ({
                  weekStart,
                  ...attendance,
                }))}
              />
            ) : (
              <p role="status" className="text-sm text-muted-foreground">
                {t("attendance.empty")}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard({
  schoolId,
  campusId,
  today: initialToday,
  timeZone: initialTimeZone,
}: Scope & { today: string | null; timeZone: string | null }) {
  const t = useTranslations("adminDashboard");
  const { access, isLoading } = useStaffAccess();
  const canViewPeople = access?.canViewPeople;
  const settings = useQuery(
    periodQuery,
    canViewPeople ? { schoolId, campusId } : "skip",
  );
  const configuredZone = settings?.institutionTimeZone ?? null;
  const timeZone =
    configuredZone && isValidTimeZone(configuredZone) ? configuredZone : null;
  const [clock, setClock] = useState({
    timeZone: initialTimeZone,
    today: initialToday,
  });
  const today = clock.timeZone === timeZone ? clock.today : null;
  useEffect(() => {
    if (!canViewPeople || !timeZone) return;
    const update = () => {
      const today = todayInTimeZone(timeZone);
      setClock((previous) =>
        previous.timeZone === timeZone && previous.today === today
          ? previous
          : { timeZone, today },
      );
    };
    const zoneUpdate =
      clock.timeZone !== timeZone ? window.setTimeout(update, 0) : undefined;
    const interval = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(zoneUpdate);
      window.removeEventListener("focus", update);
    };
  }, [canViewPeople, clock.timeZone, timeZone]);
  const [periodId, setPeriodId] = useState<string>();
  const periods = settings?.periods.filter(
    (period) => today && period.startDate <= today,
  );
  const period =
    periods?.find((item) => item._id === periodId) ??
    periods?.find((item) => today && item.endDate >= today) ??
    periods?.[0];

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!access?.canViewPeople) return <p role="status">{t("noAccess")}</p>;

  return (
    <section className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <h1 className="sr-only">{t("title")}</h1>
      {settings === undefined ? (
        <Skeleton className="h-64 w-full" />
      ) : !timeZone ? (
        <p role="status">{t("missingTimeZone")}</p>
      ) : !today ? (
        <Skeleton className="h-64 w-full" />
      ) : !period ? (
        <p role="status">{t("noPeriods")}</p>
      ) : (
        <WeeklySessions
          key={`${period._id}:${campusId ?? "all"}:${timeZone}`}
          period={period}
          periods={periods ?? []}
          onPeriodChange={setPeriodId}
          today={today}
          campusId={campusId}
          schoolId={schoolId}
        />
      )}
      {access.canManageInstitution && today && timeZone && (
        <AbekaWeeklyMetric schoolId={schoolId} timeZone={timeZone} />
      )}
    </section>
  );
}

function WeeklySessions({
  schoolId,
  campusId,
  period,
  periods,
  onPeriodChange,
  today,
}: Scope & {
  period: Period;
  periods: Period[];
  onPeriodChange: (value: string) => void;
  today: string;
}) {
  const t = useTranslations("adminDashboard");
  const format = useFormatter();
  const [offsetDays, setOffsetDays] = useState(0);
  const [singleWeek, setSingleWeek] = useState(false);
  const [classId, setClassId] = useState<Id<"classes">>();
  const summaryHeading = useRef<HTMLHeadingElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const scope = useMemo(
    () => ({ academicPeriodId: period._id, ...(campusId ? { campusId } : {}) }),
    [period._id, campusId],
  );
  const selection = useMemo(
    () => ({ ...scope, ...(classId ? { classId } : {}) }),
    [scope, classId],
  );
  const currentWeek = mondayOfCivilWeek(today);
  const afterPeriod = addCivilDays(mondayOfCivilWeek(period.endDate), 7);
  const end = currentWeek < afterPeriod ? currentWeek : afterPeriod;
  const first = mondayOfCivilWeek(period.startDate);
  const windowDays = singleWeek ? 7 : DASHBOARD_WINDOW_DAYS;
  const windowEnd = addCivilDays(end, offsetDays);
  const windowStart = addCivilDays(windowEnd, -windowDays);
  const weekStart = windowStart > first ? windowStart : first;
  const lastDay = addCivilDays(windowEnd, -1);
  const hasClosedWeeks = first < end;
  const requests = useMemo(
    () => ({
      courses: { query: api.adminSessionDashboard.listCourses, args: scope },
      ...(hasClosedWeeks
        ? {
            summary: {
              query: summaryQuery,
              args: { ...selection, weekStart, weekEnd: windowEnd },
            },
          }
        : {}),
    }),
    [scope, selection, hasClosedWeeks, weekStart, windowEnd],
  );
  const reviewScope = useMemo(
    () => ({ ...selection, weekStart, weekEnd: windowEnd }),
    [selection, weekStart, windowEnd],
  );
  const { courses, summary } = useQueries(requests) as {
    courses?:
      | FunctionReturnType<typeof api.adminSessionDashboard.listCourses>
      | Error;
    summary?: FunctionReturnType<typeof summaryQuery> | Error;
  };
  const overBudget =
    summary instanceof ConvexError &&
    summary.data === "DASHBOARD_READ_BUDGET_EXCEEDED";
  if (
    classId &&
    Array.isArray(courses) &&
    !courses.some((course) => course.classId === classId)
  ) {
    setClassId(undefined);
  }
  const options = useMemo(
    () =>
      Array.isArray(courses)
        ? [...courses].sort((a, b) => a.name.localeCompare(b.name))
        : courses,
    [courses],
  );
  const courseOptions = Array.isArray(options) ? options : [];
  const activeCourseCount = Array.isArray(courses)
    ? courses.filter((course) => course.isActive).length
    : undefined;
  const endDay = civilDayNumber(period.endDate);
  const daysRemaining = Math.max(0, endDay - civilDayNumber(today));
  const periodDays = endDay - civilDayNumber(period.startDate);
  const periodElapsed =
    daysRemaining === 0
      ? 100
      : Math.floor((100 * Math.max(0, periodDays - daysRemaining)) / periodDays);
  const civil = (value: string) =>
    format.dateTime(new Date(value), {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  const chartConfig = {
    scheduled: { label: t("scheduled"), color: sessionColors.scheduled },
    completed: { label: t("completed"), color: sessionColors.completed },
  };
  const data = summary instanceof Error ? undefined : summary;
  const weeks = data?.weeks.filter((week) => week.weekStart < windowEnd);
  const readyWeeks = weeks?.flatMap(({ counts }) => (counts ? [counts] : []));
  const hasData = !!readyWeeks?.length;
  const hasMissingWeeks = readyWeeks?.length !== weeks?.length;
  const totals =
    hasData && !hasMissingWeeks
      ? indicators.map((key) =>
          readyWeeks.reduce((total, counts) => total + counts[key], 0),
        )
      : undefined;
  const columns: ColumnDef<Week>[] = [
    {
      accessorKey: "weekStart",
      header: t("week"),
      cell: ({ row }) => civil(row.original.weekStart),
      meta: { className: "whitespace-nowrap font-medium" },
    },
    ...fields.map<ColumnDef<Week>>((field) => ({
      id: field,
      header: t(field),
      cell: ({ row }) =>
        row.original.counts ? format.number(row.original.counts[field]) : "—",
      meta: { className: "text-right tabular-nums" },
    })),
    {
      accessorKey: "refreshedAt",
      header: t("refreshedAt"),
      cell: ({ row }) =>
        row.original.refreshedAt === null
          ? t("notReady")
          : format.dateTime(new Date(row.original.refreshedAt), {
              timeZone: data?.timeZone,
              dateStyle: "medium",
              timeStyle: "short",
            }),
      meta: { className: "whitespace-nowrap" },
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Select value={period._id} onValueChange={onPeriodChange}>
          <SelectTrigger aria-label={t("period")} className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periods.map((item) => (
              <SelectItem key={item._id} value={item._id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={classId ?? "all"}
          disabled={!courseOptions.length && !classId}
          onValueChange={(value) =>
            setClassId(
              courseOptions.find(({ classId }) => classId === value)?.classId,
            )
          }
        >
          <SelectTrigger
            aria-label={t("course")}
            className="w-full min-w-0 sm:w-64"
          >
            <SelectValue placeholder={t("course")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allCourses")}</SelectItem>
            {courseOptions.map(({ classId, name }) => (
              <SelectItem key={classId} value={classId}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasClosedWeeks && (
          <div className="flex w-full flex-wrap items-center justify-between gap-3 lg:ml-auto lg:w-auto">
            <p className="text-sm font-medium" aria-live="polite">
              {format.dateTimeRange(
                new Date(
                  weekStart > period.startDate ? weekStart : period.startDate,
                ),
                new Date(lastDay < period.endDate ? lastDay : period.endDate),
                { timeZone: "UTC", dateStyle: "medium" },
              )}
            </p>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label={t(singleWeek ? "olderWeek" : "older")}
                disabled={weekStart <= first}
                onClick={() => setOffsetDays((value) => value - windowDays)}
              >
                <ChevronLeft aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label={t(singleWeek ? "newerWeek" : "newer")}
                disabled={offsetDays === 0}
                onClick={() => setOffsetDays((value) => value + windowDays)}
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
          </div>
        )}
        {courses instanceof Error && (
          <p role="status" className="text-sm text-muted-foreground">
            {t("courseLoadError")}
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-3">
        <PeopleMetric schoolId={schoolId} campusId={campusId} />
        <MetricCard
          title={t("activeCourses")}
          icon={<BookOpen className="size-4" />}
        >
          <p className="text-2xl font-semibold tabular-nums">
            {activeCourseCount === undefined
              ? "—"
              : format.number(activeCourseCount)}
          </p>
        </MetricCard>
        <MetricCard
          title={t("periodRemaining")}
          icon={<CalendarDays className="size-4" />}
        >
          <p className="text-2xl font-semibold tabular-nums">
            {t("daysRemaining", { count: daysRemaining })}
          </p>
          <Progress
            value={periodElapsed}
            aria-label={t("periodCalendarProgress")}
            indicatorClassName="bg-chart-2"
            className="bg-chart-2/20"
          />
          <p className="text-xs text-muted-foreground">
            {t("periodEnds", {
              date: format.dateTime(new Date(period.endDate), {
                dateStyle: "medium",
                timeZone: "UTC",
              }),
            })}
          </p>
        </MetricCard>
      </div>
      <Card>
        <CardHeader className="px-3 sm:px-6">
          <h2
            ref={summaryHeading}
            tabIndex={-1}
            className="text-lg font-semibold"
          >
            {t("weeklySessions")}
          </h2>
        </CardHeader>
        <CardContent className="space-y-5 px-3 sm:px-6">
          {!hasClosedWeeks ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t("noClosedWeeks")}
            </p>
          ) : (
            <>
              {summary instanceof Error ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p role="alert" className="text-sm text-muted-foreground">
                    {t(overBudget ? "overBudget" : "loadError")}
                  </p>
                  {overBudget && weekStart < addCivilDays(windowEnd, -7) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSingleWeek(true);
                        summaryHeading.current?.focus();
                      }}
                    >
                      {t("viewOneWeek")}
                    </Button>
                  )}
                </div>
              ) : !weeks ? (
                <Skeleton className="h-64 w-full" />
              ) : hasData ? (
                <>
                  <dl
                    aria-label={t("periodTotals")}
                    className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3"
                  >
                    {indicators.map((key, index) => (
                      <div
                        key={key}
                        className="min-w-0 rounded-lg bg-muted/50 p-3"
                      >
                        <dt className="text-sm text-muted-foreground">
                          {t(key)}
                        </dt>
                        <dd className="mt-1 text-xl font-semibold tabular-nums">
                          {totals ? format.number(totals[index]) : "—"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {hasMissingWeeks && (
                    <p role="status" className="text-sm text-muted-foreground">
                      {t("incompleteTotals")}
                    </p>
                  )}
                  <WeeklyChart
                    kind="areas"
                    config={chartConfig}
                    data={weeks.map(({ weekStart, counts }) => ({
                      weekStart,
                      scheduled: counts?.scheduled ?? null,
                      completed: counts?.completed ?? null,
                    }))}
                    formatWeek={civil}
                  />
                </>
              ) : (
                <p role="status" className="text-sm text-muted-foreground">
                  {t("noSummaries")}
                </p>
              )}
              {weeks && (
                <DataTable
                  data={weeks}
                  columns={columns}
                  paginate={false}
                  bordered={false}
                  scrollLabel={t("weeklySessions")}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
      <div
        className={
          weeks ? "grid grid-cols-1 gap-4 @5xl:grid-cols-2" : undefined
        }
      >
        {weeks && <WeeklyAttendance weeks={weeks} formatWeek={civil} />}
        <AdminCourseProgress
          scope={scope}
          today={today}
          courses={options}
          classId={classId}
        />
      </div>
      {hasClosedWeeks && (
        <Card>
          <CardHeader className="px-3 sm:px-6">
            <h2
              ref={reviewHeading}
              tabIndex={-1}
              className="text-lg font-semibold"
            >
              {t("reviewSessions")}
            </h2>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <AdminSessionReview
              key={`${classId ?? "all"}:${weekStart}:${windowEnd}`}
              scope={reviewScope}
              focusFallback={reviewHeading}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}
