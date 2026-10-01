import { ConvexError, v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { currentRun, runArgs } from "./abekaSync";
import { startAbekaSync } from "./abeka";
import {
  getManagedAbekaConnection,
  requireAbekaAdmin,
} from "./model/abekaAccess";
import { abekaCourseFields, catalogSubject } from "./model/abekaValidators";
import {
  MAX_CATALOG_SUBJECTS,
  mergeCatalogSubjects,
} from "../lib/abeka/catalog";
import { ABEKA_MANUAL_SYNC_INTERVAL_MS } from "../lib/abeka/request-policy";

export const expectedSchool = internalQuery({
  args: runArgs,
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { runId }) => {
    const state = await currentRun(ctx, runId);
    return state?.run.catalog && state.connection.confirmed
      ? (state.connection.externalSchoolId ?? null)
      : null;
  },
});

export const refresh = mutation({
  args: { schoolId: v.id("schools") },
  returns: v.null(),
  handler: async (ctx, { schoolId }) => {
    const connection = await getManagedAbekaConnection(ctx, schoolId);
    if (
      !connection?.confirmed ||
      !["connected", "error"].includes(connection.status)
    )
      throw new ConvexError("NOT_CONNECTED");
    const run = connection.latestRunId
      ? await ctx.db.get(connection.latestRunId)
      : null;
    if (run?.status === "running") throw new ConvexError("SYNC_RUNNING");
    if (
      connection.catalogAttemptAt &&
      Date.now() - connection.catalogAttemptAt < ABEKA_MANUAL_SYNC_INTERVAL_MS
    )
      throw new ConvexError("SYNC_COOLDOWN");
    await startAbekaSync(ctx, connection, { catalog: true });
    return null;
  },
});

export const commit = internalMutation({
  args: { ...runArgs, subjects: v.array(catalogSubject) },
  returns: v.boolean(),
  handler: async (ctx, { runId, subjects }) => {
    const state = await currentRun(ctx, runId);
    if (!state?.run.catalog || !state.connection.confirmed) return false;
    if (
      !subjects.length ||
      subjects.length > MAX_CATALOG_SUBJECTS ||
      subjects.some(
        (s) =>
          !/^[1-9]\d{0,15}$/.test(s.subjectId) ||
          !s.name.trim() ||
          s.name.length > 300 ||
          !Number.isInteger(s.totalLessons) ||
          s.totalLessons < 1 ||
          s.totalLessons > 500,
      )
    )
      throw new ConvexError("INVALID_CATALOG");
    const incoming = mergeCatalogSubjects(subjects);
    const previous = await ctx.db
      .query("abekaCourses")
      .withIndex("by_connectionId_and_subjectId", (q) =>
        q.eq("connectionId", state.connection._id),
      )
      .take(MAX_CATALOG_SUBJECTS + 1);
    const existing = new Map(previous.map((s) => [s.subjectId, s]));
    const total = new Set([
      ...existing.keys(),
      ...incoming.map((s) => s.subjectId),
    ]);
    if (total.size > MAX_CATALOG_SUBJECTS)
      throw new ConvexError("CATALOG_LIMIT");
    for (const subject of incoming) {
      const row = existing.get(subject.subjectId);
      if (row) {
        await ctx.db.patch(row._id, { ...subject, available: true });
        existing.delete(subject.subjectId);
      } else
        await ctx.db.insert("abekaCourses", {
          ...subject,
          connectionId: state.connection._id,
          available: true,
        });
    }
    for (const row of existing.values())
      if (row.available) await ctx.db.patch(row._id, { available: false });
    await ctx.db.patch(state.connection._id, {
      catalogSyncedAt: Date.now(),
      catalogError: undefined,
    });
    return true;
  },
});

const linkView = v.object({
  classId: v.id("classes"),
  name: v.string(),
  campusName: v.string(),
  campusId: v.union(v.id("campuses"), v.null()),
  active: v.boolean(),
});

function courseBelongsToCampus(
  course: Doc<"classes">,
  campus: Doc<"campuses">,
  schoolId: Id<"schools">,
) {
  // Legacy courses derive their institution from the campus, as in the course catalog.
  // An explicit conflicting institution must never fall back to the campus.
  return (
    course.campusId === campus._id &&
    campus.schoolId === schoolId &&
    (course.schoolId ?? campus.schoolId) === schoolId
  );
}

export const courses = query({
  args: { schoolId: v.id("schools"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      ...abekaCourseFields,
      _id: v.id("abekaCourses"),
      _creationTime: v.number(),
      links: v.array(linkView),
    }),
  ),
  handler: async (ctx, { schoolId, paginationOpts }) => {
    const connection = await getManagedAbekaConnection(ctx, schoolId);
    if (!connection?.confirmed)
      return { page: [], isDone: true, continueCursor: "" };
    const page = await ctx.db
      .query("abekaCourses")
      .withIndex("by_connectionId_and_subjectId", (q) =>
        q.eq("connectionId", connection._id),
      )
      .paginate(paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (course) => {
          const links = await ctx.db
            .query("abekaCourseLinks")
            .withIndex("by_courseId_and_classId", (q) =>
              q.eq("courseId", course._id),
            )
            .take(50);
          return {
            ...course,
            links: await Promise.all(
              links.map(async (link) => {
                const c = await ctx.db.get(link.classId);
                const campus = c?.campusId
                  ? await ctx.db.get(c.campusId)
                  : null;
                const owned =
                  c && campus && courseBelongsToCampus(c, campus, schoolId);
                return {
                  classId: link.classId,
                  name: owned ? c.name : "—",
                  campusName: owned ? campus.name : "—",
                  campusId: owned ? campus._id : null,
                  active: !!(owned && c.isActive && campus.isActive),
                };
              }),
            ),
          };
        }),
      ),
    };
  },
});

export const courseCandidates = query({
  args: {
    schoolId: v.id("schools"),
    campusId: v.id("campuses"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      id: v.id("classes"),
      name: v.string(),
      period: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { schoolId, campusId, paginationOpts }) => {
    await requireAbekaAdmin(ctx, schoolId);
    const campus = await ctx.db.get(campusId);
    if (!campus?.isActive || campus.schoolId !== schoolId)
      throw new ConvexError("FORBIDDEN");
    const page = await ctx.db
      .query("classes")
      .withIndex("by_campus", (q) =>
        q.eq("campusId", campusId).eq("isActive", true),
      )
      .paginate(paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page
          .filter((c) => courseBelongsToCampus(c, campus, schoolId))
          .map(async (c) => {
            const period = c.academicPeriodId
              ? await ctx.db.get(c.academicPeriodId)
              : null;
            return {
              id: c._id,
              name: c.name,
              period: period?.schoolId === schoolId ? period.name : null,
            };
          }),
      ),
    };
  },
});

export const linkCourse = mutation({
  args: {
    courseId: v.id("abekaCourses"),
    campusId: v.optional(v.id("campuses")),
    classId: v.id("classes"),
    remove: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { courseId, campusId, classId, remove }) => {
    const course = await ctx.db.get(courseId);
    const connection = course ? await ctx.db.get(course.connectionId) : null;
    if (!course || !connection?.confirmed) throw new ConvexError("NOT_FOUND");
    await requireAbekaAdmin(ctx, connection.schoolId);
    // Fence old browser tabs once migration starts. Never resurrect legacy links.
    if (
      connection.curriculumLinksMigratedAt !== undefined ||
      connection.curriculumLinksMigrationCursor !== undefined
    )
      throw new ConvexError("CURRICULUM_LINKS_REQUIRED");
    const existing = await ctx.db
      .query("abekaCourseLinks")
      .withIndex("by_connectionId_and_classId", (q) =>
        q.eq("connectionId", connection._id).eq("classId", classId),
      )
      .unique();
    if (remove) {
      if (existing?.courseId === courseId) await ctx.db.delete(existing._id);
      return null;
    }
    const c = await ctx.db.get(classId);
    const campus = campusId ? await ctx.db.get(campusId) : null;
    if (
      !course.available ||
      !c?.isActive ||
      !campus?.isActive ||
      !courseBelongsToCampus(c, campus, connection.schoolId)
    )
      throw new ConvexError("INVALID_COURSE");
    if (existing) {
      if (existing.courseId !== courseId)
        throw new ConvexError("ALREADY_LINKED");
      return null;
    }
    const links = await ctx.db
      .query("abekaCourseLinks")
      .withIndex("by_courseId_and_classId", (q) => q.eq("courseId", courseId))
      .take(50);
    if (links.length >= 50) throw new ConvexError("COURSE_LINK_LIMIT");
    await ctx.db.insert("abekaCourseLinks", {
      connectionId: connection._id,
      courseId,
      classId,
    });
    return null;
  },
});
