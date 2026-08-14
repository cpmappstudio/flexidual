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
  catalogFilterOptionsValidator,
  catalogResultValidator,
  getCatalogFilterOptions,
  listCatalogCourses,
} from "./model/catalog";
import { deriveClassType } from "./model/classType";
import { curriculumIconValidator } from "./model/curriculumIcons";
import { DEFAULT_CURRICULUM_ICON } from "../lib/curriculum-icons";
import {
  areWeeklySchedulesEqual,
  courseWeeklySlotValidator,
  inferWeeklySchedule,
  isValidWeeklySchedule,
  planWeeklyCourseOccurrences,
  type CourseWeeklySlotConfig,
  type PlannedCourseOccurrence,
} from "./model/courseSchedule";

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
  weeklySlots: v.optional(v.array(courseWeeklySlotValidator)),
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
    excludeClassId: v.optional(v.id("classes")),
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
      classes
        .filter((classData) => classData._id !== args.excludeClassId)
        .map(async (classData) => {
          const timeZone =
            classData.timeZone ?? campus.timeZone ?? school?.timeZone;
          if (!timeZone) return [];

          const schedules = await ctx.db
            .query("classSchedule")
            .withIndex("by_class_recurrence_parent", (q) =>
              q
                .eq("classId", classData._id)
                .eq("recurrenceParentId", undefined),
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
            const localEnd = utcToLocalDateTime(
              schedule.scheduledEnd,
              timeZone,
            );
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
      curriculumIconKey: curriculumIconValidator,
      teacherName: v.optional(v.string()),
      gradeName: v.optional(v.string()),
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
    const schoolId = classData.schoolId ?? curriculum?.schoolId;
    const gradeCode = classData.gradeCode;
    const [timeZone, teacher, grade] = await Promise.all([
      getClassTimeZone(ctx, classData),
      classData.teacherId ? ctx.db.get(classData.teacherId) : null,
      gradeCode && schoolId
        ? ctx.db
            .query("institutionGrades")
            .withIndex("by_school_and_code", (q) =>
              q.eq("schoolId", schoolId).eq("code", gradeCode),
            )
            .unique()
        : null,
    ]);

    return {
      ...classData,
      students: await listClassStudentIds(ctx, classData),
      academicYear: await getClassAcademicYear(ctx, classData),
      timeZone,
      weeklySlots: await getCourseWeeklySlots(ctx, classData, timeZone),
      curriculumTitle: curriculum?.title || "Unknown Curriculum",
      curriculumIconKey: curriculum?.iconKey ?? DEFAULT_CURRICULUM_ICON,
      teacherName: teacher?.fullName,
      gradeName: grade?.name,
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

async function getCourseWeeklySlots(
  ctx: QueryCtx | MutationCtx,
  classData: Doc<"classes">,
  timeZone?: string,
) {
  if (classData.weeklySlots) return classData.weeklySlots;
  if (!timeZone) return [];

  const scheduleParents = await ctx.db
    .query("classSchedule")
    .withIndex("by_class_recurrence_parent", (q) =>
      q.eq("classId", classData._id).eq("recurrenceParentId", undefined),
    )
    .take(100);
  return inferWeeklySchedule(scheduleParents, timeZone);
}

async function validateExistingScheduleForTeacher(
  ctx: MutationCtx,
  classData: Doc<"classes">,
  teacherId: Id<"users">,
  className: string,
) {
  const now = Date.now();
  const schedules = await ctx.db
    .query("classSchedule")
    .withIndex("by_class", (q) =>
      q.eq("classId", classData._id).gte("scheduledStart", now),
    )
    .collect();
  const plannedClasses: PlannedCourseOccurrence[] = schedules
    .filter(
      (schedule) =>
        schedule.status !== "cancelled" &&
        schedule.sessionType !== "ignitia" &&
        schedule.sessionType !== "abeka",
    )
    .map((schedule, index) => ({
      slotIndex: index,
      occurrenceIndex: 0,
      dayOfWeek: 0,
      start: schedule.scheduledStart,
      end: schedule.scheduledEnd,
      sessionType: "live" as const,
    }));

  await validateTeacherScheduleConflicts(ctx, {
    teacherId,
    plannedClasses,
    className,
    excludeClassId: classData._id,
  });
}

function assertNoCourseScheduleOverlap(
  plannedClasses: PlannedCourseOccurrence[],
  preservedSchedules: Doc<"classSchedule">[] = [],
) {
  const sorted = [...plannedClasses].sort((a, b) => a.start - b.start);
  for (let index = 1; index < sorted.length; index++) {
    if (sorted[index].start < sorted[index - 1].end) {
      throw new ConvexError("COURSE_CLASS_OVERLAP");
    }
  }

  if (
    sorted.some((planned) =>
      preservedSchedules.some(
        (schedule) =>
          schedule.status !== "cancelled" &&
          schedule.scheduledStart < planned.end &&
          schedule.scheduledEnd > planned.start,
      ),
    )
  ) {
    throw new ConvexError("COURSE_CLASS_OVERLAP");
  }
}

async function validateTeacherScheduleConflicts(
  ctx: MutationCtx,
  {
    teacherId,
    plannedClasses,
    className,
    excludeClassId,
  }: {
    teacherId: Id<"users">;
    plannedClasses: PlannedCourseOccurrence[];
    className: string;
    excludeClassId?: Id<"classes">;
  },
) {
  const liveClasses = plannedClasses.filter(
    (plannedClass) => plannedClass.sessionType === "live",
  );
  if (liveClasses.length === 0) return;

  const teacherClasses = (
    await ctx.db
      .query("classes")
      .withIndex("by_teacher", (q) =>
        q.eq("teacherId", teacherId).eq("isActive", true),
      )
      .collect()
  ).filter((classData) => classData._id !== excludeClassId);
  if (teacherClasses.length === 0) return;

  const rangeStart = liveClasses[0].start;
  const rangeEnd = liveClasses[liveClasses.length - 1].end;
  const teacherSchedules = (
    await Promise.all(
      teacherClasses.map((classData) =>
        ctx.db
          .query("classSchedule")
          .withIndex("by_class", (q) =>
            q
              .eq("classId", classData._id)
              .gte("scheduledStart", rangeStart - DAY_MS)
              .lte("scheduledStart", rangeEnd),
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
        className,
        conflictTime: conflict.scheduledStart.toString(),
      });
    }
  }
}

type FutureScheduleMetadata = Pick<
  Doc<"classSchedule">,
  "lessonIds" | "title" | "description"
>;

async function insertCourseSchedule(
  ctx: MutationCtx,
  {
    classId,
    schoolId,
    createdBy,
    createdAt,
    periodEnd,
    occurrencesBySlot,
    metadataByOccurrence = new Map(),
  }: {
    classId: Id<"classes">;
    schoolId: Id<"schools">;
    createdBy: Id<"users">;
    createdAt: number;
    periodEnd: number;
    occurrencesBySlot: PlannedCourseOccurrence[][];
    metadataByOccurrence?: Map<string, FutureScheduleMetadata>;
  },
) {
  let created = 0;
  for (let slotIndex = 0; slotIndex < occurrencesBySlot.length; slotIndex++) {
    const occurrences = occurrencesBySlot[slotIndex];
    if (occurrences.length === 0) continue;

    const parentRoomName = `class-${classId}-series-${createdAt}-${slotIndex}`;
    const first = occurrences[0];
    const firstMetadata = metadataByOccurrence.get(
      `${first.slotIndex}:${first.occurrenceIndex}`,
    );
    const parentId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      lessonIds: firstMetadata?.lessonIds ?? [],
      title: firstMetadata?.title,
      description: firstMetadata?.description,
      sessionType: first.sessionType,
      scheduledStart: first.start,
      scheduledEnd: first.end,
      roomName: parentRoomName,
      isLive: false,
      isRecurring: true,
      recurrenceRule: JSON.stringify({
        type: "weekly",
        daysOfWeek: [first.dayOfWeek],
        endDate: periodEnd,
      }),
      status: "scheduled",
      createdAt,
      createdBy,
    });
    created++;

    for (let index = 1; index < occurrences.length; index++) {
      const occurrence = occurrences[index];
      const metadata = metadataByOccurrence.get(
        `${occurrence.slotIndex}:${occurrence.occurrenceIndex}`,
      );
      await ctx.db.insert("classSchedule", {
        classId,
        schoolId,
        lessonIds: metadata?.lessonIds ?? [],
        title: metadata?.title,
        description: metadata?.description,
        sessionType: occurrence.sessionType,
        scheduledStart: occurrence.start,
        scheduledEnd: occurrence.end,
        roomName: `${parentRoomName}-${index}`,
        isLive: false,
        isRecurring: true,
        recurrenceParentId: parentId,
        status: "scheduled",
        createdAt,
        createdBy,
      });
      created++;
    }
  }
  return created;
}

async function replaceFutureCourseSchedule(
  ctx: MutationCtx,
  {
    classData,
    curriculum,
    teacherId,
    className,
    weeklySlots,
    updatedBy,
  }: {
    classData: Doc<"classes">;
    curriculum: Doc<"curriculums">;
    teacherId?: Id<"users">;
    className: string;
    weeklySlots: CourseWeeklySlotConfig[];
    updatedBy: Id<"users">;
  },
) {
  if (
    !curriculum.schoolId ||
    !classData.academicPeriodId ||
    !classData.campusId
  ) {
    throw new ConvexError("INVALID_ACADEMIC_PERIOD");
  }

  const [academicPeriod, school, campus, schedules] = await Promise.all([
    ctx.db.get(classData.academicPeriodId),
    ctx.db.get(curriculum.schoolId),
    ctx.db.get(classData.campusId),
    ctx.db
      .query("classSchedule")
      .withIndex("by_class", (q) => q.eq("classId", classData._id))
      .collect(),
  ]);
  if (!academicPeriod || academicPeriod.schoolId !== curriculum.schoolId) {
    throw new ConvexError("INVALID_ACADEMIC_PERIOD");
  }
  if (!school) throw new ConvexError("INSTITUTION_NOT_FOUND");
  if (!campus || campus.schoolId !== curriculum.schoolId) {
    throw new ConvexError("INVALID_CAMPUS");
  }

  const timeZone = classData.timeZone ?? campus.timeZone ?? school.timeZone;
  if (!timeZone || !isValidTimeZone(timeZone)) {
    throw new ConvexError("TIME_ZONE_REQUIRED");
  }
  if (
    !isValidWeeklySchedule(
      weeklySlots,
      school.scheduleStartMinutes ?? DEFAULT_SCHEDULE_START_MINUTES,
      school.scheduleEndMinutes ?? DEFAULT_SCHEDULE_END_MINUTES,
    )
  ) {
    throw new ConvexError("INVALID_WEEKLY_SCHEDULE");
  }

  const now = Date.now();
  const periodEndDate = toCivilDate(academicPeriod.endDate);
  const periodEnd =
    localDateTimeToUtc(`${addCivilDays(periodEndDate, 1)}T00:00`, timeZone) - 1;
  const occurrencesBySlot = planWeeklyCourseOccurrences({
    slots: weeklySlots,
    periodStartDate: toCivilDate(academicPeriod.startDate),
    periodEndDate,
    timeZone,
    from: now,
  });
  const plannedClasses = occurrencesBySlot
    .flat()
    .sort((a, b) => a.start - b.start);
  const schedulesToReplace = schedules.filter(
    (schedule) =>
      schedule.scheduledStart >= now &&
      (schedule.isRecurring === true ||
        schedule.recurrenceParentId !== undefined) &&
      schedule.status !== "active" &&
      schedule.status !== "completed" &&
      schedule.isLive !== true,
  );
  const replacedIds = new Set(
    schedulesToReplace.map((schedule) => schedule._id),
  );
  assertNoCourseScheduleOverlap(
    plannedClasses,
    schedules.filter((schedule) => !replacedIds.has(schedule._id)),
  );
  if (teacherId) {
    await validateTeacherScheduleConflicts(ctx, {
      teacherId,
      plannedClasses,
      className,
      excludeClassId: classData._id,
    });
  }

  const metadataByOccurrence = mapFutureScheduleMetadata(
    plannedClasses,
    schedulesToReplace,
    curriculum._id === classData.curriculumId,
  );
  await deleteSchedulesWithDependencies(ctx, schedulesToReplace);
  await insertCourseSchedule(ctx, {
    classId: classData._id,
    schoolId: curriculum.schoolId,
    createdBy: updatedBy,
    createdAt: now,
    periodEnd,
    occurrencesBySlot,
    metadataByOccurrence,
  });
}

function mapFutureScheduleMetadata(
  plannedClasses: PlannedCourseOccurrence[],
  schedulesToReplace: Doc<"classSchedule">[],
  shouldPreserve: boolean,
) {
  const metadataByOccurrence = new Map<string, FutureScheduleMetadata>();
  if (!shouldPreserve) return metadataByOccurrence;

  const existingMetadata = schedulesToReplace
    .filter((schedule) => schedule.status !== "cancelled")
    .sort((a, b) => a.scheduledStart - b.scheduledStart);
  plannedClasses.forEach((occurrence, index) => {
    const metadata = existingMetadata[index];
    if (!metadata) return;
    metadataByOccurrence.set(
      `${occurrence.slotIndex}:${occurrence.occurrenceIndex}`,
      {
        lessonIds: metadata.lessonIds,
        title: metadata.title,
        description: metadata.description,
      },
    );
  });
  return metadataByOccurrence;
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
    weeklySlots: v.array(courseWeeklySlotValidator),
  },
  returns: v.object({
    classId: v.id("classes"),
    classesCreated: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const name = args.name.trim();

    if (!name) throw new ConvexError("COURSE_NAME_REQUIRED");
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

    if (
      !isValidWeeklySchedule(
        args.weeklySlots,
        scheduleStartMinutes,
        scheduleEndMinutes,
      )
    ) {
      throw new ConvexError("INVALID_WEEKLY_SCHEDULE");
    }

    const occurrencesBySlot = planWeeklyCourseOccurrences({
      slots: args.weeklySlots,
      periodStartDate,
      periodEndDate,
      timeZone,
    });
    if (occurrencesBySlot.some((occurrences) => occurrences.length === 0)) {
      throw new ConvexError("INVALID_WEEKLY_SCHEDULE");
    }

    const plannedClasses = occurrencesBySlot
      .flat()
      .sort((a, b) => a.start - b.start);
    assertNoCourseScheduleOverlap(plannedClasses);
    await validateTeacherScheduleConflicts(ctx, {
      teacherId: args.teacherId,
      plannedClasses,
      className: name,
    });

    const now = Date.now();
    const classId = await ctx.db.insert("classes", {
      name,
      description: args.description?.trim() || undefined,
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
      weeklySlots: args.weeklySlots,
      isActive: true,
      createdAt: now,
      createdBy: user._id,
      schoolId: curriculum.schoolId,
    });

    const classesCreated = await insertCourseSchedule(ctx, {
      classId,
      schoolId: curriculum.schoolId,
      createdBy: user._id,
      createdAt: now,
      periodEnd: endDate,
      occurrencesBySlot,
    });

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
    description: v.optional(v.union(v.string(), v.null())),
    teacherId: v.optional(v.id("users")),
    curriculumId: v.optional(v.id("curriculums")),
    gradeCode: v.optional(v.string()),
    liveAccess: v.optional(liveAccessValidator),
    weeklySlots: v.optional(v.array(courseWeeklySlotValidator)),
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

    if (args.teacherId) {
      const teacher = await ctx.db.get(args.teacherId);
      if (!teacher) throw new ConvexError("INVALID_TEACHER");
      const isTeacher = await isTeacherInInstitution(
        ctx,
        args.teacherId,
        targetCurriculum.schoolId,
        classData.campusId,
      );
      if (!isTeacher) throw new ConvexError("INVALID_TEACHER");
    }

    const name = args.name?.trim();
    if (args.name !== undefined && !name) {
      throw new ConvexError("COURSE_NAME_REQUIRED");
    }

    const curriculumChanged = targetCurriculum._id !== classData.curriculumId;
    const currentWeeklySlots =
      args.weeklySlots === undefined && !curriculumChanged
        ? undefined
        : await getCourseWeeklySlots(
            ctx,
            classData,
            await getClassTimeZone(ctx, classData),
          );
    const effectiveWeeklySlots = args.weeklySlots ?? currentWeeklySlots ?? [];
    const scheduleChanged =
      args.weeklySlots !== undefined &&
      !areWeeklySchedulesEqual(currentWeeklySlots ?? [], args.weeklySlots);
    const shouldPersistWeeklySlots =
      args.weeklySlots !== undefined &&
      (scheduleChanged || classData.weeklySlots === undefined);

    if (
      (scheduleChanged || curriculumChanged) &&
      effectiveWeeklySlots.length > 0
    ) {
      await replaceFutureCourseSchedule(ctx, {
        classData,
        curriculum: targetCurriculum,
        teacherId: args.teacherId ?? classData.teacherId,
        className: name ?? classData.name,
        weeklySlots: effectiveWeeklySlots,
        updatedBy: user._id,
      });
    } else if (
      args.teacherId !== undefined &&
      args.teacherId !== classData.teacherId
    ) {
      await validateExistingScheduleForTeacher(
        ctx,
        classData,
        args.teacherId,
        name ?? classData.name,
      );
    }

    const cleanUpdates: Partial<Doc<"classes">> = {};
    if (args.name !== undefined) cleanUpdates.name = name!;
    if (args.description !== undefined) {
      cleanUpdates.description = args.description?.trim() || undefined;
    }
    if (args.teacherId !== undefined) cleanUpdates.teacherId = args.teacherId;
    if (args.curriculumId !== undefined) {
      cleanUpdates.curriculumId = args.curriculumId;
    }
    if (args.gradeCode !== undefined) cleanUpdates.gradeCode = args.gradeCode;
    if (liveAccess !== undefined) cleanUpdates.liveAccess = liveAccess;
    if (shouldPersistWeeklySlots && args.weeklySlots) {
      cleanUpdates.weeklySlots = args.weeklySlots;
      cleanUpdates.classType = deriveClassType(
        args.weeklySlots.map((slot) => slot.sessionType),
      );
    }

    await ctx.db.patch(args.classId, cleanUpdates);
    return null;
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
