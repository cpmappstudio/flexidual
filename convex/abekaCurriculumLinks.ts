import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  getManagedAbekaConnection,
  requireAbekaAdmin,
} from "./model/abekaAccess";
import { abekaCourseFields } from "./model/abekaValidators";

const MAX_LINKS = 50;
const BATCH_SIZE = 50;

export const courses = query({
  args: { schoolId: v.id("schools"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      ...abekaCourseFields,
      _id: v.id("abekaCourses"),
      _creationTime: v.number(),
      links: v.array(
        v.object({
          curriculumId: v.id("curriculums"),
          name: v.string(),
          active: v.boolean(),
        }),
      ),
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
          // Do not expose a partially migrated set as the final configuration.
          const links =
            connection.curriculumLinksMigratedAt === undefined
              ? []
              : await ctx.db
                  .query("abekaCurriculumLinks")
                  .withIndex("by_courseId_and_curriculumId", (q) =>
                    q.eq("courseId", course._id),
                  )
                  .take(MAX_LINKS);
          return {
            ...course,
            links: await Promise.all(
              links.map(async (link) => {
                const curriculum = await ctx.db.get(
                  "curriculums",
                  link.curriculumId,
                );
                const owned = curriculum?.schoolId === schoolId;
                return {
                  curriculumId: link.curriculumId,
                  name: owned ? curriculum.title : "—",
                  active: !!(owned && curriculum.isActive),
                };
              }),
            ),
          };
        }),
      ),
    };
  },
});

export const candidates = query({
  args: { schoolId: v.id("schools"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      id: v.id("curriculums"),
      name: v.string(),
      code: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { schoolId, paginationOpts }) => {
    await requireAbekaAdmin(ctx, schoolId);
    const page = await ctx.db
      .query("curriculums")
      .withIndex("by_school", (q) =>
        q.eq("schoolId", schoolId).eq("isActive", true),
      )
      .paginate(paginationOpts);
    return {
      ...page,
      page: page.page.map((c) => ({
        id: c._id,
        name: c.title,
        code: c.code ?? null,
      })),
    };
  },
});

export const link = mutation({
  args: {
    courseId: v.id("abekaCourses"),
    curriculumId: v.id("curriculums"),
    remove: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { courseId, curriculumId, remove }) => {
    const course = await ctx.db.get("abekaCourses", courseId);
    const connection = course
      ? await ctx.db.get("abekaConnections", course.connectionId)
      : null;
    if (!course || !connection?.confirmed) throw new ConvexError("NOT_FOUND");
    await requireAbekaAdmin(ctx, connection.schoolId);
    if (connection.curriculumLinksMigratedAt === undefined)
      throw new ConvexError("MIGRATION_REQUIRED");
    const existing = await ctx.db
      .query("abekaCurriculumLinks")
      .withIndex("by_connectionId_and_curriculumId", (q) =>
        q.eq("connectionId", connection._id).eq("curriculumId", curriculumId),
      )
      .unique();
    // Even stale/inactive associations must remain removable by their institution.
    if (remove) {
      if (existing?.courseId === courseId)
        await ctx.db.delete("abekaCurriculumLinks", existing._id);
      return null;
    }
    const curriculum = await ctx.db.get("curriculums", curriculumId);
    if (
      !course.available ||
      !curriculum?.isActive ||
      curriculum.schoolId !== connection.schoolId
    )
      throw new ConvexError("INVALID_CURRICULUM");
    if (existing) {
      if (existing.courseId !== courseId)
        throw new ConvexError("ALREADY_LINKED");
      return null;
    }
    const links = await ctx.db
      .query("abekaCurriculumLinks")
      .withIndex("by_courseId_and_curriculumId", (q) =>
        q.eq("courseId", courseId),
      )
      .take(MAX_LINKS);
    if (links.length >= MAX_LINKS) throw new ConvexError("COURSE_LINK_LIMIT");
    await ctx.db.insert("abekaCurriculumLinks", {
      connectionId: connection._id,
      courseId,
      curriculumId,
    });
    return null;
  },
});

// Both the read-only inventory and migration use the same ownership checks.
async function resolveLegacyLink(
  ctx: QueryCtx,
  connection: Doc<"abekaConnections">,
  link: Doc<"abekaCourseLinks">,
) {
  const [course, classData] = await Promise.all([
    ctx.db.get("abekaCourses", link.courseId),
    ctx.db.get("classes", link.classId),
  ]);
  if (!course || course.connectionId !== connection._id || !classData)
    return null;
  const [curriculum, campus] = await Promise.all([
    ctx.db.get("curriculums", classData.curriculumId),
    classData.campusId ? ctx.db.get("campuses", classData.campusId) : null,
  ]);
  if (
    !curriculum ||
    curriculum.schoolId !== connection.schoolId ||
    campus?.schoolId !== connection.schoolId ||
    (classData.schoolId ?? campus.schoolId) !== connection.schoolId
  )
    return null;
  // Preserve inactive but valid associations too. Activity is not ownership.
  return curriculum._id;
}

export const previewMigration = internalQuery({
  args: {
    connectionId: v.id("abekaConnections"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      legacyLinkId: v.id("abekaCourseLinks"),
      classId: v.id("classes"),
      courseId: v.id("abekaCourses"),
      curriculumId: v.union(v.id("curriculums"), v.null()),
    }),
  ),
  handler: async (ctx, { connectionId, paginationOpts }) => {
    const connection = await ctx.db.get("abekaConnections", connectionId);
    if (!connection) throw new ConvexError("NOT_FOUND");
    const page = await ctx.db
      .query("abekaCourseLinks")
      .withIndex("by_connectionId_and_classId", (q) =>
        q.eq("connectionId", connectionId),
      )
      .paginate(paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (link) => ({
          legacyLinkId: link._id,
          classId: link.classId,
          courseId: link.courseId,
          curriculumId: await resolveLegacyLink(ctx, connection, link),
        })),
      ),
    };
  },
});

// Explicitly invoked per batch. Cursor and inserts commit together; retry is safe.
// On any conflict the whole batch rolls back and the legacy profile stays live.
export const migrateBatch = internalMutation({
  args: { connectionId: v.id("abekaConnections") },
  returns: v.object({ done: v.boolean(), processed: v.number() }),
  handler: async (ctx, { connectionId }) => {
    const connection = await ctx.db.get("abekaConnections", connectionId);
    if (!connection) throw new ConvexError("NOT_FOUND");
    if (connection.curriculumLinksMigratedAt !== undefined)
      return { done: true, processed: 0 };
    const page = await ctx.db
      .query("abekaCourseLinks")
      .withIndex("by_connectionId_and_classId", (q) =>
        q.eq("connectionId", connectionId),
      )
      .paginate({
        numItems: BATCH_SIZE,
        cursor: connection.curriculumLinksMigrationCursor ?? null,
      });
    for (const legacy of page.page) {
      const curriculumId = await resolveLegacyLink(ctx, connection, legacy);
      if (!curriculumId)
        throw new ConvexError({
          code: "INVALID_LEGACY_LINK",
          legacyLinkId: legacy._id,
        });
      const existing = await ctx.db
        .query("abekaCurriculumLinks")
        .withIndex("by_connectionId_and_curriculumId", (q) =>
          q.eq("connectionId", connectionId).eq("curriculumId", curriculumId),
        )
        .unique();
      if (existing) {
        if (existing.courseId !== legacy.courseId)
          throw new ConvexError({
            code: "CONFLICTING_CURRICULUM_LINKS",
            curriculumId,
            legacyLinkId: legacy._id,
          });
      } else {
        await ctx.db.insert("abekaCurriculumLinks", {
          connectionId,
          curriculumId,
          courseId: legacy.courseId,
        });
      }
    }
    await ctx.db.patch(
      "abekaConnections",
      connectionId,
      page.isDone
        ? {
            curriculumLinksMigratedAt: Date.now(),
            curriculumLinksMigrationCursor: undefined,
          }
        : { curriculumLinksMigrationCursor: page.continueCursor },
    );
    return { done: page.isDone, processed: page.page.length };
  },
});
