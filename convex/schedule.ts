import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserOrThrow, getCurrentUserFromAuth } from "./users";
import { Id } from "./_generated/dataModel";
import { ConvexError } from "convex/values";

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

// 50% attendance required for "Present"
const FULL_ATTENDANCE_THRESHOLD_PERCENT = 0.5;

// 10% attendance required for "Partial"
const PARTIAL_ATTENDANCE_THRESHOLD_PERCENT = 0.10;

// Minimum seconds absolute (e.g., 2 minutes) to count as partial, 
// prevents noise from accidental clicks
const MIN_PARTIAL_SECONDS = 120; 

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Validate that the teacher and class are not double-booked.
 * Returns void or throws Error.
 */
async function validateScheduleOverlap(
  ctx: any,
  {
    teacherId,
    classId,
    start,
    end,
    excludeScheduleId
  }: {
    teacherId: Id<"users">,
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

  // Filter out self (for updates)
  const realClassConflicts = excludeScheduleId 
    ? classConflicts.filter((s: any) => s._id !== excludeScheduleId)
    : classConflicts;

  if (realClassConflicts.length > 0) {
    const conflict = realClassConflicts[0];
    const conflictClass = await ctx.db.get(conflict.classId);
    
    throw new ConvexError({
      code: "CLASS_SCHEDULE_CONFLICT",
      className: conflictClass?.name || "Unknown Class",
      conflictTime: conflict.scheduledStart.toString(), // Send as string number
    });
  }

  // 2. Check if the TEACHER is already busy
  // Note: We have to find classes taught by this teacher first, then their schedules,
  // OR we rely on a direct index if available. 
  // Since we don't have a "by_teacher" index on schedule, we query by time 
  // or iterating active classes.
  // OPTIMIZATION: To avoid scanning all schedules, we get the teacher's active classes first.
  
  const teacherClasses = await ctx.db
    .query("classes")
    .withIndex("by_teacher", (q: any) => q.eq("teacherId", teacherId).eq("isActive", true))
    .collect();
  
  const teacherClassIds = new Set(teacherClasses.map((c: any) => c._id));

  // If the teacher has no active classes, no conflict possible (except the one being created)
  if (teacherClassIds.size === 0) return;

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

/**
  * Generate recurrence occurrences based on the rules provided.
 */
function getFirstValidRecurrenceDate(
  startDateMs: number, 
  daysOfWeek: number[] | undefined
): number {
  if (!daysOfWeek || daysOfWeek.length === 0) return startDateMs;

  const start = new Date(startDateMs);
  const startDay = start.getDay(); // 0 = Sunday

  if (daysOfWeek.includes(startDay)) return startDateMs;

  // Find the next matching day
  // Sort days to ensure we find the closest one in the future
  const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
  
  // Try to find a day later in the same week
  const nextInWeek = sortedDays.find(d => d > startDay);
  
  let daysToAdd = 0;
  if (nextInWeek !== undefined) {
    daysToAdd = nextInWeek - startDay;
  } else {
    // Wrap around to the first available day next week
    daysToAdd = (7 - startDay) + sortedDays[0];
  }

  return startDateMs + (daysToAdd * 24 * 60 * 60 * 1000);
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get my schedule (universal query for students/teachers)
 * This is THE core query that powers the calendar and daily agenda
 */
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
    if (!user) {
      return [];
    }

    const isTeacherOrAdmin = ["teacher", "admin", "superadmin", "tutor"].includes(user.role);

    // Step 1: Find classes (role-based logic)
    let myClasses;
    if (user.role === "admin" || user.role === "superadmin") {
      if (args.teacherId) {
        myClasses = await ctx.db
          .query("classes")
          .withIndex("by_teacher", (q) => 
            q.eq("teacherId", args.teacherId!).eq("isActive", true)
          )
          .collect();
      } else {
        myClasses = await ctx.db
          .query("classes")
          .withIndex("by_active", (q) => q.eq("isActive", true))
          .collect();
      }
    } else if (user.role === "teacher" || user.role === "tutor") {
      myClasses = await ctx.db
        .query("classes")
        .withIndex("by_teacher", (q) => 
          q.eq("teacherId", user._id).eq("isActive", true)
        )
        .collect();
    } else {
      // Student: Find classes I'm enrolled in
      const allClasses = await ctx.db
        .query("classes")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
      
      myClasses = allClasses.filter(c => c.students.includes(user._id));
    }

    if (myClasses.length === 0) return [];

    const classIds = myClasses.map(c => c._id);

    // Step 2: Fetch schedules for these classes
    const scheduleItems = await Promise.all(
      classIds.map(id => 
        ctx.db
          .query("classSchedule")
          .withIndex("by_class", (q) => q.eq("classId", id))
          .collect()
      )
    );

    let flatSchedule = scheduleItems.flat();

    // Step 3: Filter by date/status
    if (args.from) {
      flatSchedule = flatSchedule.filter(s => s.scheduledStart >= args.from!);
    }
    if (args.to) {
      flatSchedule = flatSchedule.filter(s => s.scheduledStart <= args.to!);
    }
    if (args.status) {
      flatSchedule = flatSchedule.filter(s => s.status === args.status);
    }

    // Step 4: Hydrate with details AND Robust Attendance Logic
    const results = await Promise.all(
      flatSchedule.map(async (item) => {
        const classData = myClasses.find(c => c._id === item.classId);
        if (!classData) return null;

        const curriculum = await ctx.db.get(classData.curriculumId);
        const teacher = await ctx.db.get(classData.teacherId);

        let lessonData = null;
        if (item.lessonId) {
          lessonData = await ctx.db.get(item.lessonId);
        }

        let recurrenceRule = item.recurrenceRule;
        if (item.recurrenceParentId && !recurrenceRule) {
            const parent = await ctx.db.get(item.recurrenceParentId);
            recurrenceRule = parent?.recurrenceRule;
        }

        const title = lessonData?.title || item.title || "Class Session";
        const description = lessonData?.description || item.description || "";

        // --- 🧠 ATTENDANCE LOGIC ---
        let attendanceStatus: "upcoming" | "present" | "absent" | "partial" | "in-progress" | "late" = "upcoming";
        let timeInClass = 0;
        let isStudentActive = false;
        
        // Stats for Teachers
        let attendanceSummary = {
          present: 0,
          partial: 0,
          missed: 0,
          total: classData.students.length
        };

        const now = Date.now();

        if (user.role === "student") {
          const sessions = await ctx.db
            .query("class_sessions")
            .withIndex("by_student_schedule", (q) => 
              q.eq("studentId", user._id).eq("scheduleId", item._id)
            )
            .collect();

          // Check if currently connected (joined but not left)
          const activeSession = sessions.find(s => s.joinedAt && !s.leftAt);
          isStudentActive = !!activeSession;

          // Check for manual status first
          const manualRecord = sessions.find(s => s.attendanceStatus);
          
          if (manualRecord && manualRecord.attendanceStatus) {
             // Map stored status to UI status
             attendanceStatus = manualRecord.attendanceStatus as any;
          } else {
              // PROTECTED CALCULATION: Only count time WITHIN the schedule window
              timeInClass = sessions.reduce((sum, s) => {
                const sessionStart = s.joinedAt;
                // If they haven't left, calculate up to NOW, but fallback to now if leftAt is missing
                const sessionEnd = s.leftAt || now;

                // Clamp the session time to the schedule's start and end
                const effectiveStart = Math.max(sessionStart, item.scheduledStart);
                const effectiveEnd = Math.min(sessionEnd, item.scheduledEnd);

                // If effectiveEnd > effectiveStart, we have valid overlap. 
                // Math.max(0, ...) handles cases where the session is entirely outside the window.
                const duration = Math.max(0, (effectiveEnd - effectiveStart) / 1000);
                
                return sum + duration;
              }, 0);
              
              const scheduledDuration = (item.scheduledEnd - item.scheduledStart) / 1000;
              const ratio = scheduledDuration > 0 ? timeInClass / scheduledDuration : 0;

              if (ratio >= FULL_ATTENDANCE_THRESHOLD_PERCENT) {
                attendanceStatus = "present";
              } else if (ratio >= PARTIAL_ATTENDANCE_THRESHOLD_PERCENT || timeInClass >= MIN_PARTIAL_SECONDS) {
                attendanceStatus = "partial";
              } else if (item.scheduledStart > now && !isStudentActive) {
                attendanceStatus = "upcoming";
              } else if (now >= item.scheduledStart && now <= item.scheduledEnd) {
                 attendanceStatus = isStudentActive ? "in-progress" : "late";
              } else {
                 attendanceStatus = "absent";
              }
          }
        } 
        
        // --- TEACHER SUMMARY LOGIC ---
        if (isTeacherOrAdmin) {
          // Fetch all sessions for this schedule
          const allSessions = await ctx.db
            .query("class_sessions")
            .withIndex("by_schedule", (q) => q.eq("scheduleId", item._id))
            .collect();
            
          // We need to aggregate by student
          const studentStats = new Map<string, { totalSeconds: number, manualStatus?: string }>();
          
          allSessions.forEach(s => {
            const current = studentStats.get(s.studentId) || { totalSeconds: 0 };
            
            // PROTECTED CALCULATION FOR SUMMARY
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

          // Calculate counts based on registered students in class
          // Note: This iterates registered students. Dropouts handled by current enrollment.
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
            
            // Map to summary buckets
            if (status === "present" || status === "excused") attendanceSummary.present++;
            else if (status === "partial" || status === "late") attendanceSummary.partial++;
            else attendanceSummary.missed++;
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
          isLive: item.isLive || false,
          sessionType: item.sessionType || "live",
          status: item.status,
          lessonId: item.lessonId,
          classId: classData._id,
          curriculumId: classData.curriculumId,
          isRecurring: item.isRecurring || false,
          recurrenceRule: recurrenceRule,
          recurrenceParentId: item.recurrenceParentId,
          teacherName: teacher?.fullName || "Unknown",
          teacherImageUrl: teacher?.imageUrl,
          attendance: attendanceStatus,
          minutesAttended: Math.round(timeInClass / 60),
          isStudentActive: isStudentActive,
          attendanceSummary: isTeacherOrAdmin ? attendanceSummary : undefined
        };
      })
    );

    return results
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.start - b.start);
  },
});

/**
 * Get single schedule item by ID
 */
export const get = query({
  args: { id: v.id("classSchedule") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get schedule item with full details
 */
export const getWithDetails = query({
  args: { id: v.id("classSchedule") },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get(args.id);
    if (!schedule) return null;

    const classData = await ctx.db.get(schedule.classId);
    if (!classData) return null;

    // Lesson is now optional
    let lesson = null;
    if (schedule.lessonId) {
      lesson = await ctx.db.get(schedule.lessonId);
    }

    const [curriculum, teacher] = await Promise.all([
      ctx.db.get(classData.curriculumId),
      ctx.db.get(classData.teacherId),
    ]);

    return {
      ...schedule,
      lesson: lesson ? {
        _id: lesson._id,
        title: lesson.title,
        description: lesson.description,
        content: lesson.content,
      } : null,
      class: {
        _id: classData._id,
        name: classData.name,
        studentCount: classData.students.length,
      },
      curriculum: curriculum ? {
        _id: curriculum._id,
        title: curriculum.title,
        code: curriculum.code,
        color: curriculum.color,
      } : null,
      teacher: teacher ? {
        _id: teacher._id,
        fullName: teacher.fullName,
        email: teacher.email,
        avatarStorageId: teacher.avatarStorageId,
      } : null,
    };
  },
});

/**
 * Get schedule by room name (for LiveKit integration)
 */
export const getByRoomName = query({
  args: { roomName: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", args.roomName))
      .first();
  },
});

/**
 * Check if a session is active and joinable
 * Used by LiveKit to validate room access
 */
export const getSessionStatus = query({
  args: { sessionId: v.string() }, // Can be roomName or schedule ID
  handler: async (ctx, args) => {
    // Try to find by room name first (most common case)
    let schedule = await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", args.sessionId))
      .first();

    if (!schedule) {
      // Fallback: Search all schedules if sessionId looks like an ID
      const allSchedules = await ctx.db
        .query("classSchedule")
        .withIndex("by_status", (q) => 
          q.eq("status", "active")
        )
        .collect();
      
      schedule = allSchedules.find(s => s._id === args.sessionId) || null;
    }

    if (!schedule) return null;

    const now = Date.now();
    const joinWindowStart = schedule.scheduledStart - (10 * 60 * 1000); // 10 min before
    const joinWindowEnd = schedule.scheduledEnd + (5 * 60 * 1000); // 5 min after

    const isTimeWindowActive = now >= joinWindowStart && now <= joinWindowEnd;
    const isExplicitlyActive = schedule.status === "active";

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

/**
 * Get lessons already scheduled for a class
 */
export const getUsedLessons = query({
  args: { classId: v.id("classes") },
  handler: async (ctx, args) => {
    const schedules = await ctx.db
      .query("classSchedule")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .collect();

    // Return array of lessonIds that are not null/undefined
    return schedules
      .map((s) => s.lessonId)
      .filter((id): id is Id<"lessons"> => !!id);
  },
});

/**
 * Get detailed attendance for a specific schedule
 * Used by the AttendanceDialog
 */
export const getAttendanceDetails = query({
  args: { scheduleId: v.id("classSchedule") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    
    // 1. Get Schedule & Class
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) throw new Error("Schedule not found");
    const classData = await ctx.db.get(schedule.classId);
    if (!classData) throw new Error("Class not found");

    // Auth Check
    if (!["admin", "superadmin"].includes(user.role) && classData.teacherId !== user._id) {
       throw new Error("Unauthorized");
    }

    // 2. Get Students
    const students = await Promise.all(
      classData.students.map(id => ctx.db.get(id))
    );
    const validStudents = students.filter(s => s !== null);

    // 3. Get All Sessions
    const sessions = await ctx.db
      .query("class_sessions")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", args.scheduleId))
      .collect();

    // 4. Compute Status Per Student
    const results = validStudents.map(student => {
      const studentSessions = sessions.filter(s => s.studentId === student!._id);
      
      // Calculate derived stats
      const totalSeconds = studentSessions.reduce((sum, s) => {
         return sum + (s.durationSeconds || 0);
      }, 0);
      
      // Check for manual override
      const manualRecord = studentSessions.find(s => s.attendanceStatus);
      const manualStatus = manualRecord?.attendanceStatus;
      
      // Calculate automated status
      const scheduledDuration = (schedule.scheduledEnd - schedule.scheduledStart) / 1000;
      const ratio = scheduledDuration > 0 ? totalSeconds / scheduledDuration : 0;
      
      let computedStatus = "absent";
      if (ratio >= FULL_ATTENDANCE_THRESHOLD_PERCENT) computedStatus = "present";
      else if (ratio >= PARTIAL_ATTENDANCE_THRESHOLD_PERCENT || totalSeconds >= MIN_PARTIAL_SECONDS) computedStatus = "partial";
      
      // Special case: If Ignitia and no sessions, it's effectively "absent" pending confirmation
      // But we label it "pending" if it's an ignitia session with no data
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
        lastSeen: studentSessions.length > 0 
           ? Math.max(...studentSessions.map(s => s.joinedAt)) 
           : null
      };
    });

    return results.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create a single schedule (with or without lesson)
 */
export const createSchedule = mutation({
  args: {
    classId: v.id("classes"),
    lessonId: v.optional(v.id("lessons")),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    scheduledStart: v.number(),
    scheduledEnd: v.number(),
    sessionType: v.optional(v.union(v.literal("live"), v.literal("ignitia"))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const classData = await ctx.db.get(args.classId);
    if (!classData) throw new Error("Class not found");

    // Permission check
    if (
      !["admin", "superadmin"].includes(user.role) &&
      classData.teacherId !== user._id
    ) {
      throw new Error("Only administrators or the class teacher can create schedules");
    }

    // Validate lesson if provided
    if (args.lessonId) {
      const lesson = await ctx.db.get(args.lessonId);
      if (!lesson) throw new Error("Lesson not found");
      if (lesson.curriculumId !== classData.curriculumId) {
        throw new Error("Lesson does not belong to this class's curriculum");
      }
    }

    // Validate time range
    if (args.scheduledEnd <= args.scheduledStart) {
      throw new Error("End time must be after start time");
    }

    // VALIDATE OVERLAP (Teacher & Class)
    await validateScheduleOverlap(ctx, {
      teacherId: classData.teacherId,
      classId: args.classId,
      start: args.scheduledStart,
      end: args.scheduledEnd
    });

    const roomName = `class-${args.classId}-${Date.now()}`;

    return await ctx.db.insert("classSchedule", {
      classId: args.classId,
      lessonId: args.lessonId,
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

/**
 * Create recurring schedules
 * Supports: daily, weekly, custom patterns
 */
export const createRecurringSchedule = mutation({
  args: {
    classId: v.id("classes"),
    lessonId: v.optional(v.id("lessons")),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    scheduledStart: v.number(), // First occurrence
    scheduledEnd: v.number(),
    sessionType: v.optional(v.union(v.literal("live"), v.literal("ignitia"))),
    timezoneOffset: v.number(),
    recurrence: v.object({
      type: v.union(
        v.literal("daily"),
        v.literal("weekly"),
        v.literal("biweekly"),
        v.literal("monthly")
      ),
      daysOfWeek: v.optional(v.array(v.number())), // 0=Sunday, 1=Monday, etc.
      endDate: v.optional(v.number()), // When to stop generating
      occurrences: v.optional(v.number()), // Or max number of occurrences
    }),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const classData = await ctx.db.get(args.classId);
    if (!classData) throw new Error("Class not found");

    if (
      !["admin", "superadmin"].includes(user.role) &&
      classData.teacherId !== user._id
    ) {
      throw new Error("Only administrators or the class teacher can create schedules");
    }

    if (args.lessonId) {
      const lesson = await ctx.db.get(args.lessonId);
      if (!lesson) throw new Error("Lesson not found");
      if (lesson.curriculumId !== classData.curriculumId) {
        throw new Error("Lesson does not belong to this class's curriculum");
      }
    }

    if (args.scheduledEnd <= args.scheduledStart) {
      throw new Error("End time must be after start time");
    }

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
    const localOccurrences = generateRecurrenceOccurrences(
      localEffectiveStart,
      args.recurrence
    );

    if (localOccurrences.length === 0) {
      throw new Error("No valid occurrences generated");
    }

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
      lessonId: args.lessonId,
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
        lessonId: args.lessonId,
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

    return {
      parentId,
      childIds,
      totalOccurrences: realOccurrences.length,
    };
  },
});

/**
 * Schedule a lesson for a class
 */
export const scheduleLesson = mutation({
  args: {
    classId: v.id("classes"),
    lessonId: v.id("lessons"),
    scheduledStart: v.number(),
    scheduledEnd: v.number(),
    sessionType: v.optional(v.union(v.literal("live"), v.literal("ignitia"))),

  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    // Validate: Admins or the class teacher can schedule
    const classData = await ctx.db.get(args.classId);
    if (!classData) {
      throw new Error("Class not found");
    }

    if (
      !["admin", "superadmin"].includes(user.role) &&
      classData.teacherId !== user._id
    ) {
      throw new Error("Only administrators or the class teacher can schedule lessons");
    }

    // Verify lesson exists and belongs to the class curriculum
    const lesson = await ctx.db.get(args.lessonId);
    if (!lesson) {
      throw new Error("Lesson not found");
    }

    if (lesson.curriculumId !== classData.curriculumId) {
      throw new Error("Lesson does not belong to this class's curriculum");
    }

    // Validate time range
    if (args.scheduledEnd <= args.scheduledStart) {
      throw new Error("End time must be after start time");
    }

    // VALIDATE OVERLAP
    await validateScheduleOverlap(ctx, {
      teacherId: classData.teacherId,
      classId: args.classId,
      start: args.scheduledStart,
      end: args.scheduledEnd
    });

    // Generate unique room name
    const roomName = `class-${args.classId}-lesson-${args.lessonId}-${Date.now()}`;

    return await ctx.db.insert("classSchedule", {
      classId: args.classId,
      lessonId: args.lessonId,
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

/**
 * Update schedule (including linking to lesson later)
 * Now supports updating entire recurring series
 */
export const updateSchedule = mutation({
  args: {
    id: v.id("classSchedule"),
    lessonId: v.optional(v.union(v.id("lessons"), v.null())),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    scheduledStart: v.optional(v.number()),
    scheduledEnd: v.optional(v.number()),
    status: v.optional(v.union(
      v.literal("scheduled"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("cancelled")
    )),
    sessionType: v.optional(v.union(v.literal("live"), v.literal("ignitia"))),
    updateSeries: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const schedule = await ctx.db.get(args.id);
    if (!schedule) throw new Error("Schedule not found");

    const classData = await ctx.db.get(schedule.classId);
    if (!classData) throw new Error("Class not found");

    if (
      !["admin", "superadmin"].includes(user.role) &&
      classData.teacherId !== user._id
    ) {
      throw new Error("Only administrators or the class teacher can update schedules");
    }

    // Validate lesson if changing
    if (args.lessonId && args.lessonId !== null) {
      const lesson = await ctx.db.get(args.lessonId);
      if (!lesson) throw new Error("Lesson not found");
      if (lesson.curriculumId !== classData.curriculumId) {
        throw new Error("Lesson does not belong to this class's curriculum");
      }
    }

    // Calculate time delta and new duration
    const oldStart = schedule.scheduledStart;
    const newStart = args.scheduledStart ?? oldStart;
    const timeShiftDelta = newStart - oldStart;
    
    const oldEnd = schedule.scheduledEnd;
    const newEnd = args.scheduledEnd ?? oldEnd;
    const newDuration = newEnd - newStart;

    // VALIDATE OVERLAP if times are changing
    // (Only checks the specific item being edited, or the master if updating series)
    if (args.scheduledStart !== undefined || args.scheduledEnd !== undefined) {
      await validateScheduleOverlap(ctx, {
        teacherId: classData.teacherId,
        classId: classData._id,
        start: newStart,
        end: newEnd,
        excludeScheduleId: args.id
      });
    }

    // Prepare metadata updates
    const metadataUpdates: any = {};
    if (args.title !== undefined) metadataUpdates.title = args.title;
    if (args.sessionType !== undefined) metadataUpdates.sessionType = args.sessionType;
    if (args.description !== undefined) metadataUpdates.description = args.description;
    if (args.lessonId !== undefined) {
      metadataUpdates.lessonId = args.lessonId === null ? undefined : args.lessonId;
    }
    if (args.status) {
      metadataUpdates.status = args.status;
      if (args.status === "completed" && !schedule.completedAt) {
        metadataUpdates.completedAt = Date.now();
      }
    }

    // Update single or series
    if (args.updateSeries && (schedule.isRecurring || schedule.recurrenceParentId)) {
      // Find the Master ID (Parent)
      const masterId = schedule.recurrenceParentId || schedule._id;

      // Collect all items in the series (Master + Children)
      const itemsToUpdate = [];
      
      const parent = await ctx.db.get(masterId);
      if (parent) itemsToUpdate.push(parent);

      const children = await ctx.db
        .query("classSchedule")
        .withIndex("by_recurrence_parent", (q) => q.eq("recurrenceParentId", masterId))
        .collect();
      itemsToUpdate.push(...children);

      const uniqueItems = Array.from(new Map(itemsToUpdate.map(item => [item._id, item])).values());

      for (const item of uniqueItems) {
        const updatePatch: any = { ...metadataUpdates };

        // Apply Relative Time Shift
        const itemNewStart = item.scheduledStart + timeShiftDelta;
        
        updatePatch.scheduledStart = itemNewStart;
        updatePatch.scheduledEnd = itemNewStart + newDuration;

        await ctx.db.patch(item._id, updatePatch);
      }
      
      return { updated: uniqueItems.length, type: "series" };
    } else {
      // Single instance update
      const singleUpdates = { ...metadataUpdates };
      if (args.scheduledStart !== undefined) singleUpdates.scheduledStart = newStart;
      if (args.scheduledEnd !== undefined) singleUpdates.scheduledEnd = newEnd;
      
      await ctx.db.patch(args.id, singleUpdates);
      return { updated: 1, type: "single" };
    }
  },
});

/**
 * Cancel schedule or series (soft delete - preserves history)
 */
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

    if (
      !["admin", "superadmin"].includes(user.role) &&
      classData.teacherId !== user._id
    ) {
      throw new Error("Only administrators or the class teacher can cancel schedules");
    }

    // Cancel series or single
    if (args.cancelSeries && schedule.isRecurring) {
      const parentId = schedule.recurrenceParentId || schedule._id;
      
      const series = await ctx.db
        .query("classSchedule")
        .withIndex("by_recurrence_parent", (q) => q.eq("recurrenceParentId", parentId))
        .collect();
      
      await ctx.db.patch(parentId, { 
        status: "cancelled" as const,
        description: args.reason ? `${schedule.description || ''}\n\nCancellation reason: ${args.reason}` : schedule.description
      });
      
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

/**
 * Delete schedule or entire recurring series
 */
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

    if (
      !["admin", "superadmin"].includes(user.role) &&
      classData.teacherId !== user._id
    ) {
      throw new Error("Only administrators or the class teacher can delete schedules");
    }

    // Delete series or single
    if (args.deleteSeries && schedule.isRecurring) {
      const parentId = schedule.recurrenceParentId || schedule._id;
      
      // Find all in series
      const series = await ctx.db
        .query("classSchedule")
        .withIndex("by_recurrence_parent", (q) => q.eq("recurrenceParentId", parentId))
        .collect();
      
      // Delete parent
      await ctx.db.delete(parentId);
      
      // Delete children
      for (const child of series) {
        await ctx.db.delete(child._id);
      }
      
      return { deleted: series.length + 1, type: "series" };
    } else {
      await ctx.db.delete(args.id);
      return { deleted: 1, type: "single" };
    }
  },
});

/**
 * Mark session as live (called when LiveKit room is created/destroyed)
 * This automatically syncs both isLive (boolean) and status (string)
 */
export const markLive = mutation({
  args: {
    roomName: v.string(),
    isLive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const schedule = await ctx.db
      .query("classSchedule")
      .withIndex("by_room", (q) => q.eq("roomName", args.roomName))
      .first();

    if (!schedule) {
      throw new Error("Schedule not found");
    }

    const updates: any = { isLive: args.isLive };

    if (args.isLive) {
      // Teacher joined: Mark active
      if (schedule.status !== "cancelled") {
        updates.status = "active";
      
        if (schedule.completedAt) {
          updates.completedAt = undefined;
        }
      }
    } else {
      if (schedule.status === "active") {
        updates.status = "scheduled"; 
      }
    }

    await ctx.db.patch(schedule._id, updates);
  },
});

/**
 * Log Student Presence (Call this on Join/Leave)
 */
export const logStudentPresence = mutation({
  args: {
    scheduleId: v.id("classSchedule"),
    action: v.union(v.literal("join"), v.literal("leave")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const now = Date.now();

    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) throw new Error("Schedule not found");

    if (args.action === "join") {
      // Create new session record
      await ctx.db.insert("class_sessions", {
        scheduleId: args.scheduleId,
        studentId: user._id,
        joinedAt: now,
        roomName: schedule.roomName,
        sessionDate: new Date().toISOString().split('T')[0],
      });
    } else {
      // Find active session and close it
      const activeSession = await ctx.db
        .query("class_sessions")
        .withIndex("by_student_schedule", (q) => 
          q.eq("studentId", user._id).eq("scheduleId", args.scheduleId)
        )
        .filter(q => q.eq(q.field("leftAt"), undefined))
        .first();

      if (activeSession) {
        const duration = (now - activeSession.joinedAt) / 1000;
        await ctx.db.patch(activeSession._id, {
          leftAt: now,
          durationSeconds: duration
        });
      }
    }
  }
});

/**
 * Update attendance status for a student
 */
export const updateAttendance = mutation({
  args: {
    scheduleId: v.id("classSchedule"),
    studentId: v.id("users"),
    status: v.union(
      v.literal("present"),
      v.literal("absent"),
      v.literal("partial"),
      v.literal("excused")
    )
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    
    // Auth Check
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) throw new Error("Schedule not found");
    const classData = await ctx.db.get(schedule.classId);
    if (!classData) throw new Error("Class not found");

    if (!["admin", "superadmin"].includes(user.role) && classData.teacherId !== user._id) {
       throw new Error("Unauthorized");
    }

    // Find existing session record to update, or create new one
    const existingSessions = await ctx.db
      .query("class_sessions")
      .withIndex("by_student_schedule", (q) => 
         q.eq("studentId", args.studentId).eq("scheduleId", args.scheduleId)
      )
      .collect();

    // Prefer updating the one that already has a manual status, or the most recent one
    let targetSession = existingSessions.find(s => s.attendanceStatus) || existingSessions[0];

    if (targetSession) {
      await ctx.db.patch(targetSession._id, {
        attendanceStatus: args.status,
        manualMarkedBy: user._id,
        manualMarkedAt: Date.now()
      });
    } else {
      // Create new "virtual" session record for this status
      await ctx.db.insert("class_sessions", {
        scheduleId: args.scheduleId,
        studentId: args.studentId,
        joinedAt: Date.now(), // Placeholder
        leftAt: Date.now(),   // Placeholder
        durationSeconds: 0,   // No actual time accumulated
        roomName: schedule.roomName,
        sessionDate: new Date(schedule.scheduledStart).toISOString().split('T')[0],
        attendanceStatus: args.status,
        manualMarkedBy: user._id,
        manualMarkedAt: Date.now()
      });
    }
  }
});

/**
 * Generate occurrence timestamps based on recurrence rules
 */
function generateRecurrenceOccurrences(
  startTime: number,
  recurrence: {
    type: "daily" | "weekly" | "biweekly" | "monthly";
    daysOfWeek?: number[];
    endDate?: number;
    occurrences?: number;
  }
): number[] {
  const occurrences: number[] = [];
  const maxOccurrences = recurrence.occurrences || 52;
  const endDate = recurrence.endDate || (startTime + (365 * 24 * 60 * 60 * 1000));

  const startDate = new Date(startTime);
  const startDayOfWeek = startDate.getDay();

  // For daily recurrence, respect daysOfWeek if provided
  if (recurrence.type === "daily") {
    let current = startTime;
    
    while (occurrences.length < maxOccurrences && current <= endDate) {
      const currentDate = new Date(current);
      const dayOfWeek = currentDate.getDay();
      
      // If daysOfWeek specified, only add if current day matches
      if (!recurrence.daysOfWeek || recurrence.daysOfWeek.includes(dayOfWeek)) {
        occurrences.push(current);
      }
      
      // Move to next day
      current += (24 * 60 * 60 * 1000);
    }
    
    return occurrences;
  }

  // For weekly/biweekly: Generate occurrences for each selected day
  if (recurrence.type === "weekly" || recurrence.type === "biweekly") {
    const interval = recurrence.type === "weekly" ? 7 : 14;
    const daysToGenerate = recurrence.daysOfWeek && recurrence.daysOfWeek.length > 0
      ? recurrence.daysOfWeek
      : [startDayOfWeek]; // Default to start day if none specified

    let weekStart = startTime;
    
    while (occurrences.length < maxOccurrences && weekStart <= endDate) {
      // For each day in this week/period
      for (const targetDay of daysToGenerate) {
        // Calculate days to add from week start
        let daysToAdd = targetDay - startDayOfWeek;
        if (daysToAdd < 0) daysToAdd += 7;
        
        const occurrenceTime = weekStart + (daysToAdd * 24 * 60 * 60 * 1000);
        
        // Only add if within bounds and not exceeding max
        if (occurrenceTime >= startTime && 
            occurrenceTime <= endDate && 
            occurrences.length < maxOccurrences) {
          occurrences.push(occurrenceTime);
        }
      }
      
      // Move to next week/period
      weekStart += (interval * 24 * 60 * 60 * 1000);
    }
    
    return occurrences.sort((a, b) => a - b);
  }

  // Monthly: Keep existing logic but respect daysOfWeek
  if (recurrence.type === "monthly") {
    let current = startTime;
    
    while (occurrences.length < maxOccurrences && current <= endDate) {
      const currentDate = new Date(current);
      const dayOfWeek = currentDate.getDay();
      
      if (!recurrence.daysOfWeek || recurrence.daysOfWeek.includes(dayOfWeek)) {
        occurrences.push(current);
      }
      
      // Move to same date next month
      const nextDate = new Date(current);
      nextDate.setMonth(nextDate.getMonth() + 1);
      current = nextDate.getTime();
    }
    
    return occurrences;
  }

  return occurrences;
}