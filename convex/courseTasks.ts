import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  canSubmitCourseTask,
  getCourseEndAt,
  getCourseTaskAccess,
} from "./model/courseTaskAccess";
import { isStudentEnrolled } from "./model/enrollments";
import {
  assignCurrentStudentsToTask,
  releaseCourseTask,
} from "./model/courseTaskPublication";
import { refreshCourseTaskReminder } from "./model/courseTaskReminders";
import {
  deleteCourseTaskFile,
  replaceCourseTaskMaterials,
} from "./model/courseTaskFiles";
import { canManageClass } from "./permissions";
import { getCurrentUserOrThrow } from "./users";

const taskValidator = v.object({
  _id: v.id("courseTasks"),
  _creationTime: v.number(),
  classId: v.id("classes"),
  createdBy: v.id("users"),
  isDraft: v.optional(v.boolean()),
  title: v.string(),
  description: v.optional(v.string()),
  availableAt: v.optional(v.number()),
  availabilitySortAt: v.optional(v.number()),
  releasedAt: v.optional(v.number()),
  announcementMessageId: v.optional(
    v.union(v.id("courseChatMessages"), v.null()),
  ),
  dueAt: v.optional(v.number()),
  maxPublishedDueAt: v.optional(v.number()),
  allowLateSubmissions: v.boolean(),
  manuallyClosedAt: v.optional(v.number()),
  manuallyClosedBy: v.optional(v.id("users")),
  reminderScheduledId: v.optional(v.id("_scheduled_functions")),
  reminderGeneration: v.optional(v.number()),
  reminderPublishedGeneration: v.optional(v.number()),
  updatedAt: v.number(),
});
const PUBLISH_ATTEMPT_TTL_MS = 2 * 60 * 60 * 1000;
const DELETE_BATCH_SIZE = 50;

async function deleteUnpublishedTask(
  ctx: MutationCtx,
  task: Doc<"courseTasks">,
) {
  for await (const file of ctx.db
    .query("courseTaskFiles")
    .withIndex("by_taskId_and_kind_and_state", (q) =>
      q.eq("taskId", task._id),
    )) {
    await deleteCourseTaskFile(ctx, file);
  }
  await ctx.db.delete("courseTasks", task._id);
}

export const removeByClass = internalMutation({
  args: { classId: v.id("classes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await ctx.db.get("classes", args.classId)) return null;

    const task = await ctx.db
      .query("courseTasks")
      .withIndex("by_classId_and_releasedAt", (q) =>
        q.eq("classId", args.classId),
      )
      .first();
    if (task) {
      const [files, recipients] = await Promise.all([
        ctx.db
          .query("courseTaskFiles")
          .withIndex("by_taskId_and_kind_and_state", (q) =>
            q.eq("taskId", task._id),
          )
          .take(DELETE_BATCH_SIZE),
        ctx.db
          .query("courseTaskRecipients")
          .withIndex("by_taskId_and_studentId", (q) => q.eq("taskId", task._id))
          .take(DELETE_BATCH_SIZE),
      ]);
      await Promise.all(files.map((file) => deleteCourseTaskFile(ctx, file)));
      if (files.length < DELETE_BATCH_SIZE) {
        await Promise.all(
          recipients.map((recipient) =>
            ctx.db.delete("courseTaskRecipients", recipient._id),
          ),
        );
        if (recipients.length < DELETE_BATCH_SIZE) {
          if (task.reminderScheduledId) {
            const scheduled = await ctx.db.system.get(
              "_scheduled_functions",
              task.reminderScheduledId,
            );
            if (scheduled?.state.kind === "pending") {
              await ctx.scheduler.cancel(task.reminderScheduledId);
            }
          }
          await ctx.db.delete("courseTasks", task._id);
        }
      }
      await ctx.scheduler.runAfter(0, internal.courseTasks.removeByClass, args);
      return null;
    }

    const kinds = ["course_task", "course_task_reminder"] as const;
    const notifications = await Promise.all(
      kinds.map((kind) =>
        ctx.db
          .query("systemNotifications")
          .withIndex("by_class_and_kind", (q) =>
            q.eq("classId", args.classId).eq("kind", kind),
          )
          .take(DELETE_BATCH_SIZE),
      ),
    );
    await Promise.all(
      notifications
        .flat()
        .map((notification) =>
          ctx.db.delete("systemNotifications", notification._id),
        ),
    );
    if (notifications.some((group) => group.length === DELETE_BATCH_SIZE)) {
      await ctx.scheduler.runAfter(0, internal.courseTasks.removeByClass, args);
    }
    return null;
  },
});

export const remove = mutation({
  args: { taskId: v.id("courseTasks") },
  returns: v.null(),
  handler: async (ctx, { taskId }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const task = await ctx.db.get("courseTasks", taskId);
    if (!task || task.isDraft) throw new ConvexError("TASK_NOT_FOUND");
    await requireTaskManager(ctx, task.classId, user._id);

    if (task.reminderScheduledId) {
      const scheduled = await ctx.db.system.get(
        "_scheduled_functions",
        task.reminderScheduledId,
      );
      if (scheduled?.state.kind === "pending") {
        await ctx.scheduler.cancel(task.reminderScheduledId);
      }
    }

    await ctx.db.delete("courseTasks", taskId);
    await ctx.scheduler.runAfter(0, internal.courseTasks.removeDeletedTask, {
      taskId,
    });
    return null;
  },
});

export const removeDeletedTask = internalMutation({
  args: { taskId: v.id("courseTasks") },
  returns: v.null(),
  handler: async (ctx, { taskId }) => {
    if (await ctx.db.get("courseTasks", taskId)) return null;

    const files = await ctx.db
      .query("courseTaskFiles")
      .withIndex("by_taskId_and_kind_and_state", (q) => q.eq("taskId", taskId))
      .take(DELETE_BATCH_SIZE);
    await Promise.all(files.map((file) => deleteCourseTaskFile(ctx, file)));
    if (files.length === DELETE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.courseTasks.removeDeletedTask, {
        taskId,
      });
      return null;
    }

    const recipients = await ctx.db
      .query("courseTaskRecipients")
      .withIndex("by_taskId_and_studentId", (q) => q.eq("taskId", taskId))
      .take(DELETE_BATCH_SIZE);
    await Promise.all(
      recipients.map((recipient) =>
        ctx.db.delete("courseTaskRecipients", recipient._id),
      ),
    );
    if (recipients.length === DELETE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.courseTasks.removeDeletedTask, {
        taskId,
      });
      return null;
    }

    const notifications = await ctx.db
      .query("systemNotifications")
      .withIndex("by_taskId", (q) => q.eq("taskId", taskId))
      .take(DELETE_BATCH_SIZE);
    await Promise.all(
      notifications.map((notification) =>
        ctx.db.delete("systemNotifications", notification._id),
      ),
    );
    if (notifications.length === DELETE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.courseTasks.removeDeletedTask, {
        taskId,
      });
    }
    return null;
  },
});

async function requireTaskManager(
  ctx: QueryCtx | MutationCtx,
  classId: Id<"classes">,
  userId: Id<"users">,
) {
  const course = await ctx.db.get("classes", classId);
  if (!course) throw new ConvexError("CLASS_NOT_FOUND");
  if (
    course.teacherId !== userId &&
    !(await canManageClass(ctx, userId, course))
  ) {
    throw new ConvexError("PERMISSION_DENIED");
  }
  return course;
}

async function requireOpenCourse(
  ctx: QueryCtx | MutationCtx,
  course: Doc<"classes">,
  now: number,
) {
  const endAt = await getCourseEndAt(ctx, course);
  if (!course.isActive || endAt === undefined || now > endAt) {
    throw new ConvexError("COURSE_CLOSED");
  }
  return endAt;
}

function validateTaskDates({
  availableAt,
  releasedAt,
  dueAt,
  now,
  courseEndAt,
  requireFutureDue,
}: {
  availableAt: number | undefined;
  releasedAt?: number;
  dueAt: number | undefined;
  now: number;
  courseEndAt: number;
  requireFutureDue: boolean;
}) {
  const effectiveStartAt = releasedAt ?? availableAt;
  if (
    (availableAt !== undefined &&
      (!Number.isFinite(availableAt) ||
        availableAt > courseEndAt ||
        (releasedAt === undefined && availableAt <= now))) ||
    (dueAt !== undefined &&
      (!Number.isFinite(dueAt) ||
        dueAt > courseEndAt ||
        (effectiveStartAt !== undefined && dueAt <= effectiveStartAt) ||
        (requireFutureDue && dueAt <= now)))
  ) {
    throw new ConvexError("INVALID_TASK_DATES");
  }
}

async function scheduleTaskRelease(
  ctx: MutationCtx,
  taskId: Id<"courseTasks">,
  availableAt: number,
) {
  await ctx.scheduler.runAt(availableAt, internal.courseTasks.release, {
    taskId,
    expectedAvailableAt: availableAt,
  });
}

export const create = mutation({
  args: {
    classId: v.id("classes"),
    title: v.string(),
    description: v.optional(v.string()),
    availableAt: v.optional(v.number()),
    dueAt: v.optional(v.number()),
    allowLateSubmissions: v.optional(v.boolean()),
    draft: v.optional(v.boolean()),
  },
  returns: v.id("courseTasks"),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const course = await requireTaskManager(ctx, args.classId, user._id);
    const now = Date.now();
    const courseEndAt = await requireOpenCourse(ctx, course, now);
    const title = args.title.trim();
    if (!title) throw new ConvexError("TASK_TITLE_REQUIRED");
    if (title.length > 160) throw new ConvexError("TASK_TITLE_TOO_LONG");
    const description = args.description?.trim() || undefined;
    if (description && description.length > 10_000)
      throw new ConvexError("TASK_DESCRIPTION_TOO_LONG");
    if (args.dueAt === undefined && args.allowLateSubmissions === false) {
      throw new ConvexError("INVALID_LATE_SUBMISSIONS");
    }
    validateTaskDates({
      availableAt: args.availableAt,
      dueAt: args.dueAt,
      now,
      courseEndAt,
      requireFutureDue: true,
    });

    const taskId = await ctx.db.insert("courseTasks", {
      classId: course._id,
      createdBy: user._id,
      isDraft: args.draft ? true : undefined,
      title,
      description,
      availableAt: args.availableAt,
      availabilitySortAt:
        !args.draft && args.availableAt !== undefined && args.availableAt > now
          ? args.availableAt
          : undefined,
      dueAt: args.dueAt,
      allowLateSubmissions:
        args.dueAt === undefined ? true : (args.allowLateSubmissions ?? false),
      updatedAt: now,
    });
    const task = (await ctx.db.get("courseTasks", taskId))!;
    if (args.draft) {
      await ctx.scheduler.runAfter(
        PUBLISH_ATTEMPT_TTL_MS,
        internal.courseTasks.expireUnpublished,
        { taskId },
      );
      return taskId;
    }
    if (args.availableAt !== undefined && args.availableAt > now) {
      await scheduleTaskRelease(ctx, taskId, args.availableAt);
    } else {
      if (!(await releaseCourseTask(ctx, task, course, now))) {
        throw new ConvexError("TASK_RELEASE_FAILED");
      }
    }
    return taskId;
  },
});

export const update = mutation({
  args: {
    taskId: v.id("courseTasks"),
    title: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    availableAt: v.optional(v.union(v.number(), v.null())),
    dueAt: v.optional(v.union(v.number(), v.null())),
    allowLateSubmissions: v.optional(v.boolean()),
    materialFileIds: v.optional(v.array(v.id("courseTaskFiles"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const task = await ctx.db.get("courseTasks", args.taskId);
    if (!task) throw new ConvexError("TASK_NOT_FOUND");
    const course = await requireTaskManager(ctx, task.classId, user._id);
    const now = Date.now();
    const courseEndAt = await requireOpenCourse(ctx, course, now);
    const title = args.title === undefined ? task.title : args.title.trim();
    if (!title) throw new ConvexError("TASK_TITLE_REQUIRED");
    if (title.length > 160) throw new ConvexError("TASK_TITLE_TOO_LONG");
    const description =
      args.description === undefined
        ? task.description
        : args.description?.trim() || undefined;
    if (description && description.length > 10_000)
      throw new ConvexError("TASK_DESCRIPTION_TOO_LONG");
    const availableAt =
      args.availableAt === undefined
        ? task.availableAt
        : (args.availableAt ?? undefined);
    const dueAt =
      args.dueAt === undefined ? task.dueAt : (args.dueAt ?? undefined);
    if (dueAt === undefined && args.allowLateSubmissions === false) {
      throw new ConvexError("INVALID_LATE_SUBMISSIONS");
    }
    if (task.releasedAt !== undefined && availableAt !== task.availableAt) {
      throw new ConvexError("TASK_ALREADY_RELEASED");
    }
    validateTaskDates({
      availableAt,
      releasedAt: task.releasedAt,
      dueAt,
      now,
      courseEndAt,
      requireFutureDue: task.releasedAt === undefined,
    });
    const updatedTask = {
      ...task,
      title,
      description,
      availableAt,
      availabilitySortAt:
        task.releasedAt === undefined && !task.isDraft
          ? availableAt !== undefined && availableAt > now
            ? availableAt
            : now
          : task.availabilitySortAt,
      dueAt,
      allowLateSubmissions:
        dueAt === undefined
          ? true
          : (args.allowLateSubmissions ??
            (task.dueAt === undefined ? false : task.allowLateSubmissions)),
      updatedAt: now,
    };
    const wasOpen = await canSubmitCourseTask(ctx, course, task, now);
    await ctx.db.patch("courseTasks", task._id, {
      title,
      description,
      availableAt,
      availabilitySortAt: updatedTask.availabilitySortAt,
      dueAt,
      allowLateSubmissions: updatedTask.allowLateSubmissions,
      updatedAt: now,
    });
    if (args.materialFileIds !== undefined) {
      await replaceCourseTaskMaterials(
        ctx,
        task._id,
        user._id,
        args.materialFileIds,
        now,
      );
    }
    if (task.releasedAt !== undefined && dueAt !== task.dueAt) {
      await refreshCourseTaskReminder(ctx, updatedTask, course, now);
    }
    if (task.releasedAt !== undefined) {
      if (
        !wasOpen &&
        (await canSubmitCourseTask(ctx, course, updatedTask, now))
      ) {
        await assignCurrentStudentsToTask(ctx, updatedTask, course);
      }
    } else if (!task.isDraft) {
      if (availableAt !== undefined && availableAt > now) {
        if (availableAt !== task.availableAt) {
          await scheduleTaskRelease(ctx, task._id, availableAt);
        }
      } else {
        if (!(await releaseCourseTask(ctx, updatedTask, course, now))) {
          throw new ConvexError("TASK_RELEASE_FAILED");
        }
      }
    }
    return null;
  },
});

export const previewDeadlineChange = query({
  args: { taskId: v.id("courseTasks") },
  returns: v.object({ hasSubmissions: v.boolean() }),
  handler: async (ctx, { taskId }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const task = await ctx.db.get("courseTasks", taskId);
    if (!task) throw new ConvexError("TASK_NOT_FOUND");
    await requireTaskManager(ctx, task.classId, user._id);
    const submission = await ctx.db
      .query("courseTaskFiles")
      .withIndex("by_taskId_and_kind_and_state", (q) =>
        q.eq("taskId", taskId).eq("kind", "submission").eq("state", "active"),
      )
      .first();
    return { hasSubmissions: submission !== null };
  },
});

export const publish = mutation({
  args: {
    taskId: v.id("courseTasks"),
    materialFileIds: v.array(v.id("courseTaskFiles")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const task = await ctx.db.get("courseTasks", args.taskId);
    if (!task) throw new ConvexError("TASK_NOT_FOUND");
    const course = await requireTaskManager(ctx, task.classId, user._id);
    const now = Date.now();
    const courseEndAt = await requireOpenCourse(ctx, course, now);
    if (!task.isDraft) throw new ConvexError("TASK_ALREADY_PUBLISHED");
    validateTaskDates({
      availableAt: task.availableAt,
      dueAt: task.dueAt,
      now,
      courseEndAt,
      requireFutureDue: true,
    });
    await replaceCourseTaskMaterials(
      ctx,
      task._id,
      user._id,
      args.materialFileIds,
      now,
    );
    await ctx.db.patch("courseTasks", task._id, {
      isDraft: undefined,
      availabilitySortAt:
        task.availableAt !== undefined && task.availableAt > now
          ? task.availableAt
          : now,
    });
    if (task.availableAt !== undefined && task.availableAt > now) {
      await scheduleTaskRelease(ctx, task._id, task.availableAt);
    } else {
      if (!(await releaseCourseTask(ctx, task, course, now))) {
        throw new ConvexError("TASK_RELEASE_FAILED");
      }
    }
    return null;
  },
});

export const discardUnpublished = mutation({
  args: { taskId: v.id("courseTasks") },
  returns: v.union(
    v.literal("discarded"),
    v.literal("published"),
    v.literal("missing"),
  ),
  handler: async (ctx, { taskId }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const task = await ctx.db.get("courseTasks", taskId);
    if (!task) return "missing";
    if (task.createdBy !== user._id) throw new ConvexError("PERMISSION_DENIED");
    if (!task.isDraft) return "published";
    await deleteUnpublishedTask(ctx, task);
    return "discarded";
  },
});

export const expireUnpublished = internalMutation({
  args: { taskId: v.id("courseTasks") },
  returns: v.null(),
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get("courseTasks", taskId);
    if (
      task?.isDraft &&
      task._creationTime + PUBLISH_ATTEMPT_TTL_MS <= Date.now()
    ) {
      await deleteUnpublishedTask(ctx, task);
    }
    return null;
  },
});

export const setClosed = mutation({
  args: { taskId: v.id("courseTasks"), closed: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const task = await ctx.db.get("courseTasks", args.taskId);
    if (!task) throw new ConvexError("TASK_NOT_FOUND");
    const course = await requireTaskManager(ctx, task.classId, user._id);
    await requireOpenCourse(ctx, course, Date.now());
    if (task.releasedAt === undefined)
      throw new ConvexError("TASK_NOT_RELEASED");
    if ((task.manuallyClosedAt !== undefined) === args.closed) return null;
    const now = Date.now();
    const reopenedTask = {
      ...task,
      manuallyClosedAt: undefined,
      manuallyClosedBy: undefined,
    };
    if (
      !args.closed &&
      !(await canSubmitCourseTask(ctx, course, reopenedTask, now))
    ) {
      throw new ConvexError("TASK_SUBMISSION_CLOSED");
    }
    await ctx.db.patch("courseTasks", task._id, {
      manuallyClosedAt: args.closed ? now : undefined,
      manuallyClosedBy: args.closed ? user._id : undefined,
      updatedAt: now,
    });
    await refreshCourseTaskReminder(
      ctx,
      { ...task, manuallyClosedAt: args.closed ? now : undefined },
      course,
      now,
    );
    if (
      !args.closed &&
      (await canSubmitCourseTask(ctx, course, reopenedTask, now))
    ) {
      await assignCurrentStudentsToTask(ctx, reopenedTask, course);
    }
    return null;
  },
});

export const release = internalMutation({
  args: { taskId: v.id("courseTasks"), expectedAvailableAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("courseTasks", args.taskId);
    if (!task || task.releasedAt !== undefined) return null;
    if (
      task.availableAt === undefined ||
      task.availableAt !== args.expectedAvailableAt ||
      Date.now() < task.availableAt
    ) {
      return null;
    }
    const course = await ctx.db.get("classes", task.classId);
    if (course) await releaseCourseTask(ctx, task, course, Date.now());
    return null;
  },
});

export const get = query({
  args: { taskId: v.string() },
  returns: v.union(taskValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const taskId = ctx.db.normalizeId("courseTasks", args.taskId);
    if (!taskId) return null;
    const task = await ctx.db.get("courseTasks", taskId);
    if (!task) return null;
    const access = await getCourseTaskAccess(ctx, task, user._id);
    if (access.kind === "none") throw new ConvexError("PERMISSION_DENIED");
    return task;
  },
});

export const getStatus = query({
  args: { taskId: v.id("courseTasks"), now: v.number() },
  returns: v.object({
    canManage: v.boolean(),
    canSubmit: v.boolean(),
    submissionsOpen: v.boolean(),
    canReopen: v.boolean(),
  }),
  handler: async (ctx, { taskId, now }) => {
    const user = await getCurrentUserOrThrow(ctx);
    const task = await ctx.db.get("courseTasks", taskId);
    if (!task) throw new ConvexError("TASK_NOT_FOUND");
    const access = await getCourseTaskAccess(ctx, task, user._id);
    if (access.kind === "none") throw new ConvexError("PERMISSION_DENIED");
    const submissionsOpen = await canSubmitCourseTask(
      ctx,
      access.course,
      task,
      now,
    );
    return {
      canManage: access.kind === "manager",
      canSubmit: access.kind === "student" && submissionsOpen,
      submissionsOpen,
      canReopen:
        access.kind === "manager" &&
        task.manuallyClosedAt !== undefined &&
        (await canSubmitCourseTask(
          ctx,
          access.course,
          { ...task, manuallyClosedAt: undefined },
          now,
        )),
    };
  },
});

export const listForClass = query({
  args: { classId: v.id("classes"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(taskValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const course = await ctx.db.get("classes", args.classId);
    if (!course) throw new ConvexError("CLASS_NOT_FOUND");
    const isManager =
      course.teacherId === user._id ||
      (await canManageClass(ctx, user._id, course));
    if (!isManager && !(await isStudentEnrolled(ctx, course, user._id))) {
      throw new ConvexError("PERMISSION_DENIED");
    }
    if (isManager) {
      return await ctx.db
        .query("courseTasks")
        .withIndex("by_classId_and_isDraft_and_availabilitySortAt", (q) =>
          q.eq("classId", course._id).eq("isDraft", undefined),
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }

    // Keep pre-backfill assignments visible until their ordering fields exist.
    const unmigratedRecipient = await ctx.db
      .query("courseTaskRecipients")
      .withIndex("by_studentId_and_classId_and_releasedAt", (q) =>
        q.eq("studentId", user._id).eq("classId", undefined),
      )
      .first();
    if (unmigratedRecipient) {
      const result = await ctx.db
        .query("courseTasks")
        .withIndex("by_classId_and_isDraft_and_releasedAt", (q) =>
          q
            .eq("classId", course._id)
            .eq("isDraft", undefined)
            .gte("releasedAt", 0),
        )
        .order("desc")
        .paginate(args.paginationOpts);
      const page = await Promise.all(
        result.page.map(async (task) => {
          const recipient = await ctx.db
            .query("courseTaskRecipients")
            .withIndex("by_taskId_and_studentId", (q) =>
              q.eq("taskId", task._id).eq("studentId", user._id),
            )
            .unique();
          return recipient ? task : null;
        }),
      );
      return { ...result, page: page.filter((task) => task !== null) };
    }

    const result = await ctx.db
      .query("courseTaskRecipients")
      .withIndex("by_studentId_and_classId_and_releasedAt", (q) =>
        q.eq("studentId", user._id).eq("classId", course._id),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const page = await Promise.all(
      result.page.map((recipient) =>
        ctx.db.get("courseTasks", recipient.taskId),
      ),
    );
    return { ...result, page: page.filter((task) => task !== null) };
  },
});
