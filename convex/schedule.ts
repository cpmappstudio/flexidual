import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserOrThrow, getCurrentUserFromAuth } from "./users";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get my schedule (universal query for students/teachers)
 * This is THE core query that powers the calendar and daily agenda
 */
export const getMySchedule = query({
  args: {
    from: v.optional(v.number()), // Start of date range
    to: v.optional(v.number()),   // End of date range
    status: v.optional(v.union(
      v.literal("scheduled"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("cancelled")
    )),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) {
      return [];
    }

    // Step 1: Find MY classes (role-based logic)
    let myClasses;
    if (user.role === "teacher" || user.role === "tutor") {
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

    // Step 3: Filter by date range if provided
    if (args.from) {
      flatSchedule = flatSchedule.filter(s => s.scheduledStart >= args.from!);
    }
    if (args.to) {
      flatSchedule = flatSchedule.filter(s => s.scheduledStart <= args.to!);
    }

    // Step 4: Filter by status if provided
    if (args.status) {
      flatSchedule = flatSchedule.filter(s => s.status === args.status);
    }

    // Step 5: Hydrate with lesson and class details
    const results = await Promise.all(
      flatSchedule.map(async (item) => {
        const lesson = await ctx.db.get(item.lessonId);
        const classData = myClasses.find(c => c._id === item.classId);

        if (!lesson || !classData) return null;

        // Get curriculum for color
        const curriculum = await ctx.db.get(classData.curriculumId);

        return {
          scheduleId: item._id,
          title: lesson.title,
          description: lesson.description,
          className: classData.name,
          curriculumTitle: curriculum?.title || "Unknown",
          color: curriculum?.color || "#3b82f6",
          start: item.scheduledStart,
          end: item.scheduledEnd,
          roomName: item.roomName,
          isLive: item.isLive || false,
          status: item.status,
          lessonId: lesson._id,
          classId: classData._id,
          curriculumId: classData.curriculumId,
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

    const [lesson, classData] = await Promise.all([
      ctx.db.get(schedule.lessonId),
      ctx.db.get(schedule.classId),
    ]);

    if (!lesson || !classData) return null;

    const [curriculum, teacher] = await Promise.all([
      ctx.db.get(classData.curriculumId),
      ctx.db.get(classData.teacherId),
    ]);

    return {
      ...schedule,
      lesson: {
        _id: lesson._id,
        title: lesson.title,
        description: lesson.description,
        content: lesson.content,
      },
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
      // This is a safety fallback, but roomName should be preferred
      const allSchedules = await ctx.db
        .query("classSchedule")
        .withIndex("by_status", (q) => 
          q.eq("status", "active")
        )
        .collect();
      
      // Try to find by ID if the sessionId matches
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

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Schedule a lesson for a class
 */
export const scheduleLesson = mutation({
  args: {
    classId: v.id("classes"),
    lessonId: v.id("lessons"),
    scheduledStart: v.number(),
    scheduledEnd: v.number(),
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

    // Generate unique room name
    const roomName = `class-${args.classId}-lesson-${args.lessonId}-${Date.now()}`;

    return await ctx.db.insert("classSchedule", {
      classId: args.classId,
      lessonId: args.lessonId,
      scheduledStart: args.scheduledStart,
      scheduledEnd: args.scheduledEnd,
      roomName,
      isLive: false,
      status: "scheduled",
      createdAt: Date.now(),
      createdBy: user._id,
    });
  },
});

/**
 * Update scheduled lesson
 */
export const updateSchedule = mutation({
  args: {
    id: v.id("classSchedule"),
    scheduledStart: v.optional(v.number()),
    scheduledEnd: v.optional(v.number()),
    status: v.optional(v.union(
      v.literal("scheduled"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("cancelled")
    )),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const schedule = await ctx.db.get(args.id);
    if (!schedule) {
      throw new Error("Schedule not found");
    }

    const classData = await ctx.db.get(schedule.classId);
    if (!classData) {
      throw new Error("Class not found");
    }

    // Validate permissions
    if (
      !["admin", "superadmin"].includes(user.role) &&
      classData.teacherId !== user._id
    ) {
      throw new Error("Only administrators or the class teacher can update schedules");
    }

    // Validate time range if changing
    if (args.scheduledStart && args.scheduledEnd) {
      if (args.scheduledEnd <= args.scheduledStart) {
        throw new Error("End time must be after start time");
      }
    }

    const { id, ...updates } = args;

    // Auto-mark completed
    if (updates.status === "completed" && !schedule.completedAt) {
      (updates as any).completedAt = Date.now();
    }

    await ctx.db.patch(id, updates);
  },
});

/**
 * Cancel scheduled lesson
 */
export const cancelSchedule = mutation({
  args: { id: v.id("classSchedule") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const schedule = await ctx.db.get(args.id);
    if (!schedule) {
      throw new Error("Schedule not found");
    }

    const classData = await ctx.db.get(schedule.classId);
    if (!classData) {
      throw new Error("Class not found");
    }

    if (
      !["admin", "superadmin"].includes(user.role) &&
      classData.teacherId !== user._id
    ) {
      throw new Error("Only administrators or the class teacher can cancel schedules");
    }

    await ctx.db.patch(args.id, {
      status: "cancelled",
    });
  },
});

/**
 * Delete schedule
 */
export const deleteSchedule = mutation({
  args: { id: v.id("classSchedule") },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    if (!["admin", "superadmin"].includes(user.role)) {
      throw new Error("Only administrators can delete schedules");
    }

    const schedule = await ctx.db.get(args.id);
    if (!schedule) {
      throw new Error("Schedule not found");
    }

    // Prevent deletion of active sessions
    if (schedule.status === "active") {
      throw new Error("Cannot delete active session");
    }

    await ctx.db.delete(args.id);
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
      // Logic: If it's not cancelled, force it to active. 
      // This allows re-opening "scheduled" or "completed" sessions.
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