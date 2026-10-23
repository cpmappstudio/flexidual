import { HOUR } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, query, type QueryCtx } from "./_generated/server";
import { getCourseTaskAccess } from "./model/courseTaskAccess";
import { taskFileLimiter } from "./model/courseTaskFiles";
import { getCurrentUserFromAuth, getCurrentUserOrThrow } from "./users";
import {
  MAX_TASK_FILE_BYTES,
  MAX_TASK_TOTAL_BYTES,
} from "../lib/course-task-files";

async function getTarget(ctx: QueryCtx, id: Id<"courseTaskFiles">) {
  const user = await getCurrentUserFromAuth(ctx);
  if (!user) throw new ConvexError("PERMISSION_DENIED");
  const file = await ctx.db.get("courseTaskFiles", id);
  if (
    !file ||
    file.state !== "active" ||
    file.kind !== "submission" ||
    !file.storageId ||
    !file.recipientId ||
    file.contentType !== "application/pdf"
  )
    throw new ConvexError("TASK_CORRECTION_UNAVAILABLE");
  const task = await ctx.db.get("courseTasks", file.taskId);
  if (!task) throw new ConvexError("PERMISSION_DENIED");
  const access = await getCourseTaskAccess(ctx, task, user._id);
  if (access.kind !== "manager") throw new ConvexError("PERMISSION_DENIED");
  const recipient = await ctx.db.get("courseTaskRecipients", file.recipientId);
  if (
    !recipient ||
    recipient.taskId !== task._id ||
    recipient.submittedAt === undefined
  )
    throw new ConvexError("TASK_CORRECTION_UNAVAILABLE");
  return {
    user,
    file: { ...file, storageId: file.storageId },
    task,
    course: access.course,
    recipient,
  };
}

export const get = query({
  args: { id: v.id("courseTaskFiles") },
  returns: v.union(
    v.null(),
    v.object({
      name: v.string(),
      version: v.id("_storage"),
      revision: v.number(),
      classId: v.id("classes"),
      taskId: v.id("courseTasks"),
      taskTitle: v.string(),
      courseName: v.string(),
      studentId: v.id("users"),
      studentName: v.string(),
      authorName: v.string(),
      lastSaveId: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { id }) => {
    // A removed file or lost access must not discard an already open editor's work.
    try {
      const { user, file, task, course, recipient } = await getTarget(ctx, id);
      const student = await ctx.db.get("users", recipient.studentId);
      return {
        name: file.name,
        version: file.storageId,
        revision: recipient.submissionRevision,
        classId: task.classId,
        taskId: task._id,
        taskTitle: task.title,
        courseName: course.name,
        studentId: recipient.studentId,
        studentName: student?.fullName ?? "",
        authorName: user.fullName,
        lastSaveId: file.lastCorrection?.saveId,
      };
    } catch (error) {
      if (error instanceof ConvexError) return null;
      throw error;
    }
  },
});

export const reserve = internalMutation({
  args: {
    id: v.id("courseTaskFiles"),
    version: v.id("_storage"),
    revision: v.number(),
    saveId: v.string(),
    size: v.number(),
  },
  returns: v.union(
    v.object({ savedVersion: v.id("_storage") }),
    v.object({ id: v.id("courseTaskFiles") }),
  ),
  handler: async (ctx, args) => {
    const { user, file, recipient } = await getTarget(ctx, args.id);
    if (
      !args.saveId ||
      args.saveId.length > 100 ||
      !Number.isSafeInteger(args.size) ||
      args.size <= 0 ||
      args.size > MAX_TASK_FILE_BYTES
    )
      throw new ConvexError("INVALID_TASK_FILE");
    if (
      file.lastCorrection?.saveId === args.saveId &&
      file.lastCorrection.authorId === user._id
    )
      return { savedVersion: file.storageId };
    if (
      file.storageId !== args.version ||
      recipient.submissionRevision !== args.revision
    )
      throw new ConvexError("TASK_CORRECTION_CONFLICT");
    await taskFileLimiter.limit(ctx, "taskUploads", {
      key: user._id,
      throws: true,
    });
    await taskFileLimiter.limit(ctx, "taskUploadBytes", {
      key: user._id,
      count: args.size,
      throws: true,
    });
    const expiresAt = Date.now() + HOUR;
    const id = await ctx.db.insert("courseTaskFiles", {
      taskId: file.taskId,
      recipientId: file.recipientId,
      kind: "submission",
      uploadedBy: user._id,
      name: file.name,
      contentType: "application/pdf",
      size: args.size,
      state: "staged",
      expiresAt,
      correction: {
        fileId: file._id,
        version: args.version,
        revision: args.revision,
        saveId: args.saveId,
      },
    });
    await ctx.scheduler.runAt(expiresAt, internal.courseTaskFiles.expire, {
      id,
    });
    return { id };
  },
});

export const attach = internalMutation({
  args: { id: v.id("courseTaskFiles"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { id, storageId }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const staged = await ctx.db.get("courseTaskFiles", id);
    if (
      !staged?.correction ||
      staged.state !== "staged" ||
      staged.uploadedBy !== user._id ||
      staged.storageId ||
      (staged.expiresAt ?? 0) <= Date.now()
    )
      throw new ConvexError("INVALID_TASK_FILE");
    await ctx.db.patch("courseTaskFiles", id, { storageId });
    return null;
  },
});

export const discard = internalMutation({
  args: {
    id: v.id("courseTaskFiles"),
    fileId: v.id("courseTaskFiles"),
    storageId: v.optional(v.id("_storage")),
  },
  returns: v.null(),
  handler: async (ctx, { id, fileId, storageId }) => {
    const current = await ctx.db.get("courseTaskFiles", fileId);
    // A failed HTTP response can follow a successful commit. Never delete its result.
    if (
      storageId &&
      current?.storageId !== storageId &&
      (await ctx.db.system.get("_storage", storageId))
    )
      await ctx.storage.delete(storageId);
    const staged = await ctx.db.get("courseTaskFiles", id);
    if (staged?.state === "staged" && staged.correction?.fileId === fileId)
      await ctx.db.delete("courseTaskFiles", id);
    return null;
  },
});

export const complete = internalMutation({
  args: { id: v.id("courseTaskFiles"), storageId: v.id("_storage") },
  returns: v.id("_storage"),
  handler: async (ctx, { id, storageId }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const staged = await ctx.db.get("courseTaskFiles", id);
    if (
      !staged?.correction ||
      staged.storageId !== storageId ||
      staged.state !== "staged" ||
      staged.uploadedBy !== user._id ||
      (staged.expiresAt ?? 0) <= Date.now()
    )
      throw new ConvexError("INVALID_TASK_FILE");
    const { file, recipient } = await getTarget(ctx, staged.correction.fileId);
    if (
      file.lastCorrection?.saveId === staged.correction.saveId &&
      file.lastCorrection.authorId === user._id
    ) {
      await ctx.db.delete("courseTaskFiles", staged._id);
      await ctx.storage.delete(storageId);
      return file.storageId;
    }
    if (
      file.storageId !== staged.correction.version ||
      recipient.submissionRevision !== staged.correction.revision
    )
      throw new ConvexError("TASK_CORRECTION_CONFLICT");
    const metadata = await ctx.db.system.get("_storage", storageId);
    if (
      !metadata ||
      metadata.size !== staged.size ||
      (metadata.contentType !== undefined &&
        metadata.contentType !== "application/pdf")
    )
      throw new ConvexError("INVALID_TASK_FILE");
    const files = await ctx.db
      .query("courseTaskFiles")
      .withIndex("by_recipientId_and_state", (q) =>
        q.eq("recipientId", recipient._id).eq("state", "active"),
      )
      .collect();
    if (
      files.reduce(
        (total, item) =>
          total + (item._id === file._id ? staged.size : item.size),
        0,
      ) > MAX_TASK_TOTAL_BYTES
    )
      throw new ConvexError("INVALID_TASK_FILES");
    await ctx.db.patch("courseTaskFiles", file._id, {
      storageId,
      size: staged.size,
      lastCorrection: {
        authorId: user._id,
        updatedAt: Date.now(),
        saveId: staged.correction.saveId,
      },
    });
    await ctx.db.delete("courseTaskFiles", staged._id);
    await ctx.storage.delete(file.storageId);
    return storageId;
  },
});
