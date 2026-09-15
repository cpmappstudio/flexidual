import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  canAccessCampus,
  canAccessSchool,
  canManageCampusPeople,
  canManageInstitution,
} from "./permissions";
import { getCurrentUserOrThrow } from "./users";
import {
  getUtcDayRange,
  isValidCivilDate,
  isValidTimeZone,
  localDateTimeToUtc,
} from "../lib/time-zone";
import {
  CALENDAR_CLOSURE_BATCH_SIZE,
  calendarClosureMatchesClass,
  classifyCalendarClosureOverlap,
  getCalendarClosureOccurrence,
} from "./model/calendarClosures";
import {
  cancelScheduleOccurrenceForCalendarClosure,
  isScheduleCancellableForCalendarClosure,
} from "./model/scheduleCancellation";

const MAX_PREVIEW_SCHEDULES = 2_000;
const MAX_PARTIAL_SELECTIONS = 500;
const MAX_LIST_RANGE_MS = 62 * 24 * 60 * 60 * 1_000;

const sessionTypeValidator = v.union(
  v.literal("live"),
  v.literal("ignitia"),
  v.literal("abeka"),
);

const candidateValidator = v.object({
  scheduleId: v.id("classSchedule"),
  className: v.string(),
  gradeCode: v.optional(v.string()),
  start: v.number(),
  end: v.number(),
  sessionType: sessionTypeValidator,
});

const closureInputFields = {
  schoolId: v.id("schools"),
  campusId: v.optional(v.id("campuses")),
  gradeCode: v.optional(v.string()),
  localDate: v.string(),
  isAllDay: v.boolean(),
  startMinutes: v.optional(v.number()),
  endMinutes: v.optional(v.number()),
};

type ClosureInput = {
  schoolId: Id<"schools">;
  campusId?: Id<"campuses">;
  gradeCode?: string;
  localDate: string;
  isAllDay: boolean;
  startMinutes?: number;
  endMinutes?: number;
};

type ResolvedClosureInput = ClosureInput & {
  timeZone: string;
  startsAt: number;
  endsAt: number;
};

async function resolveClosureInput(
  ctx: QueryCtx | MutationCtx,
  input: ClosureInput,
): Promise<ResolvedClosureInput> {
  const school = await ctx.db.get("schools", input.schoolId);
  if (!school?.isActive) throw new ConvexError("INSTITUTION_NOT_FOUND");

  const campus = input.campusId
    ? await ctx.db.get("campuses", input.campusId)
    : null;
  if (
    input.campusId &&
    (!campus || !campus.isActive || campus.schoolId !== school._id)
  ) {
    throw new ConvexError("INVALID_CAMPUS");
  }

  if (input.gradeCode) {
    const gradeCode = input.gradeCode;
    const grade = await ctx.db
      .query("institutionGrades")
      .withIndex("by_school_and_code", (index) =>
        index.eq("schoolId", school._id).eq("code", gradeCode),
      )
      .unique();
    if (!grade) throw new ConvexError("INVALID_GRADE");
  }

  const timeZone = campus?.timeZone ?? school.timeZone;
  if (!timeZone || !isValidTimeZone(timeZone)) {
    throw new ConvexError("TIME_ZONE_REQUIRED");
  }
  if (!isValidCivilDate(input.localDate)) {
    throw new ConvexError("INVALID_DATE_RANGE");
  }

  if (input.isAllDay) {
    if (input.startMinutes !== undefined || input.endMinutes !== undefined) {
      throw new ConvexError("INVALID_DATE_RANGE");
    }
    const range = getUtcDayRange(input.localDate, timeZone);
    return { ...input, timeZone, startsAt: range.from, endsAt: range.to };
  }

  if (
    !Number.isInteger(input.startMinutes) ||
    !Number.isInteger(input.endMinutes) ||
    input.startMinutes === undefined ||
    input.endMinutes === undefined ||
    input.startMinutes < 0 ||
    input.endMinutes > 24 * 60 - 1 ||
    input.endMinutes <= input.startMinutes
  ) {
    throw new ConvexError("INVALID_DATE_RANGE");
  }

  const toTime = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
      minutes % 60,
    ).padStart(2, "0")}`;
  return {
    ...input,
    timeZone,
    startsAt: localDateTimeToUtc(
      `${input.localDate}T${toTime(input.startMinutes)}`,
      timeZone,
    ),
    endsAt: localDateTimeToUtc(
      `${input.localDate}T${toTime(input.endMinutes)}`,
      timeZone,
    ),
  };
}

async function assertCanManageClosure(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  input: Pick<ResolvedClosureInput, "schoolId" | "campusId">,
) {
  const allowed = input.campusId
    ? await canManageCampusPeople(ctx, userId, input.campusId, input.schoolId)
    : await canManageInstitution(ctx, userId, input.schoolId);
  if (!allowed) throw new ConvexError("PERMISSION_DENIED");
}

async function listSchedulesForStatus(
  ctx: QueryCtx | MutationCtx,
  input: ResolvedClosureInput,
  status: Doc<"classSchedule">["status"],
) {
  const dayRange = getUtcDayRange(input.localDate, input.timeZone);
  return await ctx.db
    .query("classSchedule")
    .withIndex("by_school_and_status_and_scheduled_start", (index) =>
      index
        .eq("schoolId", input.schoolId)
        .eq("status", status)
        .gte("scheduledStart", dayRange.from)
        .lt("scheduledStart", dayRange.to),
    )
    .take(MAX_PREVIEW_SCHEDULES + 1);
}

async function buildPreview(
  ctx: QueryCtx | MutationCtx,
  input: ResolvedClosureInput,
  now: number,
) {
  const [scheduled, cancelled, active, completed] = await Promise.all([
    listSchedulesForStatus(ctx, input, "scheduled"),
    listSchedulesForStatus(ctx, input, "cancelled"),
    listSchedulesForStatus(ctx, input, "active"),
    listSchedulesForStatus(ctx, input, "completed"),
  ]);
  const isTruncated = [scheduled, cancelled, active, completed].some(
    (items) => items.length > MAX_PREVIEW_SCHEDULES,
  );
  const classCache = new Map<Id<"classes">, Doc<"classes"> | null>();
  const getClass = async (classId: Id<"classes">) => {
    if (!classCache.has(classId)) {
      classCache.set(classId, await ctx.db.get("classes", classId));
    }
    return classCache.get(classId) ?? null;
  };
  const matches = async (schedule: Doc<"classSchedule">) => {
    const classData = await getClass(schedule.classId);
    return Boolean(
      classData?.isActive &&
        calendarClosureMatchesClass(input, classData, schedule.schoolId),
    );
  };

  const contained: Array<{
    scheduleId: Id<"classSchedule">;
    className: string;
    gradeCode?: string;
    start: number;
    end: number;
    sessionType: "live" | "ignitia" | "abeka";
  }> = [];
  const partial: typeof contained = [];
  let ineligibleCount = 0;
  let alreadyCancelledCount = 0;

  for (const schedule of scheduled.slice(0, MAX_PREVIEW_SCHEDULES)) {
    if (!(await matches(schedule))) continue;
    const overlap = classifyCalendarClosureOverlap(schedule, input);
    if (overlap === "none") continue;
    if (
      !isScheduleCancellableForCalendarClosure(schedule, now, input.timeZone)
    ) {
      ineligibleCount += 1;
      continue;
    }
    const classData = await getClass(schedule.classId);
    if (!classData) continue;
    const candidate = {
      scheduleId: schedule._id,
      className: classData.name,
      gradeCode: classData.gradeCode,
      start: schedule.scheduledStart,
      end: schedule.scheduledEnd,
      sessionType: schedule.sessionType ?? ("live" as const),
    };
    if (overlap === "contained") contained.push(candidate);
    else partial.push(candidate);
  }

  for (const schedule of cancelled.slice(0, MAX_PREVIEW_SCHEDULES)) {
    if (
      (await matches(schedule)) &&
      classifyCalendarClosureOverlap(schedule, input) !== "none"
    ) {
      alreadyCancelledCount += 1;
    }
  }
  for (const schedule of [...active, ...completed].slice(
    0,
    MAX_PREVIEW_SCHEDULES,
  )) {
    if (
      (await matches(schedule)) &&
      classifyCalendarClosureOverlap(schedule, input) !== "none"
    ) {
      ineligibleCount += 1;
    }
  }

  return {
    contained,
    partial,
    alreadyCancelledCount,
    ineligibleCount,
    isTruncated,
  };
}

export const preview = query({
  args: { ...closureInputFields, now: v.number() },
  returns: v.object({
    contained: v.array(candidateValidator),
    partial: v.array(candidateValidator),
    alreadyCancelledCount: v.number(),
    ineligibleCount: v.number(),
    isTruncated: v.boolean(),
    timeZone: v.string(),
    startsAt: v.number(),
    endsAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const input = await resolveClosureInput(ctx, args);
    await assertCanManageClosure(ctx, user._id, input);
    return {
      ...(await buildPreview(ctx, input, args.now)),
      timeZone: input.timeZone,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    };
  },
});

export const create = mutation({
  args: {
    ...closureInputFields,
    reason: v.string(),
    selectedPartialScheduleIds: v.array(v.id("classSchedule")),
  },
  returns: v.object({
    closureId: v.id("calendarClosures"),
    selectedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("CANCELLATION_REASON_REQUIRED");
    if (args.selectedPartialScheduleIds.length > MAX_PARTIAL_SELECTIONS) {
      throw new ConvexError("CALENDAR_CLOSURE_TOO_LARGE");
    }

    const input = await resolveClosureInput(ctx, args);
    await assertCanManageClosure(ctx, user._id, input);
    const previewResult = await buildPreview(ctx, input, Date.now());
    if (previewResult.isTruncated) {
      throw new ConvexError("CALENDAR_CLOSURE_TOO_LARGE");
    }

    const availablePartialIds = new Set(
      previewResult.partial.map((item) => item.scheduleId),
    );
    const selectedPartialIds = [...new Set(args.selectedPartialScheduleIds)];
    if (selectedPartialIds.some((id) => !availablePartialIds.has(id))) {
      throw new ConvexError("INVALID_PARTIAL_SELECTION");
    }
    const selectedCount =
      previewResult.contained.length + selectedPartialIds.length;
    if (selectedCount === 0) {
      throw new ConvexError("NO_CLASSES_TO_CANCEL");
    }

    const createdAt = Date.now();
    const closureId = await ctx.db.insert("calendarClosures", {
      schoolId: input.schoolId,
      campusId: input.campusId,
      gradeCode: input.gradeCode,
      localDate: input.localDate,
      timeZone: input.timeZone,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      isAllDay: input.isAllDay,
      reason,
      status: "processing",
      selectedCount,
      cancelledCount: 0,
      skippedCount: 0,
      createdBy: user._id,
      createdAt,
    });
    for (const scheduleId of selectedPartialIds) {
      await ctx.db.insert("calendarClosureOccurrences", {
        closureId,
        scheduleId,
        overlapKind: "partial",
        status: "pending",
        createdAt,
      });
    }
    await ctx.scheduler.runAfter(0, internal.calendarClosures.processBatch, {
      closureId,
      paginationOpts: {
        numItems: CALENDAR_CLOSURE_BATCH_SIZE,
        cursor: null,
      },
    });
    return { closureId, selectedCount };
  },
});

export const processBatch = internalMutation({
  args: {
    closureId: v.id("calendarClosures"),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const closure = await ctx.db.get("calendarClosures", args.closureId);
    if (!closure || closure.status !== "processing") return null;

    const dayRange = getUtcDayRange(closure.localDate, closure.timeZone);
    const page = await ctx.db
      .query("classSchedule")
      .withIndex("by_school_and_status_and_scheduled_start", (index) =>
        index
          .eq("schoolId", closure.schoolId)
          .eq("status", "scheduled")
          .gte("scheduledStart", dayRange.from)
          .lt("scheduledStart", dayRange.to),
      )
      .paginate(args.paginationOpts);

    const now = Date.now();
    const cancelledScheduleIds: Id<"classSchedule">[] = [];
    for (const schedule of page.page) {
      const classData = await ctx.db.get("classes", schedule.classId);
      if (
        !classData?.isActive ||
        !calendarClosureMatchesClass(closure, classData, schedule.schoolId)
      ) {
        continue;
      }
      const overlapKind = classifyCalendarClosureOverlap(schedule, closure);
      if (overlapKind === "none") continue;
      const occurrence = await getCalendarClosureOccurrence(
        ctx,
        closure._id,
        schedule._id,
      );
      if (overlapKind === "partial" && occurrence?.status !== "pending") {
        continue;
      }

      const cancelled = await cancelScheduleOccurrenceForCalendarClosure(ctx, {
        schedule,
        classData,
        schoolId: closure.schoolId,
        actorId: closure.createdBy,
        reason: closure.reason,
        occurredAt: now,
        source: "calendar_closure",
        calendarClosureId: closure._id,
        publishNotification: false,
        closureCreatedAt: closure.createdAt,
        closureTimeZone: closure.timeZone,
      });
      if (!cancelled) continue;

      cancelledScheduleIds.push(schedule._id);
      if (occurrence) {
        await ctx.db.patch("calendarClosureOccurrences", occurrence._id, {
          status: "cancelled",
          processedAt: now,
        });
      } else {
        await ctx.db.insert("calendarClosureOccurrences", {
          closureId: closure._id,
          scheduleId: schedule._id,
          overlapKind,
          status: "cancelled",
          createdAt: now,
          processedAt: now,
        });
      }
    }

    if (cancelledScheduleIds.length > 0) {
      await ctx.db.patch("calendarClosures", closure._id, {
        cancelledCount: closure.cancelledCount + cancelledScheduleIds.length,
      });
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.calendarClosures.processBatch, {
        closureId: closure._id,
        paginationOpts: {
          numItems: CALENDAR_CLOSURE_BATCH_SIZE,
          cursor: page.continueCursor,
        },
      });
      return null;
    }

    const pendingSelections = await ctx.db
      .query("calendarClosureOccurrences")
      .withIndex("by_closure", (index) =>
        index.eq("closureId", closure._id).eq("status", "pending"),
      )
      .take(MAX_PARTIAL_SELECTIONS);
    const completedAt = Date.now();
    for (const occurrence of pendingSelections) {
      await ctx.db.patch("calendarClosureOccurrences", occurrence._id, {
        status: "skipped",
        processedAt: completedAt,
      });
    }
    const latestClosure = await ctx.db.get("calendarClosures", closure._id);
    const cancelledCount = latestClosure?.cancelledCount ?? 0;
    await ctx.db.patch("calendarClosures", closure._id, {
      status: "completed",
      skippedCount: Math.max(0, closure.selectedCount - cancelledCount),
      completedAt,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.systemNotifications.publishCalendarClosureBatch,
      {
        closureId: closure._id,
        paginationOpts: {
          numItems: CALENDAR_CLOSURE_BATCH_SIZE,
          cursor: null,
        },
      },
    );
    return null;
  },
});

export const listForRange = query({
  args: {
    schoolId: v.id("schools"),
    campusId: v.optional(v.id("campuses")),
    from: v.number(),
    to: v.number(),
  },
  returns: v.array(
    v.object({
      _id: v.id("calendarClosures"),
      campusId: v.optional(v.id("campuses")),
      gradeCode: v.optional(v.string()),
      localDate: v.string(),
      timeZone: v.string(),
      startsAt: v.number(),
      endsAt: v.number(),
      isAllDay: v.boolean(),
      reason: v.string(),
      status: v.union(v.literal("processing"), v.literal("completed")),
      selectedCount: v.number(),
      cancelledCount: v.number(),
      skippedCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    if (
      !Number.isFinite(args.from) ||
      !Number.isFinite(args.to) ||
      args.to <= args.from ||
      args.to - args.from > MAX_LIST_RANGE_MS
    ) {
      throw new ConvexError("INVALID_DATE_RANGE");
    }
    const canRead = args.campusId
      ? await canAccessCampus(ctx, user._id, args.campusId, args.schoolId)
      : await canAccessSchool(ctx, user._id, args.schoolId);
    if (!canRead) throw new ConvexError("PERMISSION_DENIED");

    const closures = await ctx.db
      .query("calendarClosures")
      .withIndex("by_school_and_starts_at", (index) =>
        index
          .eq("schoolId", args.schoolId)
          .gte("startsAt", args.from - 24 * 60 * 60 * 1_000)
          .lt("startsAt", args.to),
      )
      .take(200);
    return closures
      .filter(
        (closure) =>
          closure.endsAt > args.from &&
          (!closure.campusId || closure.campusId === args.campusId),
      )
      .map((closure) => ({
        _id: closure._id,
        campusId: closure.campusId,
        gradeCode: closure.gradeCode,
        localDate: closure.localDate,
        timeZone: closure.timeZone,
        startsAt: closure.startsAt,
        endsAt: closure.endsAt,
        isAllDay: closure.isAllDay,
        reason: closure.reason,
        status: closure.status,
        selectedCount: closure.selectedCount,
        cancelledCount: closure.cancelledCount,
        skippedCount: closure.skippedCount,
      }));
  },
});
