/**
 * FlexiDual - Schema
 * Focus: Core scheduling system with LiveKit classroom integration
 * 
 * Core Flow:
 * 1. Admin creates Curriculums (templates)
 * 2. Admin creates Lessons (content units)
 * 3. Admin creates Classes (groups of students + teacher + curriculum)
 * 4. Admin schedules Lessons for specific Classes on specific dates
 * 5. Students/Teachers join via LiveKit when session is active
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  /**
   * USERS
   * All system users (students, teachers, tutors, admins)
   */
  users: defineTable({
    // Auth
    clerkId: v.string(),
    email: v.string(),
    
    // Profile
    firstName: v.string(),
    lastName: v.string(),
    fullName: v.string(),
    imageUrl: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
    
    // Role-based access
    role: v.union(
      v.literal("student"),
      v.literal("teacher"),
      v.literal("tutor"),
      v.literal("admin"),
      v.literal("superadmin")
    ),
    
    // Status
    isActive: v.boolean(),
    
    // Timestamps
    createdAt: v.number(),
    lastLoginAt: v.optional(v.number()),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"])
    .index("by_role", ["role", "isActive"]),

  /**
   * CURRICULUMS
   * The template/blueprint (e.g., "5th Grade Math", "Biology 101")
   */
  curriculums: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    code: v.optional(v.string()), // e.g., "MATH-05"
    
    // Visual identity
    color: v.optional(v.string()), // For UI color coding
    
    // Status
    isActive: v.boolean(),
    
    // Timestamps
    createdAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_active", ["isActive"])
    .index("by_code", ["code"]),

  /**
   * LESSONS
   * Content units that belong to a curriculum (the "what to teach")
   */
  lessons: defineTable({
    curriculumId: v.id("curriculums"),
    
    // Content
    title: v.string(),
    description: v.optional(v.string()),
    content: v.optional(v.string()), // Full lesson content/materials
    
    // Organization
    order: v.number(), // 1, 2, 3... for sequential ordering
    
    // Resources
    resourceStorageIds: v.optional(v.array(v.id("_storage"))),
    
    // Status
    isActive: v.boolean(),
    
    // Timestamps
    createdAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_curriculum", ["curriculumId", "order"])
    .index("by_curriculum_active", ["curriculumId", "isActive"]),

  /**
   * CLASSES
   * An active group (Teacher + Students + Curriculum)
   * This is where scheduling happens
   */
  classes: defineTable({
    name: v.string(), // e.g., "Math 5th Grade - Fall 2024"
    description: v.optional(v.string()),
    curriculumId: v.id("curriculums"), // What curriculum are we following?
    
    // People
    teacherId: v.id("users"), // Who teaches this?
    tutorId: v.optional(v.id("users")), // Optional live tutor
    students: v.array(v.id("users")), // Who's enrolled?
    
    // Academic period
    academicYear: v.optional(v.string()), // "2024-2025"
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    
    // Status
    isActive: v.boolean(),
    
    // Timestamps
    createdAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_teacher", ["teacherId", "isActive"])
    .index("by_curriculum", ["curriculumId"])
    .index("by_active", ["isActive"]),

  /**
   * CLASS_SCHEDULE
   * The bridge: "When does Class Y meet?" (lesson is now optional)
   * Supports recurring schedules
   */
  classSchedule: defineTable({
    classId: v.id("classes"),
    lessonId: v.optional(v.id("lessons")),
    sessionType: v.optional(v.union(v.literal("live"), v.literal("ignitia"))),
    
    // Basic info (for schedules without lessons)
    title: v.optional(v.string()), // Custom title if no lesson
    description: v.optional(v.string()), // Custom description
    
    // When?
    scheduledStart: v.number(),
    scheduledEnd: v.number(),
    
    // Recurrence support
    isRecurring: v.optional(v.boolean()),
    recurrenceRule: v.optional(v.string()), // RRULE format or simple pattern
    recurrenceParentId: v.optional(v.id("classSchedule")), // Links to parent if part of series
    
    // LiveKit Integration
    roomName: v.string(),
    isLive: v.optional(v.boolean()),
    
    // Status tracking
    status: v.union(
      v.literal("scheduled"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
    
    // Completion tracking
    completedAt: v.optional(v.number()),
    
    // Timestamps
    createdAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_class", ["classId", "scheduledStart"])
    .index("by_class_status", ["classId", "status"])
    .index("by_date_range", ["scheduledStart"])
    .index("by_room", ["roomName"])
    .index("by_status", ["status", "scheduledStart"])
    .index("by_recurrence_parent", ["recurrenceParentId"]),

  /**
   * CLASS_SESSIONS
   * Attendance tracking: Who joined when?
   * Used for the "Student Assistance" timer/percentage
   */
  class_sessions: defineTable({
    scheduleId: v.id("classSchedule"),
    studentId: v.id("users"),
    
    // Timing
    joinedAt: v.number(),
    leftAt: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    
    // LiveKit room context
    roomName: v.string(),
    
    // Date for easy querying
    sessionDate: v.string(), // YYYY-MM-DD

    // Manual Status Override
    attendanceStatus: v.optional(v.union(
      v.literal("present"),
      v.literal("absent"), 
      v.literal("partial"),
      v.literal("excused")
    )),
    manualMarkedBy: v.optional(v.id("users")),
    manualMarkedAt: v.optional(v.number()),
  })
    .index("by_schedule", ["scheduleId"])
    .index("by_student_date", ["studentId", "sessionDate"])
    .index("by_student_schedule", ["studentId", "scheduleId"])
    .index("by_room_active", ["roomName", "leftAt"]),
});

/**
 * MIGRATION NOTES FROM OLD SCHEMA:
 * 
 * REMOVED (can add back in Phase 2 if needed):
 * - campuses (multi-campus support)
 * - grades (grade-level complexity)
 * - curriculum_grades (many-to-many)
 * - curriculum_lessons (merged into lessons)
 * - teacher_assignments (simplified into classes.teacherId)
 * - lesson_progress (replaced with classSchedule + class_sessions)
 * - activity_logs (audit trail - add back if needed)
 * - assignments (homework system - Phase 2)
 * - submissions (homework tracking - Phase 2)
 * 
 * SIMPLIFIED:
 * - users: Removed campus associations, progress metrics, student profiles
 * - curriculums: Removed campus assignments, quarters, complex metrics
 * - lessons: Combined curriculum_lessons logic, removed quarters/grades
 * - classes: New simplified table replacing teacher_assignments
 * - classSchedule: New core table - the "single source of truth"
 * - class_sessions: Simplified attendance tracking
 * 
 * KEY IMPROVEMENTS:
 * ✅ One clear hierarchy: Curriculum → Lessons → Classes → Schedule
 * ✅ No redundant progress tracking
 * ✅ Schedule is the bridge, not duplicated data
 * ✅ LiveKit integration preserved (roomName, status)
 * ✅ Attendance tracking simplified but functional
 * ✅ Reduced from 10+ tables to 6 core tables
 * ✅ All indexes serve clear query patterns
 * 
 * QUERY PATTERNS SUPPORTED:
 * - Get my schedule (student/teacher): classSchedule by class membership
 * - Get today's classes: classSchedule by date range
 * - Track attendance: class_sessions by student/schedule
 * - Join LiveKit room: classSchedule by roomName + status check
 * - Calendar view: classSchedule by date range + class association
 */