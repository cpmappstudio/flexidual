import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  mutation,
  query,
  internalQuery,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserFromAuth, getCurrentUserOrThrow } from "./users";
import { canAccessClass, canManageClasses, hasSystemRole } from "./permissions";
import {
  DEFAULT_SCHEDULE_END_MINUTES,
  DEFAULT_SCHEDULE_START_MINUTES,
} from "../lib/academic-settings";
import {
  addCivilDays,
  civilDayNumber,
  getWeeklyOccurrenceStarts,
  isValidTimeZone,
  localDateTimeToUtc,
  toCivilDate,
  todayInTimeZone,
  utcToLocalDateTime,
} from "../lib/time-zone";
import { getClassTimeZone } from "./model/timeZone";
import { validateGradeCodes } from "./model/grades";
import {
  getStudentGradeCode,
  getStudentMembership,
  listInstitutionStudentMemberships,
} from "./model/membership";
import {
  ensureClassEnrollmentsMigrated,
  isStudentEnrolled,
  listClassStudentIds,
} from "./model/enrollments";
import { hasOnlyInstructorStaffRoles } from "./model/roles";
import { deleteSchedulesWithDependencies } from "./model/scheduleDeletion";
import { isCurriculumAvailableForGrade } from "../lib/curriculum";
import {
  liveAccessValidator,
  normalizeLiveAccess,
  type LiveAccess,
} from "./model/liveAccess";
import {
  catalogDetailValidator,
  catalogFilterOptionsValidator,
  catalogResultValidator,
  getCatalogCourse,
  getCatalogFilterOptions,
  listCatalogCourses,
} from "./model/catalog";
import { deriveClassType } from "./model/classType";

const classFields = {
  _id: v.id("classes"),
  _creationTime: v.number(),
  name: v.string(),
  description: v.optional(v.string()),
  curriculumId: v.id("curriculums"),
  teacherId: v.optional(v.id("users")),
  classType: v.optional(
    v.union(v.literal("standard"), v.literal("ignitia"), v.literal("abeka")),
  ),
  tutorId: v.optional(v.id("users")),
  students: v.array(v.id("users")),
  enrollmentsMigratedAt: v.optional(v.number()),
  academicPeriodId: v.optional(v.id("academicPeriods")),
  academicYear: v.optional(v.string()),
  gradeCode: v.optional(v.string()),
  startDate: v.optional(v.number()),
  endDate: v.optional(v.number()),
  timeZone: v.optional(v.string()),
  liveAccess: v.optional(liveAccessValidator),
  isActive: v.boolean(),
  createdAt: v.number(),
  createdBy: v.id("users"),
  schoolId: v.optional(v.id("schools")),
  campusId: v.optional(v.id("campuses")),
};
const classTableRowValidator = v.object({
  ...classFields,
  studentCount: v.number(),
});
const teacherOptionValidator = v.object({
  _id: v.id("users"),
  fullName: v.string(),
  email: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
});
async function getInstitutionStudents(
  ctx: QueryCtx | MutationCtx,
  schoolId: Id<"schools">,
  campusId?: Id<"campuses">,
) {
  const assignments = await listInstitutionStudentMemberships(ctx, schoolId);
  const selected = new Map<Id<"users">, (typeof assignments)[number]>();
  for (const assignment of assignments) {
    const current = selected.get(assignment.userId);
    const isCampusMatch =
      campusId !== undefined && assignment.orgId === campusId;
    if (!current || isCampusMatch) selected.set(assignment.userId, assignment);
  }

  return (
    await Promise.all(
      [...selected.values()].map(async (assignment) => {
        const user = await ctx.db.get(assignment.userId);
        if (!user || !user.isActive) return null;
        return {
          user,
          gradeCode: assignment.gradeCode ?? user.grade,
        };
      }),
    )
  ).filter((item): item is NonNullable<typeof item> => item !== null);
}

async function getClassAcademicYear(
  ctx: QueryCtx | MutationCtx,
  classData: Doc<"classes">,
) {
  if (!classData.academicPeriodId) return classData.academicYear;
  return (
    (await ctx.db.get(classData.academicPeriodId))?.name ??
    classData.academicYear
  );
}

async function validateCourseLiveAccess(
  ctx: QueryCtx | MutationCtx,
  schoolId: Id<"schools">,
  liveAccess: LiveAccess,
) {
  const normalized = normalizeLiveAccess(liveAccess);
  if (
    normalized.mode === "school" &&
    (normalized.allowedGradeCodes.length === 0 ||
      (await validateGradeCodes(ctx, schoolId, normalized.allowedGradeCodes))
        .length > 0)
  ) {
    throw new ConvexError("INVALID_LIVE_ACCESS");
  }
  return normalized;
}

type ClassListFilters = {
  isActive?: boolean;
  schoolId?: Id<"schools">;
  campusId?: Id<"campuses">;
};

async function listAccessibleClasses(
  ctx: QueryCtx,
  userId: Id<"users">,
  args: ClassListFilters,
) {
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const instructorOnly = hasOnlyInstructorStaffRoles(
    assignments.map((assignment) => assignment.role),
  );

  let validCampusIds: Set<string> | null = null;
  if (args.campusId) {
    validCampusIds = new Set([args.campusId]);
  } else if (args.schoolId) {
    const campuses = await ctx.db
      .query("campuses")
      .withIndex("by_school", (q) => q.eq("schoolId", args.schoolId!))
      .collect();
    validCampusIds = new Set(campuses.map((campus) => campus._id));
  }

  if (instructorOnly) {
    const [teachingClasses, tutoringClasses] = await Promise.all([
      ctx.db
        .query("classes")
        .withIndex("by_teacher", (q) =>
          q.eq("teacherId", userId).eq("isActive", args.isActive ?? true),
        )
        .collect(),
      ctx.db
        .query("classes")
        .withIndex("by_tutor", (q) =>
          q.eq("tutorId", userId).eq("isActive", args.isActive ?? true),
        )
        .collect(),
    ]);
    return [
      ...new Map(
        [...teachingClasses, ...tutoringClasses].map((classData) => [
          classData._id,
          classData,
        ]),
      ).values(),
    ].filter(
      (classData) =>
        !validCampusIds ||
        (classData.campusId && validCampusIds.has(classData.campusId)),
    );
  }

  let classes: Doc<"classes">[];
  if (validCampusIds) {
    classes = (
      await Promise.all(
        [...validCampusIds].map((campusId) =>
          ctx.db
            .query("classes")
            .withIndex("by_campus", (q) =>
              q
                .eq("campusId", campusId as Id<"campuses">)
                .eq("isActive", args.isActive ?? true),
            )
            .collect(),
        ),
      )
    ).flat();
  } else {
    classes = await ctx.db
      .query("classes")
      .withIndex("by_active", (q) => q.eq("isActive", args.isActive ?? true))
      .collect();
  }

  if (validCampusIds) {
    classes = classes.filter(
      (classData) =>
        classData.campusId && validCampusIds!.has(classData.campusId),
    );
  }
  const access = await Promise.all(
    classes.map((classData) => canAccessClass(ctx, userId, classData)),
  );
  return classes.filter((_, index) => access[index]);
}

async function getTeacherOptions(ctx: QueryCtx, classes: Doc<"classes">[]) {
  const teacherIds = [
    ...new Set(
      classes.flatMap((classData) =>
        classData.teacherId ? [classData.teacherId] : [],
      ),
    ),
  ];
  const teachers = (
    await Promise.all(teacherIds.map((teacherId) => ctx.db.get(teacherId)))
  ).filter((teacher): teacher is Doc<"users"> => Boolean(teacher?.isActive));

  return teachers
    .map((teacher) => ({
      _id: teacher._id,
      fullName: teacher.fullName,
      email: teacher.email,
      imageUrl: teacher.imageUrl,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

// ============================================================================
// QUERIES
// ============================================================================

export const listOverview = query({
  args: {
    schoolId: v.optional(v.id("schools")),
    campusId: v.optional(v.id("campuses")),
  },
  returns: v.object({
    classes: v.array(classTableRowValidator),
    teachers: v.array(teacherOptionValidator),
    uniqueStudentCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const classes = await listAccessibleClasses(ctx, user._id, {
      ...args,
      isActive: true,
    });
    const [studentIdsByClass, teachers] = await Promise.all([
      Promise.all(
        classes.map((classData) => listClassStudentIds(ctx, classData)),
      ),
      getTeacherOptions(ctx, classes),
    ]);
    const rows = classes.map((classData, index) => ({
      ...classData,
      students: [],
      studentCount: studentIdsByClass[index].length,
    }));
    const uniqueStudentCount = new Set(studentIdsByClass.flat()).size;

    return { classes: rows, teachers, uniqueStudentCount };
  },
});

export const listCatalog = query({
  args: {
    orgSlug: v.string(),
    now: v.number(),
    search: v.optional(v.string()),
    campusId: v.optional(v.id("campuses")),
    curriculumId: v.optional(v.id("curriculums")),
    teacherId: v.optional(v.id("users")),
    paginationOpts: paginationOptsValidator,
  },
  returns: catalogResultValidator,
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    return await listCatalogCourses(
      ctx,
      user,
      args.orgSlug,
      args.now,
      {
        search: args.search,
        campusId: args.campusId,
        curriculumId: args.curriculumId,
        teacherId: args.teacherId,
      },
      args.paginationOpts,
    );
  },
});

export const getCatalogFilters = query({
  args: {
    orgSlug: v.string(),
    campusId: v.optional(v.id("campuses")),
  },
  returns: catalogFilterOptionsValidator,
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    return await getCatalogFilterOptions(
      ctx,
      user,
      args.orgSlug,
      args.campusId,
    );
  },
});

export const getCatalog = query({
  args: {
    orgSlug: v.string(),
    classId: v.string(),
    now: v.number(),
  },
  returns: v.union(v.null(), catalogDetailValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUserFromAuth(ctx);
    if (!user) return null;
    return await getCatalogCourse(
      ctx,
      user,
      args.orgSlug,
      args.classId,
      args.now,
    );
  },
});

export const listFilterOptions = query({
  args: {
    schoolId: v.optional(v.id("schools")),
    campusId: v.optional(v.id("campuses")),
  },
  returns: v.object({
    courses: v.array(
      v.object({
        _id: v.id("classes"),
        name: v.string(),
        teacherId: v.optional(v.id("users")),
        gradeCode: v.optional(v.string()),
      }),
    ),
    teachers: v.array(teacherOptionValidator),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const classes = await listAccessibleClasses(ctx, user._id, {
      ...args,
      isActive: true,
    });
    return {
      courses: classes
        .map((classData) => ({
          _id: classData._id,
          name: classData.name,
          teacherId: classData.teacherId,
          gradeCode: classData.gradeCode,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      teachers: await getTeacherOptions(ctx, classes),
    };
  },
});

export const listWeeklyScheduleGuides = query({
  args: {
    campusId: v.id("campuses"),
    academicPeriodId: v.id("academicPeriods"),
    gradeCode: v.string(),
  },
  returns: v.array(
    v.object({
      scheduleId: v.id("classSchedule"),
      classId: v.id("classes"),
      className: v.string(),
      dayOfWeek: v.number(),
      startMinutes: v.number(),
      endMinutes: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const [campus, academicPeriod] = await Promise.all([
      ctx.db.get(args.campusId),
      ctx.db.get(args.academicPeriodId),
    ]);
    if (
      !campus ||
      !academicPeriod ||
      academicPeriod.schoolId !== campus.schoolId
    ) {
      throw new ConvexError("INVALID_SCHEDULE_GUIDE_FILTERS");
    }
    if (!(await canManageClasses(ctx, user._id, campus._id, campus.schoolId))) {
      throw new ConvexError("PERMISSION_DENIED");
    }

    const [school, classes] = await Promise.all([
      ctx.db.get(campus.schoolId),
      ctx.db
        .query("classes")
        .withIndex("by_campus_period_grade", (q) =>
          q
            .eq("campusId", campus._id)
            .eq("academicPeriodId", academicPeriod._id)
            .eq("gradeCode", args.gradeCode)
            .eq("isActive", true),
        )
        .collect(),
    ]);
    const rows = await Promise.all(
      classes.map(async (classData) => {
        const timeZone =
          classData.timeZone ?? campus.timeZone ?? school?.timeZone;
        if (!timeZone) return [];

        const schedules = await ctx.db
          .query("classSchedule")
          .withIndex("by_class_recurrence_parent", (q) =>
            q.eq("classId", classData._id).eq("recurrenceParentId", undefined),
          )
          .collect();

        return schedules.flatMap((schedule) => {
          if (
            schedule.status === "cancelled" ||
            !schedule.isRecurring ||
            schedule.recurrenceParentId
          ) {
            return [];
          }
          const localStart = utcToLocalDateTime(
            schedule.scheduledStart,
            timeZone,
          );
          const localEnd = utcToLocalDateTime(schedule.scheduledEnd, timeZone);
          if (localStart.slice(0, 10) !== localEnd.slice(0, 10)) return [];

          const startMinutes =
            Number(localStart.slice(11, 13)) * 60 +
            Number(localStart.slice(14, 16));
          const endMinutes =
            Number(localEnd.slice(11, 13)) * 60 +
            Number(localEnd.slice(14, 16));

          return [
            {
              scheduleId: schedule._id,
              classId: classData._id,
              className: classData.name,
              dayOfWeek: new Date(
                civilDayNumber(localStart.slice(0, 10)) * 86_400_000,
              ).getUTCDay(),
              startMinutes,
              endMinutes,
            },
          ];
        });
      }),
    );

    return rows
      .flat()
      .sort(
        (a, b) =>
          a.dayOfWeek - b.dayOfWeek ||
          a.startMinutes - b.startMinutes ||
          a.className.localeCompare(b.className),
      );
  },
});

/**
 * Get single class by ID
 */
export const get = query({
  args: { id: v.id("classes") },
  returns: v.union(
    v.object({
      ...classFields,
      timeZone: v.optional(v.string()),
      curriculumTitle: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const classData = await ctx.db.get(args.id);
    if (!classData) return null;
    if (!(await canAccessClass(ctx, user._id, classData))) {
      throw new ConvexError("PERMISSION_DENIED");
    }

    const curriculum = await ctx.db.get(classData.curriculumId);
    const timeZone = await getClassTimeZone(ctx, classData);

    return {
      ...classData,
      students: await listClassStudentIds(ctx, classData),
      academicYear: await getClassAcademicYear(ctx, classData),
      timeZone,
      curriculumTitle: curriculum?.title || "Unknown Curriculum",
    };
  },
});

/**
 * Get class with enriched data (teacher, curriculum, student details)
 */
export const getWithDetails = query({
  args: { id: v.id("classes") },
  returns: v.union(
    v.object({
      ...classFields,
      timeZone: v.optional(v.string()),
      teacher: v.union(
        v.null(),
        v.object({
          _id: v.id("users"),
          fullName: v.string(),
          email: v.optional(v.string()),
          avatarStorageId: v.optional(v.id("_storage")),
        }),
      ),
      tutor: v.union(
        v.null(),
        v.object({
          _id: v.id("users"),
          fullName: v.string(),
          email: v.optional(v.string()),
          avatarStorageId: v.optional(v.id("_storage")),
        }),
      ),
      curriculum: v.union(
        v.null(),
        v.object({
          _id: v.id("curriculums"),
          title: v.string(),
          code: v.optional(v.string()),
          color: v.optional(v.string()),
        }),
      ),
      studentDetails: v.array(
        v.object({
          _id: v.id("users"),
          fullName: v.string(),
          email: v.optional(v.string()),
          avatarStorageId: v.optional(v.id("_storage")),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const classData = await ctx.db.get(args.id);
    if (!classData) return null;
    if (!(await canAccessClass(ctx, user._id, classData))) {
      throw new ConvexError("PERMISSION_DENIED");
    }

    const teacher = classData.teacherId
      ? await ctx.db.get(classData.teacherId)
      : null;
    const curriculum = await ctx.db.get(classData.curriculumId);
    const timeZone = await getClassTimeZone(ctx, classData);

    // Handle optional tutor
    let tutor = null;
    if (classData.tutorId) {
      tutor = await ctx.db.get(classData.tutorId);
    }

    // Get student details
    const studentIds = await listClassStudentIds(ctx, classData);
    const students = await Promise.all(studentIds.map((id) => ctx.db.get(id)));

    return {
      ...classData,
      students: studentIds,
      academicYear: await getClassAcademicYear(ctx, classData),
      timeZone,
      teacher: teacher
        ? {
            _id: teacher._id,
            fullName: teacher.fullName,
            email: teacher.email,
            avatarStorageId: teacher.avatarStorageId,
          }
        : null,
      tutor: tutor
        ? {
            _id: tutor._id,
            fullName: tutor.fullName,
            email: tutor.email,
            avatarStorageId: tutor.avatarStorageId,
          }
        : null,
      curriculum: curriculum
        ? {
            _id: curriculum._id,
            title: curriculum.title,
            code: curriculum.code,
            color: curriculum.color,
          }
        : null,
      studentDetails: students
        .filter((s) => s !== null)
        .map((s) => ({
          _id: s!._id,
          fullName: s!.fullName,
          email: s!.email,
          avatarStorageId: s!.avatarStorageId,
        })),
    };
  },
});

/**
 * Get students in a class
 */
export const getStudents = query({
  args: { classId: v.id("classes") },
  returns: v.array(
    v.object({
      _id: v.id("users"),
      fullName: v.string(),
      email: v.optional(v.string()),
      avatarStorageId: v.optional(v.id("_storage")),
      isActive: v.boolean(),
      imageUrl: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const classData = await ctx.db.get(args.classId);
    if (!classData) return [];
    if (!(await canAccessClass(ctx, user._id, classData))) {
      throw new ConvexError("PERMISSION_DENIED");
    }

    const studentIds = await listClassStudentIds(ctx, classData);
    const students = await Promise.all(studentIds.map((id) => ctx.db.get(id)));

    return students
      .filter((s) => s !== null)
      .map((s) => ({
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
    classId: v.id("classes"),
  },
  returns: v.array(
    v.object({
      _id: v.id("users"),
      fullName: v.string(),
      email: v.optional(v.string()),
      username: v.optional(v.string()),
      avatarStorageId: v.optional(v.id("_storage")),
      imageUrl: v.optional(v.string()),
      grade: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const classData = await ctx.db.get(args.classId);
    if (!classData) throw new ConvexError("CLASS_NOT_FOUND");
    const curriculum = await ctx.db.get(classData.curriculumId);
    if (!curriculum?.schoolId) throw new ConvexError("INVALID_CURRICULUM");
    if (
      !(await canManageClasses(
        ctx,
        user._id,
        classData.campusId,
        curriculum.schoolId,
      ))
    ) {
      throw new ConvexError("PERMISSION_DENIED");
    }

    let results = await getInstitutionStudents(
      ctx,
      curriculum.schoolId,
      classData.campusId,
    );
    const gradeCodes = classData.gradeCode
      ? [classData.gradeCode]
      : curriculum.gradeCodes;
    if (gradeCodes?.length) {
      results = results.filter(
        (student) =>
          student.gradeCode && gradeCodes.includes(student.gradeCode),
      );
    }
    const enrolledIds = new Set(await listClassStudentIds(ctx, classData));
    results = results.filter((student) => !enrolledIds.has(student.user._id));

    if (args.searchQuery) {
      const q = args.searchQuery.toLowerCase().trim();
      if (q.length > 0) {
        results = results.filter(
          ({ user: student }) =>
            student.fullName.toLowerCase().includes(q) ||
            (student.email || "").toLowerCase().includes(q) ||
            (student.username || "").toLowerCase().includes(q),
        );
      }
    }

    return results.slice(0, 50).map(({ user: student, gradeCode }) => ({
      _id: student._id,
      fullName: student.fullName,
      email: student.email,
      username: student.username,
      avatarStorageId: student.avatarStorageId,
      imageUrl: student.imageUrl,
      grade: gradeCode,
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
  returns: v.union(
    v.object({ hasConflict: v.literal(false) }),
    v.object({
      hasConflict: v.literal(true),
      className: v.string(),
      curriculumTitle: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    // Get all active classes for this curriculum
    const curriculumClasses = await ctx.db
      .query("classes")
      .withIndex("by_curriculum", (q) =>
        q.eq("curriculumId", args.curriculumId).eq("isActive", true),
      )
      .collect();

    // Find if student is enrolled in any of these classes
    const enrollment = await Promise.all(
      curriculumClasses.map((classData) =>
        isStudentEnrolled(ctx, classData, args.studentId),
      ),
    );
    const conflict = curriculumClasses.find(
      (classData, index) =>
        enrollment[index] &&
        (!args.excludeClassId || classData._id !== args.excludeClassId),
    );

    if (conflict) {
      const curriculum = await ctx.db.get(args.curriculumId);
      return {
        hasConflict: true as const,
        className: conflict.name,
        curriculumTitle: curriculum?.title || "Unknown",
      };
    }

    return { hasConflict: false as const };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_WEEKLY_SLOTS = 14;
const MAX_OCCURRENCES_PER_SLOT = 60;

async function isTeacherInInstitution(
  ctx: MutationCtx,
  teacherId: Id<"users">,
  schoolId: Id<"schools">,
  campusId?: Id<"campuses">,
) {
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user", (q) => q.eq("userId", teacherId))
    .collect();
  const teacherAssignments = assignments.filter(
    (assignment) => assignment.role === "teacher",
  );

  if (campusId) {
    return teacherAssignments.some(
      (assignment) =>
        assignment.orgType === "campus" && assignment.orgId === campusId,
    );
  }

  if (
    teacherAssignments.some(
      (assignment) =>
        assignment.orgType === "school" && assignment.orgId === schoolId,
    )
  ) {
    return true;
  }

  const campusAssignments = teacherAssignments.filter(
    (assignment) => assignment.orgType === "campus" && assignment.orgId,
  );
  const campuses = await Promise.all(
    campusAssignments.map((assignment) =>
      ctx.db.get(assignment.orgId as Id<"campuses">),
    ),
  );
  return campuses.some((campus) => campus?.schoolId === schoolId);
}

/**
 * Create a course and its recurring classes in one transaction.
 */
export const createWithSchedule = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    curriculumId: v.id("curriculums"),
    campusId: v.id("campuses"),
    teacherId: v.id("users"),
    academicPeriodId: v.id("academicPeriods"),
    gradeCode: v.string(),
    liveAccess: liveAccessValidator,
    weeklySlots: v.array(
      v.object({
        dayOfWeek: v.number(),
        startMinutes: v.number(),
        durationMinutes: v.number(),
        sessionType: v.union(
          v.literal("live"),
          v.literal("ignitia"),
          v.literal("abeka"),
        ),
      }),
    ),
  },
  returns: v.object({
    classId: v.id("classes"),
    classesCreated: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const name = args.name.trim();

    if (!name) throw new ConvexError("COURSE_NAME_REQUIRED");
    if (
      args.weeklySlots.length === 0 ||
      args.weeklySlots.length > MAX_WEEKLY_SLOTS
    ) {
      throw new ConvexError("INVALID_WEEKLY_SCHEDULE");
    }

    const curriculum = await ctx.db.get(args.curriculumId);
    if (!curriculum) throw new ConvexError("CURRICULUM_NOT_FOUND");
    if (!curriculum.schoolId) throw new ConvexError("INVALID_CURRICULUM");

    const academicPeriod = await ctx.db.get(args.academicPeriodId);
    if (!academicPeriod || academicPeriod.schoolId !== curriculum.schoolId) {
      throw new ConvexError("INVALID_ACADEMIC_PERIOD");
    }
    const periodStartDate = toCivilDate(academicPeriod.startDate);
    const periodEndDate = toCivilDate(academicPeriod.endDate);
    if (
      (await validateGradeCodes(ctx, curriculum.schoolId, [args.gradeCode]))
        .length > 0 ||
      !isCurriculumAvailableForGrade(curriculum.gradeCodes, args.gradeCode)
    ) {
      throw new ConvexError("INVALID_GRADE");
    }
    const school = await ctx.db.get(curriculum.schoolId);
    if (!school) throw new ConvexError("INSTITUTION_NOT_FOUND");
    const liveAccess = await validateCourseLiveAccess(
      ctx,
      curriculum.schoolId,
      args.liveAccess,
    );
    const scheduleStartMinutes =
      school.scheduleStartMinutes ?? DEFAULT_SCHEDULE_START_MINUTES;
    const scheduleEndMinutes =
      school.scheduleEndMinutes ?? DEFAULT_SCHEDULE_END_MINUTES;

    const campus = await ctx.db.get(args.campusId);
    if (!campus || campus.schoolId !== curriculum.schoolId) {
      throw new ConvexError("INVALID_CAMPUS");
    }
    const timeZone = campus.timeZone ?? school.timeZone;
    if (!timeZone || !isValidTimeZone(timeZone)) {
      throw new ConvexError("TIME_ZONE_REQUIRED");
    }
    if (periodEndDate < todayInTimeZone(timeZone)) {
      throw new ConvexError("INVALID_ACADEMIC_PERIOD");
    }
    const startDate = localDateTimeToUtc(`${periodStartDate}T00:00`, timeZone);
    const endDate =
      localDateTimeToUtc(`${addCivilDays(periodEndDate, 1)}T00:00`, timeZone) -
      1;

    const isAuthorized = await canManageClasses(
      ctx,
      user._id,
      args.campusId,
      curriculum.schoolId,
    );
    if (!isAuthorized) throw new ConvexError("PERMISSION_DENIED");

    const teacher = await ctx.db.get(args.teacherId);
    if (
      !teacher ||
      !(await isTeacherInInstitution(
        ctx,
        args.teacherId,
        curriculum.schoolId,
        args.campusId,
      ))
    ) {
      throw new ConvexError("INVALID_TEACHER");
    }

    for (const slot of args.weeklySlots) {
      if (
        !Number.isInteger(slot.dayOfWeek) ||
        slot.dayOfWeek < 0 ||
        slot.dayOfWeek > 6 ||
        !Number.isInteger(slot.startMinutes) ||
        slot.startMinutes < 0 ||
        slot.startMinutes < scheduleStartMinutes ||
        !Number.isInteger(slot.durationMinutes) ||
        slot.durationMinutes < 15 ||
        slot.durationMinutes > 8 * 60 ||
        slot.startMinutes + slot.durationMinutes > scheduleEndMinutes
      ) {
        throw new ConvexError("INVALID_WEEKLY_SCHEDULE");
      }
    }

    const occurrencesBySlot = args.weeklySlots.map((slot) => {
      const starts = getWeeklyOccurrenceStarts({
        startDate: periodStartDate,
        endDate: periodEndDate,
        timeZone,
        dayOfWeek: slot.dayOfWeek,
        startMinutes: slot.startMinutes,
        limit: MAX_OCCURRENCES_PER_SLOT,
      });
      if (starts.length === 0) {
        throw new ConvexError("INVALID_WEEKLY_SCHEDULE");
      }
      return starts.map((start) => ({
        start,
        end: start + slot.durationMinutes * 60 * 1000,
        sessionType: slot.sessionType,
      }));
    });

    const plannedClasses = occurrencesBySlot
      .flat()
      .sort((a, b) => a.start - b.start);
    for (let index = 1; index < plannedClasses.length; index++) {
      if (plannedClasses[index].start < plannedClasses[index - 1].end) {
        throw new ConvexError("COURSE_CLASS_OVERLAP");
      }
    }

    const liveClasses = plannedClasses.filter(
      (plannedClass) => plannedClass.sessionType === "live",
    );
    if (liveClasses.length > 0) {
      const teacherClasses = await ctx.db
        .query("classes")
        .withIndex("by_teacher", (q) =>
          q.eq("teacherId", args.teacherId).eq("isActive", true),
        )
        .collect();
      const teacherSchedules = (
        await Promise.all(
          teacherClasses.map((classData) =>
            ctx.db
              .query("classSchedule")
              .withIndex("by_class", (q) =>
                q
                  .eq("classId", classData._id)
                  .gte("scheduledStart", startDate - DAY_MS)
                  .lte("scheduledStart", endDate),
              )
              .collect(),
          ),
        )
      )
        .flat()
        .filter((schedule) => schedule.status !== "cancelled");

      for (const plannedClass of liveClasses) {
        const conflict = teacherSchedules.find(
          (schedule) =>
            schedule.scheduledStart < plannedClass.end &&
            schedule.scheduledEnd > plannedClass.start,
        );
        if (conflict) {
          throw new ConvexError({
            code: "TEACHER_SCHEDULE_CONFLICT",
            className: name,
            conflictTime: conflict.scheduledStart.toString(),
          });
        }
      }
    }

    const now = Date.now();
    const classId = await ctx.db.insert("classes", {
      name,
      description: args.description,
      curriculumId: args.curriculumId,
      campusId: args.campusId,
      teacherId: args.teacherId,
      classType: deriveClassType(
        args.weeklySlots.map((slot) => slot.sessionType),
      ),
      enrollmentsMigratedAt: now,
      academicPeriodId: academicPeriod._id,
      academicYear: academicPeriod.name,
      gradeCode: args.gradeCode,
      startDate,
      endDate,
      timeZone,
      liveAccess,
      isActive: true,
      createdAt: now,
      createdBy: user._id,
      schoolId: curriculum.schoolId,
    });

    let classesCreated = 0;
    for (let slotIndex = 0; slotIndex < args.weeklySlots.length; slotIndex++) {
      const slot = args.weeklySlots[slotIndex];
      const occurrences = occurrencesBySlot[slotIndex];
      const parentRoomName = `class-${classId}-series-${now}-${slotIndex}`;
      const parentId = await ctx.db.insert("classSchedule", {
        classId,
        schoolId: curriculum.schoolId,
        lessonIds: [],
        sessionType: slot.sessionType,
        scheduledStart: occurrences[0].start,
        scheduledEnd: occurrences[0].end,
        roomName: parentRoomName,
        isLive: false,
        isRecurring: true,
        recurrenceRule: JSON.stringify({
          type: "weekly",
          daysOfWeek: [slot.dayOfWeek],
          endDate,
        }),
        status: "scheduled",
        createdAt: now,
        createdBy: user._id,
      });
      classesCreated++;

      for (let index = 1; index < occurrences.length; index++) {
        await ctx.db.insert("classSchedule", {
          classId,
          schoolId: curriculum.schoolId,
          lessonIds: [],
          sessionType: slot.sessionType,
          scheduledStart: occurrences[index].start,
          scheduledEnd: occurrences[index].end,
          roomName: `${parentRoomName}-${index}`,
          isLive: false,
          isRecurring: true,
          recurrenceParentId: parentId,
          status: "scheduled",
          createdAt: now,
          createdBy: user._id,
        });
        classesCreated++;
      }
    }

    return { classId, classesCreated };
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
    gradeCode: v.optional(v.string()),
    liveAccess: v.optional(liveAccessValidator),
    tutorId: v.optional(v.union(v.id("users"), v.null())),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const classData = await ctx.db.get(args.classId);
    if (!classData) throw new ConvexError("CLASS_NOT_FOUND");

    const curriculum = await ctx.db.get(classData.curriculumId);

    const isAuthorizedAdmin = await canManageClasses(
      ctx,
      user._id,
      classData.campusId,
      curriculum?.schoolId,
    );

    if (!isAuthorizedAdmin) {
      throw new ConvexError(
        "PERMISSION_DENIED: Only administrators or campus principals can modify this class.",
      );
    }

    const targetCurriculum = args.curriculumId
      ? await ctx.db.get(args.curriculumId)
      : curriculum;
    if (!targetCurriculum?.schoolId) {
      throw new ConvexError("INVALID_CURRICULUM");
    }
    if (
      curriculum?.schoolId &&
      targetCurriculum.schoolId !== curriculum.schoolId
    ) {
      throw new ConvexError("INVALID_CURRICULUM");
    }
    const effectiveGradeCode = args.gradeCode ?? classData.gradeCode;
    if (
      effectiveGradeCode &&
      ((
        await validateGradeCodes(ctx, targetCurriculum.schoolId, [
          effectiveGradeCode,
        ])
      ).length > 0 ||
        !isCurriculumAvailableForGrade(
          targetCurriculum.gradeCodes,
          effectiveGradeCode,
        ))
    ) {
      throw new ConvexError("INVALID_GRADE");
    }
    const liveAccess =
      args.liveAccess === undefined
        ? undefined
        : await validateCourseLiveAccess(
            ctx,
            targetCurriculum.schoolId,
            args.liveAccess,
          );

    // Validate new teacher if changing
    if (args.teacherId) {
      const teacher = await ctx.db.get(args.teacherId);
      if (!teacher) throw new Error("Invalid teacher");
      const isTeacher = await isTeacherInInstitution(
        ctx,
        args.teacherId,
        targetCurriculum.schoolId,
        classData.campusId,
      );
      if (!isTeacher) throw new Error("Invalid teacher");
    }

    const { classId, tutorId, ...updates } = args;

    // Convert null to undefined for optional fields
    const cleanUpdates: Partial<Doc<"classes">> = {
      ...updates,
      ...(liveAccess !== undefined && { liveAccess }),
    };
    if (tutorId !== undefined) {
      cleanUpdates.tutorId = tutorId ?? undefined;
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
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const classData = await ctx.db.get(args.classId);
    if (!classData) throw new ConvexError("CLASS_NOT_FOUND");

    const curriculum = await ctx.db.get(classData.curriculumId);

    const isAuthorizedAdmin = await canManageClasses(
      ctx,
      user._id,
      classData.campusId,
      curriculum?.schoolId,
    );

    if (!isAuthorizedAdmin) {
      throw new ConvexError(
        "PERMISSION_DENIED: Only administrators can add students to this class.",
      );
    }

    // Verify student exists
    const student = await ctx.db.get(args.studentId);
    if (!student) throw new ConvexError("INVALID_STUDENT");
    if (!curriculum?.schoolId) throw new ConvexError("INVALID_CURRICULUM");
    const membership = await getStudentMembership(
      ctx,
      student._id,
      curriculum.schoolId,
      classData.campusId,
    );
    const studentGrade = await getStudentGradeCode(
      ctx,
      student._id,
      curriculum.schoolId,
      classData.campusId,
    );
    const allowedGrades = classData.gradeCode
      ? [classData.gradeCode]
      : curriculum.gradeCodes;
    if (
      !membership ||
      (allowedGrades?.length &&
        (!studentGrade || !allowedGrades.includes(studentGrade)))
    ) {
      throw new ConvexError("INVALID_STUDENT");
    }

    // Check if already enrolled
    await ensureClassEnrollmentsMigrated(ctx, classData, user._id);
    const existingEnrollment = await ctx.db
      .query("classEnrollments")
      .withIndex("by_class", (q) =>
        q.eq("classId", args.classId).eq("studentId", args.studentId),
      )
      .unique();
    if (existingEnrollment) {
      throw new ConvexError("STUDENT_ALREADY_ENROLLED");
    }

    // Check for curriculum conflict
    const conflictCheck = await ctx.runQuery(
      internal.classes.checkStudentCurriculumEnrollment,
      {
        studentId: args.studentId,
        curriculumId: classData.curriculumId,
        excludeClassId: args.classId,
      },
    );

    if (conflictCheck.hasConflict) {
      throw new ConvexError({
        code: "CURRICULUM_CONFLICT",
        className: conflictCheck.className,
        curriculumTitle: conflictCheck.curriculumTitle,
      });
    }

    await ctx.db.insert("classEnrollments", {
      classId: args.classId,
      studentId: args.studentId,
      enrolledAt: Date.now(),
      enrolledBy: user._id,
    });
    return null;
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
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const classData = await ctx.db.get(args.classId);
    if (!classData) throw new ConvexError("CLASS_NOT_FOUND");

    const curriculum = await ctx.db.get(classData.curriculumId);

    const isAuthorizedAdmin = await canManageClasses(
      ctx,
      user._id,
      classData.campusId,
      curriculum?.schoolId,
    );

    if (!isAuthorizedAdmin) {
      throw new ConvexError(
        "PERMISSION_DENIED: Only administrators can remove students from this class.",
      );
    }

    await ensureClassEnrollmentsMigrated(ctx, classData, user._id);
    const enrollment = await ctx.db
      .query("classEnrollments")
      .withIndex("by_class", (q) =>
        q.eq("classId", args.classId).eq("studentId", args.studentId),
      )
      .unique();
    if (enrollment) await ctx.db.delete(enrollment._id);
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
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);

    const classData = await ctx.db.get(args.classId);
    if (!classData) throw new ConvexError("CLASS_NOT_FOUND");

    const curriculum = await ctx.db.get(classData.curriculumId);

    const isAuthorizedAdmin = await canManageClasses(
      ctx,
      user._id,
      classData.campusId,
      curriculum?.schoolId,
    );
    if (!isAuthorizedAdmin) {
      throw new ConvexError(
        "PERMISSION_DENIED: Only administrators can add students to this class.",
      );
    }

    const students = await Promise.all(
      args.studentIds.map((id) => ctx.db.get(id)),
    );
    if (students.some((s) => !s)) throw new ConvexError("INVALID_STUDENTS");
    if (!curriculum?.schoolId) throw new ConvexError("INVALID_CURRICULUM");
    const memberships = await Promise.all(
      args.studentIds.map((studentId) =>
        getStudentMembership(
          ctx,
          studentId,
          curriculum.schoolId!,
          classData.campusId,
        ),
      ),
    );
    const studentGrades = await Promise.all(
      args.studentIds.map((studentId) =>
        getStudentGradeCode(
          ctx,
          studentId,
          curriculum.schoolId!,
          classData.campusId,
        ),
      ),
    );
    const allowedGrades = classData.gradeCode
      ? [classData.gradeCode]
      : curriculum.gradeCodes;
    if (
      students.some(
        (student, index) =>
          !student ||
          !memberships[index] ||
          (allowedGrades?.length &&
            (!studentGrades[index] ||
              !allowedGrades.includes(studentGrades[index]!))),
      )
    ) {
      throw new ConvexError("INVALID_STUDENTS");
    }

    await ensureClassEnrollmentsMigrated(ctx, classData, user._id);
    const existingEnrollments = await ctx.db
      .query("classEnrollments")
      .withIndex("by_class", (q) => q.eq("classId", args.classId))
      .collect();
    const enrolledIds = new Set(
      existingEnrollments.map((enrollment) => enrollment.studentId),
    );
    const newStudents = [...new Set(args.studentIds)].filter(
      (id) => !enrolledIds.has(id),
    );

    // Check for curriculum conflicts for each new student
    for (const studentId of newStudents) {
      const conflictCheck = await ctx.runQuery(
        internal.classes.checkStudentCurriculumEnrollment,
        {
          studentId,
          curriculumId: classData.curriculumId,
          excludeClassId: args.classId,
        },
      );

      if (conflictCheck.hasConflict) {
        throw new ConvexError({
          code: "CURRICULUM_CONFLICT",
          className: conflictCheck.className,
          curriculumTitle: conflictCheck.curriculumTitle,
        });
      }
    }

    const now = Date.now();
    await Promise.all(
      newStudents.map((studentId) =>
        ctx.db.insert("classEnrollments", {
          classId: args.classId,
          studentId,
          enrolledAt: now,
          enrolledBy: user._id,
        }),
      ),
    );
    return null;
  },
});

/**
 * Delete class
 */
export const remove = mutation({
  args: { id: v.id("classes") },
  returns: v.object({ deleted: v.literal(true) }),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const classData = await ctx.db.get(args.id);
    if (!classData) return { deleted: true } as const;
    const curriculum = await ctx.db.get(classData.curriculumId);

    if (
      !(await canManageClasses(
        ctx,
        user._id,
        classData.campusId,
        curriculum?.schoolId,
      ))
    ) {
      throw new ConvexError("PERMISSION_DENIED");
    }

    const [schedules, enrollments, preferences] = await Promise.all([
      ctx.db
        .query("classSchedule")
        .withIndex("by_class", (q) => q.eq("classId", args.id))
        .collect(),
      ctx.db
        .query("classEnrollments")
        .withIndex("by_class", (q) => q.eq("classId", args.id))
        .collect(),
      ctx.db
        .query("studentClassPreferences")
        .withIndex("by_class", (q) => q.eq("classId", args.id))
        .collect(),
    ]);
    await deleteSchedulesWithDependencies(ctx, schedules);
    await Promise.all(
      [
        ...enrollments.map((enrollment) => enrollment._id),
        ...preferences.map((preference) => preference._id),
      ].map((id) => ctx.db.delete(id)),
    );

    await ctx.db.delete(args.id);
    return { deleted: true } as const;
  },
});

/**
 * Get classes I can schedule for (with curriculum details for lesson selection)
 */
export const getSchedulableClasses = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("classes"),
      name: v.string(),
      curriculumId: v.id("curriculums"),
      curriculumTitle: v.string(),
      curriculumColor: v.optional(v.string()),
      teacherId: v.optional(v.id("users")),
      timeZone: v.optional(v.string()),
      lessons: v.array(
        v.object({
          _id: v.id("lessons"),
          title: v.string(),
          order: v.number(),
        }),
      ),
    }),
  ),
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
      const assignments = await ctx.db
        .query("roleAssignments")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
      const managedSchoolIds = assignments
        .flatMap((assignment) =>
          assignment.role === "admin" &&
          assignment.orgType === "school" &&
          assignment.orgId
            ? [ctx.db.normalizeId("schools", assignment.orgId)]
            : [],
        )
        .filter((id): id is Id<"schools"> => id !== null);
      const principalCampusIds = assignments
        .flatMap((assignment) =>
          assignment.role === "principal" &&
          assignment.orgType === "campus" &&
          assignment.orgId
            ? [ctx.db.normalizeId("campuses", assignment.orgId)]
            : [],
        )
        .filter((id): id is Id<"campuses"> => id !== null);
      const schoolCampuses = (
        await Promise.all(
          managedSchoolIds.map((schoolId) =>
            ctx.db
              .query("campuses")
              .withIndex("by_school", (q) => q.eq("schoolId", schoolId))
              .collect(),
          ),
        )
      ).flat();
      const campusIds = new Set([
        ...principalCampusIds,
        ...schoolCampuses.map((campus) => campus._id),
      ]);
      classes = (
        await Promise.all(
          [...campusIds].map((campusId) =>
            ctx.db
              .query("classes")
              .withIndex("by_campus", (q) =>
                q.eq("campusId", campusId).eq("isActive", true),
              )
              .collect(),
          ),
        )
      ).flat();
    }

    // Hydrate with curriculum and lessons
    const enriched = await Promise.all(
      classes.map(async (cls) => {
        const curriculum = await ctx.db.get(cls.curriculumId);
        const timeZone = await getClassTimeZone(ctx, cls);
        const lessons = await ctx.db
          .query("lessons")
          .withIndex("by_curriculum_active", (q) =>
            q.eq("curriculumId", cls.curriculumId).eq("isActive", true),
          )
          .collect();

        return {
          _id: cls._id,
          name: cls.name,
          curriculumId: cls.curriculumId,
          curriculumTitle: curriculum?.title || "Unknown",
          curriculumColor: curriculum?.color,
          teacherId: cls.teacherId,
          timeZone,
          lessons: lessons
            .sort((a, b) => a.order - b.order)
            .map((l) => ({
              _id: l._id,
              title: l.title,
              order: l.order,
            })),
        };
      }),
    );

    return enriched;
  },
});
