import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserFromAuth, getCurrentUserOrThrow } from "./users";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List all classes with optional filters
 */
export const list = query({
  args: {
    teacherId: v.optional(v.id("users")),
    curriculumId: v.optional(v.id("curriculums")),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let classes;

    if (args.teacherId) {
      classes = await ctx.db
        .query("classes")
        .withIndex("by_teacher", (q) => 
          q.eq("teacherId", args.teacherId!)
           .eq("isActive", args.isActive ?? true)
        )
        .collect();
    } else if (args.curriculumId) {
      const allClasses = await ctx.db
        .query("classes")
        .withIndex("by_curriculum", (q) => q.eq("curriculumId", args.curriculumId!))
        .collect();
      
      classes = args.isActive !== undefined
        ? allClasses.filter(c => c.isActive === args.isActive)
        : allClasses;
    } else {
      const allClasses = await ctx.db
        .query("classes")
        .withIndex("by_active", (q) => q.eq("isActive", args.isActive ?? true))
        .collect();
      
      classes = allClasses;
    }

    return classes;
  },
});

/**
 * Get single class by ID
 */
export const get = query({
  args: { id: v.id("classes") },
  handler: async (ctx, args) => {
    const classData = await ctx.db.get(args.id);
    if (!classData) return null;

    const curriculum = await ctx.db.get(classData.curriculumId);

    return {
      ...classData,
      curriculumTitle: curriculum?.title || "Unknown Curriculum",
    };
  },
});

/**
 * Get class with enriched data (teacher, curriculum, student details)
 */
export const getWithDetails = query({
  args: { id: v.id("classes") },
  handler: async (ctx, args) => {
    const classData = await ctx.db.get(args.id);
    if (!classData) return null;

    const teacher = await ctx.db.get(classData.teacherId);
    const curriculum = await ctx.db.get(classData.curriculumId);
    
    // Handle optional tutor
    let tutor = null;
    if (classData.tutorId) {
      tutor = await ctx.db.get(classData.tutorId);
    }
    
    // Get student details
    const students = await Promise.all(
      classData.students.map(id => ctx.db.get(id))
    );

    return {
      ...classData,
      teacher: teacher ? {
        _id: teacher._id,
        fullName: teacher.fullName,
        email: teacher.email,
        avatarStorageId: teacher.avatarStorageId,
      } : null,
      tutor: tutor ? {
        _id: tutor._id,
        fullName: tutor.fullName,
        email: tutor.email,
        avatarStorageId: tutor.avatarStorageId,
      } : null,
      curriculum: curriculum ? {
        _id: curriculum._id,
        title: curriculum.title,
        code: curriculum.code,
        color: curriculum.color,
      } : null,
      studentDetails: students.filter(s => s !== null).map(s => ({
        _id: s!._id,
        fullName: s!.fullName,
        email: s!.email,
        avatarStorageId: s!.avatarStorageId,
      })),
    };
  },
});

/**
 * Get my classes (for current user - student or teacher)
 */
export const getMyClasses = query({
  handler: async (ctx) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) {
      return [];
    }

    if (user.role === "teacher" || user.role === "tutor") {
      return await ctx.db
        .query("classes")
        .withIndex("by_teacher", (q) => 
          q.eq("teacherId", user._id).eq("isActive", true)
        )
        .collect();
    }

    // Student: Find classes they're enrolled in
    const allClasses = await ctx.db
      .query("classes")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    return allClasses.filter(c => c.students.includes(user._id));
  },
});

/**
 * Get students in a class
 */
export const getStudents = query({
  args: { classId: v.id("classes") },
  handler: async (ctx, args) => {
    const classData = await ctx.db.get(args.classId);
    if (!classData) return [];

    const students = await Promise.all(
      classData.students.map(id => ctx.db.get(id))
    );

    return students.filter(s => s !== null).map(s => ({
      _id: s!._id,
      fullName: s!.fullName,
      email: s!.email,
      avatarStorageId: s!.avatarStorageId,
      isActive: s!.isActive,
    }));
  },
});

/**
 * Search for students to enroll
 */
export const searchStudents = query({
  args: { 
    searchQuery: v.string(),
    excludeClassId: v.optional(v.id("classes")),
  },
  handler: async (ctx, args) => {
    if (!args.searchQuery || args.searchQuery.length < 2) return [];

    const students = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => 
        q.eq("role", "student").eq("isActive", true)
      )
      .collect();

    const query = args.searchQuery.toLowerCase();
    let results = students.filter(s => 
      s.fullName.toLowerCase().includes(query) ||
      s.email.toLowerCase().includes(query)
    );

    // Exclude students already in the class
    if (args.excludeClassId) {
      const classData = await ctx.db.get(args.excludeClassId);
      if (classData) {
        results = results.filter(s => !classData.students.includes(s._id));
      }
    }

    return results.slice(0, 10).map(s => ({
      _id: s._id,
      fullName: s.fullName,
      email: s.email,
      avatarStorageId: s.avatarStorageId,
    }));
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create new class
 */
export const create = mutation({
  args: {
    name: v.string(),
    curriculumId: v.id("curriculums"),
    teacherId: v.id("users"),
    tutorId: v.optional(v.id("users")),
    students: v.optional(v.array(v.id("users"))),
    academicYear: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    // Validate: Only admins can create classes
    if (!["admin", "superadmin"].includes(user.role)) {
      throw new Error("Only administrators can create classes");
    }

    // Verify curriculum exists
    const curriculum = await ctx.db.get(args.curriculumId);
    if (!curriculum) {
      throw new Error("Curriculum not found");
    }

    // Verify teacher exists and has correct role
    const teacher = await ctx.db.get(args.teacherId);
    if (!teacher || teacher.role !== "teacher") {
      throw new Error("Invalid teacher");
    }

    // Verify tutor if provided
    if (args.tutorId) {
      const tutor = await ctx.db.get(args.tutorId);
      if (!tutor || tutor.role !== "tutor") {
        throw new Error("Invalid tutor");
      }
    }

    return await ctx.db.insert("classes", {
      name: args.name,
      curriculumId: args.curriculumId,
      teacherId: args.teacherId,
      tutorId: args.tutorId,
      students: args.students || [],
      academicYear: args.academicYear,
      startDate: args.startDate,
      endDate: args.endDate,
      isActive: true,
      createdAt: Date.now(),
      createdBy: user._id,
    });
  },
});

/**
 * Update class
 */
export const update = mutation({
  args: {
    id: v.id("classes"),
    name: v.optional(v.string()),
    teacherId: v.optional(v.id("users")),
    tutorId: v.optional(v.union(v.id("users"), v.null())),
    academicYear: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    if (!["admin", "superadmin"].includes(user.role)) {
      throw new Error("Only administrators can update classes");
    }

    const classData = await ctx.db.get(args.id);
    if (!classData) {
      throw new Error("Class not found");
    }

    // Validate new teacher if changing
    if (args.teacherId) {
      const teacher = await ctx.db.get(args.teacherId);
      if (!teacher || teacher.role !== "teacher") {
        throw new Error("Invalid teacher");
      }
    }

    // Validate new tutor if changing
    if (args.tutorId !== undefined && args.tutorId !== null) {
      const tutor = await ctx.db.get(args.tutorId);
      if (!tutor || tutor.role !== "tutor") {
        throw new Error("Invalid tutor");
      }
    }

    const { id, ...updates } = args;
    
    // Convert null to undefined for optional fields
    const cleanUpdates: any = { ...updates };
    if (cleanUpdates.tutorId === null) {
      cleanUpdates.tutorId = undefined;
    }

    await ctx.db.patch(id, cleanUpdates);
  },
});

/**
 * Add student to class
 */
export const addStudent = mutation({
  args: {
    classId: v.id("classes"),
    studentId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const classData = await ctx.db.get(args.classId);
    if (!classData) {
      throw new Error("Class not found");
    }

    // Validate: Admins or the class teacher can add students
    if (
      !["admin", "superadmin"].includes(user.role) &&
      classData.teacherId !== user._id
    ) {
      throw new Error("Only administrators or the class teacher can add students");
    }

    // Verify student exists
    const student = await ctx.db.get(args.studentId);
    if (!student || student.role !== "student") {
      throw new Error("Invalid student");
    }

    // Check if already enrolled
    if (classData.students.includes(args.studentId)) {
      throw new Error("Student already enrolled in this class");
    }

    await ctx.db.patch(args.classId, {
      students: [...classData.students, args.studentId],
    });
  },
});

/**
 * Remove student from class
 */
export const removeStudent = mutation({
  args: {
    classId: v.id("classes"),
    studentId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const classData = await ctx.db.get(args.classId);
    if (!classData) {
      throw new Error("Class not found");
    }

    // Validate: Admins or the class teacher can remove students
    if (
      !["admin", "superadmin"].includes(user.role) &&
      classData.teacherId !== user._id
    ) {
      throw new Error("Only administrators or the class teacher can remove students");
    }

    await ctx.db.patch(args.classId, {
      students: classData.students.filter(id => id !== args.studentId),
    });
  },
});

/**
 * Bulk add students to class
 */
export const addStudents = mutation({
  args: {
    classId: v.id("classes"),
    studentIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const classData = await ctx.db.get(args.classId);
    if (!classData) {
      throw new Error("Class not found");
    }

    if (
      !["admin", "superadmin"].includes(user.role) &&
      classData.teacherId !== user._id
    ) {
      throw new Error("Only administrators or the class teacher can add students");
    }

    // Verify all students exist
    const students = await Promise.all(
      args.studentIds.map(id => ctx.db.get(id))
    );

    const invalidStudents = students.filter(s => !s || s.role !== "student");
    if (invalidStudents.length > 0) {
      throw new Error("One or more invalid student IDs");
    }

    // Add only new students (avoid duplicates)
    const newStudents = args.studentIds.filter(
      id => !classData.students.includes(id)
    );

    await ctx.db.patch(args.classId, {
      students: [...classData.students, ...newStudents],
    });
  },
});

/**
 * Delete class
 */
export const remove = mutation({
  args: { 
    id: v.id("classes"),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    if (user.role !== "superadmin") {
      throw new Error("Only superadmins can delete classes");
    }

    // Check for scheduled sessions
    const schedules = await ctx.db
      .query("classSchedule")
      .withIndex("by_class", (q) => q.eq("classId", args.id))
      .collect();

    if (schedules.length > 0 && !args.force) {
      throw new Error(
        `Cannot delete class with ${schedules.length} scheduled session(s). ` +
        `Use force=true to delete anyway.`
      );
    }

    // Delete all schedules for this class
    for (const schedule of schedules) {
      await ctx.db.delete(schedule._id);
    }

    await ctx.db.delete(args.id);
  },
});

/**
 * Get classes I can schedule for (with curriculum details for lesson selection)
 */
export const getSchedulableClasses = query({
  handler: async (ctx) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) return [];

    // Teachers/Tutors see their classes, Admins see all
    let classes;
    if (user.role === "admin" || user.role === "superadmin") {
      classes = await ctx.db
        .query("classes")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    } else if (user.role === "teacher" || user.role === "tutor") {
      classes = await ctx.db
        .query("classes")
        .withIndex("by_teacher", (q) => 
          q.eq("teacherId", user._id).eq("isActive", true)
        )
        .collect();
    } else {
      return [];
    }

    // Hydrate with curriculum and lessons
    const enriched = await Promise.all(
      classes.map(async (cls) => {
        const curriculum = await ctx.db.get(cls.curriculumId);
        const lessons = await ctx.db
          .query("lessons")
          .withIndex("by_curriculum", (q) => 
            q.eq("curriculumId", cls.curriculumId)
          )
          .filter((q) => q.eq(q.field("isActive"), true))
          .collect();

        // Sort lessons by order
        const sortedLessons = lessons.sort((a, b) => a.order - b.order);

        return {
          _id: cls._id,
          name: cls.name,
          curriculumId: cls.curriculumId,
          curriculumTitle: curriculum?.title || "Unknown",
          curriculumColor: curriculum?.color,
          lessons: sortedLessons.map(l => ({
            _id: l._id,
            title: l.title,
            order: l.order,
          })),
        };
      })
    );

    return enriched;
  },
});