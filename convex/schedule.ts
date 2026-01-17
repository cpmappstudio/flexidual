import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserOrThrow, getCurrentUserFromAuth } from "./users";
import { Id } from "./_generated/dataModel";

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

    // Step 1: Find classes (role-based logic)
    let myClasses;
    if (user.role === "admin" || user.role === "superadmin") {
      if (args.teacherId) {
        // Admin filtering by specific teacher
        myClasses = await ctx.db
          .query("classes")
          .withIndex("by_teacher", (q) => 
            q.eq("teacherId", args.teacherId!).eq("isActive", true)
          )
          .collect();
      } else {
        // Admin seeing all active classes
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
        const classData = myClasses.find(c => c._id === item.classId);
        if (!classData) return null;

        // Get curriculum for color
        const curriculum = await ctx.db.get(classData.curriculumId);
        
        // Get Teacher Name (Important for Admins view)
        const teacher = await ctx.db.get(classData.teacherId);

        // Lesson is optional now - only fetch if exists
        let lessonData = null;
        if (item.lessonId) {
          lessonData = await ctx.db.get(item.lessonId);
        }

        // Use lesson data if available, otherwise use custom title/description
        const title = lessonData?.title || item.title || "Class Session";
        const description = lessonData?.description || item.description || "";

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
          status: item.status,
          lessonId: item.lessonId,
          classId: classData._id,
          curriculumId: classData.curriculumId,
          isRecurring: item.isRecurring || false,
          recurrenceRule: item.recurrenceRule,
          recurrenceParentId: item.recurrenceParentId,
          teacherName: teacher?.fullName || "Unknown",
          teacherImageUrl: teacher?.imageUrl,
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

    const roomName = `class-${args.classId}-${Date.now()}`;

    return await ctx.db.insert("classSchedule", {
      classId: args.classId,
      lessonId: args.lessonId,
      title: args.title,
      description: args.description,
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

    // Generate occurrences
    const duration = args.scheduledEnd - args.scheduledStart;
    const occurrences = generateRecurrenceOccurrences(
      args.scheduledStart,
      args.recurrence
    );

    if (occurrences.length === 0) {
      throw new Error("No valid occurrences generated");
    }

    // Create parent schedule
    const parentRoomName = `class-${args.classId}-series-${Date.now()}`;
    const parentId = await ctx.db.insert("classSchedule", {
      classId: args.classId,
      lessonId: args.lessonId,
      title: args.title,
      description: args.description,
      scheduledStart: args.scheduledStart,
      scheduledEnd: args.scheduledEnd,
      roomName: parentRoomName,
      isLive: false,
      isRecurring: true,
      recurrenceRule: JSON.stringify(args.recurrence),
      status: "scheduled",
      createdAt: Date.now(),
      createdBy: user._id,
    });

    // Create child schedules
    const childIds = [];
    for (let i = 1; i < occurrences.length; i++) {
      const start = occurrences[i];
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
      totalOccurrences: occurrences.length,
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

    // Calculate time delta and new duration based on the specific instance edited
    const oldStart = schedule.scheduledStart;
    const newStart = args.scheduledStart ?? oldStart;
    const timeShiftDelta = newStart - oldStart;
    
    const oldEnd = schedule.scheduledEnd;
    const newEnd = args.scheduledEnd ?? oldEnd;
    const newDuration = newEnd - newStart;

    // Prepare metadata updates
    const metadataUpdates: any = {};
    if (args.title !== undefined) metadataUpdates.title = args.title;
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
      // If recurrenceParentId exists, that's the master. If not, THIS item is the master.
      const masterId = schedule.recurrenceParentId || schedule._id;

      // Collect all items in the series (Master + Children)
      const itemsToUpdate = [];
      
      // A. Fetch Parent (Master)
      const parent = await ctx.db.get(masterId);
      if (parent) itemsToUpdate.push(parent);

      // B. Fetch Children
      const children = await ctx.db
        .query("classSchedule")
        .withIndex("by_recurrence_parent", (q) => q.eq("recurrenceParentId", masterId))
        .collect();
      itemsToUpdate.push(...children);

      // Deduplicate (just in case master was in children list)
      const uniqueItems = Array.from(new Map(itemsToUpdate.map(item => [item._id, item])).values());

      for (const item of uniqueItems) {
        const updatePatch: any = { ...metadataUpdates };

        // Apply Relative Time Shift
        // We use the item's OWN stored start time as the base + the Delta calculated from the edited event
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
  const occurrences: number[] = [startTime];
  const maxOccurrences = recurrence.occurrences || 52; // Default 1 year of weekly
  const endDate = recurrence.endDate || (startTime + (365 * 24 * 60 * 60 * 1000)); // 1 year

  let current = startTime;
  let count = 1;

  while (count < maxOccurrences && current < endDate) {
    let next: number;

    switch (recurrence.type) {
      case "daily":
        next = current + (24 * 60 * 60 * 1000);
        break;
      
      case "weekly":
        next = current + (7 * 24 * 60 * 60 * 1000);
        break;
      
      case "biweekly":
        next = current + (14 * 24 * 60 * 60 * 1000);
        break;
      
      case "monthly":
        const date = new Date(current);
        date.setMonth(date.getMonth() + 1);
        next = date.getTime();
        break;
      
      default:
        return occurrences;
    }

    // Filter by days of week if specified
    if (recurrence.daysOfWeek && recurrence.daysOfWeek.length > 0) {
      const nextDate = new Date(next);
      const dayOfWeek = nextDate.getDay();
      
      if (recurrence.daysOfWeek.includes(dayOfWeek)) {
        occurrences.push(next);
        count++;
      }
    } else {
      occurrences.push(next);
      count++;
    }

    current = next;
  }

  return occurrences;
}