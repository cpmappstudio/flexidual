import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { getCurrentUserOrThrow, getCurrentUserFromAuth } from "./users";
import { Id } from "./_generated/dataModel";
import { ConvexError } from "convex/values";
import { hasSystemRole, canManageClasses } from "./permissions";

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const FULL_ATTENDANCE_THRESHOLD_PERCENT = 0.5;
const PARTIAL_ATTENDANCE_THRESHOLD_PERCENT = 0.10;
const MIN_PARTIAL_SECONDS = 120; 
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

// ============================================================================
// HELPERS
// ============================================================================

async function validateScheduleOverlap(
  ctx: any,
  {
    teacherId, // Now it naturally accepts undefined
    classId,
    start,
    end,
    excludeScheduleId
  }: {
    teacherId?: Id<"users">, // <-- Make optional here
    classId: Id<"classes">,
    start: number,
    end: number,
    excludeScheduleId?: Id<"classSchedule">
  }
) {
  // 1. Check if the CLASS is already busy
  const classConflicts = await ctx.db
    .query("classSchedule")
    .withIndex("by_class", (q: any) => q.eq("classId", classId))
    .filter((q: any) => 
      q.and(
        q.neq(q.field("status"), "cancelled"),
        q.lt(q.field("scheduledStart"), end),
        q.gt(q.field("scheduledEnd"), start)
      )
    )
    .collect();

  const realClassConflicts = excludeScheduleId 
    ? classConflicts.filter((s: any) => s._id !== excludeScheduleId)
    : classConflicts;

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
      .withIndex("by_teacher", (q: any) => q.eq("teacherId", teacherId).eq("isActive", true))
      .collect();
    
    const teacherClassIds = new Set(teacherClasses.map((c: any) => c._id));

    if (teacherClassIds.size > 0) {
      const potentialOverlaps = await ctx.db
        .query("classSchedule")
        .withIndex("by_date_range", (q: any) => q.gte("scheduledStart", start - 24 * 60 * 60 * 1000))
        .filter((q: any) => 
          q.and(
            q.neq(q.field("status"), "cancelled"),
            q.lt(q.field("scheduledStart"), end),
            q.gt(q.field("scheduledEnd"), start)
          )
        )
        .collect();

      const teacherConflict = potentialOverlaps.find((s: any) => 
        teacherClassIds.has(s.classId) && s._id !== excludeScheduleId
      );

      if (teacherConflict) {
        const conflictClass = teacherClasses.find((c: any) => c._id === teacherConflict.classId);
        
        throw new ConvexError({
          code: "TEACHER_SCHEDULE_CONFLICT",
          className: conflictClass?.name || "another class",
          conflictTime: teacherConflict.scheduledStart.toString(),
        });
      }
    }
  }
}

function getFirstValidRecurrenceDate(
  startDateMs: number, 
  daysOfWeek: number[] | undefined
): number {
  if (!daysOfWeek || daysOfWeek.length === 0) return startDateMs;

  const start = new Date(startDateMs);
  const startDay = start.getDay(); 

  if (daysOfWeek.includes(startDay)) return startDateMs;

  const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
  const nextInWeek = sortedDays.find(d => d > startDay);
  
  let daysToAdd = 0;
  if (nextInWeek !== undefined) {
    daysToAdd = nextInWeek - startDay;
  } else {
    daysToAdd = (7 - startDay) + sortedDays[0];
  }

  return startDateMs + (daysToAdd * 24 * 60 * 60 * 1000);
}

// ============================================================================
// QUERIES
// ============================================================================

export const getMySchedule = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    status: v.optional(v.union(
      v.literal("scheduled"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("cancelled")
    )),
    teacherId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) return [];

    const isSuperAdmin = await hasSystemRole(ctx, user._id, ["superadmin"]);
    
    // Check if they hold any admin role assignments
    const adminAssignments = await ctx.db.query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter(q => q.or(q.eq(q.field("role"), "admin"), q.eq(q.field("role"), "principal")))
      .collect();
      
    const isAdmin = isSuperAdmin || adminAssignments.length > 0;
    const adminSchoolIds = adminAssignments.filter(a => a.orgType === "school").map(a => a.orgId);
    const adminCampusIds = adminAssignments.filter(a => a.orgType === "campus").map(a => a.orgId);

    let myClasses: any[] = [];

    if (isAdmin) {
      let baseClasses = [];
      if (args.teacherId) {
        baseClasses = await ctx.db.query("classes")
          .withIndex("by_teacher", q => q.eq("teacherId", args.teacherId!).eq("isActive", true))
          .collect();
      } else {
        baseClasses = await ctx.db.query("classes")
          .withIndex("by_active", q => q.eq("isActive", true))
          .collect();
      }

      if (isSuperAdmin) {
        myClasses = baseClasses;
      } else {
         for (const c of baseClasses) {
            if (c.campusId && adminCampusIds.includes(c.campusId)) { myClasses.push(c); continue; }
            const curr = await ctx.db.get(c.curriculumId);
            if (curr?.schoolId && adminSchoolIds.includes(curr.schoolId)) { myClasses.push(c); }
         }
      }
    } else {
      const teachingClasses = await ctx.db.query("classes")
        .withIndex("by_teacher", q => q.eq("teacherId", user._id).eq("isActive", true))
        .collect();
      
      const allClasses = await ctx.db.query("classes")
        .withIndex("by_active", q => q.eq("isActive", true))
        .collect();
      
      const enrolledClasses = allClasses.filter(c => c.students.includes(user._id));

      const combined = [...teachingClasses, ...enrolledClasses];
      const uniqueIds = new Set();
      myClasses = combined.filter(c => {
        if(uniqueIds.has(c._id)) return false;
        uniqueIds.add(c._id);
        return true;
      });
    }

    if (myClasses.length === 0) return [];

    const classIds = myClasses.map(c => c._id);

    const scheduleItems = await Promise.all(
      classIds.map(id => 
        ctx.db
          .query("classSchedule")
          .withIndex("by_class", (q) => q.eq("classId", id))
          .collect()
      )
    );

    let flatSchedule = scheduleItems.flat();

    if (args.from) flatSchedule = flatSchedule.filter(s => s.scheduledStart >= args.from!);
    if (args.to) flatSchedule = flatSchedule.filter(s => s.scheduledStart <= args.to!);
    if (args.status) flatSchedule = flatSchedule.filter(s => s.status === args.status);

    const uniqueCurriculumIds = new Set(myClasses.map(c => c.curriculumId));
    const uniqueTeacherIds = new Set(myClasses.map(c => c.teacherId).filter(Boolean));
    const uniqueLessonIds = new Set(flatSchedule.flatMap(s => s.lessonIds || []));

    const [curriculums, teachers, lessons] = await Promise.all([
      Promise.all(Array.from(uniqueCurriculumIds).map(id => ctx.db.get(id as Id<"curriculums">))),
      Promise.all(Array.from(uniqueTeacherIds).map(id => ctx.db.get(id as Id<"users">))),
      Promise.all(Array.from(uniqueLessonIds).map(id => ctx.db.get(id as Id<"lessons">))),
    ]);

    const curriculumMap = new Map(curriculums.filter(Boolean).map(c => [c!._id, c!]));
    const teacherMap = new Map(teachers.filter(Boolean).map(t => [t!._id, t!]));
    const lessonMap = new Map(lessons.filter(Boolean).map(l => [l!._id, l!]));

    // We only load attendance data if the user is an admin or the active teacher/student
    const allSessionsForSchedules = await Promise.all(
      flatSchedule.map(s =>
        ctx.db
          .query("class_sessions")
          .withIndex("by_schedule", (q) => q.eq("scheduleId", s._id))
          .collect()
      )
    );

    const sessionsBySchedule = new Map(flatSchedule.map((s, idx) => [s._id, allSessionsForSchedules[idx] || []]));

    const results = await Promise.all(
      flatSchedule.map(async (item) => {
        const classData = myClasses.find(c => c._id === item.classId);
        if (!classData) return null;

        const curriculum = curriculumMap.get(classData.curriculumId);
        const teacher = teacherMap.get(classData.teacherId);
        
        const isClassAdminOrTeacher = isAdmin || classData.teacherId === user._id;

        const scheduledLessons = (item.lessonIds || []).map(id => lessonMap.get(id)).filter(Boolean);
        const title = item.title || (scheduledLessons[0]?.title) || "Class Session";
        const description = item.description || (scheduledLessons[0]?.description) || "";

        let recurrenceRule = item.recurrenceRule;
        if (item.recurrenceParentId && !recurrenceRule) {
          const parent = await ctx.db.get(item.recurrenceParentId);
          recurrenceRule = parent?.recurrenceRule;
        }

        const sessions = sessionsBySchedule.get(item._id) || [];
        
        let attendanceStatus: "upcoming" | "present" | "absent" | "partial" | "in-progress" | "late" = "upcoming";
        let timeInClass = 0;
        let isStudentActive = false;
        
        let attendanceSummary = { present: 0, partial: 0, missed: 0, total: classData.students.length };
        const now = Date.now();

        // Student Stats Calculation
        if (!isClassAdminOrTeacher) {
          const studentSessions = sessions.filter(s => s.studentId === user._id);
          const activeSession = studentSessions.find(s => s.joinedAt && !s.leftAt);
          isStudentActive = !!activeSession;

          const manualRecord = studentSessions.find(s => s.attendanceStatus);
          
          if (manualRecord?.attendanceStatus) {
            attendanceStatus = manualRecord.attendanceStatus as any;
          } else {
            timeInClass = studentSessions.reduce((sum, s) => {
              const sessionStart = s.joinedAt;
              const sessionEnd = s.leftAt || now;
              const effectiveStart = Math.max(sessionStart, item.scheduledStart);
              const effectiveEnd = Math.min(sessionEnd, item.scheduledEnd);
              const duration = Math.max(0, (effectiveEnd - effectiveStart) / 1000);
              return sum + duration;
            }, 0);
            
            const scheduledDuration = (item.scheduledEnd - item.scheduledStart) / 1000;
            const ratio = scheduledDuration > 0 ? timeInClass / scheduledDuration : 0;

            if (ratio >= FULL_ATTENDANCE_THRESHOLD_PERCENT) attendanceStatus = "present";
            else if (ratio >= PARTIAL_ATTENDANCE_THRESHOLD_PERCENT || timeInClass >= MIN_PARTIAL_SECONDS) attendanceStatus = "partial";
            else if (item.scheduledStart > now && !isStudentActive) attendanceStatus = "upcoming";
            else if (now >= item.scheduledStart && now <= item.scheduledEnd) attendanceStatus = isStudentActive ? "in-progress" : "late";
            else attendanceStatus = "absent";
          }
        }
        
        // Teacher/Admin Stats Calculation
        if (isClassAdminOrTeacher) {
          const studentStats = new Map<string, { totalSeconds: number, manualStatus?: string }>();
          
          sessions.forEach(s => {
            const current = studentStats.get(s.studentId) || { totalSeconds: 0 };
            
            const sessionStart = s.joinedAt;
            const sessionEnd = s.leftAt || now;
            const effectiveStart = Math.max(sessionStart, item.scheduledStart);
            const effectiveEnd = Math.min(sessionEnd, item.scheduledEnd);
            const duration = Math.max(0, (effectiveEnd - effectiveStart) / 1000);

            current.totalSeconds += duration;
            if (s.attendanceStatus) current.manualStatus = s.attendanceStatus;
            studentStats.set(s.studentId, current);
          });
          
          const scheduledDuration = (item.scheduledEnd - item.scheduledStart) / 1000;

          for (const studentId of classData.students) {
            const stats = studentStats.get(studentId);
            let status = "absent";
            
            if (stats?.manualStatus) {
              status = stats.manualStatus;
            } else if (stats) {
              const ratio = scheduledDuration > 0 ? stats.totalSeconds / scheduledDuration : 0;
              if (ratio >= FULL_ATTENDANCE_THRESHOLD_PERCENT) status = "present";
              else if (ratio >= PARTIAL_ATTENDANCE_THRESHOLD_PERCENT || stats.totalSeconds >= MIN_PARTIAL_SECONDS) status = "partial";
            }
            
            if (status === "present" || status === "excused") attendanceSummary.present++;
            else if (status === "partial" || status === "late") attendanceSummary.partial++;
            else attendanceSummary.missed++;
          }
        }

        const isStale = now > (item.scheduledEnd + STALE_THRESHOLD_MS);
        const effectiveIsLive = item.isLive && !isStale || false;
        const effectiveStatus = (item.status === "active" && isStale) ? "completed" : item.status;

        let teacherAttendanceStatus = "upcoming";
        let teacherTimeInClass = 0;

        if (isClassAdminOrTeacher) {
            const teacherSessions = sessions.filter(s => s.studentId === classData.teacherId);
            if (teacherSessions.length > 0) {
                teacherTimeInClass = teacherSessions.reduce((sum, s) => {
                    const sessionStart = s.joinedAt;
                    const sessionEnd = s.leftAt || now;
                    const effectiveStart = Math.max(sessionStart, item.scheduledStart);
                    const effectiveEnd = Math.min(sessionEnd, item.scheduledEnd);
                    const duration = Math.max(0, (effectiveEnd - effectiveStart) / 1000);
                    return sum + duration;
                }, 0);
                
                const scheduledDuration = (item.scheduledEnd - item.scheduledStart) / 1000;
                const ratio = scheduledDuration > 0 ? teacherTimeInClass / scheduledDuration : 0;
                
                if (ratio >= FULL_ATTENDANCE_THRESHOLD_PERCENT) teacherAttendanceStatus = "present";
                else if (ratio >= PARTIAL_ATTENDANCE_THRESHOLD_PERCENT || teacherTimeInClass >= MIN_PARTIAL_SECONDS) teacherAttendanceStatus = "partial";
                else teacherAttendanceStatus = "absent";
            } else if (item.scheduledEnd < now) {
                if (effectiveStatus === "completed") teacherAttendanceStatus = "present";
                else if (effectiveStatus === "cancelled") teacherAttendanceStatus = "excused";
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
          roomName: item.roomName,
          isLive: effectiveIsLive,
          sessionType: item.sessionType || "live",
          status: effectiveStatus,
          lessonIds: item.lessonIds || [],
          lessons: scheduledLessons.map(l => ({
            _id: l!._id, title: l!.title, order: l!.order,
          })),
          classId: classData._id,
          curriculumId: classData.curriculumId,
          isRecurring: item.isRecurring || false,
          recurrenceRule: recurrenceRule,
          recurrenceParentId: item.recurrenceParentId,
          teacherName: teacher?.fullName || "Unknown",
          teacherImageUrl: teacher?.imageUrl,
          teacherAttendance: isClassAdminOrTeacher ? {
            status: teacherAttendanceStatus,
            minutes: Math.round(teacherTimeInClass / 60)
          } : undefined,
          attendance: attendanceStatus,
          minutesAttended: Math.round(timeInClass / 60),
          isStudentActive: isStudentActive,
          attendanceSummary: isClassAdminOrTeacher ? attendanceSummary : undefined
        };
      })
    );

    return results.filter((r): r is NonNullable<typeof r> => r !== null).sort((a, b) => a.start - b.start);
  },
});

export const get = query({
  args: { id: v.id("classSchedule") },
  handler: async (ctx, args) => await ctx.db.get(args.id),
});

export const getWithDetails = query({
  args: { id: v.id("classSchedule") },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.id);
    if (!schedule) return null;

    const classData = await ctx.db.get(schedule.classId);
    if (!classData) return null;

    const lessons = schedule.lessonIds && schedule.lessonIds.length > 0
      ? await Promise.all(schedule.lessonIds.map(id => ctx.db.get(id)))
      : [];
    const validLessons = lessons.filter(Boolean);

    const [curriculum, teacher] = await Promise.all([
      ctx.db.get(classData.curriculumId),
      classData.teacherId ? ctx.db.get(classData.teacherId) : null,
    ]);

    return {
      ...schedule,
      lessons: validLessons.map(l => ({
        _id: l!._id, title: l!.title, description: l!.description, content: l!.content, order: l!.order,
      })),
      class: { _id: classData._id, name: classData.name, studentCount: classData.students.length },
      curriculum: curriculum ? { _id: curriculum._id, title: curriculum.title, code: curriculum.code, color: curriculum.color } : null,
      teacher: teacher ? { _id: teacher._id, fullName: teacher.fullName, email: teacher.email, avatarStorageId: teacher.avatarStorageId } : null,
    };
  },
});

export const getByRoomName = query({
  args: { roomName: v.string() },
  handler: async (ctx, args) => await ctx.db.query("classSchedule").withIndex("by_room", (q) => q.eq("roomName", args.roomName)).first(),
});

export const getSessionStatus = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    let schedule = await ctx.db.query("classSchedule").withIndex("by_room", (q) => q.eq("roomName", args.sessionId)).first();

    if (!schedule) {
      const allSchedules = await ctx.db.query("classSchedule").withIndex("by_status", (q) => q.eq("status", "active")).collect();
      schedule = allSchedules.find(s => s._id === args.sessionId) || null;
    }

    if (!schedule) return null;

    const now = Date.now();
    const joinWindowStart = schedule.scheduledStart - (10 * 60 * 1000);
    const joinWindowEnd = schedule.scheduledEnd + (5 * 60 * 1000);

    const isTimeWindowActive = now >= joinWindowStart && now <= joinWindowEnd;
    const isStale = now > (schedule.scheduledEnd + STALE_THRESHOLD_MS);
    const isExplicitlyActive = schedule.status === "active" && !isStale;

    return {
      scheduleId: schedule._id,
      isActive: isTimeWindowActive || isExplicitlyActive,
      status: schedule.status,
      start: schedule.scheduledStart,
      end: schedule.scheduledEnd,
      roomName: schedule.roomName,
      canJoin: schedule.status === "active" || schedule.status === "scheduled",
    };
  },
});

export const checkLiveKitAccess = internalQuery({
  args: { 
    userId: v.id("users"), 
    roomName: v.string() 
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", args.roomName))
      .first();

    if (!schedule) return null;

    const classData = await ctx.db.get(schedule.classId);
    if (!classData) return null;

    const curriculum = await ctx.db.get(classData.curriculumId);

    // 1. Check if they manage the class (Teacher, Tutor, or Admin)
    const isDirectTeacher = classData.teacherId === args.userId || classData.tutorId === args.userId;
    const isAuthorizedAdmin = await canManageClasses(ctx, args.userId, classData.campusId, curriculum?.schoolId);
    
    // 2. Check if they are a registered student
    const isEnrolledStudent = classData.students.includes(args.userId);

    if (!isDirectTeacher && !isAuthorizedAdmin && !isEnrolledStudent) {
      return { authorized: false };
    }

    const isRoomAdmin = isDirectTeacher || isAuthorizedAdmin;

    return {
      authorized: true,
      roomAdmin: isRoomAdmin,
      canJoinEarly: isRoomAdmin,
      computedRole: isRoomAdmin ? "teacher" : "student"
    };
  }
});

export const getUsedLessons = query({
  args: { classId: v.id("classes") },
  handler: async (ctx, args) => {
    const schedules = await ctx.db.query("classSchedule").withIndex("by_class", (q) => q.eq("classId", args.classId)).collect();
    const usedLessons = new Set<Id<"lessons">>();
    schedules.forEach(s => { if (s.lessonIds) s.lessonIds.forEach(id => usedLessons.add(id)); });
    return Array.from(usedLessons);
  },
});

export const getAttendanceDetails = query({
  args: { scheduleId: v.id("classSchedule") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) throw new Error("Schedule not found");
    
    const classData = await ctx.db.get(schedule.classId);
    if (!classData) throw new Error("Class not found");
    const curriculum = await ctx.db.get(classData.curriculumId);

    const isClassTeacher = classData.teacherId === user._id;
    const isAuthorizedAdmin = await canManageClasses(ctx, user._id, classData.campusId, curriculum?.schoolId);

    if (!isClassTeacher && !isAuthorizedAdmin) throw new Error("Unauthorized");

    const students = await Promise.all(classData.students.map(id => ctx.db.get(id)));
    const validStudents = students.filter(s => s !== null);

    const sessions = await ctx.db.query("class_sessions").withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId)).collect();

    const now = Date.now();
    const results = validStudents.map(student => {
      const studentSessions = sessions.filter(s => s.studentId === student!._id);
      
      const totalSeconds = studentSessions.reduce((sum, s) => {
         const sessionStart = s.joinedAt;
         const sessionEnd = s.leftAt || now;
         const effectiveStart = Math.max(sessionStart, schedule.scheduledStart);
         const effectiveEnd = Math.min(sessionEnd, schedule.scheduledEnd);
         const duration = Math.max(0, (effectiveEnd - effectiveStart) / 1000);
         return sum + duration;
      }, 0);
      
      const manualRecord = studentSessions.find(s => s.attendanceStatus);
      const manualStatus = manualRecord?.attendanceStatus;
      
      const scheduledDuration = (schedule.scheduledEnd - schedule.scheduledStart) / 1000;
      const ratio = scheduledDuration > 0 ? totalSeconds / scheduledDuration : 0;
      
      let computedStatus = "absent";
      if (ratio >= FULL_ATTENDANCE_THRESHOLD_PERCENT) computedStatus = "present";
      else if (ratio >= PARTIAL_ATTENDANCE_THRESHOLD_PERCENT || totalSeconds >= MIN_PARTIAL_SECONDS) computedStatus = "partial";
      
      if (schedule.sessionType === "ignitia" && totalSeconds === 0 && !manualStatus) {
         computedStatus = "pending";
      }

      return {
        studentId: student!._id,
        fullName: student!.fullName,
        email: student!.email,
        imageUrl: student!.imageUrl,
        totalMinutes: Math.round(totalSeconds / 60),
        status: manualStatus || computedStatus,
        isManual: !!manualStatus,
        lastSeen: studentSessions.length > 0 ? Math.max(...studentSessions.map(s => s.joinedAt)) : null
      };
    });

    return results.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const createSchedule = mutation({
  args: {
    classId: v.id("classes"),
    lessonIds: v.optional(v.array(v.id("lessons"))),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    scheduledStart: v.number(),
    scheduledEnd: v.number(),
    sessionType: v.optional(v.union(v.literal("live"), v.literal("ignitia"), v.literal("abeka"))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const classData = await ctx.db.get(args.classId);
    if (!classData) throw new Error("Class not found");
    const curriculum = await ctx.db.get(classData.curriculumId);

    const isClassTeacher = classData.teacherId === user._id;
    const isAuthorizedAdmin = await canManageClasses(ctx, user._id, classData.campusId, curriculum?.schoolId);

    if (!isClassTeacher && !isAuthorizedAdmin) {
      throw new Error("Only administrators or the class teacher can create schedules");
    }

    if (args.lessonIds && args.lessonIds.length > 0) {
      const usedLessons = await ctx.db.query("classSchedule").withIndex("by_class", (q) => q.eq("classId", args.classId)).collect();
      const allUsedLessonIds = new Set<string>();
      usedLessons.forEach(s => { if (s.lessonIds) s.lessonIds.forEach(id => allUsedLessonIds.add(id)); });

      for (const lessonId of args.lessonIds) {
        if (allUsedLessonIds.has(lessonId)) throw new ConvexError({ code: "LESSON_ALREADY_SCHEDULED", lessonId: lessonId });
        const lesson = await ctx.db.get(lessonId);
        if (!lesson) throw new Error("Lesson not found");
        if (lesson.curriculumId !== classData.curriculumId) throw new Error("Lesson does not belong to this class's curriculum");
      }
    }

    if (args.scheduledEnd <= args.scheduledStart) throw new Error("End time must be after start time");

    await validateScheduleOverlap(ctx, {
      teacherId: classData.teacherId,
      classId: args.classId,
      start: args.scheduledStart,
      end: args.scheduledEnd
    });

    const roomName = `class-${args.classId}-${Date.now()}`;

    return await ctx.db.insert("classSchedule", {
      classId: args.classId,
      lessonIds: args.lessonIds,
      title: args.title,
      description: args.description,
      sessionType: args.sessionType || "live",
      scheduledStart: args.scheduledStart,
      scheduledEnd: args.scheduledEnd,
      roomName,
      isLive: false,
      isRecurring: false,
      status: "scheduled",
      createdAt: Date.now(),
      createdBy: user._id,
    });
  },
});

export const createRecurringSchedule = mutation({
  args: {
    classId: v.id("classes"),
    lessonIds: v.optional(v.array(v.id("lessons"))),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    scheduledStart: v.number(), 
    scheduledEnd: v.number(),
    sessionType: v.optional(v.union(v.literal("live"), v.literal("ignitia"), v.literal("abeka"))),
    timezoneOffset: v.number(),
    recurrence: v.object({
      type: v.union(v.literal("daily"), v.literal("weekly"), v.literal("biweekly"), v.literal("monthly")),
      daysOfWeek: v.optional(v.array(v.number())),
      endDate: v.optional(v.number()), 
      occurrences: v.optional(v.number()), 
    }),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const classData = await ctx.db.get(args.classId);
    if (!classData) throw new Error("Class not found");
    const curriculum = await ctx.db.get(classData.curriculumId);

    const isClassTeacher = classData.teacherId === user._id;
    const isAuthorizedAdmin = await canManageClasses(ctx, user._id, classData.campusId, curriculum?.schoolId);

    if (!isClassTeacher && !isAuthorizedAdmin) {
      throw new Error("Only administrators or the class teacher can create schedules");
    }

    if (args.lessonIds && args.lessonIds.length > 0) {
      throw new Error("Cannot assign lessons to a recurring schedule series. Please schedule lessons to individual sessions after creation.");
    }

    if (args.scheduledEnd <= args.scheduledStart) throw new Error("End time must be after start time");

    const offsetMs = args.timezoneOffset * 60 * 1000;
    const localStart = args.scheduledStart - offsetMs;
    const localEnd = args.scheduledEnd - offsetMs;
    
    let localEffectiveStart = localStart;
    let localEffectiveEnd = localEnd;

    if (args.recurrence.daysOfWeek && args.recurrence.daysOfWeek.length > 0) {
      const adjustedLocalStart = getFirstValidRecurrenceDate(localStart, args.recurrence.daysOfWeek);
      if (adjustedLocalStart !== localStart) {
        const diff = adjustedLocalStart - localStart;
        localEffectiveStart = adjustedLocalStart;
        localEffectiveEnd = localEnd + diff;
      }
    }

    const duration = localEffectiveEnd - localEffectiveStart;
    const localOccurrences = generateRecurrenceOccurrences(localEffectiveStart, args.recurrence);

    if (localOccurrences.length === 0) throw new Error("No valid occurrences generated");

    const realEffectiveStart = localEffectiveStart + offsetMs;
    const realEffectiveEnd = localEffectiveEnd + offsetMs;
    const realOccurrences = localOccurrences.map(t => t + offsetMs);

    await validateScheduleOverlap(ctx, {
      teacherId: classData.teacherId,
      classId: args.classId,
      start: realEffectiveStart,
      end: realEffectiveEnd
    });

    const parentRoomName = `class-${args.classId}-series-${Date.now()}`;

    const parentId = await ctx.db.insert("classSchedule", {
      classId: args.classId,
      lessonIds: [],
      title: args.title,
      description: args.description,
      scheduledStart: realEffectiveStart,
      scheduledEnd: realEffectiveEnd,
      roomName: parentRoomName,
      isLive: false,
      sessionType: args.sessionType || "live",
      isRecurring: true,
      recurrenceRule: JSON.stringify(args.recurrence),
      status: "scheduled",
      createdAt: Date.now(),
      createdBy: user._id,
    });

    const childIds = [];
    for (let i = 1; i < realOccurrences.length; i++) {
      const start = realOccurrences[i];
      const end = start + duration;
      
      const childId = await ctx.db.insert("classSchedule", {
        classId: args.classId,
        lessonIds: [],
        title: args.title,
        description: args.description,
        scheduledStart: start,
        scheduledEnd: end,
        roomName: `${parentRoomName}-${i}`,
        isLive: false,
        sessionType: args.sessionType || "live",
        isRecurring: true,
        recurrenceParentId: parentId,
        status: "scheduled",
        createdAt: Date.now(),
        createdBy: user._id,
      });
      
      childIds.push(childId);
    }

    return { parentId, childIds, totalOccurrences: realOccurrences.length };
  },
});

export const scheduleLesson = mutation({
  args: {
    classId: v.id("classes"),
    lessonIds: v.array(v.id("lessons")),
    scheduledStart: v.number(),
    scheduledEnd: v.number(),
    sessionType: v.optional(v.union(v.literal("live"), v.literal("ignitia"), v.literal("abeka"))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const classData = await ctx.db.get(args.classId);
    if (!classData) throw new Error("Class not found");
    const curriculum = await ctx.db.get(classData.curriculumId);

    const isClassTeacher = classData.teacherId === user._id;
    const isAuthorizedAdmin = await canManageClasses(ctx, user._id, classData.campusId, curriculum?.schoolId);

    if (!isClassTeacher && !isAuthorizedAdmin) {
      throw new Error("Only administrators or the class teacher can schedule lessons");
    }

    const lesson = await ctx.db.get(args.lessonIds[0]);
    if (!lesson) throw new Error("Lesson not found");
    if (lesson.curriculumId !== classData.curriculumId) throw new Error("Lesson does not belong to this class's curriculum");

    if (args.scheduledEnd <= args.scheduledStart) throw new Error("End time must be after start time");

    await validateScheduleOverlap(ctx, {
      teacherId: classData.teacherId,
      classId: args.classId,
      start: args.scheduledStart,
      end: args.scheduledEnd
    });

    const roomName = `class-${args.classId}-lesson-${args.lessonIds[0]}-${Date.now()}`;

    return await ctx.db.insert("classSchedule", {
      classId: args.classId,
      lessonIds: args.lessonIds,
      scheduledStart: args.scheduledStart,
      scheduledEnd: args.scheduledEnd,
      sessionType: args.sessionType || "live",
      roomName,
      isLive: false,
      status: "scheduled",
      createdAt: Date.now(),
      createdBy: user._id,
    });
  },
});

export const updateSchedule = mutation({
  args: {
    id: v.id("classSchedule"),
    lessonIds: v.optional(v.array(v.id("lessons"))),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    scheduledStart: v.optional(v.number()),
    scheduledEnd: v.optional(v.number()),
    status: v.optional(v.union(v.literal("scheduled"), v.literal("active"), v.literal("completed"), v.literal("cancelled"))),
    sessionType: v.optional(v.union(v.literal("live"), v.literal("ignitia"), v.literal("abeka"))),
    updateSeries: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const schedule = await ctx.db.get(args.id);
    if (!schedule) throw new Error("Schedule not found");
    const classData = await ctx.db.get(schedule.classId);
    if (!classData) throw new Error("Class not found");
    const curriculum = await ctx.db.get(classData.curriculumId);

    const isClassTeacher = classData.teacherId === user._id;
    const isAuthorizedAdmin = await canManageClasses(ctx, user._id, classData.campusId, curriculum?.schoolId);

    if (!isClassTeacher && !isAuthorizedAdmin) {
      throw new Error("Only administrators or the class teacher can update schedules");
    }

    if (args.updateSeries && args.lessonIds && args.lessonIds.length > 0) {
      throw new Error("Cannot add lessons when updating entire series. Edit individual occurrences instead.");
    }

    if (args.lessonIds && args.lessonIds.length > 0 && !args.updateSeries) {
      const usedLessons = await ctx.db.query("classSchedule").withIndex("by_class", (q) => q.eq("classId", schedule.classId)).collect();
      const allUsedLessonIds = new Set<string>();
      usedLessons.forEach(s => { if (s._id !== args.id && s.lessonIds) s.lessonIds.forEach(id => allUsedLessonIds.add(id)); });

      for (const lessonId of args.lessonIds) {
        if (allUsedLessonIds.has(lessonId)) throw new ConvexError({ code: "LESSON_ALREADY_SCHEDULED", lessonId: lessonId });
        const lesson = await ctx.db.get(lessonId);
        if (!lesson) throw new Error("Lesson not found");
        if (lesson.curriculumId !== classData.curriculumId) throw new Error("Lesson does not belong to this class's curriculum");
      }
    }

    const oldStart = schedule.scheduledStart;
    const newStart = args.scheduledStart ?? oldStart;
    const timeShiftDelta = newStart - oldStart;
    
    const oldEnd = schedule.scheduledEnd;
    const newEnd = args.scheduledEnd ?? oldEnd;
    const newDuration = newEnd - newStart;

    if (args.scheduledStart !== undefined || args.scheduledEnd !== undefined) {
      await validateScheduleOverlap(ctx, {
        teacherId: classData.teacherId,
        classId: classData._id,
        start: newStart,
        end: newEnd,
        excludeScheduleId: args.id
      });
    }

    const metadataUpdates: any = {};
    if (args.title !== undefined) metadataUpdates.title = args.title;
    if (args.sessionType !== undefined) metadataUpdates.sessionType = args.sessionType;
    if (args.description !== undefined) metadataUpdates.description = args.description;
    if (args.lessonIds !== undefined) metadataUpdates.lessonIds = args.lessonIds;
    if (args.status) {
      metadataUpdates.status = args.status;
      if (args.status === "completed" && !schedule.completedAt) metadataUpdates.completedAt = Date.now();
    }

    if (args.updateSeries && (schedule.isRecurring || schedule.recurrenceParentId)) {
      const masterId = schedule.recurrenceParentId || schedule._id;
      const itemsToUpdate = [];
      const parent = await ctx.db.get(masterId);
      if (parent) itemsToUpdate.push(parent);

      const children = await ctx.db.query("classSchedule").withIndex("by_recurrence_parent", (q) => q.eq("recurrenceParentId", masterId)).collect();
      itemsToUpdate.push(...children);

      const uniqueItems = Array.from(new Map(itemsToUpdate.map(item => [item._id, item])).values());
      const DAY_MS = 24 * 60 * 60 * 1000;

      for (const item of uniqueItems) {
        const updatePatch: any = { ...metadataUpdates };
        const timeDiffMs = item.scheduledStart - oldStart;
        const daysDifference = Math.round(timeDiffMs / DAY_MS);

        const itemNewStart = newStart + (daysDifference * DAY_MS);
        const itemNewEnd = itemNewStart + newDuration;

        const needsTimeUpdate = item.scheduledStart !== itemNewStart || item.scheduledEnd !== itemNewEnd;

        if (needsTimeUpdate) {
          updatePatch.scheduledStart = itemNewStart;
          updatePatch.scheduledEnd = itemNewEnd;
        }

        if (needsTimeUpdate || Object.keys(metadataUpdates).length > 0) {
          await ctx.db.patch(item._id, updatePatch);
        }
      }
      return { updated: uniqueItems.length, type: "series" };
    } else {
      const singleUpdates = { ...metadataUpdates };
      if (args.scheduledStart !== undefined) singleUpdates.scheduledStart = newStart;
      if (args.scheduledEnd !== undefined) singleUpdates.scheduledEnd = newEnd;
      await ctx.db.patch(args.id, singleUpdates);
      return { updated: 1, type: "single" };
    }
  },
});

export const cancelSchedule = mutation({
  args: { 
    id: v.id("classSchedule"),
    cancelSeries: v.optional(v.boolean()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const schedule = await ctx.db.get(args.id);
    if (!schedule) throw new Error("Schedule not found");
    const classData = await ctx.db.get(schedule.classId);
    if (!classData) throw new Error("Class not found");
    const curriculum = await ctx.db.get(classData.curriculumId);

    const isClassTeacher = classData.teacherId === user._id;
    const isAuthorizedAdmin = await canManageClasses(ctx, user._id, classData.campusId, curriculum?.schoolId);

    if (!isClassTeacher && !isAuthorizedAdmin) throw new Error("Only administrators or the class teacher can cancel schedules");

    if (args.cancelSeries && schedule.isRecurring) {
      const parentId = schedule.recurrenceParentId || schedule._id;
      const series = await ctx.db.query("classSchedule").withIndex("by_recurrence_parent", (q) => q.eq("recurrenceParentId", parentId)).collect();
      
      const updateData = { 
        status: "cancelled" as const,
        description: args.reason ? `${schedule.description || ''}\n\nCancellation reason: ${args.reason}` : schedule.description
      };
      await ctx.db.patch(parentId, updateData);
      
      for (const child of series) {
        await ctx.db.patch(child._id, { 
          status: "cancelled" as const,
          description: args.reason ? `${child.description || ''}\n\nCancellation reason: ${args.reason}` : child.description
        });
      }
      return { cancelled: series.length + 1, type: "series" };
    } else {
      await ctx.db.patch(args.id, { 
        status: "cancelled" as const,
        description: args.reason ? `${schedule.description || ''}\n\nCancellation reason: ${args.reason}` : schedule.description
      });
      return { cancelled: 1, type: "single" };
    }
  },
});

export const deleteSchedule = mutation({
  args: { 
    id: v.id("classSchedule"),
    deleteSeries: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const schedule = await ctx.db.get(args.id);
    if (!schedule) throw new Error("Schedule not found");
    const classData = await ctx.db.get(schedule.classId);
    if (!classData) throw new Error("Class not found");
    const curriculum = await ctx.db.get(classData.curriculumId);

    const isClassTeacher = classData.teacherId === user._id;
    const isAuthorizedAdmin = await canManageClasses(ctx, user._id, classData.campusId, curriculum?.schoolId);

    if (!isClassTeacher && !isAuthorizedAdmin) throw new Error("Only administrators or the class teacher can delete schedules");

    if (args.deleteSeries && schedule.isRecurring) {
      const parentId = schedule.recurrenceParentId || schedule._id;
      const series = await ctx.db.query("classSchedule").withIndex("by_recurrence_parent", (q) => q.eq("recurrenceParentId", parentId)).collect();
      
      await ctx.db.delete(parentId);
      for (const child of series) await ctx.db.delete(child._id);
      
      return { deleted: series.length + 1, type: "series" };
    } else {
      await ctx.db.delete(args.id);
      return { deleted: 1, type: "single" };
    }
  },
});

export const markLive = mutation({
  args: { roomName: v.string(), isLive: v.boolean() },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.query("classSchedule").withIndex("by_room", (q) => q.eq("roomName", args.roomName)).first();
    if (!schedule) throw new Error("Schedule not found");

    const updates: any = { isLive: args.isLive };
    if (args.isLive) {
      if (schedule.status !== "cancelled") {
        updates.status = "active";
        if (schedule.completedAt) updates.completedAt = undefined;
      }
    } else {
      if (schedule.status === "active") updates.status = "scheduled"; 
    }
    await ctx.db.patch(schedule._id, updates);
  },
});

export const logStudentPresence = mutation({
  args: { scheduleId: v.id("classSchedule"), action: v.union(v.literal("join"), v.literal("leave")) },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const now = Date.now();
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) throw new Error("Schedule not found");

    if (args.action === "join") {
      await ctx.db.insert("class_sessions", {
        scheduleId: args.scheduleId,
        studentId: user._id,
        joinedAt: now,
        roomName: schedule.roomName,
        sessionDate: new Date().toISOString().split('T')[0],
      });
    } else {
      const activeSession = await ctx.db.query("class_sessions")
        .withIndex("by_student_schedule", (q) => q.eq("studentId", user._id).eq("scheduleId", args.scheduleId))
        .filter(q => q.eq(q.field("leftAt"), undefined))
        .first();

      if (activeSession) {
        const duration = (now - activeSession.joinedAt) / 1000;
        await ctx.db.patch(activeSession._id, { leftAt: now, durationSeconds: duration });
      }
    }
  }
});

export const updateAttendance = mutation({
  args: {
    scheduleId: v.id("classSchedule"),
    studentId: v.id("users"),
    status: v.union(v.literal("present"), v.literal("absent"), v.literal("partial"), v.literal("excused"))
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) throw new Error("Schedule not found");
    const classData = await ctx.db.get(schedule.classId);
    if (!classData) throw new Error("Class not found");
    const curriculum = await ctx.db.get(classData.curriculumId);

    const isClassTeacher = classData.teacherId === user._id;
    const isAuthorizedAdmin = await canManageClasses(ctx, user._id, classData.campusId, curriculum?.schoolId);

    if (!isClassTeacher && !isAuthorizedAdmin) throw new Error("Unauthorized");

    const existingSessions = await ctx.db.query("class_sessions")
      .withIndex("by_student_schedule", (q) => q.eq("studentId", args.studentId).eq("scheduleId", args.scheduleId))
      .collect();

    let targetSession = existingSessions.find(s => s.attendanceStatus) || existingSessions[0];

    if (targetSession) {
      await ctx.db.patch(targetSession._id, {
        attendanceStatus: args.status,
        manualMarkedBy: user._id,
        manualMarkedAt: Date.now()
      });
    } else {
      await ctx.db.insert("class_sessions", {
        scheduleId: args.scheduleId,
        studentId: args.studentId,
        joinedAt: Date.now(),
        leftAt: Date.now(),
        durationSeconds: 0,
        roomName: schedule.roomName,
        sessionDate: new Date(schedule.scheduledStart).toISOString().split('T')[0],
        attendanceStatus: args.status,
        manualMarkedBy: user._id,
        manualMarkedAt: Date.now()
      });
    }
  }
});

export const cleanupStaleSessions = mutation({
  handler: async (ctx) => {
    const now = Date.now();
    const activeSchedules = await ctx.db.query("classSchedule").withIndex("by_status", (q) => q.eq("status", "active")).collect();

    for (const schedule of activeSchedules) {
      if (now > schedule.scheduledEnd + STALE_THRESHOLD_MS) {
        await ctx.db.patch(schedule._id, {
          status: "completed",
          isLive: false,
          completedAt: schedule.scheduledEnd,
        });
        
        const openSessions = await ctx.db.query("class_sessions")
          .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
          .filter(q => q.eq(q.field("leftAt"), undefined))
          .collect();
          
        for (const os of openSessions) {
           const duration = (schedule.scheduledEnd - os.joinedAt) / 1000;
           await ctx.db.patch(os._id, { leftAt: schedule.scheduledEnd, durationSeconds: Math.max(0, duration) });
        }
      }
    }
  }
});

function generateRecurrenceOccurrences(
  startTime: number,
  recurrence: { type: "daily" | "weekly" | "biweekly" | "monthly"; daysOfWeek?: number[]; endDate?: number; occurrences?: number; }
): number[] {
  const occurrences: number[] = [];
  const maxOccurrences = recurrence.occurrences || 52;
  const endDate = recurrence.endDate || (startTime + (365 * 24 * 60 * 60 * 1000));
  const startDate = new Date(startTime);
  const startDayOfWeek = startDate.getDay();

  if (recurrence.type === "daily") {
    let current = startTime;
    while (occurrences.length < maxOccurrences && current <= endDate) {
      const currentDate = new Date(current);
      const dayOfWeek = currentDate.getDay();
      if (!recurrence.daysOfWeek || recurrence.daysOfWeek.includes(dayOfWeek)) occurrences.push(current);
      current += (24 * 60 * 60 * 1000);
    }
    return occurrences;
  }

  if (recurrence.type === "weekly" || recurrence.type === "biweekly") {
    const interval = recurrence.type === "weekly" ? 7 : 14;
    const daysToGenerate = recurrence.daysOfWeek && recurrence.daysOfWeek.length > 0 ? recurrence.daysOfWeek : [startDayOfWeek]; 
    let weekStart = startTime;
    
    while (occurrences.length < maxOccurrences && weekStart <= endDate) {
      for (const targetDay of daysToGenerate) {
        let daysToAdd = targetDay - startDayOfWeek;
        if (daysToAdd < 0) daysToAdd += 7;
        const occurrenceTime = weekStart + (daysToAdd * 24 * 60 * 60 * 1000);
        if (occurrenceTime >= startTime && occurrenceTime <= endDate && occurrences.length < maxOccurrences) {
          occurrences.push(occurrenceTime);
        }
      }
      weekStart += (interval * 24 * 60 * 60 * 1000);
    }
    return occurrences.sort((a, b) => a - b);
  }

  if (recurrence.type === "monthly") {
    let current = startTime;
    while (occurrences.length < maxOccurrences && current <= endDate) {
      const currentDate = new Date(current);
      const dayOfWeek = currentDate.getDay();
      if (!recurrence.daysOfWeek || recurrence.daysOfWeek.includes(dayOfWeek)) occurrences.push(current);
      const nextDate = new Date(current);
      nextDate.setMonth(nextDate.getMonth() + 1);
      current = nextDate.getTime();
    }
    return occurrences;
  }

  return occurrences;
}