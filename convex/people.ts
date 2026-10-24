import { ConvexError, v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import {
  internalMutation,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  getCurrentUserOrThrow,
  publicUserValidator,
  toPublicUser,
} from "./users";
import { canViewCampusPeople, hasOrgRole } from "./permissions";
import { listTeacherClasses } from "./model/courseAssignments";
import { isStudentEnrolled } from "./model/enrollments";
import { peopleDirectoryFields } from "./model/peopleDirectory";
import { syncTeacherStudentDirectory } from "./model/teacherPeopleDirectory";

const scopeArgs = {
  campusId: v.id("campuses"),
  role: v.union(v.literal("student"), v.literal("teacher")),
};

async function authorize(
  ctx: QueryCtx,
  campusId: Id<"campuses">,
  role: "student" | "teacher",
) {
  const user = await getCurrentUserOrThrow(ctx);
  const campus = await ctx.db.get("campuses", campusId);
  if (!campus) throw new ConvexError("PERMISSION_DENIED");
  if (await canViewCampusPeople(ctx, user._id, campusId, campus.schoolId))
    return null;
  if (
    role !== "student" ||
    !(await hasOrgRole(ctx, user._id, campusId, "campus", ["teacher"]))
  )
    throw new ConvexError("PERMISSION_DENIED");
  return user._id;
}

export const isReady = query({
  args: scopeArgs,
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const teacherId = await authorize(ctx, args.campusId, args.role);
    return (
      (
        await ctx.db
          .query("peopleDirectoryState")
          .withIndex("by_campusId_and_teacherId", (q) =>
            q
              .eq("campusId", args.campusId)
              .eq("teacherId", teacherId ?? undefined),
          )
          .unique()
      )?.ready ?? false
    );
  },
});

/** Lazy, restartable initialization. Never changes membership or profile data. */
export const prepare = mutation({
  args: scopeArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const teacherId = await authorize(ctx, args.campusId, args.role);
    const state = await ctx.db
      .query("peopleDirectoryState")
      .withIndex("by_campusId_and_teacherId", (q) =>
        q.eq("campusId", args.campusId).eq("teacherId", teacherId ?? undefined),
      )
      .unique();
    if (state?.ready) return null;
    const job = state?.jobId
      ? await ctx.db.system.get("_scheduled_functions", state.jobId)
      : null;
    if (job?.state.kind === "pending" || job?.state.kind === "inProgress")
      return null;
    const jobId = teacherId
      ? await ctx.scheduler.runAfter(0, internal.people.backfillTeacher, {
          campusId: args.campusId,
          teacherId,
        })
      : await ctx.scheduler.runAfter(0, internal.people.backfill, {
          campusId: args.campusId,
          cursor: null,
        });
    if (state) await ctx.db.patch("peopleDirectoryState", state._id, { jobId });
    else
      await ctx.db.insert("peopleDirectoryState", {
        campusId: args.campusId,
        teacherId: teacherId ?? undefined,
        ready: false,
        jobId,
      });
    return null;
  },
});

export const backfill = internalMutation({
  args: { campusId: v.id("campuses"), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { campusId, cursor }) => {
    const state = await ctx.db
      .query("peopleDirectoryState")
      .withIndex("by_campusId_and_teacherId", (q) =>
        q.eq("campusId", campusId).eq("teacherId", undefined),
      )
      .unique();
    if (!state || state.ready) return null;
    const result = await ctx.db
      .query("roleAssignments")
      .withIndex("by_org", (q) =>
        q.eq("orgId", campusId).eq("orgType", "campus"),
      )
      .paginate({ cursor, numItems: 100, maximumRowsRead: 100 });
    for (const membership of result.page) {
      const user = await ctx.db.get("users", membership.userId);
      if (user)
        await ctx.db.patch("roleAssignments", membership._id, {
          directory: peopleDirectoryFields(user, membership.gradeCode),
        });
    }
    if (result.isDone)
      await ctx.db.patch("peopleDirectoryState", state._id, {
        ready: true,
        jobId: undefined,
      });
    else {
      const jobId = await ctx.scheduler.runAfter(0, internal.people.backfill, {
        campusId,
        cursor: result.continueCursor,
      });
      await ctx.db.patch("peopleDirectoryState", state._id, { jobId });
    }
    return null;
  },
});

/** Initializes only the teacher's course rosters; never scans campus people. */
export const backfillTeacher = internalMutation({
  args: {
    campusId: v.id("campuses"),
    teacherId: v.id("users"),
    afterCourseId: v.optional(v.id("classes")),
    courseId: v.optional(v.id("classes")),
    cursor: v.optional(v.string()),
    afterStudentId: v.optional(v.id("users")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("peopleDirectoryState")
      .withIndex("by_campusId_and_teacherId", (q) =>
        q.eq("campusId", args.campusId).eq("teacherId", args.teacherId),
      )
      .unique();
    if (!state || state.ready) return null;
    const courses = (
      await listTeacherClasses(ctx, args.teacherId, true, {
        campusId: args.campusId,
      })
    ).sort((a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));
    const course = args.courseId
      ? courses.find((c) => c._id === args.courseId)
      : courses.find((c) => !args.afterCourseId || c._id > args.afterCourseId);
    if (!course && !args.courseId) {
      await ctx.db.patch("peopleDirectoryState", state._id, {
        ready: true,
        jobId: undefined,
      });
      return null;
    }
    let next: typeof args = {
      campusId: args.campusId,
      teacherId: args.teacherId,
      afterCourseId: args.courseId ?? course!._id,
    };
    if (course) {
      let students: Id<"users">[];
      if (course.enrollmentsMigratedAt) {
        const page = await ctx.db
          .query("classEnrollments")
          .withIndex("by_class", (q) => q.eq("classId", course._id))
          .paginate({
            cursor: args.cursor ?? null,
            numItems: 100,
            maximumRowsRead: 100,
          });
        students = page.page.map((row) => row.studentId);
        if (!page.isDone)
          next = { ...args, courseId: course._id, cursor: page.continueCursor };
      } else {
        const remaining = [...new Set(course.students ?? [])]
          .sort()
          .filter((id) => !args.afterStudentId || id > args.afterStudentId);
        students = remaining.slice(0, 100);
        if (remaining.length > 100)
          next = {
            ...args,
            courseId: course._id,
            afterStudentId: students.at(-1),
          };
      }
      for (const studentId of new Set(students))
        await syncTeacherStudentDirectory(
          ctx,
          args.campusId,
          args.teacherId,
          studentId,
          courses,
        );
    }
    const jobId = await ctx.scheduler.runAfter(
      0,
      internal.people.backfillTeacher,
      next,
    );
    await ctx.db.patch("peopleDirectoryState", state._id, { jobId });
    return null;
  },
});

export const list = query({
  args: {
    ...scopeArgs,
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    grade: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    sortBy: v.union(
      v.literal("fullName"),
      v.literal("email"),
      v.literal("grade"),
      v.literal("isActive"),
    ),
    direction: v.union(v.literal("asc"), v.literal("desc")),
  },
  returns: paginationResultValidator(
    publicUserValidator.extend({
      role: scopeArgs.role,
      orgId: v.string(),
      orgType: v.literal("campus"),
      avatarUrl: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const teacherId = await authorize(ctx, args.campusId, args.role);
    const state = await ctx.db
      .query("peopleDirectoryState")
      .withIndex("by_campusId_and_teacherId", (q) =>
        q.eq("campusId", args.campusId).eq("teacherId", teacherId ?? undefined),
      )
      .unique();
    if (!state?.ready) throw new ConvexError("PEOPLE_DIRECTORY_NOT_READY");
    const search = args.search?.trim();
    // Native pagination supplies id/endCursor. Add only missing server read caps.
    args.paginationOpts.maximumRowsRead ??= 100;
    args.paginationOpts.maximumBytesRead ??= 512 * 1024;
    if (
      !Number.isSafeInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > 100 ||
      args.paginationOpts.maximumRowsRead === undefined ||
      !Number.isSafeInteger(args.paginationOpts.maximumRowsRead) ||
      args.paginationOpts.maximumRowsRead > 200 ||
      args.paginationOpts.maximumRowsRead < 1 ||
      args.paginationOpts.maximumBytesRead === undefined ||
      !Number.isSafeInteger(args.paginationOpts.maximumBytesRead) ||
      args.paginationOpts.maximumBytesRead > 1024 * 1024 ||
      args.paginationOpts.maximumBytesRead < 1
    )
      throw new ConvexError("INVALID_PAGINATION");
    if (search && (search.length > 256 || search.split(/\s+/).length > 16))
      throw new ConvexError("INVALID_SEARCH");
    const index = {
      fullName: "by_org_role_name",
      email: "by_org_role_email",
      grade: "by_org_role_grade",
      isActive: "by_org_role_active",
    } as const;
    const rows = ctx.db.query("roleAssignments");
    const indexed =
      args.sortBy === "fullName" && args.grade !== undefined
        ? rows.withIndex("by_org_role_grade_name", (q) =>
            q
              .eq("orgId", args.campusId)
              .eq("orgType", "campus")
              .eq("role", args.role)
              .eq("directory.grade", args.grade),
          )
        : args.sortBy === "fullName" && args.isActive !== undefined
          ? rows.withIndex("by_org_role_active_name", (q) =>
              q
                .eq("orgId", args.campusId)
                .eq("orgType", "campus")
                .eq("role", args.role)
                .eq("directory.isActive", args.isActive),
            )
          : rows.withIndex(index[args.sortBy], (q) =>
              q
                .eq("orgId", args.campusId)
                .eq("orgType", "campus")
                .eq("role", args.role),
            );
    const source = search
      ? rows.withSearchIndex("search_people", (q) => {
          const scope = q
            .search("directory.search", search)
            .eq("orgId", args.campusId)
            .eq("orgType", "campus")
            .eq("role", args.role);
          const graded =
            args.grade === undefined
              ? scope
              : scope.eq("directory.grade", args.grade);
          return args.isActive === undefined
            ? graded
            : graded.eq("directory.isActive", args.isActive);
        })
      : indexed
          .order(args.direction)
          .filter((q) =>
            q.and(
              args.isActive === undefined
                ? q.eq(true, true)
                : q.eq(q.field("directory.isActive"), args.isActive),
              args.grade === undefined
                ? q.eq(true, true)
                : q.eq(q.field("directory.grade"), args.grade),
            ),
          );
    // Read caps also cover sparse teacher rosters and filters, not just response size.
    const teacherRows = ctx.db.query("teacherStudentDirectory");
    const teacherIndex =
      args.grade !== undefined && args.isActive !== undefined
        ? ({
            fullName: "by_scope_grade_active_name",
            email: "by_scope_grade_active_email",
            grade: "by_scope_grade_active",
            isActive: "by_scope_grade_active",
          } as const)
        : args.grade !== undefined
          ? ({
              fullName: "by_scope_grade_name",
              email: "by_scope_grade_email",
              grade: "by_scope_grade",
              isActive: "by_scope_grade_active",
            } as const)
          : args.isActive !== undefined
            ? ({
                fullName: "by_scope_active_name",
                email: "by_scope_active_email",
                grade: "by_scope_active_grade",
                isActive: "by_scope_active",
              } as const)
            : ({
                fullName: "by_scope_name",
                email: "by_scope_email",
                grade: "by_scope_grade",
                isActive: "by_scope_active",
              } as const);
    const teacherSource = teacherId
      ? search
        ? teacherRows.withSearchIndex("search_people", (q) => {
            const scoped = q
              .search("directory.search", search)
              .eq("campusId", args.campusId)
              .eq("teacherId", teacherId);
            const graded =
              args.grade === undefined
                ? scoped
                : scoped.eq("directory.grade", args.grade);
            return args.isActive === undefined
              ? graded
              : graded.eq("directory.isActive", args.isActive);
          })
        : teacherRows
            .withIndex(teacherIndex[args.sortBy], (q) => {
              const scoped = q
                .eq("campusId", args.campusId)
                .eq("teacherId", teacherId);
              const graded =
                args.grade === undefined
                  ? scoped
                  : scoped.eq("directory.grade", args.grade);
              return args.isActive === undefined
                ? graded
                : graded.eq("directory.isActive", args.isActive);
            })
            .order(args.direction)
      : null;
    const result = await (teacherSource ?? source).paginate(
      args.paginationOpts,
    );
    const courses = teacherId
      ? await listTeacherClasses(ctx, teacherId, true, {
          campusId: args.campusId,
        })
      : null;
    const page = [];
    for (const membership of result.page) {
      const studentId =
        "studentId" in membership ? membership.studentId : membership.userId;
      // Legacy duplicates must not repeat a person, even across different pages or filters.
      const canonical = await ctx.db
        .query("roleAssignments")
        .withIndex("by_user_org_role", (q) =>
          q
            .eq("userId", studentId)
            .eq("orgId", args.campusId)
            .eq("orgType", "campus")
            .eq("role", args.role),
        )
        .first();
      if (
        !canonical ||
        (!("studentId" in membership) && canonical._id !== membership._id)
      )
        continue;
      if (courses) {
        let enrolled = false;
        for (const course of courses)
          if (await isStudentEnrolled(ctx, course, studentId)) {
            enrolled = true;
            break;
          }
        if (!enrolled) continue;
      }
      const user = await ctx.db.get("users", studentId);
      if (!user) continue;
      page.push({
        ...toPublicUser(user),
        role: args.role,
        orgId: String(args.campusId),
        orgType: "campus" as const,
        grade: canonical.gradeCode ?? user.grade,
        avatarUrl: user.avatarStorageId
          ? await ctx.storage.getUrl(user.avatarStorageId)
          : null,
      });
    }
    return { ...result, page };
  },
});
