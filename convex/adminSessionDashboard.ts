import {
  mergedStream,
  stream,
  type QueryStream,
} from "convex-helpers/server/stream";
import { ConvexError, type Infer, v } from "convex/values";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./functions";
import { canManageInstitution, canViewCampusPeople } from "./permissions";
import schema, {
  courseSessionWeekAttendance,
  courseSessionWeekCounts,
} from "./schema";
import { getCurrentUserOrThrow } from "./users";
import { isUserOnline } from "./presence";
import { sessionRecordValidator } from "./sessionRecords";
import { courseProgressFields } from "./model/courseProgress";
import { readIndexedCourseProgress } from "./model/courseProgressSummary";
import { dashboardSummariesReady } from "./model/dashboardAggregates";
import { verifiedAttendanceCourse } from "./model/studentAttendance";
import {
  pendingWeek,
  periodWeekRange,
  queuePeriodWeeks,
  weeklySessionCategory,
} from "./model/courseSessionWeekRefresh";
import {
  addCivilDays,
  getUtcDayStart,
  isValidCivilDate,
  isValidTimeZone,
  toCivilDate,
  utcToLocalDateTime,
} from "../lib/time-zone";
import {
  COURSE_PROGRESS_PAGE_SIZE,
  DASHBOARD_WINDOW_DAYS,
  DEFAULT_SCHEDULE_END_MINUTES,
  DEFAULT_SCHEDULE_START_MINUTES,
} from "../lib/academic-settings";
import {
  getLiveSessionHardEnd,
  getLiveSessionStartAvailableAt,
} from "../lib/live-session-policy";
import {
  isExternalClassSession,
  isPastClassSession,
} from "../lib/class-session";

export const DASHBOARD_READ_BUDGET = 250 * 1024;
export const DASHBOARD_REFRESH_READ_BUDGET = 4 * 1024 * 1024;
const MAX_TIMETABLE_SLOTS = 500;
const REVIEW_PAGE_SIZE = 20;
const countsValidator = v.object(courseSessionWeekCounts);
const scopeArgs = {
  academicPeriodId: v.id("academicPeriods"),
  weekStart: v.string(),
};
const courseScopeArgs = {
  academicPeriodId: scopeArgs.academicPeriodId,
  campusId: v.optional(v.id("campuses")),
  classId: v.optional(v.id("classes")),
};
const readLimits = { bytesRead: DASHBOARD_READ_BUDGET };
const weeklyArgs = {
  ...courseScopeArgs,
  weekStart: scopeArgs.weekStart,
  weekEnd: v.optional(v.string()),
};
const weeklyResult = v.object({
  timeZone: v.string(),
  weeks: v.array(
    v.object({
      weekStart: v.string(),
      refreshedAt: v.union(v.number(), v.null()),
      counts: v.union(countsValidator, v.null()),
      attendance: v.union(v.object(courseSessionWeekAttendance), v.null()),
    }),
  ),
});
const courseProgressArgs = {
  academicPeriodId: scopeArgs.academicPeriodId,
  campusId: courseScopeArgs.campusId,
  classIds: v.array(v.id("classes")),
  today: v.string(),
};
const courseProgressResult = v.array(
  v.object({
    classId: v.id("classes"),
    lessons: v.union(v.null(), v.object(courseProgressFields)),
    timetable: v.union(
      v.null(),
      v.object({ elapsedMs: v.number(), totalMs: v.number() }),
    ),
  }),
);
const courseOptionValidator = v.object({
  classId: v.id("classes"),
  name: v.string(),
  isActive: v.boolean(),
});
const peopleScopeArgs = {
  schoolId: v.id("schools"),
  campusId: courseScopeArgs.campusId,
};
const peopleSnapshotResult = v.object({
  total: v.number(),
  online: v.number(),
});
const reviewRowValidator = v.object({
  scheduleId: v.id("classSchedule"),
  className: v.string(),
  start: v.number(),
  end: v.number(),
  roomName: v.string(),
  reason: v.union(v.literal("noStart"), v.literal("reportPending")),
});
const reviewArgs = {
  ...courseScopeArgs,
  weekStart: scopeArgs.weekStart,
  weekEnd: v.string(),
  cursor: v.union(v.string(), v.null()),
};
const reviewResult = v.object({
  timeZone: v.string(),
  rows: v.array(reviewRowValidator),
  nextCursor: v.union(v.string(), v.null()),
});

const emptyCounts = () => ({
  scheduled: 0,
  completed: 0,
  cancelled: 0,
  noStart: 0,
  other: 0,
});
const COUNT_KEYS = Object.keys(courseSessionWeekCounts) as (keyof ReturnType<
  typeof emptyCounts
>)[];
const emptyAttendance = () => ({
  present: 0,
  partial: 0,
  absent: 0,
  excused: 0,
});
const ATTENDANCE_KEYS = Object.keys(
  courseSessionWeekAttendance,
) as (keyof ReturnType<typeof emptyAttendance>)[];

function assertMonday(date: string) {
  if (!isValidCivilDate(date) || new Date(date).getUTCDay() !== 1) {
    throw new ConvexError("INVALID_DASHBOARD_WEEK");
  }
}

function dashboardWindowEnd(weekStart: string, requestedEnd?: string) {
  assertMonday(weekStart);
  const maxEnd = addCivilDays(weekStart, DASHBOARD_WINDOW_DAYS);
  const weekEnd = requestedEnd ?? maxEnd;
  assertMonday(weekEnd);
  if (weekEnd <= weekStart || weekEnd > maxEnd)
    throw new ConvexError("INVALID_DASHBOARD_WEEK");
  return weekEnd;
}

function academicPeriodBounds(
  period: Doc<"academicPeriods">,
  timeZone: string,
) {
  return {
    from: getUtcDayStart(toCivilDate(period.startDate), timeZone),
    to: getUtcDayStart(addCivilDays(toCivilDate(period.endDate), 1), timeZone),
  };
}

function institutionTimeZone(school: Doc<"schools"> | null) {
  if (!school?.timeZone || !isValidTimeZone(school.timeZone)) {
    throw new ConvexError("INSTITUTION_TIME_ZONE_NOT_CONFIGURED");
  }
  return school.timeZone;
}

async function assertQuietWindow(
  ctx: Pick<QueryCtx, "db">,
  school: Doc<"schools">,
  timeZone: string,
  now: number,
) {
  const liveClass = await ctx.db
    .query("classSchedule")
    .withIndex("by_status_and_is_live", (q) =>
      q.eq("status", "active").eq("isLive", true),
    )
    .first();
  const liveEvent =
    !liveClass &&
    (await ctx.db
      .query("eventOccurrences")
      .withIndex("by_status_and_is_live", (q) =>
        q.eq("status", "active").eq("isLive", true),
      )
      .first());
  // The schedule stops reporting isLive before LiveKit deletes the room.
  const closingRoom =
    !liveClass &&
    !liveEvent &&
    (await ctx.db
      .query("liveRoomActivations")
      .withIndex("by_status_and_next_cleanup_at", (q) =>
        q.eq("status", "closing"),
      )
      .first());
  // The lifecycle repair job may not have adopted an older end claim yet.
  const legacyEndClaim =
    !liveClass &&
    !liveEvent &&
    !closingRoom &&
    (await ctx.db
      .query("classSchedule")
      .withIndex("by_live_room_name_and_live_end_claim_id", (q) =>
        q.eq("liveRoomName", undefined).gt("liveEndClaimId", undefined),
      )
      .first());
  if (liveClass || liveEvent || closingRoom || legacyEndClaim)
    throw new ConvexError("DASHBOARD_REFRESH_LIVE_ACTIVITY");

  const minuteMs = 60_000;
  const [hour, minute] = utcToLocalDateTime(now, timeZone)
    .slice(11)
    .split(":")
    .map(Number);
  const localTime = (hour * 60 + minute) * minuteMs;
  const day = 24 * 60 * minuteMs;
  const start = getLiveSessionStartAvailableAt(
    (school.scheduleStartMinutes ?? DEFAULT_SCHEDULE_START_MINUTES) * minuteMs,
  );
  const end = getLiveSessionHardEnd(
    (school.scheduleEndMinutes ?? DEFAULT_SCHEDULE_END_MINUTES) * minuteMs,
  );
  if (
    [localTime - day, localTime, localTime + day].some(
      (time) => time >= start && time < end,
    )
  )
    throw new ConvexError("DASHBOARD_REFRESH_DURING_SCHOOL_HOURS");
}

function countSession(
  counts: ReturnType<typeof emptyCounts>,
  session: Doc<"classSchedule">,
) {
  const category = weeklySessionCategory(session);
  if (!category) return;
  counts.scheduled++;
  counts[category]++;
}

async function courseBelongsToSchool(
  ctx: Pick<QueryCtx, "db">,
  course: Doc<"classes">,
  schoolId: Id<"schools">,
  campusMatches?: Map<Id<"campuses">, boolean>,
) {
  if (course.schoolId && course.schoolId !== schoolId) return false;
  if (course.campusId) {
    const known = campusMatches?.get(course.campusId);
    if (known !== undefined) return known;
    const campus = await ctx.db.get("campuses", course.campusId);
    const matches = campus?.schoolId === schoolId;
    campusMatches?.set(course.campusId, matches);
    return matches;
  }
  return (
    (course.schoolId ??
      (await ctx.db.get("curriculums", course.curriculumId))?.schoolId) ===
    schoolId
  );
}

type CourseScope = {
  academicPeriodId: Id<"academicPeriods">;
  campusId?: Id<"campuses">;
  classId?: Id<"classes">;
};

async function matchesDashboardCourse(
  ctx: QueryCtx,
  course: Doc<"classes"> | null,
  scope: CourseScope,
  schoolId: Id<"schools">,
  campusMatches?: Map<Id<"campuses">, boolean>,
) {
  return (
    course &&
    course.academicPeriodId === scope.academicPeriodId &&
    (!scope.campusId || course.campusId === scope.campusId) &&
    (await courseBelongsToSchool(ctx, course, schoolId, campusMatches))
  );
}

async function requireDashboardPeopleScope(
  ctx: QueryCtx,
  schoolId: Id<"schools">,
  campusId?: Id<"campuses">,
) {
  const user = await getCurrentUserOrThrow(ctx);
  if (campusId) {
    const campus = await ctx.db.get("campuses", campusId);
    if (
      campus?.schoolId !== schoolId ||
      !(await canViewCampusPeople(ctx, user._id, campusId, schoolId))
    )
      throw new ConvexError("PERMISSION_DENIED");
  } else if (!(await canManageInstitution(ctx, user._id, schoolId))) {
    throw new ConvexError("PERMISSION_DENIED");
  }
}

async function requireDashboardScope(
  ctx: QueryCtx,
  { academicPeriodId, campusId, classId }: CourseScope,
) {
  const period = await ctx.db.get("academicPeriods", academicPeriodId);
  if (!period) throw new ConvexError("PERMISSION_DENIED");
  await requireDashboardPeopleScope(ctx, period.schoolId, campusId);
  const course = classId ? await ctx.db.get("classes", classId) : null;
  if (
    classId &&
    !(await matchesDashboardCourse(
      ctx,
      course,
      { academicPeriodId, campusId },
      period.schoolId,
    ))
  )
    throw new ConvexError("PERMISSION_DENIED");
  return { period, course };
}

async function listScopedCourses(
  ctx: QueryCtx,
  scope: CourseScope,
  schoolId: Id<"schools">,
) {
  const { academicPeriodId, campusId } = scope;
  const table = ctx.db.query("classes");
  const indexed = campusId
    ? table.withIndex("by_campus_period_grade", (q) =>
        q.eq("campusId", campusId).eq("academicPeriodId", academicPeriodId),
      )
    : table.withIndex("by_academic_period", (q) =>
        q.eq("academicPeriodId", academicPeriodId),
      );
  // shortcut: same course ceiling as weekly refresh; paginate the picker if it grows beyond this.
  const rows = await indexed.take(751);
  if (rows.length > 750)
    throw new ConvexError("DASHBOARD_READ_BUDGET_EXCEEDED");
  const campusMatches = new Map<Id<"campuses">, boolean>();
  const courses = [];
  for (const row of rows) {
    if (await courseBelongsToSchool(ctx, row, schoolId, campusMatches))
      courses.push({
        classId: row._id,
        name: row.name,
        isActive: row.isActive,
      });
  }
  return courses;
}

export const listCourses = query({
  args: {
    academicPeriodId: scopeArgs.academicPeriodId,
    campusId: courseScopeArgs.campusId,
  },
  returns: v.array(courseOptionValidator),
  handler: (ctx, args): Promise<Infer<typeof courseOptionValidator>[]> =>
    ctx.runQuery(internal.adminSessionDashboard.readCourses, args, {
      transactionLimits: readLimits,
    }),
});

export const getPeopleSnapshot = query({
  args: peopleScopeArgs,
  returns: peopleSnapshotResult,
  handler: (ctx, args): Promise<Infer<typeof peopleSnapshotResult>> =>
    ctx.runQuery(internal.adminSessionDashboard.readPeopleSnapshot, args, {
      transactionLimits: readLimits,
    }),
});

export const readPeopleSnapshot = internalQuery({
  args: peopleScopeArgs,
  returns: peopleSnapshotResult,
  handler: async (ctx, { schoolId, campusId }) => {
    await requireDashboardPeopleScope(ctx, schoolId, campusId);
    const userIds = new Set<Id<"users">>();
    let membershipsRead = 0;
    const readMembers = async (
      orgId: Id<"schools"> | Id<"campuses">,
      orgType: "school" | "campus",
    ) => {
      for await (const membership of ctx.db
        .query("roleAssignments")
        .withIndex("by_org", (q) =>
          q.eq("orgId", orgId).eq("orgType", orgType),
        )) {
        // shortcut: bounded snapshot; use scoped aggregates for larger directories.
        if (++membershipsRead > 1_000)
          throw new ConvexError("DASHBOARD_READ_BUDGET_EXCEEDED");
        userIds.add(membership.userId);
      }
    };
    if (campusId) {
      await readMembers(campusId, "campus");
    } else {
      await readMembers(schoolId, "school");
      const campuses = await ctx.db
        .query("campuses")
        .withIndex("by_school", (q) => q.eq("schoolId", schoolId))
        .take(101);
      if (campuses.length > 100)
        throw new ConvexError("DASHBOARD_READ_BUDGET_EXCEEDED");
      for (const campus of campuses) await readMembers(campus._id, "campus");
    }
    const ids = [...userIds];
    let total = 0;
    let online = 0;
    for (let i = 0; i < ids.length; i += 32) {
      const statuses = await Promise.all(
        ids
          .slice(i, i + 32)
          .map(async (id) =>
            (await ctx.db.get("users", id))?.isActive
              ? await isUserOnline(ctx, id)
              : null,
          ),
      );
      for (const status of statuses) {
        if (status !== null) total++;
        if (status === true) online++;
      }
    }
    return { total, online };
  },
});

export const readCourses = internalQuery({
  args: {
    academicPeriodId: scopeArgs.academicPeriodId,
    campusId: courseScopeArgs.campusId,
  },
  returns: v.array(courseOptionValidator),
  handler: async (ctx, args) => {
    const { period } = await requireDashboardScope(ctx, args);
    return listScopedCourses(ctx, args, period.schoolId);
  },
});

export const getCourseProgress = query({
  args: courseProgressArgs,
  returns: courseProgressResult,
  handler: (ctx, args): Promise<Infer<typeof courseProgressResult>> =>
    ctx.runQuery(internal.adminSessionDashboard.readCourseProgress, args, {
      transactionLimits: readLimits,
    }),
});

export const readCourseProgress = internalQuery({
  args: courseProgressArgs,
  returns: courseProgressResult,
  handler: async (ctx, { classIds, today, ...scope }) => {
    const { period } = await requireDashboardScope(ctx, scope);
    if (!isValidCivilDate(today) || classIds.length > COURSE_PROGRESS_PAGE_SIZE)
      throw new ConvexError("INVALID_DASHBOARD_PROGRESS_REQUEST");
    const timeZone = institutionTimeZone(
      await ctx.db.get("schools", period.schoolId),
    );
    const { from, to } = academicPeriodBounds(period, timeZone);
    const cutoff = getUtcDayStart(today, timeZone);
    const ready = await dashboardSummariesReady(ctx);
    const campusMatches = new Map<Id<"campuses">, boolean>();
    const rows = [];
    const uniqueClassIds = [...new Set(classIds)];
    const schedule = stream(ctx.db, schema).query("classSchedule");
    for (const [index, classId] of uniqueClassIds.entries()) {
      const course = await ctx.db.get("classes", classId);
      if (
        !course ||
        !(await matchesDashboardCourse(
          ctx,
          course,
          scope,
          period.schoolId,
          campusMatches,
        ))
      )
        throw new ConvexError("PERMISSION_DENIED");
      const lessons = ready
        ? await readIndexedCourseProgress(ctx, course)
        : null;
      const remaining = (await ctx.meta.getTransactionMetrics()).bytesRead
        .remaining;
      // Leave headroom for the last row and the remaining courses' authorization and lesson counts.
      const slots = await schedule
        .withIndex("by_class", (q) =>
          q
            .eq("classId", classId)
            .gte("scheduledStart", from)
            .lt("scheduledStart", to),
        )
        .paginate({
          cursor: null,
          numItems: MAX_TIMETABLE_SLOTS + 1,
          maximumBytesRead: Math.max(
            1,
            Math.floor((remaining * 0.8) / (uniqueClassIds.length - index)),
          ),
        });
      let totalMs = 0;
      let elapsedMs = 0;
      // Never present a partial timetable as a complete denominator.
      if (slots.isDone) {
        for (const slot of slots.page) {
          if (
            slot.status === "cancelled" ||
            !Number.isFinite(slot.scheduledEnd)
          )
            continue;
          const end = Math.min(slot.scheduledEnd, to);
          const duration = end - slot.scheduledStart;
          if (duration <= 0) continue;
          totalMs += duration;
          elapsedMs += Math.max(0, Math.min(end, cutoff) - slot.scheduledStart);
        }
      }
      rows.push({
        classId,
        lessons,
        timetable: totalMs > 0 ? { elapsedMs, totalMs } : null,
      });
    }
    return rows;
  },
});

export const listReviewSessions = query({
  args: reviewArgs,
  returns: reviewResult,
  handler: (ctx, args): Promise<typeof reviewResult.type> =>
    ctx.runQuery(internal.adminSessionDashboard.readReviewSessions, args, {
      transactionLimits: readLimits,
    }),
});

export const readReviewSessions = internalQuery({
  args: reviewArgs,
  returns: reviewResult,
  handler: async (ctx, args) => {
    const { period, course } = await requireDashboardScope(ctx, args);
    const { weekStart } = args;
    if (args.cursor !== null && args.cursor.length > 256)
      throw new ConvexError("INVALID_DASHBOARD_CURSOR");
    const weekEnd = dashboardWindowEnd(weekStart, args.weekEnd);
    const timeZone = institutionTimeZone(
      await ctx.db.get("schools", period.schoolId),
    );
    const periodBounds = academicPeriodBounds(period, timeZone);
    const from = Math.max(
      getUtcDayStart(weekStart, timeZone),
      periodBounds.from,
    );
    const windowEnd = getUtcDayStart(weekEnd, timeZone);
    const to = Math.min(windowEnd, periodBounds.to);
    const now = Date.now();
    if (windowEnd > now) throw new ConvexError("DASHBOARD_WEEK_NOT_FINISHED");
    if (to <= from) return { timeZone, rows: [], nextCursor: null };
    const table = stream(ctx.db, schema).query("classSchedule");
    // Four ranges regardless of the number of courses, including legacy rows.
    const streams = (["scheduled", "completed"] as const).flatMap<
      QueryStream<Doc<"classSchedule">>
    >((status) =>
      course
        ? ([undefined, "live"] as const).map((sessionType) =>
            table
              .withIndex(
                "by_class_and_status_and_session_type_and_scheduled_start",
                (q) =>
                  q
                    .eq("classId", course._id)
                    .eq("status", status)
                    .eq("sessionType", sessionType)
                    .gte("scheduledStart", from)
                    .lt("scheduledStart", to),
              )
              .order("desc"),
          )
        : [period.schoolId, undefined].map((schoolId) =>
            table
              .withIndex("by_school_and_status_and_scheduled_start", (q) =>
                q
                  .eq("schoolId", schoolId)
                  .eq("status", status)
                  .gte("scheduledStart", from)
                  .lt("scheduledStart", to),
              )
              .order("desc"),
          ),
    );
    const campusMatches = new Map<Id<"campuses">, boolean>();
    const courseNames = new Map<Id<"classes">, string | null>();
    if (course) courseNames.set(course._id, course.name);
    const readBudget = (await ctx.meta.getTransactionMetrics()).bytesRead;
    const stopAt = readBudget.used + readBudget.remaining / 2;
    const reviewStream = mergedStream(streams, ["scheduledStart"]).map(
      async (row): Promise<Infer<typeof reviewRowValidator> | null> => {
        if (
          isExternalClassSession(row.sessionType) ||
          !isPastClassSession(row, now) ||
          row.sessionClosureStatus === "completed" ||
          (row.status === "scheduled" && row.sessionStartedAt !== undefined)
        )
          return null;

        let className = courseNames.get(row.classId);
        if (className === undefined) {
          // The denormalized schedule school is only a lookup hint.
          const candidate = await ctx.db.get("classes", row.classId);
          className =
            candidate &&
            (await matchesDashboardCourse(
              ctx,
              candidate,
              args,
              period.schoolId,
              campusMatches,
            ))
              ? candidate.name
              : null;
          courseNames.set(row.classId, className);
        }
        if (className === null) return null;
        return {
          scheduleId: row._id,
          className,
          start: row.scheduledStart,
          end: row.scheduledEnd,
          roomName: row.roomName,
          reason: row.status === "scheduled" ? "noStart" : "reportPending",
        };
      },
    );
    const rows: Infer<typeof reviewRowValidator>[] = [];
    let cursor = args.cursor;
    do {
      const remaining = (await ctx.meta.getTransactionMetrics()).bytesRead
        .remaining;
      const page = await reviewStream.paginate({
        cursor,
        numItems: REVIEW_PAGE_SIZE - rows.length,
        // Filtered rows still require schedule/course reads, even on empty pages.
        maximumRowsRead: REVIEW_PAGE_SIZE,
        maximumBytesRead: Math.max(1, Math.floor(remaining / 4)),
      });
      rows.push(...page.page);
      cursor = page.isDone ? null : page.continueCursor;
      // Account for course authorization too, not only the stream's schedule bytes.
    } while (
      cursor !== null &&
      rows.length < REVIEW_PAGE_SIZE &&
      (await ctx.meta.getTransactionMetrics()).bytesRead.used < stopAt
    );
    return {
      timeZone,
      nextCursor: cursor,
      rows,
    };
  },
});

const reviewRecordArgs = {
  ...courseScopeArgs,
  scheduleId: v.id("classSchedule"),
};

export const getReviewRecord = query({
  args: reviewRecordArgs,
  returns: sessionRecordValidator,
  handler: (ctx, args): Promise<Infer<typeof sessionRecordValidator>> =>
    ctx.runQuery(internal.adminSessionDashboard.readReviewRecord, args, {
      transactionLimits: readLimits,
    }),
});

export const readReviewRecord = internalQuery({
  args: reviewRecordArgs,
  returns: sessionRecordValidator,
  handler: async (
    ctx,
    { scheduleId, ...scope },
  ): Promise<Infer<typeof sessionRecordValidator>> => {
    const { period, course } = await requireDashboardScope(ctx, scope);
    const schedule = await ctx.db.get("classSchedule", scheduleId);
    const sessionCourse =
      schedule && (course ?? (await ctx.db.get("classes", schedule.classId)));
    if (
      !schedule ||
      !sessionCourse ||
      sessionCourse._id !== schedule.classId ||
      sessionCourse.academicPeriodId !== period._id ||
      (scope.campusId && sessionCourse.campusId !== scope.campusId) ||
      (!course &&
        !(await courseBelongsToSchool(ctx, sessionCourse, period.schoolId))) ||
      isExternalClassSession(schedule.sessionType) ||
      !isPastClassSession(schedule, Date.now())
    )
      throw new ConvexError("PERMISSION_DENIED");
    return ctx.runQuery(api.sessionRecords.get, {
      scheduleId,
      now: schedule.scheduledEnd,
    });
  },
});

export const getWeeklySessions = query({
  args: weeklyArgs,
  returns: weeklyResult,
  handler: (ctx, args): Promise<Infer<typeof weeklyResult>> =>
    ctx.runQuery(internal.adminSessionDashboard.readWeeklySessions, args, {
      transactionLimits: readLimits,
    }),
});

export const readWeeklySessions = internalQuery({
  args: weeklyArgs,
  returns: weeklyResult,
  handler: async (
    ctx,
    { academicPeriodId, weekStart, weekEnd, campusId, classId },
  ) => {
    const { period } = await requireDashboardScope(ctx, {
      academicPeriodId,
      campusId,
      classId,
    });
    const end = dashboardWindowEnd(weekStart, weekEnd);
    const timeZone = institutionTimeZone(
      await ctx.db.get("schools", period.schoolId),
    );
    const dates = [];
    for (let date = weekStart; date < end; date = addCivilDays(date, 7))
      dates.push(date);
    const refreshes = await ctx.db
      .query("courseSessionWeekRefreshes")
      .withIndex("by_academicPeriodId_and_weekStart", (q) =>
        q
          .eq("academicPeriodId", academicPeriodId)
          .gte("weekStart", weekStart)
          .lt("weekStart", end),
      )
      .take(dates.length);
    const refreshByWeek = new Map(refreshes.map((row) => [row.weekStart, row]));
    const weeks = new Map(
      dates.map((date) => {
        const refresh = refreshByWeek.get(date);
        const refreshedAt =
          refresh?.timeZone === timeZone ? refresh.refreshedAt : null;
        return [
          date,
          {
            weekStart: date,
            refreshedAt,
            counts: refreshedAt === null ? null : emptyCounts(),
            attendance:
              refreshedAt !== null && refresh?.attendanceReady
                ? emptyAttendance()
                : null,
          },
        ] as const;
      }),
    );

    const remaining =
      DASHBOARD_READ_BUDGET -
      (await ctx.meta.getTransactionMetrics()).bytesRead.used;
    // Reserve space for the last document: pagination stops after reading it.
    if (remaining <= 1024)
      throw new ConvexError("DASHBOARD_READ_BUDGET_EXCEEDED");
    if ([...weeks.values()].some((week) => week.counts !== null)) {
      const table = ctx.db.query("courseSessionWeeks");
      const rows = classId
        ? table.withIndex(
            "by_academicPeriodId_and_classId_and_weekStart",
            (q) =>
              q
                .eq("academicPeriodId", academicPeriodId)
                .eq("classId", classId)
                .gte("weekStart", weekStart)
                .lt("weekStart", end),
          )
        : campusId
          ? table.withIndex(
              "by_academicPeriodId_and_campusId_and_weekStart",
              (q) =>
                q
                  .eq("academicPeriodId", academicPeriodId)
                  .eq("campusId", campusId)
                  .gte("weekStart", weekStart)
                  .lt("weekStart", end),
            )
          : table.withIndex("by_academicPeriodId_and_weekStart", (q) =>
              q
                .eq("academicPeriodId", academicPeriodId)
                .gte("weekStart", weekStart)
                .lt("weekStart", end),
            );
      const result = await rows.paginate({
        cursor: null,
        numItems: 2048,
        maximumBytesRead: remaining - 1024,
      });
      if (
        !result.isDone ||
        result.pageStatus === "SplitRequired" ||
        (await ctx.meta.getTransactionMetrics()).bytesRead.used >
          DASHBOARD_READ_BUDGET
      )
        throw new ConvexError("DASHBOARD_READ_BUDGET_EXCEEDED");
      for (const row of result.page) {
        if (campusId && row.campusId !== campusId) continue;
        const week = weeks.get(row.weekStart);
        const counts = week?.counts;
        if (counts) for (const key of COUNT_KEYS) counts[key] += row[key];
        if (week?.attendance && row.attendance)
          for (const key of ATTENDANCE_KEYS)
            week.attendance[key] += row.attendance[key];
      }
    }
    return { timeZone, weeks: [...weeks.values()] };
  },
});

// Both manual and queued refreshes go through the same bounded transaction.
export const refreshWeek = internalMutation({
  args: scopeArgs,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> =>
    ctx.runMutation(internal.adminSessionDashboard.rebuildWeek, args, {
      transactionLimits: { bytesRead: DASHBOARD_REFRESH_READ_BUDGET },
    }),
});

// Bootstrap one existing period without scanning its classes or attendance.
export const initializeWeeklyHistory = internalMutation({
  args: { academicPeriodId: scopeArgs.academicPeriodId },
  returns: v.null(),
  handler: async (ctx, { academicPeriodId }) => {
    const period = await ctx.db.get("academicPeriods", academicPeriodId);
    if (!period) throw new ConvexError("ACADEMIC_PERIOD_NOT_FOUND");
    const school = await ctx.db.get("schools", period.schoolId);
    await queuePeriodWeeks(ctx, period, institutionTimeZone(school));
    return null;
  },
});

export const refreshNextPendingWeek = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const pending = await ctx.db
      .query("courseSessionWeekPending")
      .withIndex("by_availableAt", (q) => q.lte("availableAt", now))
      .first();
    if (!pending) return null;
    const { academicPeriodId, weekStart } = pending;
    const period = await ctx.db.get("academicPeriods", academicPeriodId);
    const range = period && periodWeekRange(period);
    if (!range || weekStart < range.first || weekStart > range.last) {
      await ctx.db.delete("courseSessionWeekPending", pending._id);
      return null;
    }
    try {
      await ctx.runMutation(internal.adminSessionDashboard.refreshWeek, {
        academicPeriodId,
        weekStart,
      });
    } catch (error) {
      const reason = error instanceof ConvexError ? error.data : undefined;
      if (reason === "DASHBOARD_REFRESH_LIVE_ACTIVITY") return null;
      const deferred =
        reason === "DASHBOARD_WEEK_NOT_FINISHED" ||
        reason === "DASHBOARD_REFRESH_DURING_SCHOOL_HOURS";
      if (!deferred)
        console.error("Weekly dashboard refresh failed", {
          academicPeriodId,
          weekStart,
          error,
        });
      // Keep the previous snapshot and let other periods proceed.
      await ctx.db.patch("courseSessionWeekPending", pending._id, {
        availableAt: now + (deferred ? 60 : 24 * 60) * 60_000,
      });
    }
    return null;
  },
});

// Run through refreshWeek so the whole transaction has the lower byte limit.
export const rebuildWeek = internalMutation({
  args: scopeArgs,
  returns: v.null(),
  handler: async (ctx, { academicPeriodId, weekStart }) => {
    assertMonday(weekStart);
    const period = await ctx.db.get("academicPeriods", academicPeriodId);
    if (!period) throw new ConvexError("ACADEMIC_PERIOD_NOT_FOUND");
    const school = await ctx.db.get("schools", period.schoolId);
    if (!school) throw new ConvexError("INSTITUTION_NOT_FOUND");
    const timeZone = institutionTimeZone(school);
    const from = getUtcDayStart(weekStart, timeZone);
    const to = getUtcDayStart(addCivilDays(weekStart, 7), timeZone);
    const periodBounds = academicPeriodBounds(period, timeZone);
    const start = Math.max(from, periodBounds.from);
    const end = Math.min(to, periodBounds.to);
    const refreshedAt = Date.now();
    if (to > refreshedAt) throw new ConvexError("DASHBOARD_WEEK_NOT_FINISHED");
    if (start >= end) throw new ConvexError("DASHBOARD_WEEK_OUTSIDE_PERIOD");
    await assertQuietWindow(ctx, school, timeZone, refreshedAt);

    // shortcut: one atomic week for up to 750 courses; batch and publish a new snapshot if larger.
    const courses = await ctx.db
      .query("classes")
      .withIndex("by_academic_period", (q) =>
        q.eq("academicPeriodId", academicPeriodId),
      )
      .take(751);
    if (courses.length > 750)
      throw new ConvexError("DASHBOARD_REFRESH_LIMIT_EXCEEDED");
    const priorRows = await ctx.db
      .query("courseSessionWeeks")
      .withIndex("by_academicPeriodId_and_weekStart", (q) =>
        q.eq("academicPeriodId", academicPeriodId).eq("weekStart", weekStart),
      )
      .take(751);
    if (priorRows.length > 750)
      throw new ConvexError("DASHBOARD_REFRESH_LIMIT_EXCEEDED");
    const priorByCourse = new Map(priorRows.map((row) => [row.classId, row]));
    const campusMatches = new Map<Id<"campuses">, boolean>();
    let inspectedSessions = 0;
    for (const course of courses) {
      if (
        !(await courseBelongsToSchool(
          ctx,
          course,
          period.schoolId,
          campusMatches,
        ))
      )
        continue;
      const counts = emptyCounts();
      const attendanceCounts = emptyAttendance();
      for await (const row of ctx.db
        .query("classSchedule")
        .withIndex("by_class", (q) =>
          q
            .eq("classId", course._id)
            .gte("scheduledStart", start)
            .lt("scheduledStart", end),
        )) {
        if (++inspectedSessions > 8000)
          throw new ConvexError("DASHBOARD_REFRESH_LIMIT_EXCEEDED");
        countSession(counts, row);
        if (verifiedAttendanceCourse(row)) {
          for await (const record of ctx.db
            .query("studentAttendanceRecords")
            .withIndex("by_schedule", (q) => q.eq("scheduleId", row._id))) {
            attendanceCounts[record.status]++;
          }
        }
      }
      if (!counts.scheduled) continue;
      const attendance = ATTENDANCE_KEYS.some(
        (key) => attendanceCounts[key] > 0,
      )
        ? attendanceCounts
        : undefined;
      const prior = priorByCourse.get(course._id);
      priorByCourse.delete(course._id);
      if (!prior) {
        await ctx.db.insert("courseSessionWeeks", {
          academicPeriodId,
          classId: course._id,
          campusId: course.campusId,
          weekStart,
          ...counts,
          attendance,
        });
      } else if (
        prior.campusId !== course.campusId ||
        COUNT_KEYS.some((key) => prior[key] !== counts[key]) ||
        ATTENDANCE_KEYS.some(
          (key) => prior.attendance?.[key] !== attendance?.[key],
        )
      ) {
        await ctx.db.patch("courseSessionWeeks", prior._id, {
          campusId: course.campusId,
          ...counts,
          attendance,
        });
      }
    }
    for (const row of priorByCourse.values())
      await ctx.db.delete("courseSessionWeeks", row._id);
    const priorRefresh = await ctx.db
      .query("courseSessionWeekRefreshes")
      .withIndex("by_academicPeriodId_and_weekStart", (q) =>
        q.eq("academicPeriodId", academicPeriodId).eq("weekStart", weekStart),
      )
      .unique();
    const snapshot = { timeZone, refreshedAt, attendanceReady: true as const };
    if (priorRefresh) {
      await ctx.db.patch(
        "courseSessionWeekRefreshes",
        priorRefresh._id,
        snapshot,
      );
    } else {
      await ctx.db.insert("courseSessionWeekRefreshes", {
        academicPeriodId,
        weekStart,
        ...snapshot,
      });
    }
    const pending = await pendingWeek(ctx, academicPeriodId, weekStart);
    if (pending) await ctx.db.delete("courseSessionWeekPending", pending._id);
    return null;
  },
});
