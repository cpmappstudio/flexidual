// convex/migration.ts
import { v } from "convex/values";
import { internalMutation, internalAction, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { toCivilDate } from "../lib/time-zone";
import { DEFAULT_INSTITUTION_GRADES } from "../lib/grades";
import { deriveClassTypeFromSchedules } from "./model/classType";

const ACADEMIC_CLEANUP_CONFIRMATION =
  "DELETE_LEGACY_ACADEMIC_TEST_DATA" as const;
const ACADEMIC_CLEANUP_BATCH_SIZE = 50;
const academicCleanupStageValidator = v.union(
  v.literal("whiteboardSessions"),
  v.literal("recordings"),
  v.literal("class_sessions"),
  v.literal("studentClassPreferences"),
  v.literal("classEnrollments"),
  v.literal("classSchedule"),
  v.literal("classes"),
);
type AcademicCleanupStage =
  | "whiteboardSessions"
  | "recordings"
  | "class_sessions"
  | "studentClassPreferences"
  | "classEnrollments"
  | "classSchedule"
  | "classes";
const ACADEMIC_CLEANUP_STAGES: readonly AcademicCleanupStage[] = [
  "whiteboardSessions",
  "recordings",
  "class_sessions",
  "studentClassPreferences",
  "classEnrollments",
  "classSchedule",
  "classes",
];

async function getMigrationAuthor(ctx: MutationCtx) {
  const [superadmin, admin] = await Promise.all([
    ctx.db
      .query("roleAssignments")
      .withIndex("by_role", (q) => q.eq("role", "superadmin"))
      .first(),
    ctx.db
      .query("roleAssignments")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .first(),
  ]);
  const user = await ctx.db.query("users").first();
  const createdBy = superadmin?.userId ?? admin?.userId ?? user?._id;
  if (!createdBy) throw new Error("No migration author is available");
  return createdBy;
}

export const importCurriculum = internalMutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    code: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    schoolId: v.optional(v.id("schools")),
    gradeCodes: v.optional(v.array(v.string())),
  },
  returns: v.id("curriculums"),
  handler: async (ctx, args) => {
    const createdBy = await getMigrationAuthor(ctx);

    return await ctx.db.insert("curriculums", {
      title: args.title,
      description: args.description,
      code: args.code,
      color: "#3b82f6",
      isActive: args.isActive,
      createdAt: args.createdAt,
      createdBy,
      schoolId: args.schoolId,
      gradeCodes: args.gradeCodes,
    });
  },
});

export const importLessonsBatch = internalMutation({
  args: {
    curriculumId: v.id("curriculums"),
    lessons: v.array(v.object({
      title: v.string(),
      description: v.optional(v.string()),
      content: v.optional(v.string()),
      isActive: v.boolean(),
      createdAt: v.number(),
    })),
  },
  returns: v.object({ count: v.number() }),
  handler: async (ctx, args) => {
    const createdBy = await getMigrationAuthor(ctx);

    const existingLessons = await ctx.db
      .query("lessons")
      .withIndex("by_curriculum", (q) => q.eq("curriculumId", args.curriculumId))
      .collect();

    let currentOrder = existingLessons.reduce((max, l) => Math.max(max, l.order), 0);

    for (const item of args.lessons) {
      currentOrder++;
      await ctx.db.insert("lessons", {
        curriculumId: args.curriculumId,
        title: item.title,
        description: item.description,
        content: item.content,
        order: currentOrder, 
        isActive: item.isActive,
        createdAt: item.createdAt,
        createdBy: createdBy,
      });
    }

    return { count: args.lessons.length };
  },
});

export const migrateLessonIdToArray = internalMutation({
  args: {},
  returns: v.object({
    success: v.boolean(),
    migratedCount: v.number(),
    skippedCount: v.number(),
    totalProcessed: v.number(),
  }),
  handler: async (ctx) => {
    const schedules = await ctx.db.query("classSchedule").collect();
    let migratedCount = 0;
    let skippedCount = 0;

    for (const schedule of schedules) {
      const doc = schedule as typeof schedule & {
        lessonId?: Id<"lessons">;
      };
      if (doc.lessonIds !== undefined) {
        skippedCount++;
        continue;
      }
      if (doc.lessonId !== undefined) {
        await ctx.db.patch(schedule._id, { lessonIds: [doc.lessonId] });
        migratedCount++;
      } else {
        await ctx.db.patch(schedule._id, { lessonIds: [] });
        migratedCount++;
      }
    }
    return { success: true, migratedCount, skippedCount, totalProcessed: schedules.length };
  },
});

export const clearLessonsFromRecurring = internalMutation({
  args: {},
  returns: v.object({ success: v.boolean(), clearedCount: v.number() }),
  handler: async (ctx) => {
    const schedules = (await ctx.db.query("classSchedule").collect()).filter(
      (schedule) => schedule.isRecurring,
    );
    let clearedCount = 0;
    for (const schedule of schedules) {
      if (schedule.lessonIds && schedule.lessonIds.length > 0) {
        await ctx.db.patch(schedule._id, { lessonIds: undefined });
        clearedCount++;
      }
    }
    return { success: true, clearedCount };
  },
});

export const migrateAcademicPeriodDates = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("academicPeriods")
      .paginate({ numItems: 100, cursor: args.cursor ?? null });

    for (const period of result.page) {
      if (typeof period.startDate === "number") {
        await ctx.db.patch(period._id, {
          startDate: toCivilDate(period.startDate),
          endDate: toCivilDate(period.endDate),
        });
      }
    }

    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.migration.migrateAcademicPeriodDates,
        { cursor: result.continueCursor },
      );
    }
    return null;
  },
});

export const initializeInstitutionGrades = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("schools")
      .paginate({ numItems: 25, cursor: args.cursor ?? null });

    for (const school of result.page) {
      const existing = await ctx.db
        .query("institutionGrades")
        .withIndex("by_school_and_order", (q) =>
          q.eq("schoolId", school._id),
        )
        .first();
      if (existing) continue;
      await Promise.all(
        DEFAULT_INSTITUTION_GRADES.map((grade, order) =>
          ctx.db.insert("institutionGrades", {
            schoolId: school._id,
            ...grade,
            order,
            createdAt: Date.now(),
            createdBy: school.createdBy,
          }),
        ),
      );
    }

    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.migration.initializeInstitutionGrades,
        { cursor: result.continueCursor },
      );
    }
    return null;
  },
});

export const backfillInstitutionMemberships = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("roleAssignments")
      .paginate({ numItems: 100, cursor: args.cursor ?? null });

    for (const assignment of result.page) {
      let schoolId: Id<"schools"> | undefined;
      let orgId = assignment.orgId;
      let orgType = assignment.orgType;
      if (assignment.orgType === "school" && assignment.orgId) {
        schoolId = ctx.db.normalizeId("schools", assignment.orgId) ?? undefined;
      } else if (assignment.orgType === "campus" && assignment.orgId) {
        const campusId = ctx.db.normalizeId("campuses", assignment.orgId);
        schoolId = campusId ? (await ctx.db.get(campusId))?.schoolId : undefined;
      }

      const requiresCampusScope =
        assignment.orgType === "school" &&
        (assignment.role === "principal" ||
          assignment.role === "teacher" ||
          assignment.role === "tutor" ||
          assignment.role === "student");
      if (requiresCampusScope && schoolId) {
        const campuses = await ctx.db
          .query("campuses")
          .withIndex("by_school", (q) =>
            q.eq("schoolId", schoolId).eq("isActive", true),
          )
          .take(2);
        if (campuses.length === 1) {
          orgId = campuses[0]._id;
          orgType = "campus";
        } else {
          console.warn(
            `Membership ${assignment._id} needs a campus selection before it can be migrated`,
          );
        }
      }

      const legacyUser =
        assignment.role === "student" && !assignment.gradeCode
          ? await ctx.db.get(assignment.userId)
          : null;
      await ctx.db.patch(assignment._id, {
        orgId,
        orgType,
        schoolId,
        gradeCode:
          assignment.role === "student"
            ? assignment.gradeCode ?? legacyUser?.grade
            : undefined,
      });
    }

    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.migration.backfillInstitutionMemberships,
        { cursor: result.continueCursor },
      );
    }
    return null;
  },
});

export const clearLegacyExternalPasswords = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("users")
      .paginate({ numItems: 100, cursor: args.cursor ?? null });

    for (const user of result.page) {
      if (user.externalPassword !== undefined) {
        await ctx.db.patch(user._id, { externalPassword: undefined });
      }
    }

    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.migration.clearLegacyExternalPasswords,
        { cursor: result.continueCursor },
      );
    }
    return null;
  },
});

async function deleteAcademicCleanupBatch(
  ctx: MutationCtx,
  stage: AcademicCleanupStage,
) {
  switch (stage) {
    case "whiteboardSessions": {
      const documents = await ctx.db
        .query("whiteboardSessions")
        .take(ACADEMIC_CLEANUP_BATCH_SIZE);
      for (const document of documents) {
        await Promise.all(
          Object.values(document.fileRefs ?? {}).map((file) =>
            ctx.storage.delete(file.storageId),
          ),
        );
        await ctx.db.delete(document._id);
      }
      return documents.length;
    }
    case "recordings": {
      const documents = await ctx.db
        .query("recordings")
        .take(ACADEMIC_CLEANUP_BATCH_SIZE);
      await Promise.all(
        documents.map((document) => ctx.db.delete(document._id)),
      );
      return documents.length;
    }
    case "class_sessions": {
      const documents = await ctx.db
        .query("class_sessions")
        .take(ACADEMIC_CLEANUP_BATCH_SIZE);
      await Promise.all(
        documents.map((document) => ctx.db.delete(document._id)),
      );
      return documents.length;
    }
    case "studentClassPreferences": {
      const documents = await ctx.db
        .query("studentClassPreferences")
        .take(ACADEMIC_CLEANUP_BATCH_SIZE);
      await Promise.all(
        documents.map((document) => ctx.db.delete(document._id)),
      );
      return documents.length;
    }
    case "classEnrollments": {
      const documents = await ctx.db
        .query("classEnrollments")
        .take(ACADEMIC_CLEANUP_BATCH_SIZE);
      await Promise.all(
        documents.map((document) => ctx.db.delete(document._id)),
      );
      return documents.length;
    }
    case "classSchedule": {
      const documents = await ctx.db
        .query("classSchedule")
        .take(ACADEMIC_CLEANUP_BATCH_SIZE);
      await Promise.all(
        documents.map((document) => ctx.db.delete(document._id)),
      );
      return documents.length;
    }
    case "classes": {
      const documents = await ctx.db
        .query("classes")
        .take(ACADEMIC_CLEANUP_BATCH_SIZE);
      await Promise.all(
        documents.map((document) => ctx.db.delete(document._id)),
      );
      return documents.length;
    }
  }
}

function getNextAcademicCleanupStage(stage: AcademicCleanupStage) {
  const nextIndex = ACADEMIC_CLEANUP_STAGES.indexOf(stage) + 1;
  return ACADEMIC_CLEANUP_STAGES[nextIndex] ?? null;
}

/**
 * Removes legacy test courses and their dependent session data.
 *
 * Run only after a verified production snapshot. This intentionally does not
 * touch people, memberships, institutions, campuses, curriculums, or lessons.
 * External S3/R2 objects are outside Convex's transactional storage and must be
 * reviewed separately using the backed-up recording metadata.
 */
export const resetLegacyAcademicTestData = internalMutation({
  args: {
    confirmation: v.literal(ACADEMIC_CLEANUP_CONFIRMATION),
    stage: v.optional(academicCleanupStageValidator),
  },
  returns: v.object({
    stage: academicCleanupStageValidator,
    deleted: v.number(),
    done: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const stage = args.stage ?? ACADEMIC_CLEANUP_STAGES[0];
    const deleted = await deleteAcademicCleanupBatch(ctx, stage);
    const nextStage =
      deleted === ACADEMIC_CLEANUP_BATCH_SIZE
        ? stage
        : getNextAcademicCleanupStage(stage);

    if (nextStage) {
      await ctx.scheduler.runAfter(
        0,
        internal.migration.resetLegacyAcademicTestData,
        {
          confirmation: ACADEMIC_CLEANUP_CONFIRMATION,
          stage: nextStage,
        },
      );
    }

    return {
      stage,
      deleted,
      done: nextStage === null,
    };
  },
});

export const backfillClassEnrollments = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("classes")
      .paginate({ numItems: 50, cursor: args.cursor ?? null });

    for (const classData of result.page) {
      if (classData.enrollmentsMigratedAt) continue;
      const existing = await ctx.db
        .query("classEnrollments")
        .withIndex("by_class", (q) => q.eq("classId", classData._id))
        .collect();
      const enrolledIds = new Set(existing.map((item) => item.studentId));
      const now = Date.now();
      for (const studentId of new Set(classData.students ?? [])) {
        if (enrolledIds.has(studentId)) continue;
        await ctx.db.insert("classEnrollments", {
          classId: classData._id,
          studentId,
          enrolledAt: now,
          enrolledBy: classData.createdBy,
        });
      }
      await ctx.db.patch(classData._id, { enrollmentsMigratedAt: now });
    }

    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.migration.backfillClassEnrollments,
        { cursor: result.continueCursor },
      );
    }
    return null;
  },
});

export const backfillClassCatalogFields = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("classes")
      .paginate({ numItems: 50, cursor: args.cursor ?? null });

    for (const classData of result.page) {
      const [campus, curriculum, classType] = await Promise.all([
        classData.campusId ? ctx.db.get(classData.campusId) : null,
        ctx.db.get(classData.curriculumId),
        classData.classType === undefined
          ? deriveClassTypeFromSchedules(ctx, classData._id)
          : classData.classType,
      ]);
      const schoolId =
        classData.schoolId ?? campus?.schoolId ?? curriculum?.schoolId;
      if (
        classData.schoolId !== schoolId ||
        classData.classType !== classType
      ) {
        await ctx.db.patch(classData._id, { schoolId, classType });
      }
    }

    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.migration.backfillClassCatalogFields,
        { cursor: result.continueCursor },
      );
    }
    return null;
  },
});

export const syncAllUsersToClerk = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Requires an internal query in users.ts: 
    // export const getAllUsersInternal = internalQuery({ handler: async (ctx) => await ctx.db.query("users").collect() });
    const users = await ctx.runQuery(internal.users.getAllUsersInternal, {});

    for (const user of users) {
      if (!user.clerkId.startsWith("temp_")) {
        await ctx.runAction(internal.roleAssignments.syncRolesToClerk, {
          userId: user._id,
          clerkId: user.clerkId,
        });
      }
    }
    return null;
  }
});

export const elevateToSuperadmin = internalMutation({
  args: { email: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    // 1. Find your user record
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!user) throw new Error(`User with email ${args.email} not found. Please log in first.`);

    // 2. Check if already superadmin
    const existing = await ctx.db
      .query("roleAssignments")
      .withIndex("by_user_org", (q) =>
        q.eq("userId", user._id).eq("orgId", undefined).eq("orgType", "system"),
      )
      .first();

    if (existing && existing.role === "superadmin") {
      return "User is already a Superadmin!";
    }

    // 3. Remove all existing role assignments — superadmin supersedes everything
    const allAssignments = await ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const a of allAssignments) {
      await ctx.db.delete(a._id);
    }

    // 4. Grant system-wide Superadmin access
    await ctx.db.insert("roleAssignments", {
      userId: user._id,
      orgType: "system",
      role: "superadmin",
      assignedAt: Date.now(),
    });

    return `Success! ${args.email} is now a Superadmin. Next: Run healAllUserRoles to sync Clerk metadata.`;
  },
});
