import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  MutationCtx,
  mutation,
  QueryCtx,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getCurrentUserOrThrow, getCurrentUserFromAuth } from "./users";
import { Doc, Id } from "./_generated/dataModel";
import { ConvexError } from "convex/values";
import {
  canAccessClass,
  canCancelClassOccurrence,
  canCancelClassSeries,
  canManageClasses,
  hasSystemRole,
} from "./permissions";
import {
  canStudentAccessLiveClass,
  liveAccessValidator,
  normalizeLiveAccess,
} from "./model/liveAccess";
import { hasOnlyInstructorStaffRoles } from "./model/roles";
import { getClassTimeZone } from "./model/timeZone";
import {
  getSoleStudentCampusId,
  getStudentGradeCode,
  getStudentSchoolIds,
} from "./model/membership";
import { isStudentEnrolled, listClassStudentIds } from "./model/enrollments";
import { deleteScheduleWithDependencies } from "./model/scheduleDeletion";
import { syncClassTypeFromSchedules } from "./model/classType";
import { recordClassCancellationEvent } from "./model/classCancellationEvents";
import { curriculumIconValidator } from "./model/curriculumIcons";
import {
  civilDayNumber,
  isValidTimeZone,
  localDateTimeToUtc,
  shiftZonedDateTime,
  toCivilDate,
  utcToLocalDateTime,
} from "../lib/time-zone";
import {
  DEFAULT_SCHEDULE_END_MINUTES,
  DEFAULT_SCHEDULE_START_MINUTES,
} from "../lib/academic-settings";
import {
  getConfirmedExtensionEnd,
  getEffectiveLiveEnd,
  getLiveSessionHardEnd,
  LIVE_EXTENSION_PROMPT_LEAD_MS,
  MAX_LIVE_OVERRUN_MS,
  STUDENT_ONLY_GRACE_MS,
} from "../lib/live-session-policy";
import { isExternalClassSession } from "../lib/class-session";
import { DEFAULT_CURRICULUM_ICON } from "../lib/curriculum-icons";
import {
  sessionClosureStatusValidator,
  sessionLeaderRoleValidator,
  type SessionLeaderRole,
} from "./model/sessionLeadership";
import {
  getConnectedSecondsWithinSchedule,
  normalizeExcuseReason,
  studentAttendanceStatusValidator,
  suggestStudentAttendanceStatus,
  type StudentAttendanceStatus,
} from "./model/studentAttendance";

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const attendanceStatusValidator = studentAttendanceStatusValidator;
const LIVE_PRESENCE_PRESENT_RATIO = 0.5;
const LIVE_PRESENCE_PARTIAL_RATIO = 0.1;
const LIVE_PRESENCE_MIN_PARTIAL_SECONDS = 120;
/** A session with no leftAt is considered a dropped connection if older than this */
const SESSION_STALE_MS = 4 * 60 * 60 * 1000;
const DEFAULT_SCHEDULE_HISTORY_MS = 14 * 24 * 60 * 60 * 1000;
const DEFAULT_SCHEDULE_FUTURE_MS = 60 * 24 * 60 * 60 * 1000;

const scheduleFields = {
  _id: v.id("classSchedule"),
  _creationTime: v.number(),
  classId: v.id("classes"),
  schoolId: v.optional(v.id("schools")),
  lessonIds: v.optional(v.array(v.id("lessons"))),
  sessionType: v.optional(
    v.union(v.literal("live"), v.literal("ignitia"), v.literal("abeka")),
  ),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  scheduledStart: v.number(),
  scheduledEnd: v.number(),
  isRecurring: v.optional(v.boolean()),
  recurrenceRule: v.optional(v.string()),
  recurrenceParentId: v.optional(v.id("classSchedule")),
  roomName: v.string(),
  isLive: v.optional(v.boolean()),
  liveAccess: v.optional(liveAccessValidator),
  status: v.union(
    v.literal("scheduled"),
    v.literal("active"),
    v.literal("completed"),
    v.literal("cancelled"),
  ),
  completedAt: v.optional(v.number()),
  sessionLeaderId: v.optional(v.id("users")),
  sessionLeaderRole: v.optional(sessionLeaderRoleValidator),
  sessionLeaderSince: v.optional(v.number()),
  sessionStartedBy: v.optional(v.id("users")),
  sessionStartedAt: v.optional(v.number()),
  sessionEndedBy: v.optional(v.id("users")),
  sessionClosureStatus: v.optional(sessionClosureStatusValidator),
  sessionClosedBy: v.optional(v.id("users")),
  sessionClosedAt: v.optional(v.number()),
  sessionTransferToId: v.optional(v.id("users")),
  sessionTransferRequestedBy: v.optional(v.id("users")),
  sessionTransferRequestedAt: v.optional(v.number()),
  cancellationReason: v.optional(v.string()),
  cancelledAt: v.optional(v.number()),
  cancelledBy: v.optional(v.id("users")),
  cancellationScope: v.optional(
    v.union(v.literal("occurrence"), v.literal("series")),
  ),
  cancellationEffectiveAt: v.optional(v.number()),
  liveLeaderAbsentSince: v.optional(v.number()),
  liveExtensionEndsAt: v.optional(v.number()),
  liveDecisionEndsAt: v.optional(v.number()),
  liveLastReconciledAt: v.optional(v.number()),
  createdAt: v.number(),
  createdBy: v.id("users"),
};
const scheduleValidator = v.object(scheduleFields);
const sessionStatusFields = {
  scheduleId: v.id("classSchedule"),
  isActive: v.boolean(),
  isLive: v.boolean(),
  status: v.union(
    v.literal("scheduled"),
    v.literal("active"),
    v.literal("completed"),
    v.literal("cancelled"),
  ),
  start: v.number(),
  end: v.number(),
  timeZone: v.string(),
  roomName: v.string(),
  canJoin: v.boolean(),
  liveExtensionEndsAt: v.optional(v.number()),
  liveDecisionEndsAt: v.optional(v.number()),
  liveHardEndsAt: v.number(),
};
const sessionStatusValidator = v.object(sessionStatusFields);
const viewerSessionStatusValidator = v.object({
  ...sessionStatusFields,
  roomAdmin: v.boolean(),
  isPrimaryTeacher: v.boolean(),
  isSessionLeader: v.boolean(),
  leadershipRole: v.union(sessionLeaderRoleValidator, v.null()),
});
const scheduleEventValidator = v.object({
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
  lessonIds: v.array(v.id("lessons")),
  lessons: v.array(
    v.object({
      _id: v.id("lessons"),
      title: v.string(),
      order: v.number(),
    }),
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
  teacherAttendance: v.optional(
    v.object({ status: v.string(), minutes: v.number() }),
  ),
  attendance: v.string(),
  minutesAttended: v.number(),
  isStudentActive: v.boolean(),
  attendanceSummary: v.optional(
    v.object({
      present: v.number(),
      partial: v.number(),
      absent: v.number(),
      excused: v.number(),
      pendingVerification: v.number(),
      verifiedTotal: v.number(),
      total: v.number(),
    }),
  ),
  hasRecording: v.boolean(),
});

// ============================================================================
// HELPERS
// ============================================================================

async function scheduleLiveReconciliation(
  ctx: MutationCtx,
  roomName: string,
  scheduledEnd: number,
) {
  await ctx.scheduler.runAt(
    Math.max(Date.now(), scheduledEnd),
    internal.livekit.reconcileLiveSession,
    { roomName },
  );
}

async function validateScheduleOverlap(
  ctx: MutationCtx,
  {
    teacherId, // Now it naturally accepts undefined
    classId,
    start,
    end,
    excludeScheduleId,
  }: {
    teacherId?: Id<"users">;
    classId: Id<"classes">;
    start: number;
    end: number;
    excludeScheduleId?: Id<"classSchedule">;
  },
) {
  // 1. Check if the CLASS is already busy
  const classConflicts = await ctx.db
    .query("classSchedule")
    .withIndex("by_class", (q) =>
      q.eq("classId", classId).lt("scheduledStart", end),
    )
    .collect();

  const realClassConflicts = classConflicts.filter(
    (schedule) =>
      schedule.status !== "cancelled" &&
      schedule.scheduledEnd > start &&
      schedule._id !== excludeScheduleId,
  );

  if (realClassConflicts.length > 0) {
    const conflict = realClassConflicts[0];
    const conflictClass = await ctx.db.get(conflict.classId);

    throw new ConvexError({
      code: "CLASS_SCHEDULE_CONFLICT",
      className: conflictClass?.name || "Unknown Class",
      conflictTime: conflict.scheduledStart.toString(),
    });
  }

  // 2. ONLY check teacher overlap if a teacher is actually assigned
  if (teacherId) {
    const teacherClasses = await ctx.db
      .query("classes")
      .withIndex("by_teacher", (q) =>
        q.eq("teacherId", teacherId).eq("isActive", true),
      )
      .collect();

    const teacherClassIds = new Set(teacherClasses.map((c) => c._id));

    if (teacherClassIds.size > 0) {
      const potentialOverlaps = (
        await Promise.all(
          teacherClasses.map((classData) =>
            ctx.db
              .query("classSchedule")
              .withIndex("by_class", (q) =>
                q
                  .eq("classId", classData._id)
                  .gte("scheduledStart", start - 24 * 60 * 60 * 1000)
                  .lt("scheduledStart", end),
              )
              .collect(),
          ),
        )
      ).flat();

      const teacherConflict = potentialOverlaps.find(
        (schedule) =>
          schedule.status !== "cancelled" &&
          schedule.scheduledEnd > start &&
          teacherClassIds.has(schedule.classId) &&
          schedule._id !== excludeScheduleId,
      );

      if (teacherConflict) {
        const conflictClass = teacherClasses.find(
          (classData) => classData._id === teacherConflict.classId,
        );

        throw new ConvexError({
          code: "TEACHER_SCHEDULE_CONFLICT",
          className: conflictClass?.name || "another class",
          conflictTime: teacherConflict.scheduledStart.toString(),
        });
      }
    }
  }
}

export async function canAccessSchedule(
  ctx: Parameters<typeof getCurrentUserOrThrow>[0],
  userId: Id<"users">,
  schedule: Doc<"classSchedule">,
) {
  const classData = await ctx.db.get(schedule.classId);
  if (!classData) return false;
  if (await canAccessClass(ctx, userId, classData)) return true;

  const [curriculum, campus, studentSchoolIds] = await Promise.all([
    ctx.db.get(classData.curriculumId),
    classData.campusId ? ctx.db.get(classData.campusId) : null,
    getStudentSchoolIds(ctx, userId),
  ]);
  const classSchoolId = campus?.schoolId ?? curriculum?.schoolId;
  const studentGrade = classSchoolId
    ? await getStudentGradeCode(ctx, userId, classSchoolId, classData.campusId)
    : undefined;
  return canStudentAccessLiveClass({
    isEnrolled: await isStudentEnrolled(ctx, classData, userId),
    liveAccess: schedule.liveAccess,
    studentGrade,
    classSchoolId,
    studentSchoolIds,
  });
}

async function validateClassScheduleTime(
  ctx: MutationCtx,
  classData: Doc<"classes">,
  localStart: string,
  durationMinutes: number,
) {
  const [curriculum, campus, period] = await Promise.all([
    ctx.db.get(classData.curriculumId),
    classData.campusId ? ctx.db.get(classData.campusId) : null,
    classData.academicPeriodId ? ctx.db.get(classData.academicPeriodId) : null,
  ]);
  const schoolId = campus?.schoolId ?? curriculum?.schoolId;
  const school = schoolId ? await ctx.db.get(schoolId) : null;
  if (!school) throw new ConvexError("INSTITUTION_NOT_FOUND");

  const localDate = localStart.slice(0, 10);
  if (
    period &&
    (localDate < toCivilDate(period.startDate) ||
      localDate > toCivilDate(period.endDate))
  ) {
    throw new ConvexError("OUTSIDE_ACADEMIC_PERIOD");
  }

  const hour = Number(localStart.slice(11, 13));
  const minute = Number(localStart.slice(14, 16));
  const startMinutes = hour * 60 + minute;
  const windowStart =
    school.scheduleStartMinutes ?? DEFAULT_SCHEDULE_START_MINUTES;
  const windowEnd = school.scheduleEndMinutes ?? DEFAULT_SCHEDULE_END_MINUTES;
  if (
    !Number.isInteger(startMinutes) ||
    startMinutes < windowStart ||
    startMinutes + durationMinutes > windowEnd
  ) {
    throw new ConvexError("OUTSIDE_SCHEDULE_WINDOW");
  }
}

async function deleteWhiteboardSession(ctx: MutationCtx, roomName: string) {
  const whiteboard = await ctx.db
    .query("whiteboardSessions")
    .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
    .unique();
  if (!whiteboard) return;

  await Promise.allSettled(
    Object.values(whiteboard.fileRefs ?? {}).map((file) =>
      ctx.storage.delete(file.storageId),
    ),
  );
  await ctx.db.delete(whiteboard._id);
}

async function listSchedulesStartingBetween(
  ctx: QueryCtx,
  start: number,
  end: number,
) {
  const [scheduled, active] = await Promise.all(
    (["scheduled", "active"] as const).map((status) =>
      ctx.db
        .query("classSchedule")
        .withIndex("by_status", (q) =>
          q
            .eq("status", status)
            .gte("scheduledStart", start)
            .lt("scheduledStart", end),
        )
        .collect(),
    ),
  );
  return [...scheduled, ...active];
}

async function getExtensionConflicts(
  ctx: QueryCtx,
  schedule: Doc<"classSchedule">,
  userId: Id<"users">,
  effectiveEnd: number,
  proposedEnd: number,
) {
  const currentClass = await ctx.db.get(schedule.classId);
  if (!currentClass) {
    return { staffConflict: undefined, affectedStudentCount: 0 };
  }

  const currentStudentIds = new Set(
    await listClassStudentIds(ctx, currentClass),
  );
  const candidates = (
    await listSchedulesStartingBetween(ctx, effectiveEnd, proposedEnd)
  ).filter((candidate) => candidate._id !== schedule._id);
  const candidateClasses = (
    await Promise.all(
      candidates.map((candidate) => ctx.db.get(candidate.classId)),
    )
  ).filter((classData): classData is Doc<"classes"> => Boolean(classData));
  const classById = new Map(
    candidateClasses.map((classData) => [classData._id, classData]),
  );

  const staffSchedule = candidates
    .filter((candidate) => {
      const classData = classById.get(candidate.classId);
      return classData?.teacherId === userId || classData?.tutorId === userId;
    })
    .sort((a, b) => a.scheduledStart - b.scheduledStart)[0];
  const staffClass = staffSchedule
    ? classById.get(staffSchedule.classId)
    : undefined;

  const affectedStudents = new Set<Id<"users">>();
  await Promise.all(
    candidateClasses.map(async (classData) => {
      const studentIds = await listClassStudentIds(ctx, classData);
      for (const studentId of studentIds) {
        if (currentStudentIds.has(studentId)) affectedStudents.add(studentId);
      }
    }),
  );

  return {
    staffConflict:
      staffSchedule && staffClass
        ? {
            className: staffClass.name,
            startsAt: staffSchedule.scheduledStart,
          }
        : undefined,
    affectedStudentCount: affectedStudents.size,
  };
}

function getSessionStatusData(
  schedule: Doc<"classSchedule">,
  timeZone: string,
  now: number,
) {
  const liveHardEndsAt = getLiveSessionHardEnd(schedule.scheduledEnd);
  const isTimeWindowActive =
    now >= schedule.scheduledStart - 10 * 60 * 1000 &&
    now <= schedule.scheduledEnd + 5 * 60 * 1000;
  return {
    scheduleId: schedule._id,
    isActive:
      isTimeWindowActive ||
      (schedule.status === "active" && now < liveHardEndsAt),
    isLive: schedule.isLive === true,
    status: schedule.status,
    start: schedule.scheduledStart,
    end: schedule.scheduledEnd,
    timeZone,
    roomName: schedule.roomName,
    canJoin: schedule.status === "active" || schedule.status === "scheduled",
    liveExtensionEndsAt: schedule.liveExtensionEndsAt,
    liveDecisionEndsAt: schedule.liveDecisionEndsAt,
    liveHardEndsAt,
  };
}

async function getEligibleSessionLeaderRole(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  classData: Doc<"classes">,
  schoolId?: Id<"schools">,
): Promise<SessionLeaderRole | null> {
  if (classData.teacherId === userId) return "teacher";

  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  if (
    assignments.some(
      (assignment) =>
        assignment.role === "superadmin" && assignment.orgType === "system",
    )
  ) {
    return "superadmin";
  }
  if (
    schoolId &&
    assignments.some(
      (assignment) =>
        assignment.role === "admin" &&
        assignment.orgType === "school" &&
        assignment.orgId === schoolId,
    )
  ) {
    return "admin";
  }
  if (
    classData.campusId &&
    assignments.some(
      (assignment) =>
        assignment.role === "admin" &&
        assignment.orgType === "campus" &&
        assignment.orgId === classData.campusId,
    )
  ) {
    return "admin";
  }
  if (
    classData.campusId &&
    assignments.some(
      (assignment) =>
        assignment.role === "principal" &&
        assignment.orgType === "campus" &&
        assignment.orgId === classData.campusId,
    )
  ) {
    return "principal";
  }
  return null;
}

async function getScheduleLeadershipContext(
  ctx: QueryCtx | MutationCtx,
  schedule: Doc<"classSchedule">,
) {
  const classData = await ctx.db.get(schedule.classId);
  if (!classData) throw new ConvexError("Class not found");
  const [curriculum, campus] = await Promise.all([
    ctx.db.get(classData.curriculumId),
    classData.campusId ? ctx.db.get(classData.campusId) : null,
  ]);
  const schoolId =
    classData.schoolId ?? campus?.schoolId ?? curriculum?.schoolId;
  return { classData, schoolId };
}

async function recordSessionLeadershipEvent(
  ctx: MutationCtx,
  args: {
    scheduleId: Id<"classSchedule">;
    eventType:
      | "started"
      | "claimed"
      | "transferred"
      | "transfer_rejected"
      | "recovered"
      | "takeover";
    actorId: Id<"users">;
    leaderId: Id<"users">;
    leaderRole: SessionLeaderRole;
    previousLeaderId?: Id<"users">;
    transferRequestedBy?: Id<"users">;
    transferTargetId?: Id<"users">;
    createdAt: number;
  },
) {
  await ctx.db.insert("classSessionLeadershipEvents", args);
}

async function assignSessionLeader(
  ctx: MutationCtx,
  schedule: Doc<"classSchedule">,
  args: {
    actorId: Id<"users">;
    leaderId: Id<"users">;
    leaderRole: SessionLeaderRole;
    eventType: "started" | "claimed" | "transferred" | "recovered" | "takeover";
    transferRequestedBy?: Id<"users">;
    transferTargetId?: Id<"users">;
    now: number;
  },
) {
  const previousLeaderId = schedule.sessionLeaderId;
  await ctx.db.patch(schedule._id, {
    sessionLeaderId: args.leaderId,
    sessionLeaderRole: args.leaderRole,
    sessionLeaderSince: args.now,
    sessionTransferToId: undefined,
    sessionTransferRequestedBy: undefined,
    sessionTransferRequestedAt: undefined,
    liveLeaderAbsentSince: undefined,
  });
  await recordSessionLeadershipEvent(ctx, {
    scheduleId: schedule._id,
    eventType: args.eventType,
    actorId: args.actorId,
    leaderId: args.leaderId,
    leaderRole: args.leaderRole,
    previousLeaderId,
    transferRequestedBy: args.transferRequestedBy,
    transferTargetId: args.transferTargetId,
    createdAt: args.now,
  });
}

async function getLiveLeadershipMutationContext(
  ctx: MutationCtx,
  roomName: string,
) {
  const user = await getCurrentUserOrThrow(ctx);
  const schedule = await ctx.db
    .query("classSchedule")
    .withIndex("by_room", (q) => q.eq("roomName", roomName))
    .first();
  if (!schedule) throw new ConvexError("Schedule not found");
  if (schedule.status !== "active" || schedule.isLive !== true) {
    throw new ConvexError("The class is not live");
  }
  const { classData, schoolId } = await getScheduleLeadershipContext(
    ctx,
    schedule,
  );
  const leaderRole = await getEligibleSessionLeaderRole(
    ctx,
    user._id,
    classData,
    schoolId,
  );
  return { user, schedule, classData, schoolId, leaderRole };
}

async function getLiveKitAccessData(
  ctx: QueryCtx,
  userId: Id<"users">,
  schedule: Doc<"classSchedule">,
  now: number,
) {
  const classData = await ctx.db.get(schedule.classId);
  if (!classData) return null;

  const [curriculum, user, campus] = await Promise.all([
    ctx.db.get(classData.curriculumId),
    ctx.db.get(userId),
    classData.campusId ? ctx.db.get(classData.campusId) : null,
  ]);
  if (!user) return null;

  const isPrimaryTeacher = classData.teacherId === userId;
  const isDirectInstructor = isPrimaryTeacher || classData.tutorId === userId;
  const classSchoolId = classData.campusId
    ? campus?.schoolId
    : curriculum?.schoolId;
  const isAuthorizedAdmin = await canManageClasses(
    ctx,
    userId,
    classData.campusId,
    classSchoolId,
  );
  const roomAdmin = isDirectInstructor || isAuthorizedAdmin;
  const { schoolId } = await getScheduleLeadershipContext(ctx, schedule);
  const leadershipRole = await getEligibleSessionLeaderRole(
    ctx,
    userId,
    classData,
    schoolId,
  );

  let authorized = roomAdmin;
  if (!authorized) {
    const studentSchoolIds = await getStudentSchoolIds(ctx, userId);
    const studentGrade = classSchoolId
      ? await getStudentGradeCode(
          ctx,
          userId,
          classSchoolId,
          classData.campusId,
        )
      : undefined;
    authorized = canStudentAccessLiveClass({
      isEnrolled: await isStudentEnrolled(ctx, classData, userId),
      liveAccess: schedule.liveAccess,
      studentGrade,
      classSchoolId,
      studentSchoolIds,
    });
  }

  return {
    authorized,
    roomAdmin,
    isPrimaryTeacher,
    isSessionLeader: schedule.sessionLeaderId === userId,
    leadershipRole,
    canJoinEarly: roomAdmin,
    computedRole: isPrimaryTeacher
      ? ("teacher" as const)
      : roomAdmin
        ? ("admin" as const)
        : ("student" as const),
    session: getSessionStatusData(
      schedule,
      (await getClassTimeZone(ctx, classData)) ?? "UTC",
      now,
    ),
  };
}

// ============================================================================
// QUERIES
// ============================================================================

export const getMySchedule = query({
  args: {
    now: v.number(),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("scheduled"),
        v.literal("active"),
        v.literal("completed"),
        v.literal("cancelled"),
      ),
    ),
    teacherId: v.optional(v.id("users")),
    schoolId: v.optional(v.id("schools")),
    campusId: v.optional(v.id("campuses")),
    classId: v.optional(v.id("classes")),
    includeAttendance: v.optional(v.boolean()),
    includeRecordings: v.optional(v.boolean()),
  },
  returns: v.array(scheduleEventValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) return [];

    const isSuperAdmin = await hasSystemRole(ctx, user._id, ["superadmin"]);

    // Resolve the requested campus efficiently, then apply class-level access.
    // Teachers and tutors only pass that check for directly assigned classes.
    const userAssignments = await ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const staffAssignments = userAssignments.filter(
      (assignment) =>
        assignment.role === "admin" ||
        assignment.role === "principal" ||
        assignment.role === "teacher" ||
        assignment.role === "tutor",
    );

    const isStaffViewer = isSuperAdmin || staffAssignments.length > 0;
    const instructorOnly =
      !isSuperAdmin &&
      hasOnlyInstructorStaffRoles(
        staffAssignments.map((assignment) => assignment.role),
      );
    const staffSchoolIds = staffAssignments.flatMap((assignment) =>
      assignment.orgType === "school" && assignment.orgId
        ? [assignment.orgId]
        : [],
    );
    const staffCampusIds = staffAssignments.flatMap((assignment) =>
      assignment.orgType === "campus" && assignment.orgId
        ? [assignment.orgId]
        : [],
    );

    let myClasses: Doc<"classes">[] = [];

    if (args.classId) {
      const classData = await ctx.db.get(args.classId);
      if (
        classData?.isActive &&
        (await canAccessClass(ctx, user._id, classData))
      ) {
        myClasses = [classData];
      }
    } else if (instructorOnly) {
      const [teachingClasses, tutoringClasses] = await Promise.all([
        ctx.db
          .query("classes")
          .withIndex("by_teacher", (q) =>
            q.eq("teacherId", user._id).eq("isActive", true),
          )
          .collect(),
        ctx.db
          .query("classes")
          .withIndex("by_tutor", (q) =>
            q.eq("tutorId", user._id).eq("isActive", true),
          )
          .collect(),
      ]);
      const requestedCampusIds = args.schoolId
        ? new Set(
            (
              await ctx.db
                .query("campuses")
                .withIndex("by_school", (q) => q.eq("schoolId", args.schoolId!))
                .collect()
            ).map((campus) => campus._id),
          )
        : null;
      myClasses = [
        ...new Map(
          [...teachingClasses, ...tutoringClasses].map((classData) => [
            classData._id,
            classData,
          ]),
        ).values(),
      ].filter(
        (classData) =>
          (!args.campusId || classData.campusId === args.campusId) &&
          (!requestedCampusIds ||
            (classData.campusId &&
              requestedCampusIds.has(classData.campusId))) &&
          (!args.teacherId || classData.teacherId === args.teacherId),
      );
    } else if (isStaffViewer) {
      if (isSuperAdmin && !args.schoolId && !args.campusId) {
        myClasses = args.teacherId
          ? await ctx.db
              .query("classes")
              .withIndex("by_teacher", (q) =>
                q.eq("teacherId", args.teacherId).eq("isActive", true),
              )
              .collect()
          : await ctx.db
              .query("classes")
              .withIndex("by_active", (q) => q.eq("isActive", true))
              .collect();
      } else {
        const requestedSchoolIds = args.campusId
          ? []
          : args.schoolId
            ? [args.schoolId]
            : staffSchoolIds
                .map((id) => ctx.db.normalizeId("schools", id))
                .filter((id): id is Id<"schools"> => id !== null);
        const schoolCampuses = (
          await Promise.all(
            requestedSchoolIds.map((schoolId) =>
              ctx.db
                .query("campuses")
                .withIndex("by_school", (q) => q.eq("schoolId", schoolId))
                .collect(),
            ),
          )
        ).flat();
        const requestedCampusIds = args.campusId
          ? [args.campusId]
          : args.schoolId
            ? schoolCampuses.map((campus) => campus._id)
            : [
                ...staffCampusIds
                  .map((id) => ctx.db.normalizeId("campuses", id))
                  .filter((id): id is Id<"campuses"> => id !== null),
                ...schoolCampuses.map((campus) => campus._id),
              ];
        const [campusClasses, schoolCurriculums] = await Promise.all([
          Promise.all(
            [...new Set(requestedCampusIds)].map((campusId) =>
              ctx.db
                .query("classes")
                .withIndex("by_campus", (q) =>
                  q.eq("campusId", campusId).eq("isActive", true),
                )
                .collect(),
            ),
          ),
          Promise.all(
            requestedSchoolIds.map((schoolId) =>
              ctx.db
                .query("curriculums")
                .withIndex("by_school", (q) => q.eq("schoolId", schoolId))
                .collect(),
            ),
          ),
        ]);
        const legacySchoolClasses = await Promise.all(
          schoolCurriculums.flat().map((curriculum) =>
            ctx.db
              .query("classes")
              .withIndex("by_curriculum", (q) =>
                q.eq("curriculumId", curriculum._id),
              )
              .collect(),
          ),
        );
        const accessible = new Map(
          [...campusClasses.flat(), ...legacySchoolClasses.flat()]
            .filter(
              (classData) =>
                classData.isActive &&
                (!args.teacherId || classData.teacherId === args.teacherId),
            )
            .map((classData) => [classData._id, classData]),
        );
        const access = await Promise.all(
          [...accessible.values()].map((classData) =>
            canAccessClass(ctx, user._id, classData),
          ),
        );
        myClasses = [...accessible.values()].filter(
          (_, index) => access[index],
        );
      }
    } else {
      const studentCampusId = await getSoleStudentCampusId(ctx, user._id);
      if (
        studentCampusId &&
        args.campusId &&
        studentCampusId !== args.campusId
      ) {
        return [];
      }
      const teachingClasses = await ctx.db
        .query("classes")
        .withIndex("by_teacher", (q) =>
          q.eq("teacherId", user._id).eq("isActive", true),
        )
        .collect();

      const enrollmentRows = await ctx.db
        .query("classEnrollments")
        .withIndex("by_student", (q) => q.eq("studentId", user._id))
        .collect();
      const enrolledClasses = (
        await Promise.all(enrollmentRows.map((row) => ctx.db.get(row.classId)))
      ).filter((classData): classData is Doc<"classes"> =>
        Boolean(classData?.isActive),
      );
      // Remove this legacy scan after backfillClassEnrollments has run in every deployment.
      const legacyClasses = (
        await ctx.db
          .query("classes")
          .withIndex("by_active", (q) => q.eq("isActive", true))
          .collect()
      ).filter(
        (classData) =>
          !classData.enrollmentsMigratedAt &&
          classData.students?.includes(user._id),
      );

      const combined = [
        ...teachingClasses,
        ...enrolledClasses,
        ...legacyClasses,
      ].filter((classData) => {
        const campusId = studentCampusId ?? args.campusId;
        return !campusId || classData.campusId === campusId;
      });
      const uniqueIds = new Set();
      myClasses = combined.filter((c) => {
        if (uniqueIds.has(c._id)) return false;
        uniqueIds.add(c._id);
        return true;
      });
    }

    if (myClasses.length === 0) return [];

    const classIds = myClasses.map((c) => c._id);
    const classMap = new Map(
      myClasses.map((classData) => [classData._id, classData]),
    );
    const includeAttendance = args.includeAttendance ?? true;
    const includeRecordings = args.includeRecordings ?? true;
    const classesNeedingRosters = includeAttendance
      ? myClasses.filter(
          (classData) =>
            isStaffViewer ||
            classData.teacherId === user._id ||
            classData.tutorId === user._id,
        )
      : [];
    const studentIdsByClass = new Map(
      await Promise.all(
        classesNeedingRosters.map(
          async (classData) =>
            [classData._id, await listClassStudentIds(ctx, classData)] as const,
        ),
      ),
    );
    const now = args.now;
    const from =
      args.from ??
      (args.classId ? undefined : now - DEFAULT_SCHEDULE_HISTORY_MS);
    const to =
      args.to ?? (args.classId ? undefined : now + DEFAULT_SCHEDULE_FUTURE_MS);
    if (from !== undefined && to !== undefined && from > to) {
      throw new ConvexError("INVALID_DATE_RANGE");
    }

    const scheduleItems = await Promise.all(
      classIds.map((id) =>
        ctx.db
          .query("classSchedule")
          .withIndex("by_class", (q) => {
            const range = q.eq("classId", id);
            if (from !== undefined && to !== undefined) {
              return range
                .gte("scheduledStart", from)
                .lte("scheduledStart", to);
            }
            if (from !== undefined) return range.gte("scheduledStart", from);
            if (to !== undefined) return range.lte("scheduledStart", to);
            return range;
          })
          .collect(),
      ),
    );

    let flatSchedule = scheduleItems.flat();

    if (args.status)
      flatSchedule = flatSchedule.filter((s) => s.status === args.status);

    const uniqueCurriculumIds = new Set(myClasses.map((c) => c.curriculumId));
    const uniqueTeacherIds = new Set(
      myClasses.map((c) => c.teacherId).filter(Boolean),
    );
    const uniqueLessonIds = new Set(
      flatSchedule.flatMap((s) => s.lessonIds || []),
    );

    const [curriculums, teachers, lessons] = await Promise.all([
      Promise.all(
        Array.from(uniqueCurriculumIds).map((id) =>
          ctx.db.get(id as Id<"curriculums">),
        ),
      ),
      Promise.all(
        Array.from(uniqueTeacherIds).map((id) => ctx.db.get(id as Id<"users">)),
      ),
      Promise.all(
        Array.from(uniqueLessonIds).map((id) =>
          ctx.db.get(id as Id<"lessons">),
        ),
      ),
    ]);

    const curriculumMap = new Map(
      curriculums.filter(Boolean).map((c) => [c!._id, c!]),
    );
    const teacherMap = new Map(
      teachers.filter(Boolean).map((t) => [t!._id, t!]),
    );
    const lessonMap = new Map(lessons.filter(Boolean).map((l) => [l!._id, l!]));

    const allSessionsForSchedules = includeAttendance
      ? await Promise.all(
          flatSchedule.map((schedule) => {
            const classData = classMap.get(schedule.classId);
            const needsFullAttendance =
              isStaffViewer ||
              classData?.teacherId === user._id ||
              classData?.tutorId === user._id;
            return needsFullAttendance
              ? ctx.db
                  .query("class_sessions")
                  .withIndex("by_schedule", (q) =>
                    q.eq("scheduleId", schedule._id),
                  )
                  .collect()
              : ctx.db
                  .query("class_sessions")
                  .withIndex("by_student_schedule", (q) =>
                    q.eq("studentId", user._id).eq("scheduleId", schedule._id),
                  )
                  .collect();
          }),
        )
      : flatSchedule.map(() => []);

    const sessionsBySchedule = new Map(
      flatSchedule.map((s, idx) => [s._id, allSessionsForSchedules[idx] || []]),
    );
    const allAttendanceRecords = includeAttendance
      ? await Promise.all(
          flatSchedule.map((schedule) => {
            const classData = classMap.get(schedule.classId);
            const needsFullAttendance =
              isStaffViewer ||
              classData?.teacherId === user._id ||
              classData?.tutorId === user._id;
            return needsFullAttendance
              ? ctx.db
                  .query("studentAttendanceRecords")
                  .withIndex("by_schedule", (q) =>
                    q.eq("scheduleId", schedule._id),
                  )
                  .collect()
              : ctx.db
                  .query("studentAttendanceRecords")
                  .withIndex("by_schedule_and_student", (q) =>
                    q.eq("scheduleId", schedule._id).eq("studentId", user._id),
                  )
                  .collect();
          }),
        )
      : flatSchedule.map(() => []);
    const attendanceRecordsBySchedule = new Map(
      flatSchedule.map((schedule, index) => [
        schedule._id,
        allAttendanceRecords[index] ?? [],
      ]),
    );

    const completedRecordings = includeRecordings
      ? await Promise.all(
          flatSchedule.map(async (schedule) => {
            if (isExternalClassSession(schedule.sessionType)) return [];
            return await ctx.db
              .query("recordings")
              .withIndex("by_schedule", (q) =>
                q.eq("scheduleId", schedule._id).eq("status", "complete"),
              )
              .collect();
          }),
        )
      : [];
    const scheduleIdsWithRecordings = new Set(
      flatSchedule
        .filter((_, index) =>
          completedRecordings[index]?.some((recording) =>
            Boolean(recording.url),
          ),
        )
        .map((schedule) => schedule._id),
    );

    const results = await Promise.all(
      flatSchedule.map(async (item) => {
        const classData = classMap.get(item.classId);
        if (!classData) return null;

        const curriculum = curriculumMap.get(classData.curriculumId);
        const teacher = classData.teacherId
          ? teacherMap.get(classData.teacherId)
          : undefined;
        // ponytail: UTC only protects legacy rows until their institution confirms a zone.
        const timeZone = (await getClassTimeZone(ctx, classData)) ?? "UTC";

        const isClassAdminOrTeacher =
          includeAttendance &&
          (isStaffViewer ||
            classData.teacherId === user._id ||
            classData.tutorId === user._id);
        const classStudents = studentIdsByClass.get(classData._id) ?? [];

        const scheduledLessons = (item.lessonIds || [])
          .map((id) => lessonMap.get(id))
          .filter(Boolean);
        const title =
          item.title || scheduledLessons[0]?.title || "Class Session";
        const description =
          item.description || scheduledLessons[0]?.description || "";

        let recurrenceRule = item.recurrenceRule;
        if (item.recurrenceParentId && !recurrenceRule) {
          const parent = await ctx.db.get(item.recurrenceParentId);
          recurrenceRule = parent?.recurrenceRule;
        }

        const sessions = sessionsBySchedule.get(item._id) || [];

        let attendanceStatus:
          | "upcoming"
          | "present"
          | "absent"
          | "partial"
          | "in-progress"
          | "late"
          | "pending"
          | "excused" = "upcoming";
        let timeInClass = 0;
        let isStudentActive = false;

        const attendanceSummary = {
          present: 0,
          partial: 0,
          absent: 0,
          excused: 0,
          pendingVerification: 0,
          verifiedTotal: 0,
          total: classStudents.length,
        };
        // Student Stats Calculation
        if (!isClassAdminOrTeacher) {
          const studentSessions = sessions.filter(
            (s) => s.studentId === user._id,
          );
          const activeSession = studentSessions.find(
            (s) => s.joinedAt && !s.leftAt,
          );
          // Student is only "in class" if the schedule hasn't ended yet and the session isn't stale
          isStudentActive =
            !!activeSession &&
            now <= item.scheduledEnd &&
            now - (activeSession?.joinedAt ?? 0) < SESSION_STALE_MS;

          timeInClass = getConnectedSecondsWithinSchedule(
            studentSessions,
            item.scheduledStart,
            item.scheduledEnd,
            now,
          );
          const finalAttendance = attendanceRecordsBySchedule
            .get(item._id)
            ?.find((record) => record.studentId === user._id);
          if (item.sessionClosureStatus === "completed" && finalAttendance) {
            attendanceStatus = finalAttendance.status;
          } else if (item.scheduledStart > now) attendanceStatus = "upcoming";
          else if (item.status === "active")
            attendanceStatus = isStudentActive ? "in-progress" : "late";
          else if (item.status === "completed") attendanceStatus = "pending";
        }

        // Teacher/Admin Stats Calculation
        if (isClassAdminOrTeacher) {
          const finalAttendance =
            attendanceRecordsBySchedule.get(item._id) ?? [];
          if (
            item.status === "completed" &&
            item.sessionClosureStatus === "completed"
          ) {
            const enrolledStudentIds = new Set(classStudents);
            for (const record of finalAttendance) {
              if (!enrolledStudentIds.has(record.studentId)) continue;
              attendanceSummary[record.status]++;
              attendanceSummary.verifiedTotal++;
            }
            attendanceSummary.pendingVerification = Math.max(
              0,
              classStudents.length - attendanceSummary.verifiedTotal,
            );
          } else if (item.status === "completed") {
            attendanceSummary.pendingVerification = classStudents.length;
          }
        }

        const effectiveIsLive =
          item.isLive === true && item.status === "active";
        const effectiveStatus = item.status;

        let teacherAttendanceStatus = "upcoming";
        let teacherTimeInClass = 0;

        if (isClassAdminOrTeacher) {
          const teacherSessions = sessions.filter(
            (s) => s.studentId === classData.teacherId,
          );
          if (teacherSessions.length > 0) {
            teacherTimeInClass = teacherSessions.reduce((sum, s) => {
              const sessionStart = s.joinedAt;
              const sessionEnd = s.leftAt || now;
              const effectiveStart = Math.max(
                sessionStart,
                item.scheduledStart,
              );
              const effectiveEnd = Math.min(sessionEnd, item.scheduledEnd);
              const duration = Math.max(
                0,
                (effectiveEnd - effectiveStart) / 1000,
              );
              return sum + duration;
            }, 0);

            const scheduledDuration =
              (item.scheduledEnd - item.scheduledStart) / 1000;
            const ratio =
              scheduledDuration > 0
                ? teacherTimeInClass / scheduledDuration
                : 0;

            if (ratio >= LIVE_PRESENCE_PRESENT_RATIO)
              teacherAttendanceStatus = "present";
            else if (
              ratio >= LIVE_PRESENCE_PARTIAL_RATIO ||
              teacherTimeInClass >= LIVE_PRESENCE_MIN_PARTIAL_SECONDS
            )
              teacherAttendanceStatus = "partial";
            else teacherAttendanceStatus = "absent";
          } else if (item.scheduledEnd < now) {
            if (effectiveStatus === "completed")
              teacherAttendanceStatus = "present";
            else if (effectiveStatus === "cancelled")
              teacherAttendanceStatus = "excused";
            else teacherAttendanceStatus = "absent";
          }
        }

        return {
          scheduleId: item._id,
          title,
          description,
          className: classData.name,
          curriculumTitle: curriculum?.title || "Unknown",
          color: curriculum?.color || "#3b82f6",
          start: item.scheduledStart,
          end: item.scheduledEnd,
          timeZone,
          roomName: item.roomName,
          isLive: effectiveIsLive,
          sessionType: item.sessionType || "live",
          status: effectiveStatus,
          lessonIds: item.lessonIds || [],
          lessons: scheduledLessons.map((l) => ({
            _id: l!._id,
            title: l!.title,
            order: l!.order,
          })),
          classId: classData._id,
          curriculumId: classData.curriculumId,
          teacherId: classData.teacherId,
          gradeCode: classData.gradeCode,
          isRecurring: item.isRecurring || false,
          recurrenceRule: recurrenceRule,
          recurrenceParentId: item.recurrenceParentId,
          cancellationReason: item.cancellationReason,
          teacherName: teacher?.fullName,
          teacherImageUrl: teacher?.imageUrl,
          teacherAttendance: isClassAdminOrTeacher
            ? {
                status: teacherAttendanceStatus,
                minutes: Math.round(teacherTimeInClass / 60),
              }
            : undefined,
          attendance: attendanceStatus,
          minutesAttended: Math.round(timeInClass / 60),
          isStudentActive: isStudentActive,
          attendanceSummary: isClassAdminOrTeacher
            ? item.status === "completed"
              ? attendanceSummary
              : undefined
            : undefined,
          hasRecording: scheduleIdsWithRecordings.has(item._id),
        };
      }),
    );

    return results
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.start - b.start);
  },
});

export const listAccessibleLiveClasses = query({
  args: {},
  returns: v.array(
    v.object({
      scheduleId: v.id("classSchedule"),
      title: v.string(),
      description: v.optional(v.string()),
      className: v.string(),
      start: v.number(),
      end: v.number(),
      timeZone: v.string(),
      roomName: v.string(),
      isLive: v.boolean(),
      color: v.string(),
      status: v.literal("active"),
      sessionType: v.literal("live"),
      attendance: v.literal("upcoming"),
      minutesAttended: v.literal(0),
      isStudentActive: v.literal(false),
    }),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) return [];
    const [studentSchoolIds, studentCampusId] = await Promise.all([
      getStudentSchoolIds(ctx, user._id),
      getSoleStudentCampusId(ctx, user._id),
    ]);
    if (studentSchoolIds.size === 0) return [];

    const scheduleGroups = await Promise.all([
      ...[...studentSchoolIds].map((schoolId) =>
        ctx.db
          .query("classSchedule")
          .withIndex("by_school_and_status_and_scheduled_start", (q) =>
            q.eq("schoolId", schoolId).eq("status", "active"),
          )
          .collect(),
      ),
      // Legacy active sessions are a bounded transition path. Starting any
      // legacy session below writes its schoolId, so this set naturally drains.
      ctx.db
        .query("classSchedule")
        .withIndex("by_school_and_status_and_scheduled_start", (q) =>
          q.eq("schoolId", undefined).eq("status", "active"),
        )
        .collect(),
    ]);
    const schedules = [
      ...new Map(
        scheduleGroups.flat().map((schedule) => [schedule._id, schedule]),
      ).values(),
    ];

    const liveSchedules = schedules.filter(
      (schedule) => schedule.isLive === true && schedule.sessionType === "live",
    );
    const results = await Promise.all(
      liveSchedules.map(async (schedule) => {
        const classData = await ctx.db.get(schedule.classId);
        if (!classData) return null;
        if (studentCampusId && classData.campusId !== studentCampusId) {
          return null;
        }

        const [curriculum, campus] = await Promise.all([
          ctx.db.get(classData.curriculumId),
          classData.campusId ? ctx.db.get(classData.campusId) : null,
        ]);
        const classSchoolId = classData.campusId
          ? campus?.schoolId
          : curriculum?.schoolId;
        const timeZone = (await getClassTimeZone(ctx, classData)) ?? "UTC";
        const studentGrade = classSchoolId
          ? await getStudentGradeCode(
              ctx,
              user._id,
              classSchoolId,
              classData.campusId,
            )
          : undefined;
        const authorized = canStudentAccessLiveClass({
          isEnrolled: await isStudentEnrolled(ctx, classData, user._id),
          liveAccess: schedule.liveAccess,
          studentGrade,
          classSchoolId,
          studentSchoolIds,
        });
        if (!authorized) return null;

        return {
          scheduleId: schedule._id,
          title: schedule.title || classData.name,
          ...(schedule.description !== undefined && {
            description: schedule.description,
          }),
          className: classData.name,
          start: schedule.scheduledStart,
          end: schedule.scheduledEnd,
          timeZone,
          roomName: schedule.roomName,
          isLive: true as const,
          color: curriculum?.color || "#3b82f6",
          status: "active" as const,
          sessionType: "live" as const,
          attendance: "upcoming" as const,
          minutesAttended: 0 as const,
          isStudentActive: false as const,
        };
      }),
    );

    return results
      .filter((result): result is NonNullable<typeof result> => result !== null)
      .sort((a, b) => a.start - b.start);
  },
});

export const get = query({
  args: { id: v.id("classSchedule") },
  returns: v.union(scheduleValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const schedule = await ctx.db.get(args.id);
    if (!schedule) return null;
    if (!(await canAccessSchedule(ctx, user._id, schedule))) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    return schedule;
  },
});

export const getWithDetails = query({
  args: { id: v.id("classSchedule") },
  returns: v.union(
    v.null(),
    v.object({
      ...scheduleFields,
      lessons: v.array(
        v.object({
          _id: v.id("lessons"),
          title: v.string(),
          description: v.optional(v.string()),
          content: v.optional(v.string()),
          order: v.number(),
        }),
      ),
      class: v.object({
        _id: v.id("classes"),
        name: v.string(),
        curriculumIconKey: curriculumIconValidator,
      }),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const schedule = await ctx.db.get(args.id);
    if (!schedule) return null;
    if (!(await canAccessSchedule(ctx, user._id, schedule))) {
      throw new ConvexError("PERMISSION_DENIED");
    }

    const classData = await ctx.db.get(schedule.classId);
    if (!classData) return null;

    const [lessons, curriculum] = await Promise.all([
      schedule.lessonIds && schedule.lessonIds.length > 0
        ? Promise.all(schedule.lessonIds.map((id) => ctx.db.get(id)))
        : Promise.resolve([]),
      ctx.db.get("curriculums", classData.curriculumId),
    ]);
    const validLessons = lessons.filter(Boolean);

    return {
      ...schedule,
      lessons: validLessons.map((l) => ({
        _id: l!._id,
        title: l!.title,
        description: l!.description,
        content: l!.content,
        order: l!.order,
      })),
      class: {
        _id: classData._id,
        name: classData.name,
        curriculumIconKey: curriculum?.iconKey ?? DEFAULT_CURRICULUM_ICON,
      },
    };
  },
});

export const getByRoomName = query({
  args: { roomName: v.string() },
  returns: v.union(scheduleValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const schedule = await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", args.roomName))
      .first();
    if (!schedule) return null;
    if (!(await canAccessSchedule(ctx, user._id, schedule))) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    return schedule;
  },
});

export const getSessionStatus = query({
  args: { sessionId: v.string(), now: v.number() },
  returns: v.union(viewerSessionStatusValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    let schedule = await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", args.sessionId))
      .first();

    if (!schedule) {
      const scheduleId = ctx.db.normalizeId("classSchedule", args.sessionId);
      schedule = scheduleId ? await ctx.db.get(scheduleId) : null;
    }

    if (!schedule) return null;
    const access = await getLiveKitAccessData(
      ctx,
      user._id,
      schedule,
      args.now,
    );
    if (!access?.authorized) {
      throw new ConvexError("PERMISSION_DENIED");
    }

    return {
      ...access.session,
      roomAdmin: access.roomAdmin,
      isPrimaryTeacher: access.isPrimaryTeacher,
      isSessionLeader: access.isSessionLeader,
      leadershipRole: access.leadershipRole,
    };
  },
});

export const getSessionLeadership = query({
  args: { roomName: v.string(), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      scheduleId: v.id("classSchedule"),
      closureStatus: v.optional(sessionClosureStatusValidator),
      leader: v.union(
        v.null(),
        v.object({
          userId: v.id("users"),
          participantIdentity: v.string(),
          fullName: v.string(),
          imageUrl: v.optional(v.string()),
          role: sessionLeaderRoleValidator,
          since: v.number(),
        }),
      ),
      pendingTransfer: v.union(
        v.null(),
        v.object({
          targetUserId: v.id("users"),
          targetName: v.string(),
          requestedByName: v.string(),
          requestedAt: v.number(),
        }),
      ),
      latestTransferOutcome: v.union(
        v.null(),
        v.object({
          eventId: v.id("classSessionLeadershipEvents"),
          status: v.union(v.literal("accepted"), v.literal("rejected")),
          responderName: v.string(),
          respondedAt: v.number(),
        }),
      ),
      viewer: v.object({
        userId: v.id("users"),
        isLeader: v.boolean(),
        isPrimaryTeacher: v.boolean(),
        canClaim: v.boolean(),
        canRecover: v.boolean(),
        canTransfer: v.boolean(),
        canAcceptTransfer: v.boolean(),
        canTakeover: v.boolean(),
      }),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const schedule = await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", args.roomName))
      .first();
    if (!schedule) return null;

    const access = await getLiveKitAccessData(
      ctx,
      user._id,
      schedule,
      args.now,
    );
    if (!access?.authorized) throw new ConvexError("PERMISSION_DENIED");

    const { classData, schoolId } = await getScheduleLeadershipContext(
      ctx,
      schedule,
    );
    const viewerRole = await getEligibleSessionLeaderRole(
      ctx,
      user._id,
      classData,
      schoolId,
    );
    const recentLeadershipEvents = await ctx.db
      .query("classSessionLeadershipEvents")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
      .order("desc")
      .take(10);
    const latestTransferOutcomeEvent = recentLeadershipEvents.find(
      (event) =>
        event.transferRequestedBy === user._id &&
        (event.eventType === "transferred" ||
          event.eventType === "transfer_rejected") &&
        event.createdAt >= args.now - 2 * 60_000,
    );
    const [leaderUser, transferTarget, transferRequester, transferResponder] =
      await Promise.all([
        schedule.sessionLeaderId
          ? ctx.db.get("users", schedule.sessionLeaderId)
          : null,
        schedule.sessionTransferToId
          ? ctx.db.get("users", schedule.sessionTransferToId)
          : null,
        schedule.sessionTransferRequestedBy
          ? ctx.db.get("users", schedule.sessionTransferRequestedBy)
          : null,
        latestTransferOutcomeEvent?.transferTargetId
          ? ctx.db.get("users", latestTransferOutcomeEvent.transferTargetId)
          : null,
      ]);
    const isLeader = schedule.sessionLeaderId === user._id;
    const isPrimaryTeacher = classData.teacherId === user._id;
    const isLiveSession =
      schedule.status === "active" && schedule.isLive === true;
    const leaderAbsentLongEnough =
      schedule.liveLeaderAbsentSince !== undefined &&
      args.now >= schedule.liveLeaderAbsentSince + STUDENT_ONLY_GRACE_MS;

    return {
      scheduleId: schedule._id,
      closureStatus: schedule.sessionClosureStatus,
      leader:
        leaderUser && schedule.sessionLeaderRole && schedule.sessionLeaderSince
          ? {
              userId: leaderUser._id,
              participantIdentity: leaderUser.clerkId,
              fullName: leaderUser.fullName,
              imageUrl: leaderUser.imageUrl,
              role: schedule.sessionLeaderRole,
              since: schedule.sessionLeaderSince,
            }
          : null,
      pendingTransfer:
        transferTarget &&
        transferRequester &&
        schedule.sessionTransferRequestedAt
          ? {
              targetUserId: transferTarget._id,
              targetName: transferTarget.fullName,
              requestedByName: transferRequester.fullName,
              requestedAt: schedule.sessionTransferRequestedAt,
            }
          : null,
      latestTransferOutcome:
        latestTransferOutcomeEvent && transferResponder
          ? {
              eventId: latestTransferOutcomeEvent._id,
              status:
                latestTransferOutcomeEvent.eventType === "transferred"
                  ? ("accepted" as const)
                  : ("rejected" as const),
              responderName: transferResponder.fullName,
              respondedAt: latestTransferOutcomeEvent.createdAt,
            }
          : null,
      viewer: {
        userId: user._id,
        isLeader,
        isPrimaryTeacher,
        canClaim: Boolean(
          viewerRole && isLiveSession && !schedule.sessionLeaderId,
        ),
        canRecover: Boolean(
          isPrimaryTeacher &&
            isLiveSession &&
            schedule.sessionLeaderId &&
            !isLeader,
        ),
        canTransfer: Boolean(isLeader && isLiveSession),
        canAcceptTransfer:
          isLiveSession && schedule.sessionTransferToId === user._id,
        canTakeover: Boolean(
          viewerRole && isLiveSession && !isLeader && leaderAbsentLongEnough,
        ),
      },
    };
  },
});

async function canCloseClassSession(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  schedule: Doc<"classSchedule">,
) {
  if (schedule.sessionClosureStatus === "completed") return false;
  if (schedule.status === "active" && schedule.isLive === true) {
    return schedule.sessionLeaderId === userId;
  }
  const { classData, schoolId } = await getScheduleLeadershipContext(
    ctx,
    schedule,
  );
  return Boolean(
    schedule.sessionLeaderId === userId ||
      (await getEligibleSessionLeaderRole(ctx, userId, classData, schoolId)),
  );
}

export const getSessionClosureContext = query({
  args: { roomName: v.string(), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      scheduleId: v.id("classSchedule"),
      className: v.string(),
      canClose: v.boolean(),
      closureStatus: v.optional(sessionClosureStatusValidator),
      lessons: v.array(
        v.object({
          lessonId: v.id("lessons"),
          title: v.string(),
          order: v.number(),
          selected: v.boolean(),
        }),
      ),
      attendance: v.array(
        v.object({
          studentId: v.id("users"),
          fullName: v.string(),
          imageUrl: v.optional(v.string()),
          totalMinutes: v.number(),
          status: attendanceStatusValidator,
          suggestedStatus: v.union(
            v.literal("present"),
            v.literal("partial"),
            v.literal("absent"),
          ),
          excuseReason: v.optional(v.string()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const schedule = await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", args.roomName))
      .first();
    if (!schedule) return null;
    const classData = await ctx.db.get(schedule.classId);
    if (!classData) return null;
    const access = await getLiveKitAccessData(
      ctx,
      user._id,
      schedule,
      args.now,
    );
    if (!access?.authorized) throw new ConvexError("PERMISSION_DENIED");

    const [lessons, attendance, report] = await Promise.all([
      ctx.db
        .query("lessons")
        .withIndex("by_curriculum_active", (q) =>
          q.eq("curriculumId", classData.curriculumId).eq("isActive", true),
        )
        .collect(),
      getAttendanceDetailsData(ctx, schedule, classData, args.now),
      ctx.db
        .query("classSessionReports")
        .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
        .first(),
    ]);
    const reportLessons = report
      ? await ctx.db
          .query("classSessionReportLessons")
          .withIndex("by_report", (q) => q.eq("reportId", report._id))
          .collect()
      : [];
    const selectedLessonIds = new Set(
      reportLessons.map(({ lessonId }) => lessonId),
    );

    return {
      scheduleId: schedule._id,
      className: classData.name,
      canClose: await canCloseClassSession(ctx, user._id, schedule),
      closureStatus: schedule.sessionClosureStatus,
      lessons: lessons.map((lesson) => ({
        lessonId: lesson._id,
        title: lesson.title,
        order: lesson.order,
        selected: selectedLessonIds.has(lesson._id),
      })),
      attendance: attendance.map((student) => ({
        studentId: student.studentId,
        fullName: student.fullName,
        imageUrl: student.imageUrl,
        totalMinutes: student.totalMinutes,
        status: student.status as StudentAttendanceStatus,
        suggestedStatus: student.suggestedStatus,
        excuseReason: student.excuseReason,
      })),
    };
  },
});

export const getLiveExtensionContext = query({
  args: { roomName: v.string(), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      effectiveEnd: v.number(),
      proposedEnd: v.number(),
      warningStartsAt: v.number(),
      decisionEndsAt: v.optional(v.number()),
      hardEndsAt: v.number(),
      staffConflict: v.optional(
        v.object({ className: v.string(), startsAt: v.number() }),
      ),
      affectedStudentCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const schedule = await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", args.roomName))
      .first();
    if (!schedule || schedule.status !== "active" || !schedule.isLive) {
      return null;
    }

    const access = await getLiveKitAccessData(
      ctx,
      user._id,
      schedule,
      args.now,
    );
    if (!access?.authorized || !access.isSessionLeader) return null;

    const effectiveEnd = getEffectiveLiveEnd(
      schedule.scheduledEnd,
      schedule.liveExtensionEndsAt,
    );
    const hardEndsAt = getLiveSessionHardEnd(schedule.scheduledEnd);
    const proposedEnd = getConfirmedExtensionEnd(
      effectiveEnd,
      schedule.scheduledEnd,
    );
    const shouldCalculateConflicts =
      args.now >= effectiveEnd - LIVE_EXTENSION_PROMPT_LEAD_MS &&
      effectiveEnd < hardEndsAt;
    const conflicts = shouldCalculateConflicts
      ? await getExtensionConflicts(
          ctx,
          schedule,
          user._id,
          effectiveEnd,
          proposedEnd,
        )
      : { staffConflict: undefined, affectedStudentCount: 0 };

    return {
      effectiveEnd,
      proposedEnd,
      warningStartsAt: effectiveEnd - LIVE_EXTENSION_PROMPT_LEAD_MS,
      decisionEndsAt: schedule.liveDecisionEndsAt,
      hardEndsAt,
      ...conflicts,
    };
  },
});

export const getStudentExtensionContext = query({
  args: { roomName: v.string(), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      effectiveEnd: v.number(),
      warningStartsAt: v.number(),
      extensionEndsAt: v.optional(v.number()),
      nextClass: v.optional(
        v.object({
          scheduleId: v.id("classSchedule"),
          className: v.string(),
          roomName: v.string(),
          startsAt: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const schedule = await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", args.roomName))
      .first();
    if (!schedule || schedule.status !== "active" || !schedule.isLive) {
      return null;
    }

    const access = await getLiveKitAccessData(
      ctx,
      user._id,
      schedule,
      args.now,
    );
    if (!access?.authorized || access.roomAdmin) return null;

    const effectiveEnd = getEffectiveLiveEnd(
      schedule.scheduledEnd,
      schedule.liveExtensionEndsAt,
    );
    if (
      !schedule.liveExtensionEndsAt ||
      schedule.liveExtensionEndsAt <= args.now
    ) {
      return {
        effectiveEnd,
        warningStartsAt: effectiveEnd - LIVE_EXTENSION_PROMPT_LEAD_MS,
        extensionEndsAt: schedule.liveExtensionEndsAt,
      };
    }

    const candidates = (
      await listSchedulesStartingBetween(
        ctx,
        schedule.scheduledEnd,
        schedule.liveExtensionEndsAt,
      )
    )
      .filter(
        (candidate) =>
          candidate._id !== schedule._id && candidate.scheduledEnd > args.now,
      )
      .sort((a, b) => a.scheduledStart - b.scheduledStart);

    let nextClass:
      | {
          scheduleId: Id<"classSchedule">;
          className: string;
          roomName: string;
          startsAt: number;
        }
      | undefined;
    for (const candidate of candidates) {
      const classData = await ctx.db.get(candidate.classId);
      if (!classData || !(await isStudentEnrolled(ctx, classData, user._id))) {
        continue;
      }
      nextClass = {
        scheduleId: candidate._id,
        className: classData.name,
        roomName: candidate.roomName,
        startsAt: candidate.scheduledStart,
      };
      break;
    }

    return {
      effectiveEnd,
      warningStartsAt: effectiveEnd - LIVE_EXTENSION_PROMPT_LEAD_MS,
      extensionEndsAt: schedule.liveExtensionEndsAt,
      nextClass,
    };
  },
});

export const checkLiveKitAccess = internalQuery({
  args: {
    userId: v.id("users"),
    roomName: v.string(),
    now: v.number(),
  },
  returns: v.union(
    v.object({
      authorized: v.boolean(),
      roomAdmin: v.boolean(),
      isPrimaryTeacher: v.boolean(),
      isSessionLeader: v.boolean(),
      leadershipRole: v.union(sessionLeaderRoleValidator, v.null()),
      canJoinEarly: v.boolean(),
      computedRole: v.union(
        v.literal("teacher"),
        v.literal("admin"),
        v.literal("student"),
      ),
      session: sessionStatusValidator,
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const schedule = await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", args.roomName))
      .first();

    if (!schedule) return null;
    return await getLiveKitAccessData(ctx, args.userId, schedule, args.now);
  },
});

export const getUsedLessons = query({
  args: { classId: v.id("classes") },
  returns: v.array(v.id("lessons")),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const classData = await ctx.db.get(args.classId);
    if (!classData) return [];
    if (!(await canAccessClass(ctx, user._id, classData))) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    const schedules = await ctx.db
      .query("classSchedule")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .collect();
    const usedLessons = new Set<Id<"lessons">>();
    schedules.forEach((s) => {
      if (s.lessonIds) s.lessonIds.forEach((id) => usedLessons.add(id));
    });
    return Array.from(usedLessons);
  },
});

async function getAttendanceDetailsData(
  ctx: QueryCtx | MutationCtx,
  schedule: Doc<"classSchedule">,
  classData: Doc<"classes">,
  now: number,
) {
  const studentIds = await listClassStudentIds(ctx, classData);
  const students = await Promise.all(studentIds.map((id) => ctx.db.get(id)));
  const sessions = await ctx.db
    .query("class_sessions")
    .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
    .collect();
  const attendanceRecords = await ctx.db
    .query("studentAttendanceRecords")
    .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
    .collect();
  const recordsByStudent = new Map(
    attendanceRecords.map((record) => [record.studentId, record]),
  );

  return students
    .filter((student): student is Doc<"users"> => student !== null)
    .map((student) => {
      const studentSessions = sessions.filter(
        (session) => session.studentId === student._id,
      );
      const totalSeconds = getConnectedSecondsWithinSchedule(
        studentSessions,
        schedule.scheduledStart,
        schedule.scheduledEnd,
        now,
      );
      const scheduledDuration =
        (schedule.scheduledEnd - schedule.scheduledStart) / 1000;
      const suggestedStatus = suggestStudentAttendanceStatus(
        totalSeconds,
        scheduledDuration,
      );
      const attendanceRecord = recordsByStudent.get(student._id);

      return {
        studentId: student._id,
        fullName: student.fullName,
        email: student.email,
        imageUrl: student.imageUrl,
        totalMinutes: Math.round(totalSeconds / 60),
        status: attendanceRecord?.status ?? suggestedStatus,
        suggestedStatus,
        isConfirmed: Boolean(attendanceRecord),
        excuseReason: attendanceRecord?.excuseReason,
        lastSeen:
          studentSessions.length > 0
            ? Math.max(...studentSessions.map((session) => session.joinedAt))
            : null,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export const getAttendanceDetails = query({
  args: { scheduleId: v.id("classSchedule"), now: v.number() },
  returns: v.array(
    v.object({
      studentId: v.id("users"),
      fullName: v.string(),
      email: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      totalMinutes: v.number(),
      status: v.string(),
      suggestedStatus: v.union(
        v.literal("present"),
        v.literal("partial"),
        v.literal("absent"),
      ),
      isConfirmed: v.boolean(),
      excuseReason: v.optional(v.string()),
      lastSeen: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) throw new Error("Schedule not found");

    const classData = await ctx.db.get(schedule.classId);
    if (!classData) throw new Error("Class not found");
    const curriculum = await ctx.db.get(classData.curriculumId);

    const isClassTeacher = classData.teacherId === user._id;
    const isAuthorizedAdmin = await canManageClasses(
      ctx,
      user._id,
      classData.campusId,
      curriculum?.schoolId,
    );

    if (!isClassTeacher && !isAuthorizedAdmin) throw new Error("Unauthorized");

    return await getAttendanceDetailsData(ctx, schedule, classData, args.now);
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const updateSchedule = mutation({
  args: {
    id: v.id("classSchedule"),
    lessonIds: v.optional(v.array(v.id("lessons"))),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    localStart: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("scheduled"),
        v.literal("active"),
        v.literal("completed"),
        v.literal("cancelled"),
      ),
    ),
    sessionType: v.optional(
      v.union(v.literal("live"), v.literal("ignitia"), v.literal("abeka")),
    ),
    updateSeries: v.optional(v.boolean()),
  },
  returns: v.object({
    updated: v.number(),
    type: v.union(v.literal("series"), v.literal("single")),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const schedule = await ctx.db.get(args.id);
    if (!schedule) throw new Error("Schedule not found");
    const classData = await ctx.db.get(schedule.classId);
    if (!classData) throw new Error("Class not found");
    const curriculum = await ctx.db.get(classData.curriculumId);

    const isAuthorizedAdmin = await canManageClasses(
      ctx,
      user._id,
      classData.campusId,
      curriculum?.schoolId,
    );

    if (!isAuthorizedAdmin) {
      throw new ConvexError("PERMISSION_DENIED");
    }

    if (args.updateSeries && args.lessonIds && args.lessonIds.length > 0) {
      throw new Error(
        "Cannot add lessons when updating entire series. Edit individual occurrences instead.",
      );
    }

    if (args.lessonIds && args.lessonIds.length > 0 && !args.updateSeries) {
      const usedLessons = await ctx.db
        .query("classSchedule")
        .withIndex("by_class", (q) => q.eq("classId", schedule.classId))
        .collect();
      const allUsedLessonIds = new Set<string>();
      usedLessons.forEach((s) => {
        if (s._id !== args.id && s.lessonIds)
          s.lessonIds.forEach((id) => allUsedLessonIds.add(id));
      });

      for (const lessonId of args.lessonIds) {
        if (allUsedLessonIds.has(lessonId))
          throw new ConvexError({
            code: "LESSON_ALREADY_SCHEDULED",
            lessonId: lessonId,
          });
        const lesson = await ctx.db.get(lessonId);
        if (!lesson) throw new Error("Lesson not found");
        if (lesson.curriculumId !== classData.curriculumId)
          throw new Error("Lesson does not belong to this class's curriculum");
      }
    }

    const oldStart = schedule.scheduledStart;
    const oldEnd = schedule.scheduledEnd;
    if (
      (args.localStart === undefined) !==
      (args.durationMinutes === undefined)
    ) {
      throw new ConvexError("INVALID_LOCAL_DATE_TIME");
    }
    if (
      args.durationMinutes !== undefined &&
      (!Number.isInteger(args.durationMinutes) ||
        args.durationMinutes < 15 ||
        args.durationMinutes > 8 * 60)
    ) {
      throw new ConvexError("INVALID_SCHEDULE_DURATION");
    }
    const timeZone = await getClassTimeZone(ctx, classData);
    if (!timeZone || !isValidTimeZone(timeZone)) {
      throw new ConvexError("TIME_ZONE_REQUIRED");
    }
    let newStart = oldStart;
    if (args.localStart !== undefined) {
      try {
        newStart = localDateTimeToUtc(args.localStart, timeZone);
      } catch {
        throw new ConvexError("INVALID_LOCAL_DATE_TIME");
      }
    }
    const newDuration =
      args.durationMinutes !== undefined
        ? args.durationMinutes * 60 * 1000
        : oldEnd - oldStart;
    const newEnd = newStart + newDuration;

    if (args.localStart !== undefined) {
      await validateClassScheduleTime(
        ctx,
        classData,
        args.localStart,
        newDuration / 60_000,
      );
      await validateScheduleOverlap(ctx, {
        teacherId: classData.teacherId,
        classId: classData._id,
        start: newStart,
        end: newEnd,
        excludeScheduleId: args.id,
      });
    }

    const metadataUpdates: Partial<Doc<"classSchedule">> = {};
    if (args.title !== undefined) metadataUpdates.title = args.title;
    if (args.sessionType !== undefined)
      metadataUpdates.sessionType = args.sessionType;
    if (args.description !== undefined)
      metadataUpdates.description = args.description;
    if (args.lessonIds !== undefined)
      metadataUpdates.lessonIds = args.lessonIds;
    if (args.status) {
      metadataUpdates.status = args.status;
      if (args.status === "completed" && !schedule.completedAt)
        metadataUpdates.completedAt = Date.now();
    }

    if (
      args.updateSeries &&
      (schedule.isRecurring || schedule.recurrenceParentId)
    ) {
      const masterId = schedule.recurrenceParentId || schedule._id;
      const itemsToUpdate = [];
      const parent = await ctx.db.get(masterId);
      if (parent) itemsToUpdate.push(parent);

      const children = await ctx.db
        .query("classSchedule")
        .withIndex("by_recurrence_parent", (q) =>
          q.eq("recurrenceParentId", masterId),
        )
        .collect();
      itemsToUpdate.push(...children);

      const uniqueItems = Array.from(
        new Map(itemsToUpdate.map((item) => [item._id, item])).values(),
      );
      const oldLocalStart = utcToLocalDateTime(oldStart, timeZone);
      const newLocalStart = args.localStart ?? oldLocalStart;
      const dayShift =
        civilDayNumber(newLocalStart.slice(0, 10)) -
        civilDayNumber(oldLocalStart.slice(0, 10));
      const newHour = Number(newLocalStart.slice(11, 13));
      const newMinute = Number(newLocalStart.slice(14, 16));

      const futureItems = uniqueItems.filter(
        (candidate) => candidate.scheduledStart >= oldStart,
      );
      for (const item of futureItems) {
        const updatePatch: Partial<Doc<"classSchedule">> = {
          ...metadataUpdates,
        };
        let itemNewStart = item.scheduledStart;
        try {
          itemNewStart = shiftZonedDateTime(
            item.scheduledStart,
            timeZone,
            dayShift,
            newHour,
            newMinute,
          );
        } catch {
          throw new ConvexError("INVALID_LOCAL_DATE_TIME");
        }
        const itemNewEnd = itemNewStart + newDuration;

        const needsTimeUpdate =
          item.scheduledStart !== itemNewStart ||
          item.scheduledEnd !== itemNewEnd;

        if (needsTimeUpdate) {
          await validateClassScheduleTime(
            ctx,
            classData,
            utcToLocalDateTime(itemNewStart, timeZone),
            newDuration / 60_000,
          );
          await validateScheduleOverlap(ctx, {
            teacherId: classData.teacherId,
            classId: classData._id,
            start: itemNewStart,
            end: itemNewEnd,
            excludeScheduleId: item._id,
          });
          updatePatch.scheduledStart = itemNewStart;
          updatePatch.scheduledEnd = itemNewEnd;
        }

        if (needsTimeUpdate || Object.keys(metadataUpdates).length > 0) {
          await ctx.db.patch(item._id, updatePatch);
        }
        if (
          needsTimeUpdate &&
          item.isLive === true &&
          (metadataUpdates.status ?? item.status) === "active"
        ) {
          await scheduleLiveReconciliation(ctx, item.roomName, itemNewEnd);
        }
      }
      if (args.sessionType !== undefined) {
        await syncClassTypeFromSchedules(ctx, classData._id);
      }
      return { updated: futureItems.length, type: "series" as const };
    } else {
      const singleUpdates = { ...metadataUpdates };
      if (args.localStart !== undefined) {
        singleUpdates.scheduledStart = newStart;
        singleUpdates.scheduledEnd = newEnd;
      }
      await ctx.db.patch(args.id, singleUpdates);
      if (args.sessionType !== undefined) {
        await syncClassTypeFromSchedules(ctx, classData._id);
      }
      if (
        args.localStart !== undefined &&
        schedule.isLive === true &&
        (metadataUpdates.status ?? schedule.status) === "active"
      ) {
        await scheduleLiveReconciliation(ctx, schedule.roomName, newEnd);
      }
      return { updated: 1, type: "single" as const };
    }
  },
});

export const cancelSchedule = mutation({
  args: {
    id: v.id("classSchedule"),
    cancelSeries: v.optional(v.boolean()),
    reason: v.string(),
  },
  returns: v.object({
    cancelled: v.number(),
    type: v.union(v.literal("series"), v.literal("single")),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const schedule = await ctx.db.get(args.id);
    if (!schedule) throw new Error("Schedule not found");
    const classData = await ctx.db.get(schedule.classId);
    if (!classData) throw new Error("Class not found");
    const curriculum = await ctx.db.get(classData.curriculumId);
    const schoolId = classData.schoolId ?? curriculum?.schoolId;
    const reason = args.reason.trim();
    if (!reason) throw new ConvexError("CANCELLATION_REASON_REQUIRED");

    const canCancel = args.cancelSeries
      ? await canCancelClassSeries(ctx, user._id, classData, schoolId)
      : await canCancelClassOccurrence(ctx, user._id, classData, schoolId);
    if (!canCancel) throw new ConvexError("PERMISSION_DENIED");

    if (schedule.status === "cancelled") {
      return {
        cancelled: 0,
        type: args.cancelSeries ? ("series" as const) : ("single" as const),
      };
    }

    const now = Date.now();
    if (
      schedule.status !== "scheduled" ||
      schedule.scheduledStart <= now ||
      schedule.isLive === true
    ) {
      throw new ConvexError("SCHEDULE_CANNOT_BE_CANCELLED");
    }

    if (args.cancelSeries) {
      if (!schedule.isRecurring && !schedule.recurrenceParentId) {
        throw new ConvexError("SCHEDULE_IS_NOT_RECURRING");
      }
      const parentId = schedule.recurrenceParentId || schedule._id;
      const [parent, children] = await Promise.all([
        ctx.db.get(parentId),
        ctx.db
          .query("classSchedule")
          .withIndex("by_recurrence_parent", (q) =>
            q.eq("recurrenceParentId", parentId),
          )
          .collect(),
      ]);
      const series = parent ? [parent, ...children] : children;
      const futureScheduledItems = series.filter(
        (item) =>
          item.scheduledStart >= schedule.scheduledStart &&
          item.status === "scheduled" &&
          item.isLive !== true,
      );
      for (const item of futureScheduledItems) {
        await ctx.db.patch(item._id, {
          status: "cancelled" as const,
          cancellationReason: reason,
          cancelledAt: now,
          cancelledBy: user._id,
          cancellationScope: "series" as const,
          cancellationEffectiveAt: schedule.scheduledStart,
        });
      }
      if (futureScheduledItems.length > 0) {
        await recordClassCancellationEvent(ctx, {
          classId: classData._id,
          schoolId,
          scheduleId: schedule._id,
          affectedScheduleIds: futureScheduledItems.map(({ _id }) => _id),
          actorId: user._id,
          scope: "series",
          source: "calendar",
          reason,
          effectiveAt: schedule.scheduledStart,
          occurredAt: now,
        });
      }
      return {
        cancelled: futureScheduledItems.length,
        type: "series" as const,
      };
    }

    await ctx.db.patch(args.id, {
      status: "cancelled" as const,
      cancellationReason: reason,
      cancelledAt: now,
      cancelledBy: user._id,
      cancellationScope: "occurrence" as const,
      cancellationEffectiveAt: schedule.scheduledStart,
    });
    await recordClassCancellationEvent(ctx, {
      classId: classData._id,
      schoolId,
      scheduleId: schedule._id,
      affectedScheduleIds: [schedule._id],
      actorId: user._id,
      scope: "occurrence",
      source: "calendar",
      reason,
      effectiveAt: schedule.scheduledStart,
      occurredAt: now,
    });
    return { cancelled: 1, type: "single" as const };
  },
});

export const deleteSchedule = mutation({
  args: {
    id: v.id("classSchedule"),
    deleteSeries: v.optional(v.boolean()),
  },
  returns: v.object({
    deleted: v.number(),
    type: v.union(v.literal("series"), v.literal("single")),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const schedule = await ctx.db.get(args.id);
    if (!schedule) throw new Error("Schedule not found");
    const classData = await ctx.db.get(schedule.classId);
    if (!classData) throw new Error("Class not found");
    const curriculum = await ctx.db.get(classData.curriculumId);

    const isAuthorizedAdmin = await canManageClasses(
      ctx,
      user._id,
      classData.campusId,
      curriculum?.schoolId,
    );

    if (!isAuthorizedAdmin) throw new ConvexError("PERMISSION_DENIED");

    if (args.deleteSeries && schedule.isRecurring) {
      const parentId = schedule.recurrenceParentId || schedule._id;
      const series = await ctx.db
        .query("classSchedule")
        .withIndex("by_recurrence_parent", (q) =>
          q.eq("recurrenceParentId", parentId),
        )
        .collect();

      const parent = await ctx.db.get(parentId);
      if (parent) await deleteScheduleWithDependencies(ctx, parent);
      for (const child of series) {
        await deleteScheduleWithDependencies(ctx, child);
      }

      await syncClassTypeFromSchedules(ctx, classData._id);

      return { deleted: series.length + 1, type: "series" as const };
    } else {
      await deleteScheduleWithDependencies(ctx, schedule);
      await syncClassTypeFromSchedules(ctx, classData._id);
      return { deleted: 1, type: "single" as const };
    }
  },
});

export const claimSessionLeadership = mutation({
  args: { roomName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, schedule, leaderRole } =
      await getLiveLeadershipMutationContext(ctx, args.roomName);
    if (!leaderRole) throw new ConvexError("PERMISSION_DENIED");
    if (schedule.sessionLeaderId) {
      if (schedule.sessionLeaderId === user._id) return null;
      throw new ConvexError("This class already has a session leader");
    }
    await assignSessionLeader(ctx, schedule, {
      actorId: user._id,
      leaderId: user._id,
      leaderRole,
      eventType: "claimed",
      now: Date.now(),
    });
    return null;
  },
});

export const requestSessionLeadershipTransfer = mutation({
  args: { roomName: v.string(), targetUserId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, schedule, classData, schoolId } =
      await getLiveLeadershipMutationContext(ctx, args.roomName);
    if (schedule.sessionLeaderId !== user._id) {
      throw new ConvexError("Only the session leader can request a transfer");
    }
    if (args.targetUserId === user._id) {
      throw new ConvexError("Choose another session leader");
    }
    const target = await ctx.db.get("users", args.targetUserId);
    if (!target?.isActive) throw new ConvexError("Target user is unavailable");
    const targetRole = await getEligibleSessionLeaderRole(
      ctx,
      target._id,
      classData,
      schoolId,
    );
    if (!targetRole)
      throw new ConvexError("Target user cannot lead this class");

    await ctx.db.patch(schedule._id, {
      sessionTransferToId: target._id,
      sessionTransferRequestedBy: user._id,
      sessionTransferRequestedAt: Date.now(),
    });
    return null;
  },
});

export const cancelSessionLeadershipTransfer = mutation({
  args: { roomName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, schedule } = await getLiveLeadershipMutationContext(
      ctx,
      args.roomName,
    );
    if (schedule.sessionLeaderId !== user._id) {
      throw new ConvexError("Only the session leader can cancel the transfer");
    }
    await ctx.db.patch(schedule._id, {
      sessionTransferToId: undefined,
      sessionTransferRequestedBy: undefined,
      sessionTransferRequestedAt: undefined,
    });
    return null;
  },
});

export const rejectSessionLeadershipTransfer = mutation({
  args: { roomName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, schedule } = await getLiveLeadershipMutationContext(
      ctx,
      args.roomName,
    );
    if (schedule.sessionTransferToId !== user._id) {
      throw new ConvexError("No leadership transfer is pending for this user");
    }
    if (
      !schedule.sessionLeaderId ||
      !schedule.sessionLeaderRole ||
      !schedule.sessionTransferRequestedBy
    ) {
      throw new ConvexError("The leadership transfer is no longer available");
    }

    const respondedAt = Date.now();
    await ctx.db.patch(schedule._id, {
      sessionTransferToId: undefined,
      sessionTransferRequestedBy: undefined,
      sessionTransferRequestedAt: undefined,
    });
    await recordSessionLeadershipEvent(ctx, {
      scheduleId: schedule._id,
      eventType: "transfer_rejected",
      actorId: user._id,
      leaderId: schedule.sessionLeaderId,
      leaderRole: schedule.sessionLeaderRole,
      transferRequestedBy: schedule.sessionTransferRequestedBy,
      transferTargetId: user._id,
      createdAt: respondedAt,
    });
    return null;
  },
});

export const acceptSessionLeadershipTransfer = mutation({
  args: { roomName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, schedule, leaderRole } =
      await getLiveLeadershipMutationContext(ctx, args.roomName);
    if (schedule.sessionTransferToId !== user._id || !leaderRole) {
      throw new ConvexError("No leadership transfer is pending for this user");
    }
    await assignSessionLeader(ctx, schedule, {
      actorId: user._id,
      leaderId: user._id,
      leaderRole,
      eventType: "transferred",
      transferRequestedBy: schedule.sessionTransferRequestedBy,
      transferTargetId: user._id,
      now: Date.now(),
    });
    return null;
  },
});

export const recoverSessionLeadership = mutation({
  args: { roomName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, schedule, classData } =
      await getLiveLeadershipMutationContext(ctx, args.roomName);
    if (classData.teacherId !== user._id) {
      throw new ConvexError("Only the assigned teacher can recover the class");
    }
    if (schedule.sessionLeaderId === user._id) return null;
    await assignSessionLeader(ctx, schedule, {
      actorId: user._id,
      leaderId: user._id,
      leaderRole: "teacher",
      eventType: "recovered",
      now: Date.now(),
    });
    return null;
  },
});

export const takeOverSessionLeadership = mutation({
  args: { roomName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user, schedule, leaderRole } =
      await getLiveLeadershipMutationContext(ctx, args.roomName);
    if (!leaderRole) throw new ConvexError("PERMISSION_DENIED");
    if (schedule.sessionLeaderId === user._id) return null;
    const canTakeOver =
      schedule.liveLeaderAbsentSince !== undefined &&
      Date.now() >= schedule.liveLeaderAbsentSince + STUDENT_ONLY_GRACE_MS;
    if (!canTakeOver) {
      throw new ConvexError(
        "The current leader is still responsible for this class",
      );
    }
    await assignSessionLeader(ctx, schedule, {
      actorId: user._id,
      leaderId: user._id,
      leaderRole,
      eventType: "takeover",
      now: Date.now(),
    });
    return null;
  },
});

export const submitSessionClosure = mutation({
  args: {
    roomName: v.string(),
    lessonIds: v.array(v.id("lessons")),
    attendance: v.array(
      v.object({
        studentId: v.id("users"),
        status: attendanceStatusValidator,
        excuseReason: v.optional(v.string()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const schedule = await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", args.roomName))
      .first();
    if (!schedule) throw new ConvexError("Schedule not found");
    if (!(await canCloseClassSession(ctx, user._id, schedule))) {
      throw new ConvexError("Only the session leader can close this class");
    }
    const classData = await ctx.db.get(schedule.classId);
    if (!classData) throw new ConvexError("Class not found");

    const uniqueLessonIds = new Set(args.lessonIds);
    if (
      uniqueLessonIds.size === 0 ||
      uniqueLessonIds.size !== args.lessonIds.length
    ) {
      throw new ConvexError("Select at least one taught lesson");
    }
    const lessons = await Promise.all(
      args.lessonIds.map((lessonId) => ctx.db.get(lessonId)),
    );
    if (
      lessons.some(
        (lesson) =>
          !lesson ||
          !lesson.isActive ||
          lesson.curriculumId !== classData.curriculumId,
      )
    ) {
      throw new ConvexError("Invalid taught lesson selection");
    }

    const enrolledStudentIds = await listClassStudentIds(ctx, classData);
    const submittedStudentIds = new Set(
      args.attendance.map(({ studentId }) => studentId),
    );
    if (
      submittedStudentIds.size !== args.attendance.length ||
      submittedStudentIds.size !== enrolledStudentIds.length ||
      enrolledStudentIds.some(
        (studentId) => !submittedStudentIds.has(studentId),
      )
    ) {
      throw new ConvexError("Verify the attendance of every enrolled student");
    }

    const now = Date.now();
    const existingReport = await ctx.db
      .query("classSessionReports")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
      .first();
    const reportId = existingReport
      ? existingReport._id
      : await ctx.db.insert("classSessionReports", {
          scheduleId: schedule._id,
          closedBy: user._id,
          closedAt: now,
        });
    if (existingReport) {
      await ctx.db.patch(existingReport._id, {
        closedBy: user._id,
        closedAt: now,
      });
      const previousLessons = await ctx.db
        .query("classSessionReportLessons")
        .withIndex("by_report", (q) => q.eq("reportId", existingReport._id))
        .collect();
      for (const previousLesson of previousLessons) {
        await ctx.db.delete(previousLesson._id);
      }
    }
    for (const lessonId of args.lessonIds) {
      await ctx.db.insert("classSessionReportLessons", {
        reportId,
        scheduleId: schedule._id,
        lessonId,
      });
    }

    for (const attendance of args.attendance) {
      const excuseReason = normalizeExcuseReason(
        attendance.status,
        attendance.excuseReason,
      );
      const existingAttendance = await ctx.db
        .query("studentAttendanceRecords")
        .withIndex("by_schedule_and_student", (q) =>
          q
            .eq("scheduleId", schedule._id)
            .eq("studentId", attendance.studentId),
        )
        .unique();
      if (existingAttendance) {
        await ctx.db.patch(existingAttendance._id, {
          status: attendance.status,
          excuseReason,
          lastUpdatedBy: user._id,
          lastUpdatedAt: now,
        });
      } else {
        await ctx.db.insert("studentAttendanceRecords", {
          scheduleId: schedule._id,
          studentId: attendance.studentId,
          status: attendance.status,
          excuseReason,
          confirmedBy: user._id,
          confirmedAt: now,
          lastUpdatedBy: user._id,
          lastUpdatedAt: now,
        });
      }
    }

    await ctx.db.patch(schedule._id, {
      sessionClosureStatus: "completed",
      sessionClosedBy: user._id,
      sessionClosedAt: now,
    });
    return null;
  },
});

export const markLive = mutation({
  args: {
    roomName: v.string(),
    isLive: v.literal(true),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) throw new ConvexError("User not authenticated");
    const schedule = await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", args.roomName))
      .first();
    if (!schedule) throw new ConvexError("Schedule not found");

    const { classData, schoolId: classSchoolId } =
      await getScheduleLeadershipContext(ctx, schedule);
    const leaderRole = await getEligibleSessionLeaderRole(
      ctx,
      user._id,
      classData,
      classSchoolId,
    );
    if (!leaderRole) {
      throw new ConvexError(
        "Only the assigned teacher or an authorized administrator can start this class",
      );
    }

    if (schedule.isLive) {
      if (!schedule.sessionLeaderId) {
        await assignSessionLeader(ctx, schedule, {
          actorId: user._id,
          leaderId: user._id,
          leaderRole,
          eventType: "claimed",
          now: Date.now(),
        });
      }
      return null;
    }
    if (schedule.status === "cancelled") {
      throw new ConvexError("Cancelled sessions cannot be started");
    }
    const now = Date.now();
    if (
      schedule.status === "completed" ||
      now > schedule.scheduledEnd + MAX_LIVE_OVERRUN_MS
    ) {
      throw new ConvexError("Completed sessions cannot be started");
    }
    const liveAccess = normalizeLiveAccess(classData.liveAccess);
    await assignSessionLeader(ctx, schedule, {
      actorId: user._id,
      leaderId: user._id,
      leaderRole,
      eventType: "started",
      now,
    });
    await ctx.db.patch(schedule._id, {
      isLive: true,
      schoolId: classSchoolId,
      liveAccess,
      status: "active",
      completedAt: undefined,
      sessionStartedBy: user._id,
      sessionStartedAt: now,
      sessionEndedBy: undefined,
      sessionClosureStatus: "pending",
      sessionClosedBy: undefined,
      sessionClosedAt: undefined,
      liveLeaderAbsentSince: undefined,
      liveExtensionEndsAt: undefined,
      liveDecisionEndsAt: undefined,
      liveLastReconciledAt: undefined,
    });
    await scheduleLiveReconciliation(
      ctx,
      schedule.roomName,
      schedule.scheduledEnd,
    );
    return null;
  },
});

export const confirmLiveExtension = mutation({
  args: { roomName: v.string() },
  returns: v.object({
    extensionEndsAt: v.number(),
    hardEndsAt: v.number(),
  }),
  handler: async (ctx, { roomName }) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) throw new ConvexError("User not authenticated");

    const schedule = await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", roomName))
      .first();
    if (!schedule) throw new ConvexError("Schedule not found");

    if (schedule.sessionLeaderId !== user._id) {
      throw new ConvexError("Only the session leader can extend this class");
    }

    const now = Date.now();
    const currentEnd = schedule.liveExtensionEndsAt ?? schedule.scheduledEnd;
    if (
      schedule.status !== "active" ||
      !schedule.isLive ||
      schedule.liveDecisionEndsAt === undefined
    ) {
      throw new ConvexError("The live session cannot be extended");
    }
    if (now >= schedule.liveDecisionEndsAt) {
      throw new ConvexError("The decision window has already ended");
    }

    const hardEndsAt = getLiveSessionHardEnd(schedule.scheduledEnd);
    const extensionEndsAt = getConfirmedExtensionEnd(
      currentEnd,
      schedule.scheduledEnd,
    );
    if (extensionEndsAt <= currentEnd) {
      throw new ConvexError("The live session reached its maximum duration");
    }

    await ctx.db.patch(schedule._id, {
      liveExtensionEndsAt: extensionEndsAt,
      liveLeaderAbsentSince: undefined,
      liveDecisionEndsAt: undefined,
    });
    await ctx.scheduler.runAt(
      extensionEndsAt,
      internal.livekit.reconcileLiveSession,
      { roomName },
    );

    return { extensionEndsAt, hardEndsAt };
  },
});

export const endLiveSession = internalMutation({
  args: {
    roomName: v.string(),
    endedAt: v.number(),
    endedBy: v.optional(v.id("users")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const schedule = await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", args.roomName))
      .first();
    if (!schedule) return null;

    await ctx.db.patch(schedule._id, {
      isLive: false,
      status: "completed",
      completedAt: schedule.completedAt ?? args.endedAt,
      sessionEndedBy: args.endedBy ?? schedule.sessionEndedBy,
      liveLeaderAbsentSince: undefined,
      liveExtensionEndsAt: undefined,
      liveDecisionEndsAt: undefined,
      liveLastReconciledAt: args.endedAt,
    });

    const openSessions = await ctx.db
      .query("class_sessions")
      .withIndex("by_schedule", (q) =>
        q.eq("scheduleId", schedule._id).eq("leftAt", undefined),
      )
      .collect();
    await Promise.all(
      openSessions.map((session) => {
        const leftAt = Math.max(args.endedAt, session.joinedAt);
        return ctx.db.patch(session._id, {
          leftAt,
          durationSeconds: (leftAt - session.joinedAt) / 1000,
        });
      }),
    );

    await deleteWhiteboardSession(ctx, args.roomName);

    return null;
  },
});

export const logStudentPresence = mutation({
  args: {
    scheduleId: v.id("classSchedule"),
    action: v.union(v.literal("join"), v.literal("leave")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const now = Date.now();
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) throw new Error("Schedule not found");

    const classData = await ctx.db.get(schedule.classId);
    if (!classData) throw new Error("Class not found");
    if (!(await isStudentEnrolled(ctx, classData, user._id))) return null;
    const timeZone = (await getClassTimeZone(ctx, classData)) ?? "UTC";

    if (args.action === "join") {
      if (
        !schedule.isLive ||
        schedule.status === "cancelled" ||
        schedule.status === "completed"
      ) {
        throw new ConvexError("CLASS_NOT_LIVE");
      }

      const activeSession = await ctx.db
        .query("class_sessions")
        .withIndex("by_student_schedule", (q) =>
          q
            .eq("studentId", user._id)
            .eq("scheduleId", args.scheduleId)
            .eq("leftAt", undefined),
        )
        .first();
      if (activeSession) return null;

      await ctx.db.insert("class_sessions", {
        scheduleId: args.scheduleId,
        studentId: user._id,
        joinedAt: now,
        roomName: schedule.roomName,
        sessionDate: utcToLocalDateTime(now, timeZone).slice(0, 10),
      });
    } else {
      const activeSessions = await ctx.db
        .query("class_sessions")
        .withIndex("by_student_schedule", (q) =>
          q
            .eq("studentId", user._id)
            .eq("scheduleId", args.scheduleId)
            .eq("leftAt", undefined),
        )
        .collect();

      await Promise.all(
        activeSessions.map((activeSession) =>
          ctx.db.patch(activeSession._id, {
            leftAt: now,
            durationSeconds: Math.max(0, (now - activeSession.joinedAt) / 1000),
          }),
        ),
      );
    }
  },
});

export const updateAttendance = mutation({
  args: {
    scheduleId: v.id("classSchedule"),
    studentId: v.id("users"),
    status: attendanceStatusValidator,
    excuseReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) throw new Error("Schedule not found");
    const classData = await ctx.db.get(schedule.classId);
    if (!classData) throw new Error("Class not found");
    const curriculum = await ctx.db.get(classData.curriculumId);

    const isClassTeacher = classData.teacherId === user._id;
    const isAuthorizedAdmin = await canManageClasses(
      ctx,
      user._id,
      classData.campusId,
      curriculum?.schoolId,
    );

    if (!isClassTeacher && !isAuthorizedAdmin) throw new Error("Unauthorized");
    if (
      schedule.status !== "completed" ||
      schedule.sessionClosureStatus !== "completed"
    ) {
      throw new ConvexError("Attendance has not been verified yet");
    }
    const enrolledStudentIds = await listClassStudentIds(ctx, classData);
    if (!enrolledStudentIds.includes(args.studentId)) {
      throw new ConvexError("Student is not enrolled in this class");
    }

    const existingAttendance = await ctx.db
      .query("studentAttendanceRecords")
      .withIndex("by_schedule_and_student", (q) =>
        q.eq("scheduleId", args.scheduleId).eq("studentId", args.studentId),
      )
      .unique();
    if (!existingAttendance) {
      throw new ConvexError("Attendance record not found");
    }
    const now = Date.now();
    await ctx.db.patch(existingAttendance._id, {
      status: args.status,
      excuseReason: normalizeExcuseReason(args.status, args.excuseReason),
      lastUpdatedBy: user._id,
      lastUpdatedAt: now,
    });
  },
});

export const getLiveLifecycleState = internalQuery({
  args: { roomName: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      roomName: v.string(),
      scheduledEnd: v.number(),
      isLive: v.boolean(),
      status: v.union(
        v.literal("scheduled"),
        v.literal("active"),
        v.literal("completed"),
        v.literal("cancelled"),
      ),
      liveLeaderAbsentSince: v.optional(v.number()),
      liveExtensionEndsAt: v.optional(v.number()),
      liveDecisionEndsAt: v.optional(v.number()),
      sessionLeaderId: v.optional(v.id("users")),
      sessionClosureStatus: v.optional(sessionClosureStatusValidator),
    }),
  ),
  handler: async (ctx, { roomName }) => {
    const schedule = await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", roomName))
      .first();
    if (!schedule) return null;

    return {
      roomName: schedule.roomName,
      scheduledEnd: schedule.scheduledEnd,
      isLive: schedule.isLive === true,
      status: schedule.status,
      liveLeaderAbsentSince: schedule.liveLeaderAbsentSince,
      liveExtensionEndsAt: schedule.liveExtensionEndsAt,
      liveDecisionEndsAt: schedule.liveDecisionEndsAt,
      sessionLeaderId: schedule.sessionLeaderId,
      sessionClosureStatus: schedule.sessionClosureStatus,
    };
  },
});

export const updateLiveLifecycleState = internalMutation({
  args: {
    roomName: v.string(),
    reconciledAt: v.number(),
    expectedLeaderAbsentSince: v.union(v.number(), v.null()),
    expectedExtensionEndsAt: v.union(v.number(), v.null()),
    expectedDecisionEndsAt: v.union(v.number(), v.null()),
    leaderAbsentSince: v.union(v.number(), v.null()),
    extensionEndsAt: v.union(v.number(), v.null()),
    decisionEndsAt: v.union(v.number(), v.null()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const schedule = await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", args.roomName))
      .first();
    if (!schedule || schedule.status !== "active" || !schedule.isLive) {
      return false;
    }
    if (
      (schedule.liveLeaderAbsentSince ?? null) !==
        args.expectedLeaderAbsentSince ||
      (schedule.liveExtensionEndsAt ?? null) !== args.expectedExtensionEndsAt ||
      (schedule.liveDecisionEndsAt ?? null) !== args.expectedDecisionEndsAt
    ) {
      return false;
    }

    await ctx.db.patch(schedule._id, {
      liveLeaderAbsentSince: args.leaderAbsentSince ?? undefined,
      liveExtensionEndsAt: args.extensionEndsAt ?? undefined,
      liveDecisionEndsAt: args.decisionEndsAt ?? undefined,
      liveLastReconciledAt: args.reconciledAt,
    });
    return true;
  },
});

export const listExpiredLiveSessions = internalQuery({
  args: { now: v.number(), limit: v.number() },
  returns: v.array(
    v.object({
      roomName: v.string(),
      scheduledEnd: v.number(),
    }),
  ),
  handler: async (ctx, { now, limit }) => {
    const activeSchedules = await ctx.db
      .query("classSchedule")
      .withIndex("by_live_expiration", (q) =>
        q.eq("status", "active").eq("isLive", true).lte("scheduledEnd", now),
      )
      .take(Math.min(Math.max(limit, 1), 200));

    return activeSchedules.map((schedule) => ({
      roomName: schedule.roomName,
      scheduledEnd: schedule.scheduledEnd,
    }));
  },
});
