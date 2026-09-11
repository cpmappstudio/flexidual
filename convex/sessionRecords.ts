import { ConvexError, v, type Infer } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { canAccessClass, canManageClasses } from "./permissions";
import { getClassTimeZone } from "./model/timeZone";
import { getCurrentUserFromAuth, getCurrentUserOrThrow } from "./users";
import { studentAttendanceStatusValidator } from "./model/studentAttendance";
import { isExternalClassSession } from "../lib/class-session";
import { isStudentEnrolled } from "./model/enrollments";

const RECENT_SESSION_LIMIT = 8;
const RECENT_SESSION_SCAN_LIMIT = 24;
const SESSION_LESSON_LIMIT = 500;
const SESSION_ATTENDANCE_LIMIT = 500;
const RECORDING_PART_LIMIT = 10;

const recentSessionValidator = v.object({
  scheduleId: v.id("classSchedule"),
  title: v.union(v.string(), v.null()),
  start: v.number(),
  end: v.number(),
  timeZone: v.string(),
  sessionType: v.union(
    v.literal("live"),
    v.literal("ignitia"),
    v.literal("abeka"),
  ),
});

const recordingPartValidator = v.object({
  _id: v.id("recordings"),
  url: v.string(),
  durationMs: v.union(v.number(), v.null()),
  startedAt: v.number(),
});

const lessonValidator = v.object({
  lessonId: v.id("lessons"),
  title: v.string(),
  order: v.number(),
});

const attendanceStudentValidator = v.object({
  studentId: v.id("users"),
  fullName: v.string(),
  imageUrl: v.union(v.string(), v.null()),
  status: studentAttendanceStatusValidator,
  excuseReason: v.union(v.string(), v.null()),
});

const attendanceSummaryValidator = v.object({
  present: v.number(),
  partial: v.number(),
  absent: v.number(),
  excused: v.number(),
});

const completedRecordValidator = v.object({
  state: v.literal("completed"),
  scheduleId: v.id("classSchedule"),
  lessons: v.array(lessonValidator),
  recordings: v.array(recordingPartValidator),
  ownAttendance: v.optional(
    v.union(
      v.null(),
      v.object({
        status: studentAttendanceStatusValidator,
        excuseReason: v.union(v.string(), v.null()),
      }),
    ),
  ),
  staffDetails: v.union(
    v.null(),
    v.object({
      notes: v.union(v.string(), v.null()),
      attendance: v.object({
        summary: attendanceSummaryValidator,
        students: v.array(attendanceStudentValidator),
      }),
    }),
  ),
});

const pendingRecordValidator = v.object({
  state: v.literal("pending"),
  scheduleId: v.id("classSchedule"),
  recordings: v.array(recordingPartValidator),
  canCompleteReport: v.boolean(),
});

const emptyRecordValidator = v.object({
  state: v.union(v.literal("notApplicable"), v.literal("unavailable")),
  scheduleId: v.id("classSchedule"),
});

const sessionRecordValidator = v.union(
  completedRecordValidator,
  pendingRecordValidator,
  emptyRecordValidator,
);

async function getClassSchoolId(ctx: QueryCtx, classData: Doc<"classes">) {
  if (classData.schoolId) return classData.schoolId;
  const [campus, curriculum] = await Promise.all([
    classData.campusId ? ctx.db.get("campuses", classData.campusId) : null,
    ctx.db.get("curriculums", classData.curriculumId),
  ]);
  return campus?.schoolId ?? curriculum?.schoolId;
}

async function getPlayableRecordings(
  ctx: QueryCtx,
  scheduleId: Id<"classSchedule">,
) {
  const recordings = await ctx.db
    .query("recordings")
    .withIndex("by_schedule", (q) =>
      q.eq("scheduleId", scheduleId).eq("status", "complete"),
    )
    .take(RECORDING_PART_LIMIT);

  return recordings
    .filter((recording): recording is typeof recording & { url: string } =>
      Boolean(recording.url),
    )
    .sort((first, second) => first.startedAt - second.startedAt)
    .map((recording) => ({
      _id: recording._id,
      url: recording.url,
      durationMs: recording.durationMs ?? null,
      startedAt: recording.startedAt,
    }));
}

export const listRecent = query({
  args: {
    classId: v.id("classes"),
    now: v.number(),
  },
  returns: v.array(recentSessionValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) return [];

    const classData = await ctx.db.get("classes", args.classId);
    if (!classData || !(await canAccessClass(ctx, user._id, classData))) {
      return [];
    }

    const candidates = await ctx.db
      .query("classSchedule")
      .withIndex("by_class", (q) =>
        q.eq("classId", args.classId).lt("scheduledStart", args.now),
      )
      .order("desc")
      .take(RECENT_SESSION_SCAN_LIMIT);
    const schedules = candidates
      .filter(
        (schedule) =>
          schedule.scheduledEnd <= args.now &&
          schedule.status !== "cancelled" &&
          schedule.status !== "active" &&
          !schedule.isLive,
      )
      .slice(0, RECENT_SESSION_LIMIT);
    const timeZone = (await getClassTimeZone(ctx, classData)) ?? "UTC";

    return schedules.map((schedule) => ({
      scheduleId: schedule._id,
      title: schedule.title ?? null,
      start: schedule.scheduledStart,
      end: schedule.scheduledEnd,
      timeZone,
      sessionType: schedule.sessionType ?? ("live" as const),
    }));
  },
});

export const get = query({
  args: {
    scheduleId: v.id("classSchedule"),
    now: v.number(),
  },
  returns: sessionRecordValidator,
  handler: async (ctx, args): Promise<Infer<typeof sessionRecordValidator>> => {
    const user = await getCurrentUserOrThrow(ctx);
    const schedule = await ctx.db.get("classSchedule", args.scheduleId);
    if (!schedule) throw new ConvexError("Schedule not found");

    const classData = await ctx.db.get("classes", schedule.classId);
    if (!classData) throw new ConvexError("Class not found");
    if (!(await canAccessClass(ctx, user._id, classData))) {
      throw new ConvexError("PERMISSION_DENIED");
    }

    if (isExternalClassSession(schedule.sessionType)) {
      return { state: "notApplicable" as const, scheduleId: schedule._id };
    }

    const [report, recordings, schoolId] = await Promise.all([
      ctx.db
        .query("classSessionReports")
        .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
        .unique(),
      getPlayableRecordings(ctx, schedule._id),
      getClassSchoolId(ctx, classData),
    ]);
    const canViewAttendance =
      classData.teacherId === user._id ||
      (await canManageClasses(ctx, user._id, classData.campusId, schoolId));

    if (!report) {
      const isPastSession =
        schedule.scheduledEnd <= args.now &&
        schedule.status !== "cancelled" &&
        schedule.status !== "active" &&
        !schedule.isLive;
      if (!isPastSession) {
        return { state: "unavailable" as const, scheduleId: schedule._id };
      }
      return {
        state: "pending" as const,
        scheduleId: schedule._id,
        recordings,
        canCompleteReport: canViewAttendance,
      };
    }

    const reportLessons = await ctx.db
      .query("classSessionReportLessons")
      .withIndex("by_report", (q) => q.eq("reportId", report._id))
      .take(SESSION_LESSON_LIMIT);
    const lessonDocuments = await Promise.all(
      reportLessons.map(({ lessonId }) => ctx.db.get("lessons", lessonId)),
    );
    const lessons = lessonDocuments
      .filter((lesson) => lesson !== null)
      .sort((first, second) => first.order - second.order)
      .map((lesson) => ({
        lessonId: lesson._id,
        title: lesson.title,
        order: lesson.order,
      }));

    if (!canViewAttendance) {
      const isStudent = await isStudentEnrolled(ctx, classData, user._id);
      const attendance = isStudent
        ? await ctx.db
            .query("studentAttendanceRecords")
            .withIndex("by_schedule_and_student", (q) =>
              q.eq("scheduleId", schedule._id).eq("studentId", user._id),
            )
            .unique()
        : null;
      return {
        state: "completed" as const,
        scheduleId: schedule._id,
        lessons,
        recordings,
        staffDetails: null,
        ...(isStudent
          ? {
              ownAttendance: attendance
                ? {
                    status: attendance.status,
                    excuseReason: attendance.excuseReason ?? null,
                  }
                : null,
            }
          : {}),
      };
    }

    const attendanceRecords = await ctx.db
      .query("studentAttendanceRecords")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
      .take(SESSION_ATTENDANCE_LIMIT);
    const students = await Promise.all(
      attendanceRecords.map(({ studentId }) => ctx.db.get("users", studentId)),
    );
    const attendanceStudents = attendanceRecords
      .map((attendance, index) => {
        const student = students[index];
        if (!student) return null;
        return {
          studentId: student._id,
          fullName: student.fullName,
          imageUrl: student.imageUrl ?? null,
          status: attendance.status,
          excuseReason: attendance.excuseReason ?? null,
        };
      })
      .filter((student) => student !== null)
      .sort((first, second) => first.fullName.localeCompare(second.fullName));
    const summary = { present: 0, partial: 0, absent: 0, excused: 0 };
    for (const student of attendanceStudents) summary[student.status] += 1;

    return {
      state: "completed" as const,
      scheduleId: schedule._id,
      lessons,
      recordings,
      staffDetails: {
        notes: report.notes ?? null,
        attendance: { summary, students: attendanceStudents },
      },
    };
  },
});
