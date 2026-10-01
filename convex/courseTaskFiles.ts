import { RateLimiter, HOUR, MINUTE } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  canSubmitCourseTask,
  getCourseEndAt,
  getCourseTaskAccess,
} from "./model/courseTaskAccess";
import { deleteCourseTaskFile } from "./model/courseTaskFiles";
import { getCurrentUserOrThrow } from "./users";
import { isValidTaskFile } from "../lib/course-task-files";

const limiter = new RateLimiter(components.rateLimiter, {
  taskUploads: { kind: "token bucket", rate: 50, period: MINUTE, capacity: 50 },
  taskUploadBytes: {
    kind: "token bucket",
    rate: 400 * 1024 * 1024,
    period: HOUR,
    capacity: 400 * 1024 * 1024,
  },
  taskDownloadBytes: {
    kind: "token bucket",
    rate: 5 * 1024 * 1024 * 1024,
    period: HOUR,
    capacity: 5 * 1024 * 1024 * 1024,
  },
});

export const reserve = internalMutation({
  args: {
    taskId: v.id("courseTasks"),
    kind: v.optional(v.union(v.literal("material"), v.literal("submission"))),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  returns: v.id("courseTaskFiles"),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const task = await ctx.db.get("courseTasks", args.taskId);
    if (!task) throw new ConvexError("TASK_NOT_FOUND");
    const access = await getCourseTaskAccess(ctx, task, user._id);
    const kind = args.kind ?? "submission";
    if (kind === "submission") {
      if (access.kind !== "student") throw new ConvexError("PERMISSION_DENIED");
      if (!(await canSubmitCourseTask(ctx, access.course, task, Date.now())))
        throw new ConvexError("TASK_SUBMISSION_CLOSED");
    } else {
      if (access.kind !== "manager") throw new ConvexError("PERMISSION_DENIED");
      const endAt = await getCourseEndAt(ctx, access.course);
      if (!access.course.isActive || endAt === undefined || Date.now() > endAt)
        throw new ConvexError("COURSE_CLOSED");
    }
    if (!isValidTaskFile({ ...args, type: args.contentType }))
      throw new ConvexError("INVALID_TASK_FILE");
    await limiter.limit(ctx, "taskUploads", { key: user._id, throws: true });
    await limiter.limit(ctx, "taskUploadBytes", {
      key: user._id,
      count: args.size,
      throws: true,
    });
    const expiresAt = Date.now() + HOUR;
    const id = await ctx.db.insert("courseTaskFiles", {
      taskId: task._id,
      recipientId: access.kind === "student" ? access.recipient._id : undefined,
      kind,
      uploadedBy: user._id,
      name: args.name,
      contentType: args.contentType,
      size: args.size,
      state: "staged",
      expiresAt,
    });
    await ctx.scheduler.runAt(expiresAt, internal.courseTaskFiles.expire, {
      id,
    });
    return id;
  },
});

export const complete = internalMutation({
  args: { id: v.id("courseTaskFiles"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const file = await ctx.db.get("courseTaskFiles", args.id);
    if (
      !file ||
      file.state !== "staged" ||
      file.expiresAt === undefined ||
      file.expiresAt <= Date.now() ||
      file.uploadedBy !== user._id
    )
      throw new ConvexError("INVALID_TASK_FILE");
    const task = await ctx.db.get("courseTasks", file.taskId);
    const access = task && (await getCourseTaskAccess(ctx, task, user._id));
    if (!task || !access) throw new ConvexError("PERMISSION_DENIED");
    if (file.kind === "submission") {
      if (
        access.kind !== "student" ||
        access.recipient._id !== file.recipientId ||
        !(await canSubmitCourseTask(ctx, access.course, task, Date.now()))
      )
        throw new ConvexError("TASK_SUBMISSION_CLOSED");
    } else {
      if (access.kind !== "manager") throw new ConvexError("PERMISSION_DENIED");
      const endAt = await getCourseEndAt(ctx, access.course);
      if (!access.course.isActive || endAt === undefined || Date.now() > endAt)
        throw new ConvexError("PERMISSION_DENIED");
    }
    if (file.storageId) throw new ConvexError("INVALID_TASK_FILE");
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (
      !metadata ||
      metadata.size !== file.size ||
      (metadata.contentType !== undefined &&
        metadata.contentType !== file.contentType)
    )
      throw new ConvexError("INVALID_TASK_FILE");
    await ctx.db.patch("courseTaskFiles", file._id, {
      storageId: args.storageId,
    });
    return null;
  },
});

export const expire = internalMutation({
  args: { id: v.id("courseTaskFiles") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const file = await ctx.db.get("courseTaskFiles", id);
    if (file?.state === "staged" && (file.expiresAt ?? 0) <= Date.now())
      await deleteCourseTaskFile(ctx, file);
    return null;
  },
});

export const cancelStaged = mutation({
  args: { id: v.id("courseTaskFiles") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const file = await ctx.db.get("courseTaskFiles", id);
    if (!file || file.uploadedBy !== user._id || file.state !== "staged")
      throw new ConvexError("PERMISSION_DENIED");
    await deleteCourseTaskFile(ctx, file);
    return null;
  },
});

export const read = internalMutation({
  args: { id: v.id("courseTaskFiles") },
  returns: v.object({
    storageId: v.id("_storage"),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
  }),
  handler: async (ctx, { id }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const file = await ctx.db.get("courseTaskFiles", id);
    if (!file?.storageId || file.state !== "active")
      throw new ConvexError("PERMISSION_DENIED");
    const task = await ctx.db.get("courseTasks", file.taskId);
    const access = task && (await getCourseTaskAccess(ctx, task, user._id));
    if (!access || access.kind === "none")
      throw new ConvexError("PERMISSION_DENIED");
    if (file.kind === "submission") {
      if (!file.recipientId) throw new ConvexError("PERMISSION_DENIED");
      const recipient = await ctx.db.get(
        "courseTaskRecipients",
        file.recipientId,
      );
      if (
        !recipient ||
        recipient.taskId !== file.taskId ||
        (access.kind === "student" && access.recipient._id !== recipient._id)
      )
        throw new ConvexError("PERMISSION_DENIED");
    }
    await limiter.limit(ctx, "taskDownloadBytes", {
      key: user._id,
      count: file.size,
      throws: true,
    });
    return {
      storageId: file.storageId,
      name: file.name,
      contentType: file.contentType,
      size: file.size,
    };
  },
});

export const listMaterials = query({
  args: { taskId: v.id("courseTasks") },
  returns: v.array(
    v.object({
      id: v.id("courseTaskFiles"),
      name: v.string(),
      contentType: v.string(),
      size: v.number(),
    }),
  ),
  handler: async (ctx, { taskId }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const task = await ctx.db.get("courseTasks", taskId);
    if (!task) throw new ConvexError("TASK_NOT_FOUND");
    const access = await getCourseTaskAccess(ctx, task, user._id);
    if (access.kind === "none") throw new ConvexError("PERMISSION_DENIED");
    const files = await ctx.db
      .query("courseTaskFiles")
      .withIndex("by_taskId_and_kind_and_state", (q) =>
        q.eq("taskId", taskId).eq("kind", "material").eq("state", "active"),
      )
      .collect();
    return files.map((file) => ({
      id: file._id,
      name: file.name,
      contentType: file.contentType,
      size: file.size,
    }));
  },
});
