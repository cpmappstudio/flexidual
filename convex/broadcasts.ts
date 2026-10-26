import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserOrThrow } from "./users";
import {
  addBroadcastParticipants,
  canManageBroadcast,
  getBroadcastRole,
  getBroadcastWriter,
} from "./model/broadcastAccess";
import { getUserImageUrl } from "./model/userImage";
import { validateGradeCodes } from "./model/grades";
import {
  canAccessCampus,
  canAccessSchool,
  canManageCampusPeople,
  canManageInstitution,
} from "./permissions";

export const scope = query({
  args: { orgSlug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      schoolId: v.id("schools"),
      campusId: v.optional(v.id("campuses")),
      canCreate: v.boolean(),
      canInstitution: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const school = await ctx.db
      .query("schools")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
      .unique();
    const campus = school
      ? null
      : await ctx.db
          .query("campuses")
          .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug))
          .unique();
    const schoolId = school?._id ?? campus?.schoolId;
    if (
      !schoolId ||
      (school
        ? !school.isActive || !(await canAccessSchool(ctx, user._id, schoolId))
        : !campus?.isActive ||
          !(await canAccessCampus(ctx, user._id, campus._id, schoolId)))
    )
      return null;
    const canInstitution = await canManageInstitution(ctx, user._id, schoolId);
    return {
      schoolId,
      campusId: campus?._id,
      canInstitution,
      canCreate:
        canInstitution ||
        Boolean(
          campus &&
            (await canManageCampusPeople(ctx, user._id, campus._id, schoolId)),
        ),
    };
  },
});

const scopeFields = {
  schoolId: v.id("schools"),
  campusId: v.optional(v.id("campuses")),
  mode: v.union(v.literal("private"), v.literal("school")),
};
const teacherFields = {
  _id: v.id("users"),
  fullName: v.string(),
  imageUrl: v.optional(v.string()),
  role: v.literal("teacher"),
  isMuted: v.boolean(),
};

export const create = mutation({
  args: {
    ...scopeFields,
    name: v.string(),
    gradeCodes: v.array(v.string()),
    teacherIds: v.array(v.id("users")),
  },
  returns: v.id("broadcasts"),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    if (!(await canManageBroadcast(ctx, user._id, args)))
      throw new ConvexError("PERMISSION_DENIED");
    const school = await ctx.db.get("schools", args.schoolId);
    const campus = args.campusId
      ? await ctx.db.get("campuses", args.campusId)
      : null;
    if (
      !school?.isActive ||
      (args.campusId &&
        (!campus?.isActive || campus.schoolId !== school._id)) ||
      (args.mode === "private" && !campus)
    )
      throw new ConvexError("INVALID_BROADCAST_SCOPE");
    const name = args.name.trim();
    const gradeCodes = [...new Set(args.gradeCodes)];
    const teacherIds = [...new Set(args.teacherIds)];
    if (
      !name ||
      name.length > 120 ||
      !gradeCodes.length ||
      gradeCodes.length > 30 ||
      teacherIds.length > 100
    )
      throw new ConvexError("INVALID_BROADCAST");
    if ((await validateGradeCodes(ctx, school._id, gradeCodes)).length)
      throw new ConvexError("INVALID_GRADE");
    const id = await ctx.db.insert("broadcasts", {
      name,
      schoolId: school._id,
      ...(args.mode === "private" ? { campusId: campus!._id } : {}),
      mode: args.mode,
      gradeCodes,
      createdBy: user._id,
      createdAt: Date.now(),
      professorsMuted: false,
      professorAttachmentsEnabled: false,
    });
    const broadcast = (await ctx.db.get("broadcasts", id))!;
    await addBroadcastParticipants(ctx, broadcast, teacherIds);
    return id;
  },
});

export const list = query({
  args: {
    schoolId: v.id("schools"),
    campusId: v.optional(v.id("campuses")),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      _id: v.id("broadcasts"),
      name: v.string(),
      archived: v.boolean(),
      canManage: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const search = args.search?.trim() ?? "";
    if (search.length > 120 || search.split(/\s+/).length > 16)
      return { page: [], isDone: true, continueCursor: "" };
    const rows = search
      ? ctx.db
          .query("broadcasts")
          .withSearchIndex("search_name", (q) =>
            q.search("name", search).eq("schoolId", args.schoolId),
          )
      : ctx.db
          .query("broadcasts")
          .withIndex("by_schoolId", (q) => q.eq("schoolId", args.schoolId))
          .order("desc");
    const result = await rows.paginate({
      ...args.paginationOpts,
      maximumRowsRead: 100,
      numItems: Math.min(50, args.paginationOpts.numItems),
    });
    const page = await Promise.all(
      result.page.map(async (broadcast) => {
        if (
          args.campusId &&
          broadcast.mode === "private" &&
          broadcast.campusId !== args.campusId
        )
          return null;
        if (!(await getBroadcastRole(ctx, user._id, broadcast))) return null;
        return {
          _id: broadcast._id,
          name: broadcast.name,
          archived: broadcast.chatArchivedAt !== undefined,
          canManage: await canManageBroadcast(ctx, user._id, broadcast),
        };
      }),
    );
    return { ...result, page: page.filter((item) => item !== null) };
  },
});

export const context = query({
  args: { broadcastId: v.id("broadcasts") },
  returns: v.union(
    v.null(),
    v.object({
      name: v.string(),
      schoolId: v.id("schools"),
      campusId: v.optional(v.id("campuses")),
      mode: v.union(v.literal("private"), v.literal("school")),
      canManage: v.boolean(),
      archived: v.boolean(),
      settings: v.object({
        studentsMuted: v.boolean(),
        studentAttachmentsEnabled: v.boolean(),
        disabled: v.boolean(),
      }),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const broadcast = await ctx.db.get("broadcasts", args.broadcastId);
    if (!broadcast || !(await getBroadcastRole(ctx, user._id, broadcast)))
      return null;
    return {
      name: broadcast.name,
      schoolId: broadcast.schoolId,
      campusId: broadcast.campusId,
      mode: broadcast.mode,
      canManage: await canManageBroadcast(ctx, user._id, broadcast),
      archived: broadcast.chatArchivedAt !== undefined,
      settings: {
        studentsMuted: broadcast.professorsMuted,
        studentAttachmentsEnabled: broadcast.professorAttachmentsEnabled,
        disabled: broadcast.chatDisabled ?? false,
      },
    };
  },
});

export const updateParticipants = mutation({
  args: {
    broadcastId: v.id("broadcasts"),
    add: v.array(v.id("users")),
    remove: v.array(v.id("users")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const broadcast = await ctx.db.get("broadcasts", args.broadcastId);
    if (
      !broadcast ||
      (await getBroadcastRole(ctx, user._id, broadcast)) !== "admin"
    )
      throw new ConvexError("PERMISSION_DENIED");
    if (broadcast.chatArchivedAt !== undefined)
      throw new ConvexError("CHAT_ARCHIVED");
    const add = [...new Set(args.add)];
    const remove = [...new Set(args.remove)];
    if (
      args.add.length > 100 ||
      args.remove.length > 100 ||
      add.some((id) => remove.includes(id))
    )
      throw new ConvexError("INVALID_CHAT_PARTICIPANT");
    await addBroadcastParticipants(ctx, broadcast, add);
    for (const userId of remove) {
      const writer = await getBroadcastWriter(ctx, broadcast._id, userId);
      if (writer) await ctx.db.delete("broadcastWriters", writer._id);
    }
    return null;
  },
});

export const participants = query({
  args: {
    broadcastId: v.id("broadcasts"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(v.object(teacherFields)),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const broadcast = await ctx.db.get("broadcasts", args.broadcastId);
    if (!broadcast || !(await getBroadcastRole(ctx, user._id, broadcast)))
      throw new ConvexError("PERMISSION_DENIED");
    const result = await ctx.db
      .query("broadcastWriters")
      .withIndex("by_broadcastId_and_userId", (q) =>
        q.eq("broadcastId", broadcast._id),
      )
      .paginate({
        ...args.paginationOpts,
        maximumRowsRead: 100,
        numItems: Math.min(40, args.paginationOpts.numItems),
      });
    const page = await Promise.all(
      result.page.map(async (writer) => {
        if (
          (await getBroadcastRole(ctx, writer.userId, broadcast)) !== "teacher"
        )
          return null;
        const teacher = (await ctx.db.get("users", writer.userId))!;
        return {
          _id: teacher._id,
          fullName: teacher.fullName,
          imageUrl: await getUserImageUrl(ctx, teacher),
          role: "teacher" as const,
          isMuted: !writer.enabled,
        };
      }),
    );
    return { ...result, page: page.filter((item) => item !== null) };
  },
});
