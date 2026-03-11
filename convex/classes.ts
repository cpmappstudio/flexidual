import { ConvexError, v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { getCurrentUserFromAuth, getCurrentUserOrThrow } from "./users";
import { hasSystemRole, canManageClasses, hasAnyOrgRole } from "./permissions";

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
    schoolId: v.optional(v.id("schools")),
    campusId: v.optional(v.id("campuses")),
  },
  handler: async (ctx, args) => {
    // 1. Resolve hierarchical constraints first
    let validCampusIds: Set<string> | null = null;
    
    if (args.campusId) {
      validCampusIds = new Set([args.campusId]);
    } else if (args.schoolId) {
      const campuses = await ctx.db
        .query("campuses")
        .withIndex("by_school", (q) => q.eq("schoolId", args.schoolId!))
        .collect();
      validCampusIds = new Set(campuses.map(c => c._id));
    }

    // 2. Fetch using the most optimized existing index
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

    // 3. Apply the organizational filter in-memory if requested
    if (validCampusIds) {
      classes = classes.filter(c => c.campusId && validCampusIds!.has(c.campusId));
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
    if (!user) return [];

    // Get classes where they are the assigned teacher
    const teachingClasses = await ctx.db
      .query("classes")
      .withIndex("by_teacher", (q) => q.eq("teacherId", user._id).eq("isActive", true))
      .collect();

    // Get classes where they are an enrolled student
    const allClasses = await ctx.db
      .query("classes")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    
    const studentClasses = allClasses.filter(c => c.students.includes(user._id));

    // Combine and remove duplicates
    const combined = [...teachingClasses, ...studentClasses];
    const uniqueIds = new Set();
    return combined.filter(c => {
      if (uniqueIds.has(c._id)) return false;
      uniqueIds.add(c._id);
      return true;
    });
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
      imageUrl: s!.imageUrl,
    }));
  },
});

/**
 * Search for students to enroll
 */
export const searchStudents = query({
  args: {
    searchQuery: v.optional(v.string()),
    excludeClassId: v.optional(v.id("classes")),
    gradeCodes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const studentAssignments = await ctx.db.query("roleAssignments").collect();
    const studentIds = [...new Set(
      studentAssignments.filter(a => a.role === "student").map(a => a.userId)
    )];
    const allUsersRaw = await Promise.all(studentIds.map(id => ctx.db.get(id)));
    const allStudents = allUsersRaw.filter((s): s is NonNullable<typeof s> => s !== null && s.isActive);

    let results = allStudents;

    if (args.gradeCodes && args.gradeCodes.length > 0) {
      results = results.filter(s => s.grade && args.gradeCodes!.includes(s.grade));
    }

    if (args.excludeClassId) {
      const classData = await ctx.db.get(args.excludeClassId);
      if (classData && classData.students) {
        const enrolledIds = new Set(classData.students);
        results = results.filter(s => !enrolledIds.has(s._id));
      }
    }

    if (args.searchQuery) {
      const q = args.searchQuery.toLowerCase().trim();
      if (q.length > 0) {
        results = results.filter(s => 
          s.fullName.toLowerCase().includes(q) ||
          (s.email || "").toLowerCase().includes(q) ||
          (s.username || "").toLowerCase().includes(q)
        );
      }
    }

    return results.slice(0, 50).map(s => ({
      _id: s._id,
      fullName: s.fullName,
      email: s.email,
      username: s.username,
      avatarStorageId: s.avatarStorageId,
      imageUrl: s.imageUrl,
      grade: s.grade,
    }));
  },
});

/**
 * Internal query to check if student is enrolled in a class with the same curriculum
 */
export const checkStudentCurriculumEnrollment = internalQuery({
  args: {
    studentId: v.id("users"),
    curriculumId: v.id("curriculums"),
    excludeClassId: v.optional(v.id("classes")),
  },
  handler: async (ctx, args) => {
    // Get all active classes for this curriculum
    const curriculumClasses = await ctx.db
      .query("classes")
      .withIndex("by_curriculum", (q) => q.eq("curriculumId", args.curriculumId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // Find if student is enrolled in any of these classes
    const conflict = curriculumClasses.find(
      (cls) => 
        cls.students.includes(args.studentId) && 
        (!args.excludeClassId || cls._id !== args.excludeClassId)
    );

    if (conflict) {
      const curriculum = await ctx.db.get(args.curriculumId);
      return {
        hasConflict: true,
        className: conflict.name,
        curriculumTitle: curriculum?.title || 'Unknown',
      };
    }

    return { hasConflict: false };
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
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    curriculumId: v.id("curriculums"),
    campusId: v.optional(v.id("campuses")),
    teacherId: v.id("users"),
    tutorId: v.optional(v.id("users")),
    students: v.optional(v.array(v.id("users"))),
    academicYear: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    // Verify curriculum exists to get the school context
    const curriculum = await ctx.db.get(args.curriculumId);
    if (!curriculum) throw new Error("Curriculum not found");

    // Check Multi-Tenant Authorization
    const isAuthorized = await canManageClasses(ctx, user._id, args.campusId, curriculum.schoolId);
    if (!isAuthorized) {
      throw new Error("Only administrators or principals can create classes for this campus.");
    }

    // Verify teacher exists
    const teacher = await ctx.db.get(args.teacherId);
    if (!teacher) throw new Error("Invalid teacher");

    // --- SMART AUTO-NAMING LOGIC ---
    let className = args.name?.trim();
    if (!className) {
      const year = args.academicYear || new Date().getFullYear().toString();
      const teacherName = teacher.lastName || teacher.firstName || "Teacher";
      
      const existing = await ctx.db
        .query("classes")
        .withIndex("by_curriculum", (q) => q.eq("curriculumId", args.curriculumId))
        .collect();
        
      const similar = existing.filter(c => c.teacherId === args.teacherId && c.academicYear === args.academicYear);
      const sectionStr = similar.length > 0 ? ` (Sec ${similar.length + 1})` : "";
      
      className = `${curriculum.title} - ${teacherName} - ${year}${sectionStr}`;
    }

    return await ctx.db.insert("classes", {
      name: className,
      description: args.description,
      curriculumId: args.curriculumId,
      campusId: args.campusId,
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
    classId: v.id("classes"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    teacherId: v.optional(v.id("users")),
    curriculumId: v.optional(v.id("curriculums")),
    tutorId: v.optional(v.union(v.id("users"), v.null())),
    academicYear: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const classData = await ctx.db.get(args.classId);
    if (!classData) throw new ConvexError("CLASS_NOT_FOUND");
    
    const curriculum = await ctx.db.get(classData.curriculumId);

    const isAuthorizedAdmin = await canManageClasses(ctx, user._id, classData.campusId, curriculum?.schoolId);

    if (!isAuthorizedAdmin) {
      throw new ConvexError("PERMISSION_DENIED: Only administrators or the assigned teacher can modify this class.");
    }

    // Validate new teacher if changing
    if (args.teacherId) {
      const teacher = await ctx.db.get(args.teacherId);
      if (!teacher) throw new Error("Invalid teacher");
      const isTeacher = await hasAnyOrgRole(ctx, args.teacherId, ["teacher"]);
      if (!isTeacher) throw new Error("Invalid teacher");
    }

    const { classId, ...updates } = args;
    
    // Convert null to undefined for optional fields
    const cleanUpdates: any = { ...updates };
    if (cleanUpdates.tutorId === null) {
      cleanUpdates.tutorId = undefined;
    }

    // Protect against accidentally clearing the class name during edits
    if (cleanUpdates.name !== undefined && cleanUpdates.name.trim() === "") {
      delete cleanUpdates.name; 
    }

    await ctx.db.patch(classId, cleanUpdates);
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
    if (!classData) throw new ConvexError("CLASS_NOT_FOUND");
    
    const curriculum = await ctx.db.get(classData.curriculumId);

    const isAuthorizedAdmin = await canManageClasses(ctx, user._id, classData.campusId, curriculum?.schoolId);

    if (!isAuthorizedAdmin) {
      throw new ConvexError("PERMISSION_DENIED: Only administrators can add students to this class.");
    }

    // Verify student exists
    const student = await ctx.db.get(args.studentId);
    if (!student) throw new ConvexError("INVALID_STUDENT");
    const isStudent = await hasAnyOrgRole(ctx, args.studentId, ["student"]);
    if (!isStudent) throw new ConvexError("INVALID_STUDENT");

    // Check if already enrolled
    if (classData.students.includes(args.studentId)) {
      throw new ConvexError("STUDENT_ALREADY_ENROLLED");
    }

    // Check for curriculum conflict
    const conflictCheck = await ctx.runQuery(
      internal.classes.checkStudentCurriculumEnrollment,
      {
        studentId: args.studentId,
        curriculumId: classData.curriculumId,
        excludeClassId: args.classId,
      }
    );

    if (conflictCheck.hasConflict) {
      throw new ConvexError({
        code: "CURRICULUM_CONFLICT",
        className: conflictCheck.className,
        curriculumTitle: conflictCheck.curriculumTitle,
      });
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
    if (!classData) throw new ConvexError("CLASS_NOT_FOUND");
    
    const curriculum = await ctx.db.get(classData.curriculumId);

    const isAuthorizedAdmin = await canManageClasses(ctx, user._id, classData.campusId, curriculum?.schoolId);

    if (!isAuthorizedAdmin) {
      throw new ConvexError("PERMISSION_DENIED: Only administrators can remove students from this class.");
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
    if (!classData) throw new ConvexError("CLASS_NOT_FOUND");

    const curriculum = await ctx.db.get(classData.curriculumId);

    const isAuthorizedAdmin = await canManageClasses(ctx, user._id, classData.campusId, curriculum?.schoolId);
    if (!isAuthorizedAdmin) {
      throw new ConvexError("PERMISSION_DENIED: Only administrators can add students to this class.");
    }

    const students = await Promise.all(args.studentIds.map(id => ctx.db.get(id)));
    if (students.some(s => !s)) throw new ConvexError("INVALID_STUDENTS");

    const roleChecks = await Promise.all(
      args.studentIds.map(id => hasAnyOrgRole(ctx, id, ["student"]))
    );
    if (roleChecks.some(isStudent => !isStudent)) throw new ConvexError("INVALID_STUDENTS");

    // Add only new students (avoid duplicates)
    const newStudents = args.studentIds.filter(
      id => !classData.students.includes(id)
    );

    // Check for curriculum conflicts for each new student
    for (const studentId of newStudents) {
      const conflictCheck = await ctx.runQuery(
        internal.classes.checkStudentCurriculumEnrollment,
        {
          studentId,
          curriculumId: classData.curriculumId,
          excludeClassId: args.classId,
        }
      );

      if (conflictCheck.hasConflict) {
        throw new ConvexError({
          code: "CURRICULUM_CONFLICT",
          className: conflictCheck.className,
          curriculumTitle: conflictCheck.curriculumTitle,
        });
      }
    }

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

    const isSuperAdmin = await hasSystemRole(ctx, user._id, ["superadmin"]);
    if (!isSuperAdmin) {
      throw new Error("Only system superadmins can delete classes");
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

    const isSuperAdmin = await hasSystemRole(ctx, user._id, ["superadmin"]);

    let classes;
    if (isSuperAdmin) {
      classes = await ctx.db
        .query("classes")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
    } else {
      // For now, non-superadmins can only schedule classes they explicitly teach
      // (We can expand this to School Admins later if needed by querying campuses)
      classes = await ctx.db
        .query("classes")
        .withIndex("by_teacher", (q) => q.eq("teacherId", user._id).eq("isActive", true))
        .collect();
    }

    // Hydrate with curriculum and lessons
    const enriched = await Promise.all(
      classes.map(async (cls) => {
        const curriculum = await ctx.db.get(cls.curriculumId);
        const lessons = await ctx.db
          .query("lessons")
          .withIndex("by_curriculum", (q) => q.eq("curriculumId", cls.curriculumId))
          .filter((q) => q.eq(q.field("isActive"), true))
          .collect();

        return {
          _id: cls._id,
          name: cls.name,
          curriculumId: cls.curriculumId,
          curriculumTitle: curriculum?.title || "Unknown",
          curriculumColor: curriculum?.color,
          teacherId: cls.teacherId,
          lessons: lessons.sort((a, b) => a.order - b.order).map(l => ({
             _id: l._id, title: l.title, order: l.order 
          })),
        };
      })
    );

    return enriched;
  },
});