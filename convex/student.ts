import {
  isCourseTeacher,
  getCourseTeacherForGrade,
} from "./model/courseAssignments";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { query, mutation, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserFromAuth } from "./users";
import { ConvexError, v } from "convex/values";
import { getInstitutionGrades } from "./model/grades";
import { getStudentGradeCode } from "./model/membership";
import { resolveStudentDashboardAccess } from "./model/studentDashboardAccess";
import { canAccessEvent } from "./model/eventAccess";
import {
  isStudentEnrolled,
  listActiveStudentClasses,
} from "./model/enrollments";
import { canManageCampusPeople, canManageClasses } from "./permissions";
import { getClassTimeZone } from "./model/timeZone";
import { curriculumIconValidator } from "./model/curriculumIcons";
import {
  getConnectedSecondsWithinSchedule,
  studentAttendanceStatusValidator,
} from "./model/studentAttendance";
import { DEFAULT_CURRICULUM_ICON } from "../lib/curriculum-icons";
import {
  isExternalClassSession,
  isLiveClassSession,
  isUpcomingClassSession,
} from "../lib/class-session";
import { getSessionContentSummary } from "./model/sessionContent";
import {
  getAbekaStudentCourseProgress,
  getAbekaStudentCourseReports,
} from "./model/abekaStudentProgress";
import { lessonProgress, abekaProgressPoint } from "./model/abekaValidators";
import { getAbekaProgressHistory } from "./model/abekaProgressHistory";
import {
  courseProgressFields,
  getClassCurriculumProgress,
} from "./model/courseProgress";

const dashboardScheduleValidator = v.object({
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
  status: v.union(
    v.literal("scheduled"),
    v.literal("active"),
    v.literal("completed"),
    v.literal("cancelled"),
  ),
  sessionType: v.optional(
    v.union(v.literal("live"), v.literal("ignitia"), v.literal("abeka")),
  ),
  attendance: v.literal("upcoming"),
  minutesAttended: v.literal(0),
  isStudentActive: v.literal(false),
});

const studentDashboardTargetValidator = v.object({
  studentId: v.optional(v.string()),
  orgSlug: v.optional(v.string()),
});

function toDashboardSchedule(
  schedule: Doc<"classSchedule">,
  course: Doc<"classes">,
  curriculum: Doc<"curriculums"> | null,
  timeZone: string | undefined,
) {
  return {
    scheduleId: schedule._id,
    title: schedule.title || course.name,
    ...(schedule.description !== undefined
      ? { description: schedule.description }
      : {}),
    className: course.name,
    start: schedule.scheduledStart,
    end: schedule.scheduledEnd,
    timeZone: timeZone ?? "UTC",
    roomName: schedule.roomName,
    isLive: isLiveClassSession(schedule),
    color: curriculum?.color || "#3b82f6",
    status: schedule.status,
    ...(schedule.sessionType !== undefined
      ? { sessionType: schedule.sessionType }
      : {}),
    attendance: "upcoming" as const,
    minutesAttended: 0 as const,
    isStudentActive: false as const,
  };
}

// The clock filters these events locally; the subscription changes only with the day or data.
export const getStudentDashboardSchedule = query({
  args: {
    ...studentDashboardTargetValidator.fields,
    from: v.number(),
    to: v.number(),
  },
  returns: v.union(v.null(), v.array(dashboardScheduleValidator)),
  handler: async (ctx, args) => {
    if (
      !Number.isFinite(args.from) ||
      !Number.isFinite(args.to) ||
      args.from > args.to ||
      args.to - args.from > 2 * 24 * 60 * 60_000
    )
      throw new ConvexError("INVALID_DATE_RANGE");
    const access = await resolveStudentDashboardAccess(ctx, args);
    if (!access) return null;
    const courses = await listActiveStudentClasses(
      ctx,
      access.student._id,
      access.campus?._id,
    );
    const events = await Promise.all(
      courses.map(async (course) => {
        const [day, active, curriculum, timeZone] = await Promise.all([
          ctx.db
            .query("classSchedule")
            .withIndex("by_class", (q) =>
              q
                .eq("classId", course._id)
                .gte("scheduledStart", args.from)
                .lte("scheduledStart", args.to),
            )
            .collect(),
          ctx.db
            .query("classSchedule")
            .withIndex(
              "by_class_and_status_and_session_type_and_scheduled_start",
              (q) => q.eq("classId", course._id).eq("status", "active"),
            )
            .collect(),
          ctx.db.get(course.curriculumId),
          getClassTimeZone(ctx, course),
        ]);
        return [
          ...new Map(
            [
              ...day,
              ...active.filter(
                (schedule) =>
                  isLiveClassSession(schedule) ||
                  schedule.scheduledEnd >= args.from,
              ),
            ].map((schedule) => [schedule._id, schedule]),
          ).values(),
        ]
          .filter(
            (schedule) =>
              schedule.status !== "completed" &&
              schedule.status !== "cancelled",
          )
          .map((schedule) =>
            toDashboardSchedule(schedule, course, curriculum, timeZone),
          );
      }),
    );
    return events.flat().sort((a, b) => a.start - b.start);
  },
});

export const getStudentDashboardEvents = query({
  args: {
    ...studentDashboardTargetValidator.fields,
    from: v.number(),
    to: v.number(),
    scope: v.union(v.literal("school"), v.literal("campus")),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      occurrenceId: v.id("eventOccurrences"),
      eventId: v.id("events"),
      title: v.string(),
      start: v.number(),
      end: v.number(),
      status: v.union(v.literal("scheduled"), v.literal("active")),
      isLive: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    if (
      !Number.isSafeInteger(args.from) ||
      !Number.isSafeInteger(args.to) ||
      args.from > args.to ||
      args.to - args.from > 2 * 24 * 60 * 60_000
    )
      throw new ConvexError("INVALID_DATE_RANGE");
    const access = await resolveStudentDashboardAccess(ctx, args);
    if (!access?.campus) return { page: [], continueCursor: "", isDone: true };
    const { campus } = access;

    const rows = await ctx.db
      .query("eventOccurrences")
      .withIndex("by_schoolId_and_campusId_and_scheduledStart", (q) =>
        q
          .eq("schoolId", campus.schoolId)
          .eq("campusId", args.scope === "campus" ? campus._id : undefined)
          .gte("scheduledStart", args.from - 24 * 60 * 60_000)
          .lte("scheduledStart", args.to),
      )
      .paginate(args.paginationOpts);
    const eligibleRows = rows.page.filter(
      (row) =>
        row.scheduledEnd > args.from &&
        (row.status === "scheduled" || row.status === "active"),
    );
    const events = new Map(
      await Promise.all(
        [...new Set(eligibleRows.map((row) => row.eventId))].map(
          async (eventId) => [eventId, await ctx.db.get(eventId)] as const,
        ),
      ),
    );
    const visibleEvents = new Set(
      (
        await Promise.all(
          [...events.values()].map(async (event) =>
            event && (await canAccessEvent(ctx, access.student._id, event))
              ? event._id
              : null,
          ),
        )
      ).filter((id) => id !== null),
    );

    const page = eligibleRows
      .filter((row) => visibleEvents.has(row.eventId))
      .map((row) => ({
        occurrenceId: row._id,
        eventId: row.eventId,
        title: events.get(row.eventId)!.title,
        start: row.scheduledStart,
        end: row.scheduledEnd,
        status: row.status as "scheduled" | "active",
        isLive: row.status === "active" && row.isLive === true,
      }))
      .sort((a, b) => a.start - b.start);
    return { ...rows, page };
  },
});

export const getAbekaCourseReport = query({
  args: { ...studentDashboardTargetValidator.fields, classId: v.id("classes") },
  returns: v.union(
    v.null(),
    v.object({
      subjectName: v.string(),
      syncedAt: v.number(),
      history: v.array(abekaProgressPoint),
      lessons: v.array(
        lessonProgress.pick(
          "lessonNumber",
          "percentage",
          "completed",
          "lastViewed",
        ),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const access = await resolveStudentDashboardAccess(ctx, args);
    if (!access) return null;
    const course = await ctx.db.get("classes", args.classId);
    if (
      !course?.isActive ||
      (access.campus && course.campusId !== access.campus._id) ||
      !(await isStudentEnrolled(ctx, course, access.student._id))
    )
      return null;
    const reports = await getAbekaStudentCourseReports(
      ctx,
      access.student._id,
      [course],
    );
    const report = reports.get(course._id);
    if (!report) return null;
    // Return only the requested course's display data, not integration identifiers.
    return {
      subjectName: report.subjectName,
      syncedAt: report.syncedAt,
      history: await getAbekaProgressHistory(ctx, report._id),
      lessons: report.lessons.map(
        ({ lessonNumber, percentage, completed, lastViewed }) => ({
          lessonNumber,
          percentage,
          completed,
          lastViewed,
        }),
      ),
    };
  },
});

const attendanceHistoryItemValidator = v.object({
  scheduleId: v.id("classSchedule"),
  studentId: v.id("users"),
  classId: v.id("classes"),
  className: v.string(),
  curriculumIconKey: curriculumIconValidator,
  sessionTitle: v.union(v.string(), v.null()),
  start: v.number(),
  end: v.number(),
  timeZone: v.string(),
  status: studentAttendanceStatusValidator,
  excuseReason: v.union(v.string(), v.null()),
  attendedMinutes: v.number(),
  scheduledMinutes: v.number(),
  canEditAttendance: v.boolean(),
  contentSummary: v.object({
    lessonPreview: v.union(
      v.null(),
      v.object({ title: v.string(), order: v.number() }),
    ),
    hasMoreLessons: v.boolean(),
    recordingCount: v.number(),
  }),
});

const pendingAttendanceSessionValidator = v.object({
  scheduleId: v.id("classSchedule"),
  classId: v.id("classes"),
  className: v.string(),
  curriculumIconKey: curriculumIconValidator,
  sessionTitle: v.union(v.string(), v.null()),
  start: v.number(),
  end: v.number(),
  timeZone: v.string(),
  roomName: v.string(),
  canCompleteReport: v.boolean(),
});

function isVerifiedStandardSession(schedule: {
  status: "scheduled" | "active" | "completed" | "cancelled";
  sessionClosureStatus?: "pending" | "completed";
  sessionType?: "live" | "ignitia" | "abeka";
}) {
  return (
    schedule.status === "completed" &&
    schedule.sessionClosureStatus === "completed" &&
    !isExternalClassSession(schedule.sessionType)
  );
}

async function buildAttendanceHistoryItem(
  ctx: QueryCtx,
  viewerId: Id<"users">,
  studentId: Id<"users">,
  schedule: Doc<"classSchedule">,
  attendance: Doc<"studentAttendanceRecords">,
  classData: Doc<"classes">,
) {
  const [curriculum, sessions, timeZone, contentSummary] = await Promise.all([
    ctx.db.get("curriculums", classData.curriculumId),
    ctx.db
      .query("class_sessions")
      .withIndex("by_student_schedule", (q) =>
        q.eq("studentId", studentId).eq("scheduleId", schedule._id),
      )
      .collect(),
    getClassTimeZone(ctx, classData),
    getSessionContentSummary(ctx, schedule._id),
  ]);
  const attendedSeconds = getConnectedSecondsWithinSchedule(
    sessions,
    schedule.scheduledStart,
    schedule.scheduledEnd,
    schedule.scheduledEnd,
  );
  const canEditAttendance =
    isCourseTeacher(classData, viewerId) ||
    (await canManageClasses(
      ctx,
      viewerId,
      classData.campusId,
      classData.schoolId ?? curriculum?.schoolId,
    ));

  return {
    scheduleId: schedule._id,
    studentId,
    classId: classData._id,
    className: classData.name,
    curriculumIconKey: curriculum?.iconKey ?? DEFAULT_CURRICULUM_ICON,
    sessionTitle: schedule.title ?? null,
    start: schedule.scheduledStart,
    end: schedule.scheduledEnd,
    timeZone: timeZone ?? "UTC",
    status: attendance.status,
    excuseReason: attendance.excuseReason ?? null,
    attendedMinutes: Math.round(attendedSeconds / 60),
    scheduledMinutes: Math.round(
      (schedule.scheduledEnd - schedule.scheduledStart) / 60_000,
    ),
    canEditAttendance,
    contentSummary,
  };
}

export const getStudentDashboardStats = query({
  args: {
    now: v.optional(v.number()),
    ...studentDashboardTargetValidator.fields,
  },
  returns: v.union(
    v.null(),
    v.object({
      canEdit: v.boolean(),
      student: v.object({
        _id: v.id("users"),
        firstName: v.string(),
        lastName: v.string(),
        fullName: v.string(),
        email: v.optional(v.string()),
        username: v.optional(v.string()),
        imageUrl: v.optional(v.string()),
        avatarStorageId: v.optional(v.id("_storage")),
        isActive: v.boolean(),
        grade: v.optional(v.string()),
        gradeName: v.optional(v.string()),
        school: v.optional(v.string()),
        role: v.literal("student"),
        orgId: v.optional(v.string()),
        orgType: v.literal("campus"),
      }),
      overall: v.object({
        activeCourses: v.number(),
        totalSessions: v.number(),
        verifiedSessions: v.number(),
        pendingVerification: v.number(),
        upcomingSessions: v.number(),
        attendanceCounts: v.object({
          present: v.number(),
          partial: v.number(),
          absent: v.number(),
          excused: v.number(),
        }),
      }),
      pendingAttendanceSessions: v.array(pendingAttendanceSessionValidator),
      classes: v.array(
        v.object({
          classId: v.id("classes"),
          className: v.string(),
          abekaProgress: v.union(
            v.null(),
            v.object({
              completed: v.number(),
              total: v.number(),
              percentage: v.number(),
              syncedAt: v.number(),
            }),
          ),
          courseProgress: v.object(courseProgressFields),
          timeZone: v.string(),
          curriculumTitle: v.string(),
          curriculumIconKey: curriculumIconValidator,
          description: v.optional(v.string()),
          teacher: v.object({
            fullName: v.string(),
            imageUrl: v.optional(v.string()),
          }),
          stats: v.object({
            totalClasses: v.number(),
            verifiedClasses: v.number(),
            pendingVerification: v.number(),
            upcomingClasses: v.number(),
            attendanceCounts: v.object({
              present: v.number(),
              partial: v.number(),
              absent: v.number(),
              excused: v.number(),
            }),
          }),
          icon: v.union(v.string(), v.null()),
          nextSession: v.optional(v.number()),
        }),
      ),
      upcomingLessons: v.array(dashboardScheduleValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const access = await resolveStudentDashboardAccess(ctx, args);
    if (!access) return null;
    const { viewer, student: user, campus } = access;
    const now = args.now;
    const includeUpcomingLessons = Boolean(args.studentId && now !== undefined);

    const canEdit = campus
      ? await canManageCampusPeople(
          ctx,
          viewer._id,
          campus._id,
          campus.schoolId,
        )
      : false;

    const myClasses = await listActiveStudentClasses(
      ctx,
      user._id,
      campus?._id,
    );
    let schoolId = campus?.schoolId;
    let gradeCampusId = campus?._id;
    if (!schoolId && myClasses.length > 0) {
      const firstClass = myClasses[0];
      const [firstCurriculum, firstCampus] = await Promise.all([
        ctx.db.get(firstClass.curriculumId),
        firstClass.campusId ? ctx.db.get(firstClass.campusId) : null,
      ]);
      schoolId = firstCampus?.schoolId ?? firstCurriculum?.schoolId;
      gradeCampusId = firstClass.campusId;
    }
    const gradeCode = schoolId
      ? await getStudentGradeCode(ctx, user._id, schoolId, gradeCampusId)
      : user.grade;
    const gradeName =
      gradeCode && schoolId
        ? (await getInstitutionGrades(ctx, schoolId)).find(
            (grade) => grade.code === gradeCode,
          )?.name
        : undefined;
    const studentProfile = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      email: user.email,
      username: user.username,
      imageUrl: user.imageUrl,
      avatarStorageId: user.avatarStorageId,
      isActive: user.isActive,
      grade: gradeCode,
      gradeName,
      school: user.school,
      role: "student" as const,
      orgId: campus?._id,
      orgType: "campus" as const,
    };

    if (myClasses.length === 0) {
      return {
        canEdit,
        student: studentProfile,
        overall: {
          activeCourses: 0,
          totalSessions: 0,
          verifiedSessions: 0,
          pendingVerification: 0,
          upcomingSessions: 0,
          attendanceCounts: {
            present: 0,
            partial: 0,
            absent: 0,
            excused: 0,
          },
        },
        classes: [],
        pendingAttendanceSessions: [],
        upcomingLessons: [],
      };
    }

    const attendanceRecords = await ctx.db
      .query("studentAttendanceRecords")
      .withIndex("by_student", (q) => q.eq("studentId", user._id))
      .collect();
    const attendanceBySchedule = new Map(
      attendanceRecords.map((record) => [record.scheduleId, record]),
    );

    // --- Per-class stats ---
    const abekaProgress = await getAbekaStudentCourseProgress(
      ctx,
      user._id,
      myClasses,
    );
    const classDetails = await Promise.all(
      myClasses.map(async (classData) => {
        const teacherId = getCourseTeacherForGrade(classData, gradeCode);
        const [
          teacher,
          curriculum,
          userPreference,
          schedules,
          timeZone,
          curriculumProgress,
        ] = await Promise.all([
          teacherId ? ctx.db.get(teacherId) : null,
          ctx.db.get(classData.curriculumId),
          ctx.db
            .query("studentClassPreferences")
            .withIndex("by_student_class", (q) =>
              q.eq("studentId", user._id).eq("classId", classData._id),
            )
            .unique(),
          ctx.db
            .query("classSchedule")
            .withIndex("by_class", (q) => q.eq("classId", classData._id))
            .collect(),
          getClassTimeZone(ctx, classData),
          getClassCurriculumProgress(ctx, classData),
        ]);

        const countableSchedules = schedules.filter(
          (schedule) =>
            schedule.status !== "cancelled" &&
            !isExternalClassSession(schedule.sessionType),
        );
        const completedSchedules = countableSchedules.filter(
          (schedule) => schedule.status === "completed",
        );
        const upcomingClasses = countableSchedules.filter(
          (schedule) =>
            schedule.status === "scheduled" || schedule.status === "active",
        ).length;
        const attendanceCounts = {
          present: 0,
          partial: 0,
          absent: 0,
          excused: 0,
        };
        let pendingVerification = 0;
        for (const schedule of completedSchedules) {
          const attendance = attendanceBySchedule.get(schedule._id);
          if (schedule.sessionClosureStatus !== "completed" || !attendance) {
            pendingVerification++;
          } else attendanceCounts[attendance.status]++;
        }
        const verifiedClasses = Object.values(attendanceCounts).reduce(
          (total, count) => total + count,
          0,
        );
        const pendingSchedules = completedSchedules.filter(
          (schedule) =>
            schedule.sessionClosureStatus !== "completed" ||
            !attendanceBySchedule.has(schedule._id),
        );
        const canCompleteReport =
          pendingSchedules.length > 0 &&
          (isCourseTeacher(classData, viewer._id) ||
            (await canManageClasses(
              ctx,
              viewer._id,
              classData.campusId,
              classData.schoolId ?? curriculum?.schoolId,
            )));
        const pendingAttendanceSessions = pendingSchedules.map((schedule) => ({
          scheduleId: schedule._id,
          classId: classData._id,
          className: classData.name,
          curriculumIconKey: curriculum?.iconKey ?? DEFAULT_CURRICULUM_ICON,
          sessionTitle: schedule.title ?? null,
          start: schedule.scheduledStart,
          end: schedule.scheduledEnd,
          timeZone: timeZone ?? "UTC",
          roomName: schedule.roomName,
          canCompleteReport,
        }));

        return {
          stats: {
            classId: classData._id,
            className: classData.name,
            abekaProgress: abekaProgress.get(classData._id) ?? null,
            courseProgress: {
              totalLessons: curriculumProgress.totalLessons,
              taughtLessons: curriculumProgress.taughtLessons,
              pendingLessons: curriculumProgress.pendingLessons,
              percentage: curriculumProgress.percentage,
            },
            timeZone: timeZone ?? "UTC",
            curriculumTitle:
              curriculum?.title ??
              (classData.classType === "abeka"
                ? "Abeka Curriculum"
                : classData.classType === "ignitia"
                  ? "Ignitia Curriculum"
                  : "Curriculum"),
            curriculumIconKey: curriculum?.iconKey ?? DEFAULT_CURRICULUM_ICON,
            description: classData.description,
            teacher: teacher
              ? { fullName: teacher.fullName, imageUrl: teacher.imageUrl }
              : {
                  fullName:
                    classData.classType === "abeka"
                      ? "Abeka Virtual"
                      : classData.classType === "ignitia"
                        ? "Ignitia Virtual"
                        : "System",
                  imageUrl: undefined,
                },
            stats: {
              totalClasses: countableSchedules.length,
              verifiedClasses,
              pendingVerification,
              upcomingClasses,
              attendanceCounts,
            },
            icon: userPreference?.icon || null,
            nextSession:
              now === undefined
                ? undefined
                : schedules
                    .filter((schedule) => schedule.scheduledStart > now)
                    .sort((a, b) => a.scheduledStart - b.scheduledStart)[0]
                    ?.scheduledStart,
          },
          pendingAttendanceSessions,
          upcomingLessons:
            includeUpcomingLessons && now !== undefined
              ? schedules
                  .filter((schedule) =>
                    isUpcomingClassSession(
                      schedule,
                      schedule.scheduledEnd,
                      now,
                    ),
                  )
                  .map((schedule) =>
                    toDashboardSchedule(
                      schedule,
                      classData,
                      curriculum,
                      timeZone,
                    ),
                  )
              : [],
        };
      }),
    );
    const classStats = classDetails.map((item) => item.stats);
    const upcomingLessons = classDetails
      .flatMap((item) => item.upcomingLessons)
      .sort((a, b) => a.start - b.start)
      .slice(0, 50);
    const pendingAttendanceSessions = classDetails
      .flatMap((item) => item.pendingAttendanceSessions)
      .sort((first, second) => second.start - first.start);

    // --- Overall stats ---
    const totalCourses = classStats.length;
    const totalSessions = classStats.reduce(
      (acc, c) => acc + c.stats.totalClasses,
      0,
    );
    const attendanceCounts = classStats.reduce(
      (counts, classStat) => ({
        present: counts.present + classStat.stats.attendanceCounts.present,
        partial: counts.partial + classStat.stats.attendanceCounts.partial,
        absent: counts.absent + classStat.stats.attendanceCounts.absent,
        excused: counts.excused + classStat.stats.attendanceCounts.excused,
      }),
      { present: 0, partial: 0, absent: 0, excused: 0 },
    );
    const verifiedSessions = Object.values(attendanceCounts).reduce(
      (total, count) => total + count,
      0,
    );
    const pendingVerification = classStats.reduce(
      (total, classStat) => total + classStat.stats.pendingVerification,
      0,
    );
    const upcomingSessions = classStats.reduce(
      (total, classStat) => total + classStat.stats.upcomingClasses,
      0,
    );

    return {
      canEdit,
      student: studentProfile,
      overall: {
        activeCourses: totalCourses,
        totalSessions,
        verifiedSessions,
        pendingVerification,
        upcomingSessions,
        attendanceCounts,
      },
      pendingAttendanceSessions,
      classes: classStats,
      upcomingLessons,
    };
  },
});

export const listStudentAttendanceHistory = query({
  args: {
    status: v.optional(studentAttendanceStatusValidator),
    classId: v.optional(v.id("classes")),
    paginationOpts: paginationOptsValidator,
    ...studentDashboardTargetValidator.fields,
  },
  returns: paginationResultValidator(attendanceHistoryItemValidator),
  handler: async (ctx, args) => {
    const access = await resolveStudentDashboardAccess(ctx, args);
    if (!access) throw new ConvexError("PERMISSION_DENIED");
    const { viewer, student, campus } = access;
    const classes = await listActiveStudentClasses(
      ctx,
      student._id,
      campus?._id,
    );
    const classesById = new Map(classes.map((item) => [item._id, item]));
    if (args.classId) {
      const result = await ctx.db
        .query("classSchedule")
        .withIndex("by_class", (q) => q.eq("classId", args.classId!))
        .order("desc")
        .paginate(args.paginationOpts);
      const classData = classesById.get(args.classId);
      if (!classData) return { ...result, page: [] };

      const page = await Promise.all(
        result.page.map(async (schedule) => {
          if (!isVerifiedStandardSession(schedule)) return null;
          const attendance = await ctx.db
            .query("studentAttendanceRecords")
            .withIndex("by_schedule_and_student", (q) =>
              q.eq("scheduleId", schedule._id).eq("studentId", student._id),
            )
            .unique();
          if (
            !attendance ||
            (args.status && attendance.status !== args.status)
          ) {
            return null;
          }
          return await buildAttendanceHistoryItem(
            ctx,
            viewer._id,
            student._id,
            schedule,
            attendance,
            classData,
          );
        }),
      );

      return { ...result, page: page.filter((item) => item !== null) };
    }

    const attendanceQuery = args.status
      ? ctx.db
          .query("studentAttendanceRecords")
          .withIndex("by_student_and_status_and_confirmed_at", (q) =>
            q.eq("studentId", student._id).eq("status", args.status!),
          )
      : ctx.db
          .query("studentAttendanceRecords")
          .withIndex("by_student_and_confirmed_at", (q) =>
            q.eq("studentId", student._id),
          );
    const result = await attendanceQuery
      .order("desc")
      .paginate(args.paginationOpts);
    const page = await Promise.all(
      result.page.map(async (attendance) => {
        const schedule = await ctx.db.get(
          "classSchedule",
          attendance.scheduleId,
        );
        if (!schedule || !isVerifiedStandardSession(schedule)) return null;
        const classData = classesById.get(schedule.classId);
        if (!classData) return null;

        return await buildAttendanceHistoryItem(
          ctx,
          viewer._id,
          student._id,
          schedule,
          attendance,
          classData,
        );
      }),
    );

    return {
      ...result,
      page: page.filter((item) => item !== null),
    };
  },
});

export const updateClassIcon = mutation({
  args: {
    classId: v.id("classes"),
    icon: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) throw new Error("Unauthorized");
    const classData = await ctx.db.get(args.classId);
    if (!classData || !(await isStudentEnrolled(ctx, classData, user._id))) {
      throw new Error("Unauthorized");
    }

    const existingPref = await ctx.db
      .query("studentClassPreferences")
      .withIndex("by_student_class", (q) =>
        q.eq("studentId", user._id).eq("classId", args.classId),
      )
      .unique();

    if (existingPref) {
      await ctx.db.patch(existingPref._id, {
        icon: args.icon,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("studentClassPreferences", {
        studentId: user._id,
        classId: args.classId,
        icon: args.icon,
        updatedAt: Date.now(),
      });
    }
  },
});
