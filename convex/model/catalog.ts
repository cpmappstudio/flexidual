import {
  paginationResultValidator,
  type PaginationOptions,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { DEFAULT_CURRICULUM_ICON } from "../../lib/curriculum-icons";
import { classHasLiveSessions } from "./classType";
import { curriculumIconValidator } from "./curriculumIcons";
import { canStudentAccessLiveClass, normalizeLiveAccess } from "./liveAccess";
import { resolveMembershipSchoolId } from "./membership";
import {
  ASSIGNABLE_COURSE_INSTRUCTOR_ROLES,
  canAssignmentsManageClass,
  isStaffRole,
} from "./roles";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const LEGACY_COURSE_LIMIT = 50;
const FILTER_OPTION_LIMIT = 250;

const catalogSessionValidator = v.object({
  title: v.string(),
  start: v.number(),
  timeZone: v.string(),
  roomName: v.string(),
  canOpen: v.boolean(),
});

export const catalogCourseValidator = v.object({
  _id: v.id("classes"),
  name: v.string(),
  description: v.optional(v.string()),
  curriculumId: v.id("curriculums"),
  curriculumTitle: v.string(),
  curriculumColor: v.string(),
  curriculumIconKey: curriculumIconValidator,
  campusName: v.optional(v.string()),
  institutionName: v.optional(v.string()),
  teacherId: v.optional(v.id("users")),
  teacherName: v.optional(v.string()),
  teacherImageUrl: v.optional(v.string()),
  gradeCode: v.optional(v.string()),
  gradeName: v.optional(v.string()),
  accessMode: v.union(v.literal("private"), v.literal("school")),
  liveSession: v.optional(catalogSessionValidator),
  nextSession: v.optional(catalogSessionValidator),
});

export const catalogResultValidator = paginationResultValidator(
  catalogCourseValidator,
);

export const catalogFilterOptionsValidator = v.object({
  campuses: v.array(
    v.object({
      value: v.id("campuses"),
      label: v.string(),
    }),
  ),
  curriculums: v.array(
    v.object({
      value: v.id("curriculums"),
      label: v.string(),
    }),
  ),
  teachers: v.array(
    v.object({
      value: v.id("users"),
      label: v.string(),
    }),
  ),
});

type ScopedAssignment = {
  assignment: Doc<"roleAssignments">;
  schoolId?: Id<"schools">;
};

type CatalogAccess = {
  user: Doc<"users">;
  schoolId?: Id<"schools">;
  assignments: Doc<"roleAssignments">[];
  isStaffViewer: boolean;
  studentMemberships: ScopedAssignment[];
  studentSchoolIds: Set<string>;
};

type CatalogResources = {
  curriculums: Map<Id<"curriculums">, Doc<"curriculums">>;
  campuses: Map<Id<"campuses">, Doc<"campuses">>;
  teachers: Map<Id<"users">, Doc<"users">>;
  schools: Map<Id<"schools">, Doc<"schools">>;
  grades: Map<string, Doc<"institutionGrades">>;
};

export type CatalogFilters = {
  search?: string;
  campusId?: Id<"campuses">;
  curriculumId?: Id<"curriculums">;
  teacherId?: Id<"users">;
};

async function resolveCatalogSchoolId(
  ctx: QueryCtx,
  orgSlug: string,
  assignments: Doc<"roleAssignments">[],
  scopedAssignments: ScopedAssignment[],
) {
  const isSuperAdmin = assignments.some(
    (assignment) =>
      assignment.role === "superadmin" && assignment.orgType === "system",
  );
  if (orgSlug === "system" || orgSlug === "admin") {
    if (!isSuperAdmin) throw new ConvexError("PERMISSION_DENIED");
    return undefined;
  }

  const school = await ctx.db
    .query("schools")
    .withIndex("by_slug", (q) => q.eq("slug", orgSlug))
    .first();
  if (school) {
    if (
      !isSuperAdmin &&
      !scopedAssignments.some(
        ({ schoolId: assignmentSchoolId }) => assignmentSchoolId === school._id,
      )
    ) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    return school._id;
  }

  const campus = await ctx.db
    .query("campuses")
    .withIndex("by_slug", (q) => q.eq("slug", orgSlug))
    .first();
  if (!campus) throw new ConvexError("ORGANIZATION_NOT_FOUND");
  const hasCampusAccess = assignments.some(
    (assignment) =>
      (assignment.role === "admin" &&
        assignment.orgType === "school" &&
        assignment.orgId === campus.schoolId) ||
      (assignment.orgType === "campus" &&
        assignment.orgId === campus._id &&
        (assignment.role === "principal" ||
          assignment.role === "teacher" ||
          assignment.role === "tutor" ||
          assignment.role === "student")),
  );
  if (!isSuperAdmin && !hasCampusAccess) {
    throw new ConvexError("PERMISSION_DENIED");
  }
  return campus.schoolId;
}

async function getCatalogAccess(
  ctx: QueryCtx,
  user: Doc<"users">,
  orgSlug: string,
): Promise<CatalogAccess> {
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  const scopedAssignments = await Promise.all(
    assignments.map(async (assignment) => ({
      assignment,
      schoolId:
        assignment.schoolId ??
        (await resolveMembershipSchoolId(
          ctx,
          assignment.orgType,
          assignment.orgId,
        )),
    })),
  );
  const schoolId = await resolveCatalogSchoolId(
    ctx,
    orgSlug,
    assignments,
    scopedAssignments,
  );
  const isStaffViewer =
    assignments.some(
      (assignment) =>
        assignment.role === "superadmin" && assignment.orgType === "system",
    ) ||
    (schoolId !== undefined &&
      scopedAssignments.some(
        ({ assignment, schoolId: assignmentSchoolId }) =>
          assignmentSchoolId === schoolId && isStaffRole(assignment.role),
      ));
  const studentMemberships = schoolId
    ? scopedAssignments.filter(
        ({ assignment, schoolId: assignmentSchoolId }) =>
          assignmentSchoolId === schoolId && assignment.role === "student",
      )
    : [];

  return {
    user,
    schoolId,
    assignments,
    isStaffViewer,
    studentMemberships,
    studentSchoolIds: new Set(
      studentMemberships.flatMap(({ schoolId: membershipSchoolId }) =>
        membershipSchoolId ? [membershipSchoolId] : [],
      ),
    ),
  };
}

function getStudentGrade(access: CatalogAccess, classData: Doc<"classes">) {
  const membership =
    access.studentMemberships.find(
      ({ assignment }) =>
        classData.campusId &&
        assignment.orgType === "campus" &&
        assignment.orgId === classData.campusId,
    ) ??
    access.studentMemberships.find(
      ({ assignment }) => assignment.orgType === "school",
    ) ??
    access.studentMemberships[0];
  return membership?.assignment.gradeCode ?? access.user.grade;
}

async function isCatalogCourse(ctx: QueryCtx, classData: Doc<"classes">) {
  if (classData.classType === "standard") return true;
  if (classData.classType === "ignitia" || classData.classType === "abeka") {
    return false;
  }
  return await classHasLiveSessions(ctx, classData._id);
}

function isVisibleCourse(access: CatalogAccess, classData: Doc<"classes">) {
  if (access.isStaffViewer) return true;
  return canStudentAccessLiveClass({
    isEnrolled: false,
    liveAccess: classData.liveAccess,
    studentGrade: getStudentGrade(access, classData),
    classSchoolId: access.schoolId,
    studentSchoolIds: access.studentSchoolIds,
  });
}

function matchesFilters(classData: Doc<"classes">, filters: CatalogFilters) {
  return (
    (!filters.campusId || classData.campusId === filters.campusId) &&
    (!filters.curriculumId ||
      classData.curriculumId === filters.curriculumId) &&
    (!filters.teacherId || classData.teacherId === filters.teacherId) &&
    (!filters.search ||
      classData.name.toLocaleLowerCase().includes(filters.search))
  );
}

async function paginateCurrentClasses(
  ctx: QueryCtx,
  schoolId: Id<"schools"> | undefined,
  filters: CatalogFilters,
  paginationOpts: PaginationOptions,
) {
  const campusId = filters.campusId;
  if (filters.search) {
    const searchQuery = schoolId
      ? ctx.db
          .query("classes")
          .withSearchIndex("search_catalog_name", (q) =>
            q
              .search("name", filters.search!)
              .eq("schoolId", schoolId)
              .eq("isActive", true)
              .eq("classType", "standard"),
          )
      : ctx.db
          .query("classes")
          .withSearchIndex("search_catalog_name", (q) =>
            q
              .search("name", filters.search!)
              .eq("isActive", true)
              .eq("classType", "standard"),
          );
    return await searchQuery
      .filter((q) =>
        q.and(
          filters.curriculumId
            ? q.eq(q.field("curriculumId"), filters.curriculumId)
            : q.eq(true, true),
          campusId ? q.eq(q.field("campusId"), campusId) : q.eq(true, true),
          filters.teacherId
            ? q.eq(q.field("teacherId"), filters.teacherId)
            : q.eq(true, true),
        ),
      )
      .paginate(paginationOpts);
  }

  const classesQuery = campusId
    ? ctx.db
        .query("classes")
        .withIndex("by_campus", (q) =>
          q.eq("campusId", campusId).eq("isActive", true),
        )
        .filter((q) => q.eq(q.field("classType"), "standard"))
        .order("desc")
    : schoolId
      ? ctx.db
          .query("classes")
          .withIndex("by_school_and_active_and_class_type", (q) =>
            q
              .eq("schoolId", schoolId)
              .eq("isActive", true)
              .eq("classType", "standard"),
          )
          .order("desc")
      : ctx.db
          .query("classes")
          .withIndex("by_active_and_class_type", (q) =>
            q.eq("isActive", true).eq("classType", "standard"),
          )
          .order("desc");
  return await classesQuery
    .filter((q) =>
      q.and(
        filters.curriculumId
          ? q.eq(q.field("curriculumId"), filters.curriculumId)
          : q.eq(true, true),
        filters.teacherId
          ? q.eq(q.field("teacherId"), filters.teacherId)
          : q.eq(true, true),
      ),
    )
    .paginate(paginationOpts);
}

async function validateCatalogCampus(
  ctx: QueryCtx,
  schoolId: Id<"schools"> | undefined,
  campusId: Id<"campuses"> | undefined,
) {
  if (!campusId) return undefined;

  const campus = await ctx.db.get(campusId);
  if (!campus?.isActive || (schoolId && campus.schoolId !== schoolId)) {
    throw new ConvexError("INVALID_CAMPUS");
  }
  return campus;
}

async function listLegacyClasses(
  ctx: QueryCtx,
  schoolId: Id<"schools"> | undefined,
  filters: CatalogFilters,
  isFirstPage: boolean,
) {
  if (!schoolId || !isFirstPage) return [];

  // ponytail: remove this bounded bridge after backfillClassCatalogFields has
  // run in every deployment.
  const [standard, unknown] = await Promise.all([
    ctx.db
      .query("classes")
      .withIndex("by_school_and_active_and_class_type", (q) =>
        q
          .eq("schoolId", undefined)
          .eq("isActive", true)
          .eq("classType", "standard"),
      )
      .take(LEGACY_COURSE_LIMIT),
    ctx.db
      .query("classes")
      .withIndex("by_school_and_active_and_class_type", (q) =>
        q
          .eq("schoolId", undefined)
          .eq("isActive", true)
          .eq("classType", undefined),
      )
      .take(LEGACY_COURSE_LIMIT),
  ]);
  const candidates = [...standard, ...unknown].filter((classData) =>
    matchesFilters(classData, filters),
  );
  const resources = await loadResources(ctx, candidates);
  const catalogFlags = await Promise.all(
    candidates.map((classData) => isCatalogCourse(ctx, classData)),
  );
  return candidates.filter(
    (classData, index) =>
      catalogFlags[index] &&
      getCourseSchoolId(classData, resources) === schoolId,
  );
}

async function loadResources(
  ctx: QueryCtx,
  classes: Doc<"classes">[],
): Promise<CatalogResources> {
  const curriculumIds = [...new Set(classes.map((item) => item.curriculumId))];
  const campusIds = [
    ...new Set(
      classes.flatMap((item) => (item.campusId ? [item.campusId] : [])),
    ),
  ];
  const teacherIds = [
    ...new Set(
      classes.flatMap((item) => (item.teacherId ? [item.teacherId] : [])),
    ),
  ];
  const [curriculumDocs, campusDocs, teacherDocs] = await Promise.all([
    Promise.all(curriculumIds.map((id) => ctx.db.get(id))),
    Promise.all(campusIds.map((id) => ctx.db.get(id))),
    Promise.all(teacherIds.map((id) => ctx.db.get(id))),
  ]);
  const curriculums = new Map(
    curriculumDocs.flatMap((item) => (item ? [[item._id, item] as const] : [])),
  );
  const campuses = new Map(
    campusDocs.flatMap((item) => (item ? [[item._id, item] as const] : [])),
  );
  const teachers = new Map(
    teacherDocs.flatMap((item) => (item ? [[item._id, item] as const] : [])),
  );
  const schoolIds = [
    ...new Set(
      classes.flatMap((item) => {
        const schoolId =
          item.schoolId ??
          (item.campusId ? campuses.get(item.campusId)?.schoolId : undefined) ??
          curriculums.get(item.curriculumId)?.schoolId;
        return schoolId ? [schoolId] : [];
      }),
    ),
  ];
  const schoolDocs = await Promise.all(schoolIds.map((id) => ctx.db.get(id)));
  const schools = new Map(
    schoolDocs.flatMap((item) => (item ? [[item._id, item] as const] : [])),
  );
  const gradeKeys = [
    ...new Map(
      classes.flatMap((item) => {
        const schoolId =
          item.schoolId ??
          (item.campusId ? campuses.get(item.campusId)?.schoolId : undefined) ??
          curriculums.get(item.curriculumId)?.schoolId;
        return schoolId && item.gradeCode
          ? [
              [
                `${schoolId}:${item.gradeCode}`,
                { schoolId, code: item.gradeCode },
              ] as const,
            ]
          : [];
      }),
    ).values(),
  ];
  const gradeDocs = await Promise.all(
    gradeKeys.map(({ schoolId, code }) =>
      ctx.db
        .query("institutionGrades")
        .withIndex("by_school_and_code", (q) =>
          q.eq("schoolId", schoolId).eq("code", code),
        )
        .first(),
    ),
  );
  const grades = new Map(
    gradeDocs.flatMap((item) =>
      item ? [[`${item.schoolId}:${item.code}`, item] as const] : [],
    ),
  );

  return { curriculums, campuses, teachers, schools, grades };
}

function getCourseSchoolId(
  classData: Doc<"classes">,
  resources: CatalogResources,
) {
  return (
    classData.schoolId ??
    (classData.campusId
      ? resources.campuses.get(classData.campusId)?.schoolId
      : undefined) ??
    resources.curriculums.get(classData.curriculumId)?.schoolId
  );
}

function canOpenCourse(access: CatalogAccess, classData: Doc<"classes">) {
  return (
    classData.teacherId === access.user._id ||
    classData.tutorId === access.user._id ||
    canAssignmentsManageClass(
      access.assignments,
      classData.campusId,
      access.schoolId,
    )
  );
}

function toCatalogCourse(
  access: CatalogAccess,
  resources: CatalogResources,
  classData: Doc<"classes">,
  liveSchedule?: Doc<"classSchedule">,
  nextSchedule?: Doc<"classSchedule">,
) {
  const curriculum = resources.curriculums.get(classData.curriculumId);
  const campus = classData.campusId
    ? resources.campuses.get(classData.campusId)
    : undefined;
  const teacher = classData.teacherId
    ? resources.teachers.get(classData.teacherId)
    : undefined;
  const schoolId = getCourseSchoolId(classData, resources);
  const school = schoolId ? resources.schools.get(schoolId) : undefined;
  const grade =
    schoolId && classData.gradeCode
      ? resources.grades.get(`${schoolId}:${classData.gradeCode}`)
      : undefined;
  const timeZone =
    classData.timeZone ?? campus?.timeZone ?? school?.timeZone ?? "UTC";
  const staffCanOpen = canOpenCourse(access, classData);
  const studentGrade = getStudentGrade(access, classData);
  const toSession = (schedule: Doc<"classSchedule">, canOpen: boolean) => ({
    title: schedule.title ?? classData.name,
    start: schedule.scheduledStart,
    timeZone,
    roomName: schedule.roomName,
    canOpen,
  });
  const canOpenLive = liveSchedule
    ? staffCanOpen ||
      canStudentAccessLiveClass({
        isEnrolled: false,
        liveAccess: liveSchedule.liveAccess,
        studentGrade,
        classSchoolId: schoolId,
        studentSchoolIds: access.studentSchoolIds,
      })
    : false;

  return {
    _id: classData._id,
    name: classData.name,
    ...(classData.description !== undefined && {
      description: classData.description,
    }),
    curriculumId: classData.curriculumId,
    curriculumTitle: curriculum?.title ?? "Unknown Curriculum",
    curriculumColor: curriculum?.color ?? "#197db8",
    curriculumIconKey: curriculum?.iconKey ?? DEFAULT_CURRICULUM_ICON,
    ...(campus?.name !== undefined && { campusName: campus.name }),
    ...(school?.name !== undefined && { institutionName: school.name }),
    ...(classData.teacherId !== undefined && {
      teacherId: classData.teacherId,
    }),
    ...(teacher?.fullName !== undefined && { teacherName: teacher.fullName }),
    ...(teacher?.imageUrl !== undefined && {
      teacherImageUrl: teacher.imageUrl,
    }),
    ...(classData.gradeCode !== undefined && {
      gradeCode: classData.gradeCode,
    }),
    ...(grade?.name !== undefined && { gradeName: grade.name }),
    accessMode: normalizeLiveAccess(classData.liveAccess).mode,
    ...(liveSchedule && { liveSession: toSession(liveSchedule, canOpenLive) }),
    ...(nextSchedule && { nextSession: toSession(nextSchedule, staffCanOpen) }),
  };
}

async function getCatalogSchedulesForClass(
  ctx: QueryCtx,
  classId: Id<"classes">,
  now: number,
) {
  const querySchedule = (
    status: "active" | "scheduled",
    sessionType: "live" | undefined,
  ) =>
    ctx.db
      .query("classSchedule")
      .withIndex(
        "by_class_and_status_and_session_type_and_scheduled_start",
        (q) =>
          q
            .eq("classId", classId)
            .eq("status", status)
            .eq("sessionType", sessionType)
            .gte(
              "scheduledStart",
              status === "active" ? now - ONE_DAY_MS : now,
            ),
      );
  const [activeLive, activeLegacy, nextLive, nextLegacy] = await Promise.all([
    querySchedule("active", "live").order("desc").take(10),
    querySchedule("active", undefined).order("desc").take(10),
    querySchedule("scheduled", "live").first(),
    querySchedule("scheduled", undefined).first(),
  ]);
  const liveSchedule = [...activeLive, ...activeLegacy]
    .sort((a, b) => b.scheduledStart - a.scheduledStart)
    .find((schedule) => schedule.isLive === true);
  const nextSchedule = [nextLive, nextLegacy]
    .filter((schedule): schedule is Doc<"classSchedule"> => Boolean(schedule))
    .sort((a, b) => a.scheduledStart - b.scheduledStart)[0];
  return { liveSchedule, nextSchedule };
}

async function enrichCourses(
  ctx: QueryCtx,
  access: CatalogAccess,
  classes: Doc<"classes">[],
  now: number,
) {
  const [resources, schedules] = await Promise.all([
    loadResources(ctx, classes),
    Promise.all(
      classes.map((classData) =>
        getCatalogSchedulesForClass(ctx, classData._id, now),
      ),
    ),
  ]);
  return classes.map((classData, index) =>
    toCatalogCourse(
      access,
      resources,
      classData,
      schedules[index].liveSchedule,
      schedules[index].nextSchedule,
    ),
  );
}

export async function listCatalogCourses(
  ctx: QueryCtx,
  user: Doc<"users">,
  orgSlug: string,
  now: number,
  filters: CatalogFilters,
  paginationOpts: PaginationOptions,
) {
  const access = await getCatalogAccess(ctx, user, orgSlug);
  await validateCatalogCampus(ctx, access.schoolId, filters.campusId);
  const normalizedFilters = {
    ...filters,
    search: filters.search?.trim().toLocaleLowerCase() || undefined,
  };
  const pageResult = await paginateCurrentClasses(
    ctx,
    access.schoolId,
    normalizedFilters,
    paginationOpts,
  );
  const legacyClasses = await listLegacyClasses(
    ctx,
    access.schoolId,
    normalizedFilters,
    paginationOpts.cursor === null,
  );
  const visibleClasses = [...legacyClasses, ...pageResult.page].filter(
    (classData) => isVisibleCourse(access, classData),
  );

  return {
    ...pageResult,
    page: await enrichCourses(ctx, access, visibleClasses, now),
  };
}

export async function getCatalogFilterOptions(
  ctx: QueryCtx,
  user: Doc<"users">,
  orgSlug: string,
  campusId?: Id<"campuses">,
) {
  const access = await getCatalogAccess(ctx, user, orgSlug);
  const selectedCampus = await validateCatalogCampus(
    ctx,
    access.schoolId,
    campusId,
  );
  const schoolId = access.schoolId;
  const teacherSchoolId = selectedCampus?.schoolId ?? schoolId;
  const [campuses, curriculums, assignmentGroups] = await Promise.all([
    schoolId
      ? ctx.db
          .query("campuses")
          .withIndex("by_school", (q) =>
            q.eq("schoolId", schoolId).eq("isActive", true),
          )
          .take(FILTER_OPTION_LIMIT)
      : ctx.db
          .query("campuses")
          .withIndex("by_active", (q) => q.eq("isActive", true))
          .take(FILTER_OPTION_LIMIT),
    schoolId
      ? ctx.db
          .query("curriculums")
          .withIndex("by_school", (q) =>
            q.eq("schoolId", schoolId).eq("isActive", true),
          )
          .take(FILTER_OPTION_LIMIT)
      : ctx.db
          .query("curriculums")
          .withIndex("by_active", (q) => q.eq("isActive", true))
          .take(FILTER_OPTION_LIMIT),
    Promise.all(
      ASSIGNABLE_COURSE_INSTRUCTOR_ROLES.map((role) =>
        teacherSchoolId
          ? ctx.db
              .query("roleAssignments")
              .withIndex("by_role", (q) =>
                q.eq("role", role).eq("schoolId", teacherSchoolId),
              )
              .take(FILTER_OPTION_LIMIT)
          : ctx.db
              .query("roleAssignments")
              .withIndex("by_role", (q) => q.eq("role", role))
              .take(FILTER_OPTION_LIMIT),
      ),
    ),
  ]);
  const assignments = assignmentGroups.flat();
  const teacherIds = [
    ...new Set(
      assignments
        .filter(
          (assignment) =>
            !campusId ||
            (assignment.orgType === "campus" && assignment.orgId === campusId),
        )
        .map((assignment) => assignment.userId),
    ),
  ];
  const teachers = (
    await Promise.all(teacherIds.map((teacherId) => ctx.db.get(teacherId)))
  ).filter((teacher): teacher is Doc<"users"> => Boolean(teacher?.isActive));

  return {
    campuses: campuses
      .map((campus) => ({ value: campus._id, label: campus.name }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    curriculums: curriculums
      .map((curriculum) => ({
        value: curriculum._id,
        label: curriculum.title,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    teachers: teachers
      .map((teacher) => ({ value: teacher._id, label: teacher.fullName }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}
