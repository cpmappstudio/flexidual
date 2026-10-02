import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import {
  canSubmitCourseTask,
  getCourseTaskAccess,
} from "./model/courseTaskAccess";
import { deleteCourseTaskFile } from "./model/courseTaskFiles";
import { getCurrentUserOrThrow } from "./users";
import {
  MAX_TASK_SUBMISSION_FILES,
  validTaskFileSet,
} from "../lib/course-task-files";

const fileSummary = v.object({
  id: v.id("courseTaskFiles"),
  name: v.string(),
  contentType: v.string(),
  size: v.number(),
});

const feedbackValidator = v.object({
  text: v.string(),
  authorId: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
  forRevision: v.number(),
});

function summarizeFile(file: Doc<"courseTaskFiles">) {
  return {
    id: file._id,
    name: file.name,
    contentType: file.contentType,
    size: file.size,
  };
}

async function getRecipient(
  ctx: QueryCtx,
  taskId: Id<"courseTasks">,
  studentId: Id<"users">,
) {
  return ctx.db
    .query("courseTaskRecipients")
    .withIndex("by_taskId_and_studentId", (q) =>
      q.eq("taskId", taskId).eq("studentId", studentId),
    )
    .unique();
}

export const submit = mutation({
  args: {
    taskId: v.id("courseTasks"),
    fileIds: v.array(v.id("courseTaskFiles")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const task = await ctx.db.get("courseTasks", args.taskId);
    if (!task) throw new ConvexError("TASK_NOT_FOUND");
    const access = await getCourseTaskAccess(ctx, task, user._id);
    if (access.kind !== "student") throw new ConvexError("PERMISSION_DENIED");
    const now = Date.now();
    if (!(await canSubmitCourseTask(ctx, access.course, task, now)))
      throw new ConvexError("TASK_SUBMISSION_CLOSED");
    if (
      args.fileIds.length < 1 ||
      args.fileIds.length > MAX_TASK_SUBMISSION_FILES ||
      new Set(args.fileIds).size !== args.fileIds.length
    )
      throw new ConvexError("INVALID_TASK_FILES");
    const files = await Promise.all(
      args.fileIds.map((id) => ctx.db.get("courseTaskFiles", id)),
    );
    if (
      files.some(
        (file) =>
          !file ||
          file.taskId !== task._id ||
          file.recipientId !== access.recipient._id ||
          file.uploadedBy !== user._id ||
          file.kind !== "submission" ||
          file.state !== "staged" ||
          !file.storageId ||
          (file.expiresAt ?? 0) <= now,
      ) ||
      !validTaskFileSet(
        files as Doc<"courseTaskFiles">[],
        MAX_TASK_SUBMISSION_FILES,
      )
    )
      throw new ConvexError("INVALID_TASK_FILES");

    const previous = await ctx.db
      .query("courseTaskFiles")
      .withIndex("by_recipientId_and_state", (q) =>
        q.eq("recipientId", access.recipient._id).eq("state", "active"),
      )
      .collect();
    for (const file of previous) await deleteCourseTaskFile(ctx, file);
    for (const file of files) {
      await ctx.db.patch("courseTaskFiles", file!._id, {
        state: "active",
        expiresAt: undefined,
      });
    }
    await ctx.db.patch("courseTaskRecipients", access.recipient._id, {
      submittedAt: now,
      submittedLate: task.dueAt !== undefined && now > task.dueAt,
      submissionRevision: access.recipient.submissionRevision + 1,
      feedback: undefined,
    });
    return null;
  },
});

export const get = query({
  args: {
    taskId: v.id("courseTasks"),
    studentId: v.optional(v.id("users")),
  },
  returns: v.object({
    studentId: v.id("users"),
    submittedAt: v.optional(v.number()),
    submittedLate: v.optional(v.boolean()),
    submissionRevision: v.number(),
    feedback: v.optional(feedbackValidator),
    files: v.array(fileSummary),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const task = await ctx.db.get("courseTasks", args.taskId);
    if (!task) throw new ConvexError("TASK_NOT_FOUND");
    const access = await getCourseTaskAccess(ctx, task, user._id);
    if (access.kind === "none") throw new ConvexError("PERMISSION_DENIED");
    const studentId = args.studentId ?? user._id;
    if (access.kind === "student" && studentId !== user._id)
      throw new ConvexError("PERMISSION_DENIED");
    const recipient = await getRecipient(ctx, task._id, studentId);
    if (!recipient) throw new ConvexError("TASK_RECIPIENT_NOT_FOUND");
    const files = await ctx.db
      .query("courseTaskFiles")
      .withIndex("by_recipientId_and_state", (q) =>
        q.eq("recipientId", recipient._id).eq("state", "active"),
      )
      .collect();
    return {
      studentId,
      submittedAt: recipient.submittedAt,
      submittedLate: recipient.submittedLate,
      submissionRevision: recipient.submissionRevision,
      feedback: recipient.feedback,
      files: files.map(summarizeFile),
    };
  },
});

export const listForTask = query({
  args: {
    taskId: v.id("courseTasks"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      studentId: v.id("users"),
      studentName: v.string(),
      submittedAt: v.optional(v.number()),
      submittedLate: v.optional(v.boolean()),
      submissionRevision: v.number(),
      hasFeedback: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const task = await ctx.db.get("courseTasks", args.taskId);
    if (!task) throw new ConvexError("TASK_NOT_FOUND");
    const access = await getCourseTaskAccess(ctx, task, user._id);
    if (access.kind !== "manager") throw new ConvexError("PERMISSION_DENIED");
    const page = await ctx.db
      .query("courseTaskRecipients")
      .withIndex("by_taskId_and_studentId", (q) => q.eq("taskId", task._id))
      .paginate(args.paginationOpts);
    const rows = await Promise.all(
      page.page.map(async (recipient) => {
        const student = await ctx.db.get("users", recipient.studentId);
        return {
          studentId: recipient.studentId,
          studentName: student?.fullName ?? "",
          submittedAt: recipient.submittedAt,
          submittedLate: recipient.submittedLate,
          submissionRevision: recipient.submissionRevision,
          hasFeedback: recipient.feedback !== undefined,
        };
      }),
    );
    return { ...page, page: rows };
  },
});

export const setFeedback = mutation({
  args: {
    taskId: v.id("courseTasks"),
    studentId: v.id("users"),
    text: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const task = await ctx.db.get("courseTasks", args.taskId);
    if (!task) throw new ConvexError("TASK_NOT_FOUND");
    const access = await getCourseTaskAccess(ctx, task, user._id);
    if (access.kind !== "manager") throw new ConvexError("PERMISSION_DENIED");
    const recipient = await getRecipient(ctx, task._id, args.studentId);
    if (!recipient || recipient.submittedAt === undefined)
      throw new ConvexError("TASK_SUBMISSION_NOT_FOUND");
    const text = args.text?.trim() || undefined;
    if (text && text.length > 2_000)
      throw new ConvexError("TASK_FEEDBACK_TOO_LONG");
    const now = Date.now();
    await ctx.db.patch("courseTaskRecipients", recipient._id, {
      feedback: text
        ? {
            text,
            authorId: user._id,
            createdAt:
              recipient.feedback?.authorId === user._id
                ? recipient.feedback.createdAt
                : now,
            updatedAt: now,
            forRevision: recipient.submissionRevision,
          }
        : undefined,
    });
    return null;
  },
});
