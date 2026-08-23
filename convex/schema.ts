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
import { curriculumIconValidator } from "./model/curriculumIcons";
import { liveAccessValidator } from "./model/liveAccess";
import { courseWeeklySlotValidator } from "./model/courseSchedule";

export default defineSchema({
  /**
   * USERS
   * All system users (students, teachers, tutors, admins)
   */
  users: defineTable({
    // Auth
    clerkId: v.string(),
    email: v.optional(v.string()),
    username: v.optional(v.string()),
    // Legacy only. Remove after clearLegacyExternalPasswords has run in every deployment.
    externalPassword: v.optional(v.string()),

    // Profile
    firstName: v.string(),
    lastName: v.string(),
    fullName: v.string(),
    imageUrl: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),

    // Status
    isActive: v.boolean(),

    // Timestamps
    createdAt: v.number(),
    lastLoginAt: v.optional(v.number()),

    grade: v.optional(v.string()),
    school: v.optional(v.string()),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"])
    .index("by_grade", ["grade"]),

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
    iconKey: v.optional(curriculumIconValidator),

    // Status
    isActive: v.boolean(),

    // Timestamps
    createdAt: v.number(),
    createdBy: v.id("users"),

    gradeCodes: v.optional(v.array(v.string())), // e.g. ["04", "05"]

    schoolId: v.optional(v.id("schools")),
  })
    .index("by_active", ["isActive"])
    .index("by_code", ["code"])
    .index("by_school_code", ["schoolId", "code"])
    .index("by_school", ["schoolId", "isActive"]),

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
    teacherId: v.optional(v.id("users")), // Optional teacher as we are supporting ignitia and abeka virtual asynchronous classes
    // Cached from the course schedule; legacy rows are derived on read.
    classType: v.optional(
      v.union(v.literal("standard"), v.literal("ignitia"), v.literal("abeka")),
    ),
    tutorId: v.optional(v.id("users")), // Optional live tutor
    // Legacy during the classEnrollments backfill. Remove in the next schema cleanup.
    students: v.optional(v.array(v.id("users"))),
    enrollmentsMigratedAt: v.optional(v.number()),

    // Academic period
    academicPeriodId: v.optional(v.id("academicPeriods")),
    academicYear: v.optional(v.string()), // "2024-2025"
    gradeCode: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    timeZone: v.optional(v.string()),
    liveAccess: v.optional(liveAccessValidator),
    weeklySlots: v.optional(v.array(courseWeeklySlotValidator)),
    chatStudentsMuted: v.optional(v.boolean()),
    chatDisabled: v.optional(v.boolean()),
    chatArchivedAt: v.optional(v.number()),

    // Status
    isActive: v.boolean(),

    // Timestamps
    createdAt: v.number(),
    createdBy: v.id("users"),

    // Denormalized tenant scope for indexed institution catalog queries.
    schoolId: v.optional(v.id("schools")),
    campusId: v.optional(v.id("campuses")),
  })
    .index("by_teacher", ["teacherId", "isActive"])
    .index("by_tutor", ["tutorId", "isActive"])
    .index("by_curriculum", ["curriculumId", "isActive"])
    .index("by_academic_period", ["academicPeriodId"])
    .index("by_grade", ["gradeCode"])
    .index("by_active", ["isActive"])
    .index("by_active_and_class_type", ["isActive", "classType"])
    .index("by_school_and_active_and_class_type", [
      "schoolId",
      "isActive",
      "classType",
    ])
    .index("by_campus", ["campusId", "isActive"])
    .index("by_campus_period_grade", [
      "campusId",
      "academicPeriodId",
      "gradeCode",
      "isActive",
    ])
    .searchIndex("search_catalog_name", {
      searchField: "name",
      filterFields: ["schoolId", "isActive", "classType"],
    }),

  classEnrollments: defineTable({
    classId: v.id("classes"),
    studentId: v.id("users"),
    enrolledAt: v.number(),
    enrolledBy: v.id("users"),
  })
    .index("by_class", ["classId", "studentId"])
    .index("by_student", ["studentId", "classId"]),

  courseChatMessages: defineTable({
    classId: v.id("classes"),
    authorId: v.id("users"),
    body: v.string(),
  }).index("by_class", ["classId"]),

  courseChatMutes: defineTable({
    classId: v.id("classes"),
    userId: v.id("users"),
    mutedAt: v.number(),
    mutedBy: v.id("users"),
  }).index("by_class_and_user", ["classId", "userId"]),

  /**
   * CLASS_SCHEDULE
   * The bridge: "When does Class Y meet?" (lesson is now optional)
   * Supports recurring schedules
   */
  classSchedule: defineTable({
    classId: v.id("classes"),
    // Denormalized tenant scope for institution-bounded live discovery.
    // Optional while legacy schedules age out or are started and backfilled.
    schoolId: v.optional(v.id("schools")),
    // lessonId: v.optional(v.id("lessons")),
    lessonIds: v.optional(v.array(v.id("lessons"))),
    sessionType: v.optional(
      v.union(v.literal("live"), v.literal("ignitia"), v.literal("abeka")),
    ),

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
    liveAccess: v.optional(liveAccessValidator),

    // Status tracking
    status: v.union(
      v.literal("scheduled"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),

    // Completion tracking
    completedAt: v.optional(v.number()),

    // Cancellation tracking
    cancellationReason: v.optional(v.string()),
    cancelledAt: v.optional(v.number()),
    cancelledBy: v.optional(v.id("users")),
    cancellationScope: v.optional(
      v.union(v.literal("occurrence"), v.literal("series")),
    ),
    cancellationEffectiveAt: v.optional(v.number()),

    // Live lifecycle state. These fields are managed by the room reconciler.
    liveLeaderAbsentSince: v.optional(v.number()),
    liveExtensionEndsAt: v.optional(v.number()),
    liveDecisionEndsAt: v.optional(v.number()),
    liveLastReconciledAt: v.optional(v.number()),

    // Timestamps
    createdAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_class", ["classId", "scheduledStart"])
    .index("by_class_and_session_type", ["classId", "sessionType"])
    .index("by_class_and_status_and_session_type_and_scheduled_start", [
      "classId",
      "status",
      "sessionType",
      "scheduledStart",
    ])
    .index("by_class_recurrence_parent", ["classId", "recurrenceParentId"])
    .index("by_room", ["roomName"])
    .index("by_status", ["status", "scheduledStart"])
    .index("by_school_and_status_and_scheduled_start", [
      "schoolId",
      "status",
      "scheduledStart",
    ])
    .index("by_live_expiration", ["status", "isLive", "scheduledEnd"])
    .index("by_recurrence_parent", ["recurrenceParentId"]),

  // Domain events retained independently from per-recipient delivery state.
  classCancellationEvents: defineTable({
    classId: v.id("classes"),
    schoolId: v.optional(v.id("schools")),
    scheduleId: v.id("classSchedule"),
    affectedScheduleIds: v.array(v.id("classSchedule")),
    actorId: v.id("users"),
    scope: v.union(v.literal("occurrence"), v.literal("series")),
    source: v.union(v.literal("calendar"), v.literal("course_schedule")),
    reason: v.string(),
    effectiveAt: v.number(),
    occurredAt: v.number(),
  })
    .index("by_class_and_occurred_at", ["classId", "occurredAt"])
    .index("by_school_and_occurred_at", ["schoolId", "occurredAt"]),

  systemNotifications: defineTable({
    recipientId: v.id("users"),
    kind: v.union(
      v.literal("course_enrollment"),
      v.literal("course_assignment"),
      v.literal("class_starting_soon"),
      v.literal("class_cancelled"),
      v.literal("recording_available"),
      v.literal("role_changed"),
      v.literal("organization_membership_changed"),
      v.literal("announcement"),
    ),
    action: v.optional(
      v.union(
        v.literal("added"),
        v.literal("removed"),
        v.literal("changed"),
      ),
    ),
    actorId: v.optional(v.id("users")),
    schoolId: v.optional(v.id("schools")),
    campusId: v.optional(v.id("campuses")),
    classId: v.optional(v.id("classes")),
    scheduleId: v.optional(v.id("classSchedule")),
    recordingId: v.optional(v.id("recordings")),
    cancellationEventId: v.optional(v.id("classCancellationEvents")),
    organizationSlug: v.optional(v.string()),
    roomName: v.optional(v.string()),
    className: v.optional(v.string()),
    schoolName: v.optional(v.string()),
    campusName: v.optional(v.string()),
    previousOrganizationName: v.optional(v.string()),
    role: v.optional(v.string()),
    previousRole: v.optional(v.string()),
    reason: v.optional(v.string()),
    scheduledStart: v.optional(v.number()),
    scheduledEnd: v.optional(v.number()),
    announcementTitle: v.optional(v.string()),
    announcementBody: v.optional(v.string()),
    announcementUrl: v.optional(v.string()),
    dedupeKey: v.string(),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
  })
    .index("by_recipient_and_created_at", ["recipientId", "createdAt"])
    .index("by_recipient_and_read_at_and_created_at", [
      "recipientId",
      "readAt",
      "createdAt",
    ])
    .index("by_dedupe_key", ["dedupeKey"])
    .index("by_schedule_and_kind", ["scheduleId", "kind"]),

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
    attendanceStatus: v.optional(
      v.union(
        v.literal("present"),
        v.literal("absent"),
        v.literal("partial"),
        v.literal("excused"),
      ),
    ),
    manualMarkedBy: v.optional(v.id("users")),
    manualMarkedAt: v.optional(v.number()),
  })
    .index("by_schedule", ["scheduleId", "leftAt"])
    .index("by_student_date", ["studentId", "sessionDate"])
    .index("by_student_schedule", ["studentId", "scheduleId", "leftAt"]),

  /**
   * STUDENT CLASS PREFERENCES
   * Personalized UI settings (like custom icons) for a student's enrolled classes.
   */
  studentClassPreferences: defineTable({
    studentId: v.id("users"),
    classId: v.id("classes"),
    icon: v.string(), // e.g., "calculator", "beaker", "book"
    updatedAt: v.number(),
  })
    .index("by_class", ["classId"])
    .index("by_student_class", ["studentId", "classId"]),

  /**
   * SCHOOLS (Top-Level Tenant)
   * The overarching educational institution or district.
   * Managed by: Admins (and Superadmins)
   */
  schools: defineTable({
    name: v.string(),
    slug: v.string(), // URL-safe identifier (e.g., "boston-public")
    logoStorageId: v.optional(v.id("_storage")),
    scheduleStartMinutes: v.optional(v.number()),
    scheduleEndMinutes: v.optional(v.number()),
    timeZone: v.optional(v.string()),

    isActive: v.boolean(),
    createdAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_slug", ["slug"])
    .index("by_active", ["isActive"]),

  academicPeriods: defineTable({
    schoolId: v.id("schools"),
    name: v.string(),
    // Numbers are legacy values; new periods use civil YYYY-MM-DD strings.
    startDate: v.union(v.string(), v.number()),
    endDate: v.union(v.string(), v.number()),
    createdAt: v.number(),
    createdBy: v.id("users"),
  }).index("by_school_and_start", ["schoolId", "startDate"]),

  institutionGrades: defineTable({
    schoolId: v.id("schools"),
    code: v.string(),
    name: v.string(),
    order: v.number(),
    createdAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_school_and_order", ["schoolId", "order"])
    .index("by_school_and_code", ["schoolId", "code"]),

  /**
   * CAMPUSES (Second-Level Tenant)
   * Physical or logical branches of a school.
   * Managed by institution administrators; principals have read-only settings access.
   */
  campuses: defineTable({
    schoolId: v.id("schools"),
    name: v.string(),
    slug: v.string(), // e.g., "north-campus"
    code: v.optional(v.string()), // Internal reference code
    timeZone: v.optional(v.string()),

    address: v.optional(
      v.object({
        street: v.optional(v.string()),
        city: v.optional(v.string()),
        state: v.optional(v.string()),
        zipCode: v.optional(v.string()),
        country: v.optional(v.string()),
      }),
    ),

    isActive: v.boolean(),
    createdAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_school", ["schoolId", "isActive"])
    .index("by_slug", ["slug"])
    .index("by_active", ["isActive"]),

  /**
   * ROLE ASSIGNMENTS (The Security Junction)
   * Decouples identity from access. Determines who can do what, and where.
   */
  roleAssignments: defineTable({
    userId: v.id("users"),

    // The Context
    orgId: v.optional(v.string()), // ID of the School or Campus (null if system-wide)
    orgType: v.union(
      v.literal("system"),
      v.literal("school"),
      v.literal("campus"),
    ),

    // The Permission
    role: v.union(
      v.literal("superadmin"), // System level
      v.literal("admin"), // School level
      v.literal("principal"), // Campus level
      v.literal("teacher"), // Campus level
      v.literal("tutor"), // Campus level
      v.literal("student"), // Campus level
    ),

    // Denormalized tenant scope. Optional until the membership backfill completes.
    schoolId: v.optional(v.id("schools")),
    // A student's grade belongs to this membership, not to their global identity.
    gradeCode: v.optional(v.string()),

    // Audit Trail
    assignedAt: v.number(),
    assignedBy: v.optional(v.id("users")), // Who granted this access
  })
    .index("by_user", ["userId"])
    .index("by_role", ["role", "schoolId"])
    .index("by_org", ["orgId", "orgType"])
    .index("by_user_org", ["userId", "orgId", "orgType"])
    .index("by_school_role_grade", ["schoolId", "role", "gradeCode"]),

  /**
   * RECORDINGS
   * Tracks LiveKit egress recordings for class sessions.
   * Created when a recording starts; updated via LiveKit egress webhook on completion.
   */
  recordings: defineTable({
    scheduleId: v.id("classSchedule"),
    roomName: v.string(),
    egressId: v.string(),
    status: v.union(
      v.literal("starting"),
      v.literal("active"),
      v.literal("complete"),
      v.literal("failed"),
      v.literal("aborted"),
    ),
    fileKey: v.optional(v.string()), // S3/R2 object key (path)
    url: v.optional(v.string()), // Public playback URL
    durationMs: v.optional(v.number()),
    fileSize: v.optional(v.number()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_schedule", ["scheduleId", "status"])
    .index("by_egress_id", ["egressId"])
    .index("by_room", ["roomName"]),

  /**
   * WHITEBOARD SESSIONS
   * Live scene state for an active classroom whiteboard session.
   * Writer (companion device) upserts on every change (debounced).
   * Readers (teacher view, students) subscribe reactively via useQuery.
   * Avoids all WebRTC DataChannel size limits for scene data.
   */
  whiteboardSessions: defineTable({
    roomName: v.string(),
    elements: v.array(v.any()), // ExcalidrawElements array
    recordingToken: v.optional(v.string()),
    fileRefs: v.optional(
      v.record(
        v.string(),
        v.object({
          url: v.string(),
          mimeType: v.string(),
          storageId: v.id("_storage"),
          created: v.number(),
        }),
      ),
    ),
    updatedAt: v.number(),
  }).index("by_roomName", ["roomName"]),
});
