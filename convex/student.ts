import { query } from "./_generated/server";
import { getCurrentUserFromAuth } from "./users";

export const getStudentDashboardStats = query({
  handler: async (ctx) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user || user.role !== "student") return null;

    const allClasses = await ctx.db
      .query("classes")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const myClasses = allClasses.filter((c) => c.students.includes(user._id));

    // --- Per-class stats ---
    const classStats = await Promise.all(
      myClasses.map(async (classData) => {
        const [teacher, curriculum] = await Promise.all([
          ctx.db.get(classData.teacherId),
          ctx.db.get(classData.curriculumId)
        ]);
        
        const schedules = await ctx.db
          .query("classSchedule")
          .withIndex("by_class", (q) => q.eq("classId", classData._id))
          .collect();

        const now = Date.now();
        const pastSchedules = schedules.filter((s) => s.scheduledEnd < now);
        const scheduleIds = new Set(schedules.map(s => s._id));
        
        const mySessions = await ctx.db
          .query("class_sessions")
          .withIndex("by_student_date", (q) => q.eq("studentId", user._id))
          .collect();

        const classSessions = mySessions.filter(s => scheduleIds.has(s.scheduleId));
        
        let attendedCount = 0;
        const processedSchedules = new Set();
        classSessions.forEach(session => {
            if (processedSchedules.has(session.scheduleId)) return;
            if (session.attendanceStatus === 'present' || session.attendanceStatus === 'partial') {
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
        const progress = totalPast === 0 ? 0 : Math.round((attendedCount / totalPast) * 100);

        return {
          classId: classData._id,
          className: classData.name,
          curriculumTitle: curriculum?.title || "Unknown Course",
          description: classData.description,
          teacher: teacher
            ? { fullName: teacher.fullName, imageUrl: teacher.imageUrl }
            : { fullName: "Unknown", imageUrl: undefined },
          stats: {
            totalClasses: schedules.length,
            completedClasses: pastSchedules.length,
            attendedClasses: attendedCount,
            progressPercentage: Math.min(progress, 100),
          },
          nextSession: schedules
            .filter(s => s.scheduledStart > now)
            .sort((a, b) => a.scheduledStart - b.scheduledStart)[0]?.scheduledStart
        };
      })
    );

    // --- Overall stats ---
    const totalCourses = classStats.length;
    const totalSessions = classStats.reduce((acc, c) => acc + c.stats.totalClasses, 0);
    const totalAttended = classStats.reduce((acc, c) => acc + c.stats.attendedClasses, 0);
    const totalPastSessions = classStats.reduce((acc, c) => acc + c.stats.completedClasses, 0);
    
    const overallAttendance = totalPastSessions === 0 
        ? 100 
        : Math.round((totalAttended / totalPastSessions) * 100);

    return {
        student: {
            fullName: user.fullName,
            email: user.email,
            imageUrl: user.imageUrl,
            grade: user.grade,
            school: user.school,
        },
        overall: {
            activeCourses: totalCourses,
            totalSessions,
            attendanceRate: overallAttendance,
            completedSessions: totalPastSessions
        },
        classes: classStats
    };
  },
});