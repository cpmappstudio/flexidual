import { ConvexError, v } from "convex/values";

import { query } from "./_generated/server";
import { listAccessibleScheduleClasses } from "./model/scheduleAccess";
import { getClassTimeZone } from "./model/timeZone";
import { getSessionLeaderRoleFromAssignments } from "./model/sessionLeadership";

const MAX_CALENDAR_RANGE_MS = 62 * 24 * 60 * 60 * 1_000;

const calendarEventValidator = v.object({
  scheduleId: v.id("classSchedule"),
  title: v.string(),
  description: v.string(),
  className: v.string(),
  curriculumTitle: v.string(),
  color: v.string(),
  start: v.number(),
  end: v.number(),
  timeZone: v.string(),
  roomName: v.string(),
  isLive: v.boolean(),
  sessionType: v.union(
    v.literal("live"),
    v.literal("ignitia"),
    v.literal("abeka"),
  ),
  status: v.union(
    v.literal("scheduled"),
    v.literal("active"),
    v.literal("completed"),
    v.literal("cancelled"),
  ),
  classId: v.id("classes"),
  curriculumId: v.id("curriculums"),
  teacherId: v.optional(v.id("users")),
  gradeCode: v.optional(v.string()),
  isRecurring: v.boolean(),
  recurrenceRule: v.optional(v.string()),
  recurrenceParentId: v.optional(v.id("classSchedule")),
  cancellationReason: v.optional(v.string()),
  teacherName: v.optional(v.string()),
  teacherImageUrl: v.optional(v.string()),
  canLeadSession: v.boolean(),
  sessionStartedAt: v.optional(v.number()),
  sessionReopenUntil: v.optional(v.number()),
  sessionEndedAt: v.optional(v.number()),
  sessionEndedByName: v.optional(v.string()),
  sessionEndedAutomatically: v.boolean(),
  sessionClosing: v.optional(v.boolean()),
  sessionCloseRetrying: v.optional(v.boolean()),
});

export const listEvents = query({
  args: {
    from: v.number(),
    to: v.number(),
    schoolId: v.optional(v.id("schools")),
    campusId: v.optional(v.id("campuses")),
    classId: v.optional(v.id("classes")),
    teacherId: v.optional(v.id("users")),
    gradeCode: v.optional(v.string()),
  },
  returns: v.array(calendarEventValidator),
  handler: async (ctx, args) => {
    if (args.from > args.to || args.to - args.from > MAX_CALENDAR_RANGE_MS) {
      throw new ConvexError("INVALID_DATE_RANGE");
    }

    const accessContext = await listAccessibleScheduleClasses(ctx, args);
    if (!accessContext || accessContext.classes.length === 0) return [];

    const { classes, user } = accessContext;
    const classById = new Map(
      classes.map((classData) => [classData._id, classData]),
    );
    const schedules = (
      await Promise.all(
        classes.map((classData) =>
          ctx.db
            .query("classSchedule")
            .withIndex("by_class", (q) =>
              q
                .eq("classId", classData._id)
                .gte("scheduledStart", args.from)
                .lte("scheduledStart", args.to),
            )
            .collect(),
        ),
      )
    ).flat();

    const curriculumIds = [
      ...new Set(classes.map((classData) => classData.curriculumId)),
    ];
    const userIds = [
      ...new Set(
        [
          ...classes.map((classData) => classData.teacherId),
          ...schedules.map((schedule) => schedule.sessionEndedBy),
        ].filter((id) => id !== undefined),
      ),
    ];
    const campusIds = [
      ...new Set(
        classes.flatMap((classData) =>
          classData.campusId ? [classData.campusId] : [],
        ),
      ),
    ];
    const scheduledClassIds = [
      ...new Set(schedules.map((schedule) => schedule.classId)),
    ];
    const recurrenceParentIds = [
      ...new Set(
        schedules.flatMap((schedule) =>
          schedule.recurrenceParentId && !schedule.recurrenceRule
            ? [schedule.recurrenceParentId]
            : [],
        ),
      ),
    ];
    const [
      curriculums,
      users,
      campuses,
      roleAssignments,
      classTimeZones,
      recurrenceParents,
    ] = await Promise.all([
      Promise.all(curriculumIds.map((id) => ctx.db.get(id))),
      Promise.all(userIds.map((id) => ctx.db.get(id))),
      Promise.all(campusIds.map((id) => ctx.db.get(id))),
      ctx.db
        .query("roleAssignments")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect(),
      Promise.all(
        scheduledClassIds.flatMap((classId) => {
          const classData = classById.get(classId);
          return classData
            ? [
                getClassTimeZone(ctx, classData).then(
                  (timeZone) => [classId, timeZone ?? "UTC"] as const,
                ),
              ]
            : [];
        }),
      ),
      Promise.all(
        recurrenceParentIds.map(
          async (id) => [id, await ctx.db.get(id)] as const,
        ),
      ),
    ]);

    const curriculumById = new Map(
      curriculums.flatMap((curriculum) =>
        curriculum ? [[curriculum._id, curriculum] as const] : [],
      ),
    );
    const userById = new Map(
      users.flatMap((value) => (value ? [[value._id, value] as const] : [])),
    );
    const campusById = new Map(
      campuses.flatMap((campus) =>
        campus ? [[campus._id, campus] as const] : [],
      ),
    );
    const timeZoneByClassId = new Map(classTimeZones);
    const recurrenceParentById = new Map(recurrenceParents);

    return schedules
      .flatMap((schedule) => {
        const classData = classById.get(schedule.classId);
        if (!classData) return [];
        const curriculum = curriculumById.get(classData.curriculumId);
        const teacher = classData.teacherId
          ? userById.get(classData.teacherId)
          : undefined;
        const sessionEndedBy = schedule.sessionEndedBy
          ? userById.get(schedule.sessionEndedBy)
          : undefined;
        const schoolId =
          classData.schoolId ??
          (classData.campusId
            ? campusById.get(classData.campusId)?.schoolId
            : curriculum?.schoolId);
        const canLeadSession =
          getSessionLeaderRoleFromAssignments(
            user._id,
            classData,
            schoolId,
            roleAssignments,
          ) !== null;
        const recurrenceRule =
          schedule.recurrenceRule ??
          (schedule.recurrenceParentId
            ? recurrenceParentById.get(schedule.recurrenceParentId)
                ?.recurrenceRule
            : undefined);

        return [
          {
            scheduleId: schedule._id,
            title: schedule.title || classData.name,
            description: schedule.description || "",
            className: classData.name,
            curriculumTitle: curriculum?.title || "Unknown",
            color: curriculum?.color || "#3b82f6",
            start: schedule.scheduledStart,
            end: schedule.scheduledEnd,
            timeZone: timeZoneByClassId.get(classData._id) ?? "UTC",
            roomName: schedule.roomName,
            isLive: schedule.isLive === true && schedule.status === "active",
            sessionType: schedule.sessionType || ("live" as const),
            status: schedule.status,
            classId: classData._id,
            curriculumId: classData.curriculumId,
            teacherId: classData.teacherId,
            gradeCode: classData.gradeCode,
            isRecurring: schedule.isRecurring || false,
            recurrenceRule,
            recurrenceParentId: schedule.recurrenceParentId,
            cancellationReason: schedule.cancellationReason,
            teacherName: teacher?.fullName,
            teacherImageUrl: teacher?.imageUrl,
            canLeadSession,
            sessionStartedAt: canLeadSession
              ? schedule.sessionStartedAt
              : undefined,
            sessionReopenUntil: canLeadSession
              ? schedule.sessionReopenUntil
              : undefined,
            sessionEndedAt: canLeadSession ? schedule.completedAt : undefined,
            sessionClosing:
              canLeadSession && schedule.liveEndClaimId !== undefined,
            sessionCloseRetrying:
              canLeadSession && schedule.liveCleanupRetrying === true,
            sessionEndedByName: canLeadSession
              ? sessionEndedBy?.fullName
              : undefined,
            sessionEndedAutomatically:
              canLeadSession &&
              schedule.status === "completed" &&
              schedule.sessionEndedBy === undefined,
          },
        ];
      })
      .sort((first, second) => first.start - second.start);
  },
});
