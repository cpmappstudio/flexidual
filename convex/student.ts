import { v } from "convex/values";
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

    const stats = await Promise.all(
      myClasses.map(async (classData) => {
        const [teacher, curriculum] = await Promise.all([
          ctx.db.get(classData.teacherId),
          ctx.db.get(classData.curriculumId)
        ]);
        
        // Get all schedules for this class
        const schedules = await ctx.db
          .query("classSchedule")
          .withIndex("by_class", (q) => q.eq("classId", classData._id))
          .collect();

        const now = Date.now();
        const pastSchedules = schedules.filter((s) => s.scheduledEnd < now);
        
        // Get attendance records for this student in this class
        // We fetch sessions linked to the schedules of this class
        const scheduleIds = new Set(schedules.map(s => s._id));
        
        const mySessions = await ctx.db
          .query("class_sessions")
          .withIndex("by_student_date", (q) => q.eq("studentId", user._id))
          .collect();

        // Filter sessions relevant to this class
        const classSessions = mySessions.filter(s => scheduleIds.has(s.scheduleId));

        // Calculate Attendance Score
        // Logic: Count 'present' or 'partial' or significant duration
        let attendedCount = 0;
        
        // We map sessions to schedules to handle multiple joins per schedule
        const processedSchedules = new Set();

        classSessions.forEach(session => {
            if (processedSchedules.has(session.scheduleId)) return;
            
            // Check manual status
            if (session.attendanceStatus === 'present' || session.attendanceStatus === 'partial') {
                attendedCount++;
                processedSchedules.add(session.scheduleId);
                return;
            }

            // Check automated duration (fallback)
            // Assuming 30 mins (1800s) is a "presence" if no manual status
            if ((session.durationSeconds || 0) > 600) { // > 10 mins
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

    return stats;
  },
});