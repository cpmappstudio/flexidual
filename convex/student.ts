import { query, mutation } from "./_generated/server";
import { getCurrentUserFromAuth } from "./users";
import { v } from "convex/values";
import { getInstitutionGrades } from "./model/grades";
import { getStudentGradeCode } from "./model/membership";
import { isStudentEnrolled } from "./model/enrollments";

export const getStudentDashboardStats = query({
  args: { now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      student: v.object({
        fullName: v.string(),
        email: v.optional(v.string()),
        username: v.optional(v.string()),
        imageUrl: v.optional(v.string()),
        grade: v.optional(v.string()),
        gradeName: v.optional(v.string()),
        school: v.optional(v.string()),
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
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) return null;

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
          .map((classData) => [classData!._id, classData!]),
      ).values(),
    ];
    const studentProfile = {
      fullName: user.fullName,
      email: user.email,
      username: user.username,
      imageUrl: user.imageUrl,
      grade: user.grade,
      school: user.school,
    };

    if (myClasses.length === 0) {
      return {
        student: studentProfile,
        overall: {
          activeCourses: 0,
          totalSessions: 0,
          attendanceRate: 100,
          completedSessions: 0,
        },
        classes: [],
      };
    }

    const firstClass = myClasses[0];
    const [firstCurriculum, firstCampus] = await Promise.all([
      ctx.db.get(firstClass.curriculumId),
      firstClass.campusId ? ctx.db.get(firstClass.campusId) : null,
    ]);
    const schoolId = firstCampus?.schoolId ?? firstCurriculum?.schoolId;
    const gradeCode = schoolId
      ? await getStudentGradeCode(
          ctx,
          user._id,
          schoolId,
          firstClass.campusId,
        )
      : undefined;
    const gradeName = gradeCode && schoolId
      ? (await getInstitutionGrades(ctx, schoolId)).find(
          (grade) => grade.code === gradeCode,
        )?.name
      : undefined;
    const mySessions = await ctx.db
      .query("class_sessions")
      .withIndex("by_student_date", (q) => q.eq("studentId", user._id))
      .collect();

    // --- Per-class stats ---
    const classStats = await Promise.all(
      myClasses.map(async (classData) => {
        const [teacher, curriculum] = await Promise.all([
          classData.teacherId ? ctx.db.get(classData.teacherId) : null,
          ctx.db.get(classData.curriculumId),
        ]);

        const userPreference = await ctx.db
          .query("studentClassPreferences")
          .withIndex("by_student_class", (q) =>
            q.eq("studentId", user._id).eq("classId", classData._id),
          )
          .unique();

        const schedules = await ctx.db
          .query("classSchedule")
          .withIndex("by_class", (q) => q.eq("classId", classData._id))
          .collect();

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
          classId: classData._id,
          className: classData.name,
          curriculumTitle:
            curriculum?.title ??
            (classData.classType === "abeka"
              ? "Abeka Curriculum"
              : classData.classType === "ignitia"
                ? "Ignitia Curriculum"
                : "Curriculum"),
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
        };
      }),
    );

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
      student: {
        ...studentProfile,
        grade: gradeCode,
        gradeName,
      },
      overall: {
        activeCourses: totalCourses,
        totalSessions,
        attendanceRate: overallAttendance,
        completedSessions: totalPastSessions,
      },
      classes: classStats,
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
