// ################################################################################
// # File: schema.ts                                                              # 
// # Project: CPCA Teachers - Teacher Progress Tracking System                    #
// # Description: Schema optimized for tracking teacher progress across campuses  #
// # Creation date: 09/22/2025                                                    #
// ################################################################################

/**
 * CPCA TEACHERS: Teacher Progress Tracking System
 * Schema optimized for multi-campus teacher management and lesson tracking.
 * 
 * PERFORMANCE NOTES (Convex Best Practices):
 * - Indexes designed to avoid full table scans on tables > 1000 documents
 * - Compound indexes ordered by selectivity (most selective field first)
 * - No redundant indexes (if we have ["a", "b"], we don't need ["a"])
 * - Strategic denormalization in lesson_progress for dashboard queries
 * - Maximum 32 indexes per table (we use ~3-6 per table)
 * 
 * QUERY PATTERNS SUPPORTED:
 * - Campus dashboard: List all teachers by campus, progress overview
 * - Teacher dashboard: View assigned courses, lesson progress, upload evidence
 * - Admin dashboard: Manage campuses, teachers, curriculums, track overall progress
 * - Progress tracking: Real-time progress calculation by teacher, course, campus
 * 
 * Tables:
 * 1. users - Teachers and admins (indexed by role, clerk_id, email)
 * 2. campuses - School campuses (indexed by status, created date)
 * 3. grades - Academic grades/levels (indexed by order, status)
 * 4. curriculums - Course definitions (indexed by status, grade associations)
 * 5. curriculum_grades - Many-to-many for curriculum-grade relationships
 * 6. curriculum_lessons - Lesson templates per curriculum (indexed by quarter, order)
 * 7. teacher_assignments - Teacher-curriculum assignments (indexed by teacher, campus)
 * 8. lesson_progress - Actual lesson completion tracking (indexed by teacher, status)
 * 9. class_sessions - Attendance logs for virtual classes (indexed by student, date, room)
 * 10. assignments - Homework and tasks created by teachers (indexed by curriculum, teacher)
 * 11. submissions - Student submissions for assignments (indexed by assignment, student)
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  /**
   * Users table - Teachers and Admins
   * Stores all system users with their roles and profiles
   */
  users: defineTable({
    // Authentication
    clerkId: v.string(),
    email: v.string(),

    // Personal information
    firstName: v.string(),
    lastName: v.string(),
    fullName: v.string(), // Denormalized for performance

    // Profile (stored in Convex Storage)
    avatarStorageId: v.optional(v.id("_storage")), // Reference to Convex storage for avatar
    phone: v.optional(v.string()),

    // System fields
    role: v.union(
      v.literal("teacher"),
      v.literal("admin"),
      v.literal("superadmin"),
      v.literal("student"),
      v.literal("tutor")
    ),

    // Campus association (teachers belong to one campus)
    campusId: v.optional(v.id("campuses")),

    // Status tracking
    isActive: v.boolean(),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("on_leave"),
      v.literal("terminated")
    ),

    // Progress metrics (denormalized for performance)
    progressMetrics: v.optional(v.object({
      totalLessons: v.number(),
      completedLessons: v.number(),
      progressPercentage: v.number(), // 0-100
      lastUpdated: v.number(),
    })),

    // Timestamps
    createdAt: v.number(),
    createdBy: v.optional(v.id("users")),
    updatedAt: v.optional(v.number()),
    lastLoginAt: v.optional(v.number()),

    // Password handling (if not using Clerk for everything)
    hashedPassword: v.optional(v.string()),

    // Student-specific profile (if role is student)
    studentProfile: v.optional(v.object({
        gradeCode: v.string(), // e.g., "05" (5th Grade)
        parentName: v.optional(v.string()),
        parentEmail: v.optional(v.string()),
        parentPhone: v.optional(v.string()),
        groupCode: v.string(), // Defines which group section they belong to (e.g., "05-A") - This is crucial for linking them to the specific teacher assigned to this group
    })),

    // Real-time online status tracking
    onlineStatus: v.optional(v.object({
        state: v.union(v.literal("online"), v.literal("offline"), v.literal("in_class")),
        lastSeen: v.number(),
        currentRoomId: v.optional(v.string()), // Which class are they currently Dragged & Dropped into?
    })),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"])
    .index("by_role_active", ["role", "isActive"])
    .index("by_campus_active", ["campusId", "isActive"])
    .index("by_campus_status", ["campusId", "status"])
    .index("by_campus_grade", ["campusId", "studentProfile.gradeCode"]), 

  /**
   * Campuses table
   * Represents different school locations/branches
   */
  campuses: defineTable({
    name: v.string(),
    code: v.optional(v.string()), // Unique campus code

    // Images (stored in Convex Storage)
    campusImageStorageId: v.optional(v.id("_storage")), // Reference to Convex storage for campus image

    // Director information
    // Keep a reference to the director user record instead of storing the director's
    // image/document here. Director profile (including avatarStorageId) should live
    // in the `users` table and be referenced via `directorId`.
    directorId: v.optional(v.id("users")),
    directorName: v.optional(v.string()),
    directorEmail: v.optional(v.string()),
    directorPhone: v.optional(v.string()),

    // Address
    address: v.optional(v.object({
      street: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      zipCode: v.optional(v.string()),
      country: v.optional(v.string()),
    })),

    // Grades offered at this campus
    grades: v.optional(v.array(v.object({
      name: v.string(), // "Prekinder", "1st Grade", "2nd Grade", etc.
      code: v.string(), // "PK", "01", "02", etc. (base grade code without group suffix)
      level: v.number(), // Numeric level for ordering (0 for prekinder, 1, 2, 3...)
      category: v.optional(v.union(
        v.literal("prekinder"),
        v.literal("kinder"),
        v.literal("elementary"),
        v.literal("middle"),
        v.literal("high")
      )),
      numberOfGroups: v.optional(v.number()), // How many sections/groups this grade has (e.g., 3 means: 01-1, 01-2, 01-3)
      isActive: v.boolean(),
    }))),

    // Metrics (denormalized for dashboard)
    metrics: v.optional(v.object({
      totalTeachers: v.number(),
      activeTeachers: v.number(),
      averageProgress: v.number(), // 0-100
      lastUpdated: v.number(),
    })),

    // Status
    isActive: v.boolean(),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("maintenance")
    ),

    // Timestamps
    createdAt: v.number(),
    createdBy: v.id("users"),
    updatedAt: v.optional(v.number()),
    updatedBy: v.optional(v.id("users")),
  })
    .index("by_active", ["isActive"])
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"])
    .index("by_name", ["name"])
    .index("by_director", ["directorId"]),

  /**
   * Curriculums table
   * Course/subject definitions that can span multiple grades
   */
  curriculums: defineTable({
    name: v.string(), // "Mathematics", "Science", etc.
    code: v.optional(v.string()), // "MATH-101"
    description: v.optional(v.string()),

    // Academic organization
    numberOfQuarters: v.number(), // 1-4 typically

    // Campus assignments - each campus can have its own teachers and grades
    campusAssignments: v.optional(v.array(v.object({
      campusId: v.id("campuses"),
      assignedTeachers: v.array(v.id("users")), // Teachers from this specific campus
      gradeCodes: v.array(v.string()), // Grade codes taught at this campus
    }))),

    // Metrics (denormalized)
    metrics: v.optional(v.object({
      totalLessons: v.number(),
      assignedTeachers: v.number(),
      averageProgress: v.number(),
      lastUpdated: v.number(),
    })),

    // Additional metadata (documents stored in Convex Storage when uploaded)
    syllabusStorageId: v.optional(v.id("_storage")), // Reference to Convex storage for syllabus/document
    resources: v.optional(v.array(v.object({
      name: v.string(),
      url: v.string(),
      type: v.string(),
    }))),

    // Status
    isActive: v.boolean(),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("archived"),
      v.literal("deprecated")
    ),

    // Timestamps
    createdAt: v.number(),
    createdBy: v.id("users"),
    updatedAt: v.optional(v.number()),
    updatedBy: v.optional(v.id("users")),
  })
    .index("by_active", ["isActive"])
    .index("by_status", ["status"])
    .index("by_name", ["name"])
    .index("by_created", ["createdAt"]),

  /**
   * Curriculum lessons table
   * Template lessons that belong to a curriculum
   */
  curriculum_lessons: defineTable({
    curriculumId: v.id("curriculums"),

    // Lesson details
    title: v.string(),
    description: v.optional(v.string()),

    // Quarter assignment
    quarter: v.number(), // 1, 2, 3, or 4

    // Grade assignment (optional - if not set, applies to all grades)
    // Changed to array to support multiple grades per lesson
    gradeCodes: v.optional(v.array(v.string())), // e.g., ["PK", "K"], ["01", "02"]

    // Legacy field for backward compatibility (deprecated, use gradeCodes)
    gradeCode: v.optional(v.string()),

    // Ordering within quarter
    orderInQuarter: v.number(),

    // Expected duration
    expectedDurationMinutes: v.optional(v.number()),

    // Resources
    resources: v.optional(v.array(v.object({
      name: v.string(),
      url: v.string(),
      type: v.string(),
      isRequired: v.boolean(),
    }))),

    // Learning objectives
    objectives: v.optional(v.array(v.string())),

    // Status
    isActive: v.boolean(),
    isMandatory: v.boolean(), // Some lessons might be optional

    // Timestamps
    createdAt: v.number(),
    createdBy: v.id("users"),
    updatedAt: v.optional(v.number()),
    updatedBy: v.optional(v.id("users")),
  })
    .index("by_curriculum_quarter", ["curriculumId", "quarter", "orderInQuarter"])
    .index("by_curriculum_active", ["curriculumId", "isActive"])
    .index("by_quarter", ["quarter", "isActive"]),

  /**
   * Teacher assignments table
   * Links teachers to curriculums they're assigned to teach
   */
  teacher_assignments: defineTable({
    teacherId: v.id("users"),
    curriculumId: v.id("curriculums"),
    campusId: v.id("campuses"),

    // Academic period
    academicYear: v.string(), // "2025-2026"
    startDate: v.number(),
    endDate: v.optional(v.number()),

    // Assignment details
    assignmentType: v.union(
      v.literal("primary"), // Main teacher
      v.literal("substitute"),
      v.literal("assistant"),
      v.literal("co_teacher")
    ),

    // Grade and group assignment
    // Teacher can be assigned to specific grades (e.g., ["01", "K"]) and groups (e.g., ["01-1", "01-2", "K-1"])
    assignedGrades: v.optional(v.array(v.string())), // Base grade codes the teacher teaches
    assignedGroupCodes: v.optional(v.array(v.string())), // Specific group/section codes the teacher teaches

    // Progress tracking (denormalized)
    progressSummary: v.optional(v.object({
      totalLessons: v.number(),
      completedLessons: v.number(),
      progressPercentage: v.number(),
      lastLessonDate: v.optional(v.number()),
      lastUpdated: v.number(),
    })),

    // Status
    isActive: v.boolean(),
    status: v.union(
      v.literal("active"),
      v.literal("pending"),
      v.literal("completed"),
      v.literal("cancelled")
    ),

    // Timestamps
    assignedAt: v.number(),
    assignedBy: v.id("users"),
    updatedAt: v.optional(v.number()),
  })
    .index("by_teacher_active", ["teacherId", "isActive"])
    .index("by_curriculum", ["curriculumId", "isActive"])
    .index("by_campus_curriculum", ["campusId", "curriculumId", "isActive"])
    .index("by_teacher_campus", ["teacherId", "campusId", "isActive"])
    .index("by_academic_year", ["academicYear", "status"]),

  /**
   * Lesson progress table
   * Tracks actual lesson completion by teachers
   */
  lesson_progress: defineTable({
    // Core references
    teacherId: v.id("users"),
    lessonId: v.id("curriculum_lessons"),
    assignmentId: v.id("teacher_assignments"),

    // Denormalized for performance
    curriculumId: v.id("curriculums"),
    campusId: v.id("campuses"),
    quarter: v.number(),

    // Grade tracking (for multi-grade support)
    // When a curriculum is taught to multiple grade sections,
    // each grade section needs separate progress tracking
    // Stores the grade code (e.g., "PK1", "K1") from campus.grades
    gradeCode: v.optional(v.string()),

    // Group tracking (for multi-group support within a grade)
    // When a teacher teaches multiple groups within the same grade,
    // each group needs separate progress tracking
    // Stores the group code (e.g., "01-1", "01-2") which is gradeCode-groupNumber
    groupCode: v.optional(v.string()),

    // Completion tracking
    status: v.union(
      v.literal("not_started"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("skipped"),
      v.literal("rescheduled")
    ),

    // Evidence of completion (stored in Convex Storage)
    evidencePhotoStorageId: v.optional(v.id("_storage")), // Reference to Convex storage for uploaded photo
    evidenceDocumentStorageId: v.optional(v.id("_storage")), // Reference to Convex storage for uploaded document

    // Teacher's input
    activitiesPerformed: v.optional(v.string()), // Text description of activities
    lessonPlan: v.optional(v.string()), // Lesson plan details
    notes: v.optional(v.string()), // Additional notes

    // Completion details
    completedAt: v.optional(v.number()),
    scheduledDate: v.optional(v.number()),
    actualDurationMinutes: v.optional(v.number()),

    // Student metrics (optional)
    studentAttendance: v.optional(v.object({
      present: v.number(),
      absent: v.number(),
      total: v.number(),
    })),

    // Validation
    isVerified: v.boolean(), // Admin has verified the completion
    verifiedBy: v.optional(v.id("users")),
    verifiedAt: v.optional(v.number()),
    verificationNotes: v.optional(v.string()),

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    lastModifiedBy: v.optional(v.id("users")),
  })
    .index("by_teacher_lesson", ["teacherId", "lessonId"])
    .index("by_teacher_lesson_grade", ["teacherId", "lessonId", "gradeCode"]) // For multi-grade progress queries
    .index("by_teacher_lesson_group", ["teacherId", "lessonId", "groupCode"]) // For multi-group progress queries
    .index("by_assignment_status", ["assignmentId", "status"])
    .index("by_curriculum_teacher", ["curriculumId", "teacherId", "quarter"])
    .index("by_campus_date", ["campusId", "completedAt"])
    .index("by_teacher_quarter_status", ["teacherId", "quarter", "status"])
    .index("by_verification_status", ["isVerified", "completedAt"]),

  /**
   * Activity logs table (optional but recommended for audit trail)
   * Tracks all important actions in the system
   */
  activity_logs: defineTable({
    userId: v.id("users"),

    // Action details
    action: v.string(), // "created_campus", "updated_lesson", "uploaded_evidence", etc.
    entityType: v.string(), // "campus", "curriculum", "lesson_progress", etc.
    entityId: v.string(), // ID of the affected entity

    // Changes made (for updates)
    changes: v.optional(v.object({
      before: v.any(),
      after: v.any(),
    })),

    // Context
    metadata: v.optional(v.object({
      campusId: v.optional(v.id("campuses")),
      ip: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      notes: v.optional(v.string()),
    })),

    // Timestamp
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_entity", ["entityType", "entityId"])
    .index("by_action", ["action", "createdAt"])
    .index("by_created", ["createdAt"]),

  /**
   * Class Sessions (Attendance Log)
   * Tracks every time a student enters a virtual class via Drag & Drop.
   * Used to calculate the "Time in Class" and % Assistance.
   */
  class_sessions: defineTable({
    studentId: v.id("users"),
    campusId: v.id("campuses"),
    
    // Which class is this?
    curriculumId: v.id("curriculums"), 
    teacherId: v.optional(v.id("users")), // The teacher of this class
    
    // LiveKit Room Name (e.g., "math-101-group-a")
    roomName: v.string(), 

    // Timing
    enteredAt: v.number(),
    leftAt: v.optional(v.number()),
    durationSeconds: v.optional(v.number()), // Calculated on exit

    // Date reference for queries like "Attendance for 2025-10-22"
    sessionDate: v.string(), // YYYY-MM-DD
  })
  .index("by_student_date", ["studentId", "sessionDate"])
  .index("by_student_curriculum", ["studentId", "curriculumId"])
  .index("by_room_active", ["roomName", "leftAt"]), // Find currently active sessions

  /**
   * Assignments/Homeworks
   * Tasks created by Teachers for Students
   */
  assignments: defineTable({
    curriculumId: v.id("curriculums"),
    teacherId: v.id("users"),
    
    // Target audience
    gradeCodes: v.array(v.string()), // e.g. ["05"]
    groupCodes: v.optional(v.array(v.string())), // e.g. ["05-A"]

    title: v.string(),
    description: v.optional(v.string()),
    type: v.union(v.literal("homework"), v.literal("quiz"), v.literal("project")),
    
    dueDate: v.number(),
    
    // Files attached by teacher
    resourceStorageIds: v.optional(v.array(v.id("_storage"))),
    
    isActive: v.boolean(),
    createdAt: v.number(),
  })
  .index("by_curriculum_active", ["curriculumId", "isActive"])
  .index("by_teacher", ["teacherId"]),

  /**
   * Student Submissions
   * Tracking homework completion/files uploaded by students
   */
  submissions: defineTable({
    assignmentId: v.id("assignments"),
    studentId: v.id("users"),
    
    status: v.union(v.literal("draft"), v.literal("submitted"), v.literal("graded")),
    
    // Student's work
    fileStorageIds: v.optional(v.array(v.id("_storage"))),
    comments: v.optional(v.string()),
    
    submittedAt: v.optional(v.number()),
    
    // Grading
    grade: v.optional(v.number()),
    feedback: v.optional(v.string()),
  })
  .index("by_assignment_student", ["assignmentId", "studentId"])
  .index("by_student", ["studentId"]),
});

/**
 * PERFORMANCE CONSIDERATIONS AND BEST PRACTICES:
 * 
 * 1. Denormalization Strategy:
 *    - Progress metrics stored in users table for quick teacher overview
 *    - Campus metrics stored for dashboard performance
 *    - Assignment progress summary prevents multiple aggregation queries
 * 
 * 2. Index Strategy:
 *    - Compound indexes serve multiple query patterns
 *    - Most selective fields first in compound indexes
 *    - Status fields included for filtering active records
 *    - Date fields in indexes for sorting and reporting
 * 
 * 3. Expected Scale:
 *    - Multiple campuses (10-50)
 *    - ~100-500 teachers across all campuses
 *    - ~50-200 curriculums
 *    - ~1000-5000 lesson templates
 *    - ~10,000-50,000 lesson progress records per academic year
 * 
 * 4. Query Patterns Optimized:
 *    - Campus dashboard: O(1) with denormalized metrics
 *    - Teacher progress view: Indexed by teacher and assignment
 *    - Admin overview: Aggregated metrics prevent full scans
 *    - Progress calculation: Quarter-based indexing for efficient filtering
 * 
 * 5. Security Considerations:
 *    - Role-based access control through user roles
 *    - Campus isolation for multi-tenant architecture
 *    - Activity logging for audit trail
 *    - Verification system for lesson completion
 */