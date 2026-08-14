import { query, mutation } from "./_generated/server";
import { getCurrentUserFromAuth } from "./users";
import { v } from "convex/values";
import { getInstitutionGrades } from "./model/grades";
import {
  getSoleStudentCampusId,
  getStudentGradeCode,
} from "./model/membership";
import { isStudentEnrolled } from "./model/enrollments";
import { canManageCampusPeople, canViewCampusPeople } from "./permissions";
import { getClassTimeZone } from "./model/timeZone";
import { curriculumIconValidator } from "./model/curriculumIcons";
import { DEFAULT_CURRICULUM_ICON } from "../lib/curriculum-icons";

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

export const getStudentDashboardStats = query({
  args: {
    now: v.number(),
    studentId: v.optional(v.string()),
    orgSlug: v.optional(v.string()),
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
        attendanceRate: v.number(),
        completedSessions: v.number(),
      }),
      classes: v.array(
        v.object({
          classId: v.id("classes"),
          className: v.string(),
          curriculumTitle: v.string(),
          curriculumIconKey: curriculumIconValidator,
          description: v.optional(v.string()),
          teacher: v.object({
            fullName: v.string(),
            imageUrl: v.optional(v.string()),
          }),
          stats: v.object({
            totalClasses: v.number(),
            completedClasses: v.number(),
            attendedClasses: v.number(),
            progressPercentage: v.number(),
          }),
          icon: v.union(v.string(), v.null()),
          nextSession: v.optional(v.number()),
        }),
      ),
      upcomingLessons: v.array(dashboardScheduleValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const viewer = await getCurrentUserFromAuth(ctx);
    if (!viewer) return null;

    const requestedStudentId = args.studentId
      ? ctx.db.normalizeId("users", args.studentId)
      : viewer._id;
    if (!requestedStudentId) return null;

    const user = await ctx.db.get(requestedStudentId);
    if (!user) return null;

    const viewingOwnProfile = user._id === viewer._id;
    const includeUpcomingLessons = Boolean(args.studentId);
    let campus =
      args.studentId && args.orgSlug
        ? await ctx.db
            .query("campuses")
            .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug!))
            .first()
        : null;
    if (!args.studentId) {
      const studentCampusId = await getSoleStudentCampusId(ctx, user._id);
      campus = studentCampusId ? await ctx.db.get(studentCampusId) : null;
    }
    if (args.studentId && !campus) return null;

    if (campus) {
      const studentMembership = await ctx.db
        .query("roleAssignments")
        .withIndex("by_user_org", (q) =>
          q
            .eq("userId", user._id)
            .eq("orgId", campus._id)
            .eq("orgType", "campus"),
        )
        .collect();
      if (
        !studentMembership.some((assignment) => assignment.role === "student")
      ) {
        return null;
      }
      if (
        !viewingOwnProfile &&
        !(await canViewCampusPeople(
          ctx,
          viewer._id,
          campus._id,
          campus.schoolId,
        ))
      ) {
        return null;
      }
    }

    const canEdit = campus
      ? await canManageCampusPeople(
          ctx,
          viewer._id,
          campus._id,
          campus.schoolId,
        )
      : false;

    const enrollmentRows = await ctx.db
      .query("classEnrollments")
      .withIndex("by_student", (q) => q.eq("studentId", user._id))
      .collect();
    const normalizedClasses = (
      await Promise.all(enrollmentRows.map((row) => ctx.db.get(row.classId)))
    ).filter((classData) => classData?.isActive);
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
    const myClasses = [
      ...new Map(
        [...normalizedClasses, ...legacyClasses]
          .filter((classData) => classData !== null)
          .filter((classData) => !campus || classData!.campusId === campus._id)
          .map((classData) => [classData!._id, classData!]),
      ).values(),
    ];
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
          attendanceRate: 100,
          completedSessions: 0,
        },
        classes: [],
        upcomingLessons: [],
      };
    }

    const mySessions = await ctx.db
      .query("class_sessions")
      .withIndex("by_student_date", (q) => q.eq("studentId", user._id))
      .collect();

    // --- Per-class stats ---
    const classDetails = await Promise.all(
      myClasses.map(async (classData) => {
        const [teacher, curriculum, userPreference, schedules, timeZone] =
          await Promise.all([
            classData.teacherId ? ctx.db.get(classData.teacherId) : null,
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
            includeUpcomingLessons
              ? getClassTimeZone(ctx, classData)
              : Promise.resolve(undefined),
          ]);

        const pastSchedules = schedules.filter(
          (schedule) => schedule.scheduledEnd < args.now,
        );
        const scheduleIds = new Set(schedules.map((s) => s._id));
        const classSessions = mySessions.filter((s) =>
          scheduleIds.has(s.scheduleId),
        );

        let attendedCount = 0;
        const processedSchedules = new Set();
        classSessions.forEach((session) => {
          if (processedSchedules.has(session.scheduleId)) return;
          if (
            session.attendanceStatus === "present" ||
            session.attendanceStatus === "partial"
          ) {
            attendedCount++;
            processedSchedules.add(session.scheduleId);
            return;
          }
          if ((session.durationSeconds || 0) > 600) {
            attendedCount++;
            processedSchedules.add(session.scheduleId);
          }
        });

        const totalPast = pastSchedules.length;
        const progress =
          totalPast === 0 ? 0 : Math.round((attendedCount / totalPast) * 100);

        return {
          stats: {
            classId: classData._id,
            className: classData.name,
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
              totalClasses: schedules.length,
              completedClasses: pastSchedules.length,
              attendedClasses: attendedCount,
              progressPercentage: Math.min(progress, 100),
            },
            icon: userPreference?.icon || null,
            nextSession: schedules
              .filter((schedule) => schedule.scheduledStart > args.now)
              .sort((a, b) => a.scheduledStart - b.scheduledStart)[0]
              ?.scheduledStart,
          },
          upcomingLessons: includeUpcomingLessons
            ? schedules
                .filter(
                  (schedule) =>
                    schedule.status !== "cancelled" &&
                    schedule.scheduledEnd > args.now,
                )
                .map((schedule) => ({
                  scheduleId: schedule._id,
                  title: schedule.title || classData.name,
                  ...(schedule.description !== undefined
                    ? { description: schedule.description }
                    : {}),
                  className: classData.name,
                  start: schedule.scheduledStart,
                  end: schedule.scheduledEnd,
                  timeZone: timeZone ?? "UTC",
                  roomName: schedule.roomName,
                  isLive: schedule.isLive === true,
                  color: curriculum?.color || "#3b82f6",
                  status: schedule.status,
                  ...(schedule.sessionType !== undefined
                    ? { sessionType: schedule.sessionType }
                    : {}),
                  attendance: "upcoming" as const,
                  minutesAttended: 0 as const,
                  isStudentActive: false as const,
                }))
            : [],
        };
      }),
    );
    const classStats = classDetails.map((item) => item.stats);
    const upcomingLessons = classDetails
      .flatMap((item) => item.upcomingLessons)
      .sort((a, b) => a.start - b.start)
      .slice(0, 50);

    // --- Overall stats ---
    const totalCourses = classStats.length;
    const totalSessions = classStats.reduce(
      (acc, c) => acc + c.stats.totalClasses,
      0,
    );
    const totalAttended = classStats.reduce(
      (acc, c) => acc + c.stats.attendedClasses,
      0,
    );
    const totalPastSessions = classStats.reduce(
      (acc, c) => acc + c.stats.completedClasses,
      0,
    );

    const overallAttendance =
      totalPastSessions === 0
        ? 100
        : Math.round((totalAttended / totalPastSessions) * 100);

    return {
      canEdit,
      student: studentProfile,
      overall: {
        activeCourses: totalCourses,
        totalSessions,
        attendanceRate: overallAttendance,
        completedSessions: totalPastSessions,
      },
      classes: classStats,
      upcomingLessons,
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
