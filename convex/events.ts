import { ConvexError, v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserFromAuth, getCurrentUserOrThrow } from "./users";
import { validateGradeCodes } from "./model/grades";
import {
  canCreateEvent,
  canAccessEvent,
  canManageEvent,
  canEditEvent,
  canCancelEventOccurrence,
  isEventTeacher,
} from "./model/eventAccess";
import {
  assertNoActiveEventRoom,
  getEventLeaderRole,
  hasActiveEventRoom,
} from "./model/eventRoomAccess";
import { deleteEvent } from "./model/eventDeletion";
import { scheduleEventNotice } from "./eventChangeNotifications";
import {
  addCivilDays,
  civilDayNumber,
  getWeeklyOccurrenceStarts,
  isValidCivilDate,
  isValidTimeZone,
  localDateTimeToUtc,
  utcToLocalDateTime,
} from "../lib/time-zone";
import {
  DEFAULT_SCHEDULE_END_MINUTES,
  DEFAULT_SCHEDULE_START_MINUTES,
} from "../lib/academic-settings";
import { getEventScheduleTimeIssue } from "../lib/event-schedule-window";
import { firstWeeklyDate, MAX_EVENT_WEEKS } from "../lib/event-weekly-schedule";
import {
  ensureEventActivation,
  getEventActivationId,
} from "./model/liveActivation";
import { deleteWhiteboardSession } from "./model/whiteboardCleanup";
import {
  canReopenLiveSession,
  LIVE_SESSION_EARLY_START_MS,
} from "../lib/live-session-policy";

const weeklySlotValidator = v.object({
  dayOfWeek: v.number(),
  startMinutes: v.number(),
  durationMinutes: v.number(),
});

const eventScheduleValidator = v.union(
  v.object({ kind: v.literal("single"), start: v.number(), end: v.number() }),
  v.object({
    kind: v.literal("weekly"),
    startDate: v.string(),
    endDate: v.string(),
    slots: v.array(weeklySlotValidator),
  }),
);

const eventScheduleEditValidator = v.object({
  mode: v.literal("replace"),
  schedule: eventScheduleValidator,
  reason: v.string(),
  expectedFutureCount: v.number(),
  expectedFutureFingerprint: v.string(),
});

type EventSchedule =
  | { kind: "single"; start: number; end: number }
  | {
      kind: "weekly";
      startDate: string;
      endDate: string;
      slots: Array<{
        dayOfWeek: number;
        startMinutes: number;
        durationMinutes: number;
      }>;
    };

const MAX_OCCURRENCES = 500;
const MAX_WEEKLY_SLOTS = 14;
const MAX_OCCURRENCE_LOOKBACK_MS = 26 * 60 * 60 * 1_000;
const DELETE_BATCH_SIZE = 100;
const MAX_CALENDAR_RANGE_MS = 62 * 24 * 60 * 60_000;

function futureScheduleFingerprint(
  event: Doc<"events">,
  occurrences: Doc<"eventOccurrences">[],
) {
  return JSON.stringify({
    timeZone: event.timeZone,
    campusId: event.campusId,
    weeklySlots: event.weeklySlots,
    recurrenceStartDate: event.recurrenceStartDate,
    recurrenceEndDate: event.recurrenceEndDate,
    dates: occurrences.map(({ _id, scheduledStart, scheduledEnd }) => [
      _id,
      scheduledStart,
      scheduledEnd,
    ]),
  });
}

function listScheduledOccurrencesFrom(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"events">,
  from: number,
) {
  return ctx.db
    .query("eventOccurrences")
    .withIndex("by_eventId_and_status_and_scheduledStart", (q) =>
      q
        .eq("eventId", eventId)
        .eq("status", "scheduled")
        .gte("scheduledStart", from),
    )
    .take(MAX_OCCURRENCES + 1);
}

function diffEventDates(
  future: Doc<"eventOccurrences">[],
  proposed: Array<{ start: number; end: number }>,
) {
  const available = new Map<string, Doc<"eventOccurrences">[]>();
  for (const occurrence of future) {
    const key = `${occurrence.scheduledStart}:${occurrence.scheduledEnd}`;
    const matches = available.get(key) ?? [];
    matches.push(occurrence);
    available.set(key, matches);
  }
  const kept = new Set<Id<"eventOccurrences">>();
  const added = proposed.filter((date) => {
    const match = available.get(`${date.start}:${date.end}`)?.pop();
    if (!match) return true;
    kept.add(match._id);
    return false;
  });
  return {
    removed: future.filter((occurrence) => !kept.has(occurrence._id)),
    added,
  };
}

async function deleteOccurrenceRecordings(
  ctx: MutationCtx,
  occurrence: Doc<"eventOccurrences">,
) {
  const pending = await Promise.all(
    (["starting", "active"] as const).map((status) =>
      ctx.db
        .query("recordings")
        .withIndex("by_event_occurrence", (q) =>
          q.eq("eventOccurrenceId", occurrence._id).eq("status", status),
        )
        .first(),
    ),
  );
  if (pending.some(Boolean)) {
    await ctx.scheduler.runAfter(
      30_000,
      internal.events.removeOccurrencesByEvent,
      { eventId: occurrence.eventId },
    );
    return "waiting" as const;
  }
  const recordings = await ctx.db
    .query("recordings")
    .withIndex("by_event_occurrence", (q) =>
      q.eq("eventOccurrenceId", occurrence._id),
    )
    .take(DELETE_BATCH_SIZE);
  if (
    (recordings.length || occurrence.liveActivationId) &&
    !occurrence.recordingsCleanupFinishedAt
  ) {
    if (!occurrence.recordingsCleanupStartedAt) {
      await ctx.db.patch(occurrence._id, {
        recordingsCleanupStartedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(
        0,
        internal.eventRecordingCleanup.removeFiles,
        {
          occurrenceId: occurrence._id,
          attempt: 0,
        },
      );
    }
    return "waiting" as const;
  }
  for (const recording of recordings) await ctx.db.delete(recording._id);
  return recordings.length === DELETE_BATCH_SIZE ? ("more" as const) : false;
}

const occurrenceValidator = v.object({
  _id: v.id("eventOccurrences"),
  eventId: v.id("events"),
  start: v.number(),
  end: v.number(),
  status: v.union(
    v.literal("scheduled"),
    v.literal("active"),
    v.literal("completed"),
    v.literal("cancelled"),
  ),
  cancellationReason: v.optional(v.string()),
  roomName: v.string(),
});

const eventSummaryValidator = v.object({
  _id: v.id("events"),
  schoolId: v.id("schools"),
  campusId: v.optional(v.id("campuses")),
  campusName: v.optional(v.string()),
  gradeCodes: v.optional(v.array(v.string())),
  title: v.string(),
  description: v.optional(v.string()),
  responsibleId: v.id("users"),
  responsibleName: v.string(),
  teacherIds: v.array(v.id("users")),
  timeZone: v.string(),
  isRecurring: v.boolean(),
  canManage: v.boolean(),
  canEdit: v.boolean(),
  canCancelOccurrence: v.boolean(),
});

const eventListItemValidator = eventSummaryValidator.extend({
  nextOccurrenceStart: v.union(v.number(), v.null()),
});

async function summarizeEvent(
  ctx: QueryCtx,
  event: Doc<"events">,
  actorId: Doc<"users">["_id"],
) {
  const responsible = await ctx.db.get(event.responsibleId);
  const campus = event.campusId ? await ctx.db.get(event.campusId) : null;
  return {
    _id: event._id,
    schoolId: event.schoolId,
    campusId: event.campusId,
    campusName: campus?.name,
    gradeCodes: event.gradeCodes,
    title: event.title,
    description: event.description,
    responsibleId: event.responsibleId,
    responsibleName: responsible?.fullName ?? "",
    teacherIds: event.teacherIds,
    timeZone: event.timeZone,
    isRecurring: Boolean(event.weeklySlots),
    canManage: await canManageEvent(ctx, actorId, event),
    canEdit: await canEditEvent(ctx, actorId, event),
    canCancelOccurrence: await canCancelEventOccurrence(ctx, actorId, event),
  };
}

function summarizeOccurrence(occurrence: Doc<"eventOccurrences">) {
  return {
    _id: occurrence._id,
    eventId: occurrence.eventId,
    start: occurrence.scheduledStart,
    end: occurrence.scheduledEnd,
    status: occurrence.status,
    cancellationReason: occurrence.cancellationReason,
    roomName: occurrence.roomName,
  };
}

async function findNextScheduledOccurrence(
  ctx: QueryCtx,
  eventId: Id<"events">,
  now: number,
) {
  return (
    ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_status_and_scheduledStart", (q) =>
        q
          .eq("eventId", eventId)
          .eq("status", "scheduled")
          .gte("scheduledStart", now - MAX_OCCURRENCE_LOOKBACK_MS),
      )
      // eslint-disable-next-line @convex-dev/no-filter-in-query
      .filter((q) => q.gt(q.field("scheduledEnd"), now))
      .first()
  );
}

function validateOccurrence(
  start: number,
  end: number,
  timeZone: string,
  window: { startMinutes: number; endMinutes: number },
) {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    end <= start
  )
    throw new ConvexError("INVALID_EVENT_TIME");
  const issue = getEventScheduleTimeIssue(
    utcToLocalDateTime(start, timeZone),
    utcToLocalDateTime(end, timeZone),
    window.startMinutes,
    window.endMinutes,
  );
  if (issue)
    throw new ConvexError(
      issue === "outsideWindow"
        ? "OUTSIDE_SCHEDULE_WINDOW"
        : "INVALID_EVENT_TIME",
    );
}

function planEventDates(
  schedule: EventSchedule,
  timeZone: string,
  window: { startMinutes: number; endMinutes: number },
  from?: number,
) {
  if (schedule.kind === "single") {
    validateOccurrence(schedule.start, schedule.end, timeZone, window);
    if (from !== undefined && schedule.start <= from)
      throw new ConvexError("INVALID_EVENT_TIME");
    return [{ start: schedule.start, end: schedule.end }];
  }
  const { startDate, endDate, slots } = schedule;
  if (
    !isValidCivilDate(startDate) ||
    !isValidCivilDate(endDate) ||
    endDate < startDate ||
    civilDayNumber(endDate) - civilDayNumber(startDate) > MAX_EVENT_WEEKS * 7 ||
    !slots.length ||
    slots.length > MAX_WEEKLY_SLOTS ||
    new Set(slots.map((slot) => `${slot.dayOfWeek}:${slot.startMinutes}`))
      .size !== slots.length ||
    slots.some(
      (slot) =>
        !Number.isInteger(slot.dayOfWeek) ||
        slot.dayOfWeek < 0 ||
        slot.dayOfWeek > 6 ||
        !Number.isInteger(slot.startMinutes) ||
        slot.startMinutes < 0 ||
        slot.startMinutes >= 1440 ||
        !Number.isInteger(slot.durationMinutes) ||
        slot.durationMinutes < 1 ||
        slot.durationMinutes > 1440,
    )
  )
    throw new ConvexError("INVALID_EVENT_RECURRENCE");
  const firstWeekly = firstWeeklyDate(
    startDate,
    slots.map((slot) => slot.dayOfWeek),
  );
  if (!firstWeekly || firstWeekly > endDate)
    throw new ConvexError("INVALID_EVENT_RECURRENCE");
  if (
    slots.some(
      (slot) =>
        slot.startMinutes < window.startMinutes ||
        slot.startMinutes + slot.durationMinutes > window.endMinutes ||
        slot.startMinutes + slot.durationMinutes >= 1440,
    )
  )
    throw new ConvexError("OUTSIDE_SCHEDULE_WINDOW");
  const localNow =
    from === undefined ? null : utcToLocalDateTime(from, timeZone);
  const firstDate =
    localNow && localNow.slice(0, 10) > startDate
      ? localNow.slice(0, 10)
      : startDate;
  const dates = slots.flatMap((slot) =>
    getWeeklyOccurrenceStarts({
      startDate:
        localNow &&
        firstDate === localNow.slice(0, 10) &&
        slot.startMinutes <=
          Number(localNow.slice(11, 13)) * 60 + Number(localNow.slice(14, 16))
          ? addCivilDays(firstDate, 1)
          : firstDate,
      endDate,
      timeZone,
      dayOfWeek: slot.dayOfWeek,
      startMinutes: slot.startMinutes,
      limit: MAX_OCCURRENCES + 1,
    })
      .filter((start) => from === undefined || start > from)
      .map((start) => {
        const date = utcToLocalDateTime(start, timeZone).slice(0, 10);
        const endMinutes = slot.startMinutes + slot.durationMinutes;
        const end = localDateTimeToUtc(
          `${date}T${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`,
          timeZone,
        );
        return { start, end };
      }),
  );
  if (!dates.length) throw new ConvexError("EVENT_NO_FUTURE_SESSIONS");
  if (dates.length > MAX_OCCURRENCES)
    throw new ConvexError("EVENT_RECURRENCE_TOO_LARGE");
  dates.forEach(({ start, end }) =>
    validateOccurrence(start, end, timeZone, window),
  );
  return dates.sort((a, b) => a.start - b.start);
}

async function getActiveEventScope(
  ctx: QueryCtx | MutationCtx,
  scope: Pick<Doc<"events">, "schoolId" | "campusId">,
) {
  const school = await ctx.db.get(scope.schoolId);
  const campus = scope.campusId ? await ctx.db.get(scope.campusId) : null;
  if (
    !school?.isActive ||
    (scope.campusId &&
      (!campus?.isActive || campus.schoolId !== scope.schoolId))
  ) {
    throw new ConvexError("INVALID_EVENT_SCOPE");
  }
  return { school, campus };
}

async function validateEventDetails(
  ctx: MutationCtx,
  args: {
    schoolId: Id<"schools">;
    campusId?: Id<"campuses">;
    gradeCodes?: string[];
    title: string;
    description?: string;
    responsibleId: Id<"users">;
    teacherIds: Id<"users">[];
  },
) {
  const scope = { schoolId: args.schoolId, campusId: args.campusId };
  await getActiveEventScope(ctx, scope);
  const title = args.title.trim();
  const description = args.description?.trim() || undefined;
  if (
    !title ||
    title.length > 160 ||
    (description && description.length > 2000)
  )
    throw new ConvexError("INVALID_EVENT_TITLE_OR_DESCRIPTION");
  if (
    args.gradeCodes &&
    (!args.gradeCodes.length ||
      args.gradeCodes.length > 64 ||
      args.gradeCodes.some((grade) => !grade.trim()) ||
      new Set(args.gradeCodes).size !== args.gradeCodes.length ||
      (await validateGradeCodes(ctx, args.schoolId, args.gradeCodes)).length >
        0)
  )
    throw new ConvexError("INVALID_EVENT_GRADES");
  const teacherIds = [...new Set(args.teacherIds)].filter(
    (id) => id !== args.responsibleId,
  );
  if (
    teacherIds.length > 16 ||
    !(await isEventTeacher(ctx, args.responsibleId, scope)) ||
    !(
      await Promise.all(teacherIds.map((id) => isEventTeacher(ctx, id, scope)))
    ).every(Boolean)
  )
    throw new ConvexError("INVALID_EVENT_TEACHER");
  return { title, description, teacherIds };
}

export const listTeacherOptions = query({
  args: {
    schoolId: v.id("schools"),
    campusId: v.optional(v.id("campuses")),
  },
  returns: v.array(
    v.object({
      _id: v.id("users"),
      fullName: v.string(),
      email: v.optional(v.string()),
      role: v.union(v.literal("teacher"), v.literal("principal")),
    }),
  ),
  handler: async (ctx, args) => {
    const actor = await getCurrentUserOrThrow(ctx);
    const scope = { schoolId: args.schoolId, campusId: args.campusId };
    if (!(await canCreateEvent(ctx, actor._id, scope)))
      throw new ConvexError("PERMISSION_DENIED");
    await getActiveEventScope(ctx, scope);
    const campuses = args.campusId
      ? []
      : await ctx.db
          .query("campuses")
          .withIndex("by_school", (q) => q.eq("schoolId", args.schoolId))
          .take(101);
    if (campuses.length > 100)
      throw new ConvexError("EVENT_TEACHER_OPTIONS_TOO_LARGE");
    const campusIds = args.campusId
      ? [args.campusId]
      : campuses
          .filter((campus) => campus.isActive)
          .map((campus) => campus._id);
    const assignmentPages = await Promise.all(
      campusIds.flatMap((campusId) =>
        (["teacher", "principal"] as const).map((role) =>
          ctx.db
            .query("roleAssignments")
            .withIndex("by_org_role", (q) =>
              q.eq("orgId", campusId).eq("orgType", "campus").eq("role", role),
            )
            .take(501),
        ),
      ),
    );
    if (assignmentPages.some((page) => page.length > 500))
      throw new ConvexError("EVENT_TEACHER_OPTIONS_TOO_LARGE");
    const assignments = assignmentPages.flat();
    const roles = new Map<Id<"users">, "teacher" | "principal">();
    for (const assignment of assignments) {
      if (assignment.role !== "teacher" && assignment.role !== "principal")
        continue;
      if (assignment.role === "principal" || !roles.has(assignment.userId))
        roles.set(assignment.userId, assignment.role);
    }
    const teachers = await Promise.all(
      [...roles.keys()].map((id) => ctx.db.get(id)),
    );
    return teachers
      .filter((teacher) => teacher?.isActive)
      .map((teacher) => ({
        _id: teacher!._id,
        fullName: teacher!.fullName,
        email: teacher!.email,
        role: roles.get(teacher!._id)!,
      }))
      .sort((first, second) => first.fullName.localeCompare(second.fullName));
  },
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    campusId: v.optional(v.id("campuses")),
    gradeCodes: v.optional(v.array(v.string())),
    title: v.string(),
    description: v.optional(v.string()),
    responsibleId: v.id("users"),
    teacherIds: v.array(v.id("users")),
    schedule: eventScheduleValidator,
  },
  returns: v.id("events"),
  handler: async (ctx, args) => {
    const actor = await getCurrentUserOrThrow(ctx);
    const scope = { schoolId: args.schoolId, campusId: args.campusId };
    if (!(await canCreateEvent(ctx, actor._id, scope))) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    const { school, campus } = await getActiveEventScope(ctx, scope);
    const { title, description, teacherIds } = await validateEventDetails(
      ctx,
      args,
    );

    const timeZone = campus?.timeZone ?? school.timeZone;
    if (!timeZone || !isValidTimeZone(timeZone)) {
      throw new ConvexError("TIME_ZONE_REQUIRED");
    }

    const now = Date.now();
    const window = {
      startMinutes:
        school.scheduleStartMinutes ?? DEFAULT_SCHEDULE_START_MINUTES,
      endMinutes: school.scheduleEndMinutes ?? DEFAULT_SCHEDULE_END_MINUTES,
    };
    const occurrences = planEventDates(args.schedule, timeZone, window, now);
    const eventId = await ctx.db.insert("events", {
      ...scope,
      gradeCodes: args.gradeCodes,
      title,
      description,
      responsibleId: args.responsibleId,
      teacherIds,
      timeZone,
      weeklySlots:
        args.schedule.kind === "weekly" ? args.schedule.slots : undefined,
      recurrenceStartDate:
        args.schedule.kind === "weekly" ? args.schedule.startDate : undefined,
      recurrenceEndDate:
        args.schedule.kind === "weekly" ? args.schedule.endDate : undefined,
      createdAt: now,
      createdBy: actor._id,
    });
    for (const { start, end } of occurrences) {
      await ctx.db.insert("eventOccurrences", {
        eventId,
        schoolId: args.schoolId,
        campusId: args.campusId,
        scheduledStart: start,
        scheduledEnd: end,
        status: "scheduled",
        roomName: `event-${eventId}-${start}`,
        createdAt: now,
        createdBy: actor._id,
      });
    }
    return eventId;
  },
});

export const updateDetails = mutation({
  args: {
    eventId: v.id("events"),
    campusId: v.optional(v.id("campuses")),
    gradeCodes: v.optional(v.array(v.string())),
    title: v.string(),
    description: v.optional(v.string()),
    responsibleId: v.id("users"),
    teacherIds: v.array(v.id("users")),
    scheduleEdit: v.optional(eventScheduleEditValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await getCurrentUserOrThrow(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || !(await canEditEvent(ctx, actor._id, event)))
      throw new ConvexError("PERMISSION_DENIED");
    const nextScope = { schoolId: event.schoolId, campusId: args.campusId };
    if (!(await canEditEvent(ctx, actor._id, nextScope)))
      throw new ConvexError("PERMISSION_DENIED");
    const details = await validateEventDetails(ctx, { ...args, ...nextScope });
    await assertNoActiveEventRoom(ctx, event._id);
    const { school, campus } = await getActiveEventScope(ctx, nextScope);
    const timeZone =
      event.campusId === args.campusId
        ? event.timeZone
        : (campus?.timeZone ?? school.timeZone);
    if (!timeZone || !isValidTimeZone(timeZone))
      throw new ConvexError("TIME_ZONE_REQUIRED");
    const scheduleEdit = args.scheduleEdit;
    const now = Date.now();
    const proposed = scheduleEdit
      ? planEventDates(scheduleEdit.schedule, timeZone, {
          startMinutes:
            school.scheduleStartMinutes ?? DEFAULT_SCHEDULE_START_MINUTES,
          endMinutes: school.scheduleEndMinutes ?? DEFAULT_SCHEDULE_END_MINUTES,
        })
      : [];
    if (proposed.some(({ start }) => start <= now))
      throw new ConvexError("INVALID_EVENT_TIME");
    const future = scheduleEdit
      ? await listScheduledOccurrencesFrom(ctx, event._id, now)
      : [];
    if (future.length > MAX_OCCURRENCES)
      throw new ConvexError("EVENT_RECURRENCE_TOO_LARGE");
    if (scheduleEdit && future.length === 0 && event.weeklySlots?.length)
      throw new ConvexError("EVENT_NO_FUTURE_SESSIONS");
    if (
      scheduleEdit &&
      (future.length !== scheduleEdit.expectedFutureCount ||
        futureScheduleFingerprint(event, future) !==
          scheduleEdit.expectedFutureFingerprint)
    )
      throw new ConvexError("EVENT_SCHEDULE_CHANGED");
    if (event.weeklySlots?.length && scheduleEdit?.schedule.kind === "single")
      throw new ConvexError("EVENT_RECURRENCE_TYPE_CHANGE_NOT_ALLOWED");
    const changes = diffEventDates(future, proposed);
    const reason = scheduleEdit?.reason?.trim();
    if (
      scheduleEdit &&
      ((changes.removed.length > 0 && !reason) || (reason?.length ?? 0) > 500)
    )
      throw new ConvexError("INVALID_CANCELLATION_REASON");
    await ctx.db.patch(event._id, {
      ...details,
      campusId: args.campusId,
      gradeCodes: args.gradeCodes,
      responsibleId: args.responsibleId,
      timeZone,
      ...(scheduleEdit
        ? {
            weeklySlots:
              scheduleEdit.schedule.kind === "weekly"
                ? scheduleEdit.schedule.slots
                : undefined,
            recurrenceStartDate:
              scheduleEdit.schedule.kind === "weekly"
                ? scheduleEdit.schedule.startDate
                : undefined,
            recurrenceEndDate:
              scheduleEdit.schedule.kind === "weekly"
                ? scheduleEdit.schedule.endDate
                : undefined,
          }
        : {}),
    });
    if (scheduleEdit) {
      for (const occurrence of changes.removed)
        await ctx.db.patch(occurrence._id, {
          status: "cancelled",
          cancellationReason: reason,
        });
      for (const [index, date] of changes.added.entries())
        await ctx.db.insert("eventOccurrences", {
          eventId: event._id,
          schoolId: event.schoolId,
          campusId: args.campusId,
          scheduledStart: date.start,
          scheduledEnd: date.end,
          status: "scheduled",
          roomName: `event-${event._id}-${date.start}-${now}-${index}`,
          createdAt: now,
          createdBy: actor._id,
        });
      if (changes.removed.length || changes.added.length) {
        const updated = (await ctx.db.get(event._id))!;
        await scheduleEventNotice(
          ctx,
          updated,
          actor._id,
          "event_schedule",
          "changed",
          reason || undefined,
        );
      }
    }
    if (event.campusId !== args.campusId) {
      const thread = await ctx.db
        .query("eventChatThreads")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .unique();
      if (thread) await ctx.db.patch(thread._id, { campusId: args.campusId });
      await ctx.scheduler.runAfter(0, internal.events.syncOccurrenceScope, {
        eventId: event._id,
        cursor: null,
      });
    }
    return null;
  },
});

export const getEditingSchedule = query({
  args: { eventId: v.id("events"), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      futureCount: v.number(),
      futureFingerprint: v.string(),
      next: v.union(v.null(), v.object({ start: v.number(), end: v.number() })),
      weeklySlots: v.optional(v.array(weeklySlotValidator)),
      recurrenceEndDate: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const actor = await getCurrentUserOrThrow(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || !(await canEditEvent(ctx, actor._id, event))) return null;
    const future = await listScheduledOccurrencesFrom(ctx, event._id, args.now);
    return {
      futureCount: future.length,
      futureFingerprint: futureScheduleFingerprint(event, future),
      next: future[0]
        ? { start: future[0].scheduledStart, end: future[0].scheduledEnd }
        : null,
      weeklySlots: event.weeklySlots,
      recurrenceEndDate: event.recurrenceEndDate,
    };
  },
});

export const previewScheduleChange = query({
  args: {
    eventId: v.id("events"),
    campusId: v.optional(v.id("campuses")),
    schedule: eventScheduleValidator,
    now: v.number(),
  },
  returns: v.union(
    v.null(),
    v.object({ error: v.string() }),
    v.object({
      removedCount: v.number(),
      addedCount: v.number(),
      futureCount: v.number(),
      futureFingerprint: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const actor = await getCurrentUserOrThrow(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || !(await canEditEvent(ctx, actor._id, event))) return null;
    const scope = { schoolId: event.schoolId, campusId: args.campusId };
    if (!(await canEditEvent(ctx, actor._id, scope))) return null;
    const { school, campus } = await getActiveEventScope(ctx, scope);
    const timeZone =
      event.campusId === args.campusId
        ? event.timeZone
        : (campus?.timeZone ?? school.timeZone);
    if (!timeZone || !isValidTimeZone(timeZone))
      return { error: "TIME_ZONE_REQUIRED" };
    let proposed: Array<{ start: number; end: number }>;
    try {
      proposed = planEventDates(args.schedule, timeZone, {
        startMinutes:
          school.scheduleStartMinutes ?? DEFAULT_SCHEDULE_START_MINUTES,
        endMinutes: school.scheduleEndMinutes ?? DEFAULT_SCHEDULE_END_MINUTES,
      });
    } catch (error) {
      if (error instanceof ConvexError && typeof error.data === "string")
        return { error: error.data };
      if (
        error instanceof Error &&
        error.message.includes("INVALID_LOCAL_DATE_TIME")
      )
        return { error: "INVALID_LOCAL_DATE_TIME" };
      throw error;
    }
    if (proposed.some(({ start }) => start <= args.now))
      return { error: "INVALID_EVENT_TIME" };
    const future = await listScheduledOccurrencesFrom(ctx, event._id, args.now);
    if (future.length > MAX_OCCURRENCES)
      return { error: "EVENT_RECURRENCE_TOO_LARGE" };
    if (!future.length && event.weeklySlots?.length)
      return { error: "EVENT_NO_FUTURE_SESSIONS" };
    if (event.weeklySlots?.length && args.schedule.kind === "single")
      return { error: "EVENT_RECURRENCE_TYPE_CHANGE_NOT_ALLOWED" };
    const changes = diffEventDates(future, proposed);
    return {
      removedCount: changes.removed.length,
      addedCount: changes.added.length,
      futureCount: future.length,
      futureFingerprint: futureScheduleFingerprint(event, future),
    };
  },
});

export const syncOccurrenceScope = internalMutation({
  args: { eventId: v.id("events"), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;
    const page = await ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", event._id),
      )
      .paginate({ cursor: args.cursor, numItems: DELETE_BATCH_SIZE });
    for (const occurrence of page.page) {
      if (occurrence.campusId !== event.campusId)
        await ctx.db.patch(occurrence._id, { campusId: event.campusId });
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.events.syncOccurrenceScope, {
        eventId: event._id,
        cursor: page.continueCursor,
      });
    return null;
  },
});

export const remove = mutation({
  args: { eventId: v.id("events") },
  returns: v.object({ deleted: v.literal(true) }),
  handler: async (ctx, args) => {
    const actor = await getCurrentUserOrThrow(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) return { deleted: true } as const;
    if (!(await canEditEvent(ctx, actor._id, event)))
      throw new ConvexError("PERMISSION_DENIED");
    await scheduleEventNotice(
      ctx,
      event,
      actor._id,
      "event_deleted",
      "removed",
    );
    await deleteEvent(ctx, event._id);
    return { deleted: true } as const;
  },
});

export const listForCalendar = query({
  args: {
    schoolId: v.id("schools"),
    campusId: v.optional(v.id("campuses")),
    scope: v.union(
      v.literal("school"),
      v.literal("campus"),
      v.literal("institution"),
    ),
    from: v.number(),
    to: v.number(),
    teacherId: v.optional(v.id("users")),
    gradeCode: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      ...occurrenceValidator.fields,
      event: eventSummaryValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const actor = await getCurrentUserOrThrow(ctx);
    if (
      !Number.isSafeInteger(args.from) ||
      !Number.isSafeInteger(args.to) ||
      args.from > args.to ||
      args.to - args.from > MAX_CALENDAR_RANGE_MS
    )
      throw new ConvexError("INVALID_DATE_RANGE");
    if ((args.scope === "school") !== (args.campusId === undefined))
      throw new ConvexError("INVALID_EVENT_SCOPE");
    if (args.campusId) {
      const campus = await ctx.db.get(args.campusId);
      if (campus?.schoolId !== args.schoolId)
        throw new ConvexError("INVALID_EVENT_SCOPE");
    }
    const page =
      args.scope === "school"
        ? await ctx.db
            .query("eventOccurrences")
            .withIndex("by_schoolId_and_scheduledStart", (q) =>
              q
                .eq("schoolId", args.schoolId)
                .gte("scheduledStart", args.from - MAX_OCCURRENCE_LOOKBACK_MS)
                .lte("scheduledStart", args.to),
            )
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("eventOccurrences")
            .withIndex("by_schoolId_and_campusId_and_scheduledStart", (q) =>
              q
                .eq("schoolId", args.schoolId)
                .eq(
                  "campusId",
                  args.scope === "campus" ? args.campusId : undefined,
                )
                .gte("scheduledStart", args.from - MAX_OCCURRENCE_LOOKBACK_MS)
                .lte("scheduledStart", args.to),
            )
            .paginate(args.paginationOpts);
    const events = await Promise.all(
      [...new Set(page.page.map((row) => row.eventId))].map((id) =>
        ctx.db.get(id),
      ),
    );
    const visibleEvents = new Map<
      Id<"events">,
      Awaited<ReturnType<typeof summarizeEvent>>
    >();
    for (const event of events) {
      if (
        event &&
        (args.scope === "school" ||
          event.campusId === args.campusId ||
          (args.scope === "institution" && !event.campusId)) &&
        (!args.teacherId ||
          event.responsibleId === args.teacherId ||
          event.teacherIds.includes(args.teacherId)) &&
        (!args.gradeCode ||
          !event.gradeCodes ||
          event.gradeCodes.includes(args.gradeCode)) &&
        (await canAccessEvent(ctx, actor._id, event))
      ) {
        visibleEvents.set(
          event._id,
          await summarizeEvent(ctx, event, actor._id),
        );
      }
    }
    const visible = page.page.flatMap((row) => {
      const event = visibleEvents.get(row.eventId);
      return event && row.scheduledEnd > args.from
        ? [{ ...summarizeOccurrence(row), event }]
        : [];
    });
    return { ...page, page: visible };
  },
});

export const list = query({
  args: {
    schoolId: v.id("schools"),
    campusId: v.optional(v.id("campuses")),
    search: v.optional(v.string()),
    now: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(eventListItemValidator),
  handler: async (ctx, args) => {
    const actor = await getCurrentUserOrThrow(ctx);
    const search = args.search?.trim();
    const page = search
      ? await ctx.db
          .query("events")
          .withSearchIndex("search_title", (q) =>
            q.search("title", search).eq("schoolId", args.schoolId),
          )
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("events")
          .withIndex("by_schoolId_and_createdAt", (q) =>
            q.eq("schoolId", args.schoolId),
          )
          .order("desc")
          .paginate(args.paginationOpts);
    const summaries = await Promise.all(
      page.page.map(async (event) => {
        if (
          (args.campusId &&
            event.campusId &&
            event.campusId !== args.campusId) ||
          !(await canAccessEvent(ctx, actor._id, event))
        )
          return null;
        const [summary, next] = await Promise.all([
          summarizeEvent(ctx, event, actor._id),
          findNextScheduledOccurrence(ctx, event._id, args.now),
        ]);
        return {
          ...summary,
          nextOccurrenceStart: next?.scheduledStart ?? null,
        };
      }),
    );
    return { ...page, page: summaries.filter((item) => item !== null) };
  },
});

export const get = query({
  args: { eventId: v.id("events") },
  returns: v.union(eventSummaryValidator, v.null()),
  handler: async (ctx, args) => {
    const actor = await getCurrentUserFromAuth(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!actor || !event || !(await canAccessEvent(ctx, actor._id, event)))
      return null;
    return summarizeEvent(ctx, event, actor._id);
  },
});

export const hasActiveRoom = query({
  args: { eventId: v.id("events") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const actor = await getCurrentUserOrThrow(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || !(await canAccessEvent(ctx, actor._id, event)))
      throw new ConvexError("PERMISSION_DENIED");
    return hasActiveEventRoom(ctx, event._id);
  },
});

export const listOccurrences = query({
  args: {
    eventId: v.id("events"),
    category: v.union(
      v.literal("upcoming"),
      v.literal("past"),
      v.literal("cancelled"),
    ),
    now: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    occurrenceValidator.extend({
      hasRecording: v.boolean(),
      recordingFailed: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const actor = await getCurrentUserOrThrow(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || !(await canAccessEvent(ctx, actor._id, event)))
      throw new ConvexError("PERMISSION_DENIED");
    if (
      args.category !== "cancelled" &&
      (args.now === undefined || !Number.isSafeInteger(args.now))
    )
      throw new ConvexError("INVALID_DATE_RANGE");
    const page =
      args.category === "cancelled"
        ? await ctx.db
            .query("eventOccurrences")
            .withIndex("by_eventId_and_status_and_scheduledStart", (q) =>
              q.eq("eventId", args.eventId).eq("status", "cancelled"),
            )
            .order("desc")
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("eventOccurrences")
            .withIndex("by_eventId_and_scheduledStart", (q) =>
              args.category === "upcoming"
                ? q
                    .eq("eventId", args.eventId)
                    .gte(
                      "scheduledStart",
                      args.now! - MAX_OCCURRENCE_LOOKBACK_MS,
                    )
                : q
                    .eq("eventId", args.eventId)
                    .lte(
                      "scheduledStart",
                      args.now! + LIVE_SESSION_EARLY_START_MS,
                    ),
            )
            // Keep chronological pages together; status and end time are not index ranges on this ordering.
            // eslint-disable-next-line @convex-dev/no-filter-in-query
            .filter((q) =>
              q.and(
                q.neq(q.field("status"), "cancelled"),
                args.category === "upcoming"
                  ? q.or(
                      q.eq(q.field("status"), "active"),
                      q.and(
                        q.eq(q.field("status"), "scheduled"),
                        q.or(
                          q.gte(q.field("scheduledStart"), args.now!),
                          q.gt(q.field("scheduledEnd"), args.now!),
                        ),
                      ),
                    )
                  : q.and(
                      q.neq(q.field("status"), "active"),
                      q.or(
                        q.eq(q.field("status"), "completed"),
                        q.lte(q.field("scheduledEnd"), args.now!),
                      ),
                    ),
              ),
            )
            .order(args.category === "upcoming" ? "asc" : "desc")
            .paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (occurrence) => {
          const recordings = await ctx.db
            .query("recordings")
            .withIndex("by_event_occurrence", (q) =>
              q.eq("eventOccurrenceId", occurrence._id),
            )
            .collect();
          return {
            ...summarizeOccurrence(occurrence),
            hasRecording: recordings.some(
              (recording) =>
                recording.status === "complete" && Boolean(recording.url),
            ),
            recordingFailed: recordings.some(
              (recording) =>
                recording.status === "failed" ||
                recording.status === "aborted" ||
                (recording.status === "complete" && !recording.url),
            ),
          };
        }),
      ),
    };
  },
});

export const nextOccurrence = query({
  args: { eventId: v.id("events"), now: v.number() },
  returns: v.union(occurrenceValidator, v.null()),
  handler: async (ctx, args) => {
    const actor = await getCurrentUserOrThrow(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event || !(await canAccessEvent(ctx, actor._id, event)))
      throw new ConvexError("PERMISSION_DENIED");
    const active = await ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_status_and_scheduledStart", (q) =>
        q.eq("eventId", args.eventId).eq("status", "active"),
      )
      .order("desc")
      .first();
    const recentlyCompleted =
      !active && (await getEventLeaderRole(ctx, actor._id, event))
        ? await ctx.db
            .query("eventOccurrences")
            .withIndex("by_eventId_and_status_and_scheduledStart", (q) =>
              q
                .eq("eventId", args.eventId)
                .eq("status", "completed")
                .gte("scheduledStart", args.now - MAX_OCCURRENCE_LOOKBACK_MS),
            )
            .order("desc")
            .collect()
        : [];
    const reopenable = recentlyCompleted.find((occurrence) =>
      canReopenLiveSession({
        now: args.now,
        scheduledStart: occurrence.scheduledStart,
        scheduledEnd: occurrence.scheduledEnd,
        status: occurrence.status,
        isLive: occurrence.isLive === true,
        sessionStartedAt: occurrence.sessionStartedAt,
        sessionReopenUntil: occurrence.sessionReopenUntil,
      }),
    );
    const row =
      active ??
      reopenable ??
      (await findNextScheduledOccurrence(ctx, args.eventId, args.now));
    return row ? summarizeOccurrence(row) : null;
  },
});

export const cancelOccurrence = mutation({
  args: {
    occurrenceId: v.id("eventOccurrences"),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await getCurrentUserOrThrow(ctx);
    const occurrence = await ctx.db.get(args.occurrenceId);
    const event = occurrence ? await ctx.db.get(occurrence.eventId) : null;
    if (!event || !(await canCancelEventOccurrence(ctx, actor._id, event)))
      throw new ConvexError("PERMISSION_DENIED");
    await assertNoActiveEventRoom(ctx, event._id);
    if (
      occurrence!.status !== "scheduled" ||
      occurrence!.scheduledStart <= Date.now()
    )
      throw new ConvexError("EVENT_OCCURRENCE_NOT_EDITABLE");
    const reason = args.reason.trim();
    if (!reason || reason.length > 500)
      throw new ConvexError("INVALID_CANCELLATION_REASON");
    await ctx.db.patch(occurrence!._id, {
      status: "cancelled",
      cancellationReason: reason,
    });
    await scheduleEventNotice(
      ctx,
      event,
      actor._id,
      "event_schedule",
      "removed",
      reason,
    );
    return null;
  },
});

export const cancelFuture = mutation({
  args: {
    occurrenceId: v.id("eventOccurrences"),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await getCurrentUserOrThrow(ctx);
    const occurrence = await ctx.db.get(args.occurrenceId);
    const event = occurrence ? await ctx.db.get(occurrence.eventId) : null;
    if (!event || !(await canEditEvent(ctx, actor._id, event)))
      throw new ConvexError("PERMISSION_DENIED");
    await assertNoActiveEventRoom(ctx, event._id);
    if (
      occurrence!.status !== "scheduled" ||
      occurrence!.scheduledStart <= Date.now()
    )
      throw new ConvexError("EVENT_OCCURRENCE_NOT_EDITABLE");
    const reason = args.reason.trim();
    if (!reason || reason.length > 500)
      throw new ConvexError("INVALID_CANCELLATION_REASON");
    const future = await listScheduledOccurrencesFrom(
      ctx,
      event._id,
      occurrence!.scheduledStart,
    );
    if (future.length > MAX_OCCURRENCES)
      throw new ConvexError("EVENT_RECURRENCE_TOO_LARGE");
    for (const date of future)
      await ctx.db.patch(date._id, {
        status: "cancelled",
        cancellationReason: reason,
      });
    await scheduleEventNotice(
      ctx,
      event,
      actor._id,
      "event_schedule",
      "removed",
      reason,
    );
    return null;
  },
});

export const removeOccurrencesByEvent = internalMutation({
  args: { eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await ctx.db.get(args.eventId)) return null;
    const occurrences = await ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_scheduledStart", (q) =>
        q.eq("eventId", args.eventId),
      )
      .take(DELETE_BATCH_SIZE);
    let madeProgress = false;
    let hasMoreActivations = false;
    for (const occurrence of occurrences) {
      if (occurrence.isLive) {
        const activation = await ensureEventActivation(ctx, occurrence);
        const claimId = `delete:${occurrence._id}`;
        const cleanupJobId = await ctx.scheduler.runAfter(
          0,
          internal.livekit.cleanupActivation,
          { activationId: getEventActivationId(occurrence) },
        );
        await ctx.db.patch("liveRoomActivations", activation._id, {
          status: "closing",
          claimId,
          cleanupJobId,
          nextCleanupAt: Date.now() + 60_000,
        });
        await ctx.db.patch("eventOccurrences", occurrence._id, {
          status: "completed",
          isLive: false,
          completedAt: Date.now(),
          liveEndClaimId: claimId,
        });
        continue;
      }
      if (!occurrence.liveActivationId) {
        const recordingCleanup = await deleteOccurrenceRecordings(
          ctx,
          occurrence,
        );
        if (recordingCleanup) {
          if (recordingCleanup === "more") hasMoreActivations = true;
          continue;
        }
        await ctx.db.delete(occurrence._id);
        madeProgress = true;
        continue;
      }
      const activations = await ctx.db
        .query("liveRoomActivations")
        .withIndex("by_event_occurrence", (q) =>
          q.eq("eventOccurrenceId", occurrence._id),
        )
        .take(DELETE_BATCH_SIZE);
      if (activations.some((activation) => activation.status !== "closed")) {
        continue;
      }
      for (const activation of activations) {
        await ctx.db.delete(activation._id);
        madeProgress = true;
      }
      if (activations.length === DELETE_BATCH_SIZE) {
        hasMoreActivations = true;
        continue;
      }
      const recordingCleanup = await deleteOccurrenceRecordings(
        ctx,
        occurrence,
      );
      if (recordingCleanup) {
        if (recordingCleanup === "more") hasMoreActivations = true;
        continue;
      }
      await deleteWhiteboardSession(ctx, occurrence.roomName);
      await ctx.db.delete(occurrence._id);
      madeProgress = true;
    }
    if (
      hasMoreActivations ||
      (madeProgress && occurrences.length === DELETE_BATCH_SIZE)
    )
      await ctx.scheduler.runAfter(
        0,
        internal.events.removeOccurrencesByEvent,
        args,
      );
    return null;
  },
});

export const markRecordingsCleaned = internalMutation({
  args: { occurrenceId: v.id("eventOccurrences") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const occurrence = await ctx.db.get(args.occurrenceId);
    if (!occurrence || (await ctx.db.get(occurrence.eventId))) return null;
    await ctx.db.patch(occurrence._id, {
      recordingsCleanupFinishedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.events.removeOccurrencesByEvent, {
      eventId: occurrence.eventId,
    });
    return null;
  },
});
