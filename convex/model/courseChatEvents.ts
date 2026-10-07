import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { canSubmitCourseTask, getCourseTaskAccess } from "./courseTaskAccess";
import { getClassNotificationContext } from "./systemNotificationEvents";
import { createSystemNotification } from "./systemNotifications";

export const courseTaskEventValidator = v.object({
  taskId: v.id("courseTasks"),
  kind: v.union(v.literal("course_task"), v.literal("course_task_reminder")),
  messageId: v.optional(v.id("courseChatMessages")),
  createdAt: v.number(),
  reminderDueAt: v.optional(v.number()),
  reminderGeneration: v.optional(v.number()),
  legacyReminderContinuation: v.optional(v.boolean()),
});
export type CourseTaskEvent = Infer<typeof courseTaskEventValidator>;

export function taskEventFromMessage(
  message: Doc<"courseChatMessages">,
): CourseTaskEvent {
  const event = message.event!;
  return {
    kind: event.kind,
    taskId: event.taskId,
    reminderDueAt: event.reminderDueAt,
    reminderGeneration: event.reminderGeneration,
    messageId: message._id,
    createdAt: message._creationTime,
  };
}

// ponytail: choose the event's channel once; delivery never creates a fallback.
export async function prepareCourseTaskEvent(
  ctx: MutationCtx,
  task: Doc<"courseTasks">,
  course: Doc<"classes">,
  kind: CourseTaskEvent["kind"],
): Promise<CourseTaskEvent | null> {
  const base: CourseTaskEvent = {
    taskId: task._id,
    kind,
    createdAt: Date.now(),
    ...(kind === "course_task_reminder"
      ? {
          reminderDueAt: task.dueAt,
          reminderGeneration: task.reminderGeneration,
        }
      : {}),
  };
  let message: Doc<"courseChatMessages"> | null = null;
  if (
    kind === "course_task" &&
    course.chatArchivedAt === undefined &&
    task.announcementMessageId !== undefined
  ) {
    if (!task.announcementMessageId) return base;
    message = await ctx.db.get(
      "courseChatMessages",
      task.announcementMessageId,
    );
    return message ? taskEventFromMessage(message) : null;
  }
  if (course.chatArchivedAt === undefined) {
    const eventKey =
      kind === "course_task"
        ? `course_task:${task._id}`
        : `course_task_reminder:${task._id}:${task.dueAt}:${task.reminderGeneration}`;
    message = await ctx.db
      .query("courseChatMessages")
      .withIndex("by_eventKey", (q) => q.eq("eventKey", eventKey))
      .unique();
    if (!message) {
      const messageId = await ctx.db.insert("courseChatMessages", {
        classId: course._id,
        body: task.title,
        eventKey,
        event: {
          kind,
          taskId: task._id,
          title: task.title,
          ...(kind === "course_task_reminder"
            ? {
                reminderDueAt: task.dueAt,
                reminderGeneration: task.reminderGeneration,
              }
            : {}),
        },
      });
      message = (await ctx.db.get("courseChatMessages", messageId))!;
    }
  }
  const event = message ? taskEventFromMessage(message) : base;
  if (kind === "course_task" && task.announcementMessageId === undefined) {
    await ctx.db.patch("courseTasks", task._id, {
      announcementMessageId: message?._id ?? null,
    });
  }
  return event;
}

export async function publishCourseTaskEvent(
  ctx: MutationCtx,
  event: CourseTaskEvent,
) {
  await ctx.scheduler.runAfter(
    0,
    internal.courseChatNotifications.publishTask,
    { event, cursor: null },
  );
}

export async function deliverCourseTaskEvent(
  ctx: MutationCtx,
  event: CourseTaskEvent,
  course: Doc<"classes">,
  studentId: Id<"users">,
) {
  if (event.messageId) {
    const message = await ctx.db.get("courseChatMessages", event.messageId);
    if (
      !message ||
      course.chatArchivedAt !== undefined ||
      message._creationTime <= (course.chatNotificationsClearedThrough ?? 0)
    )
      return;
    const watermark = await ctx.db
      .query("systemNotifications")
      .withIndex("by_dedupe_key", (q) =>
        q.eq("dedupeKey", `course_chat:${course._id}:${studentId}`),
      )
      .unique();
    if (message._creationTime <= (watermark?.chatReadThrough ?? 0)) return;
  }
  const task = await ctx.db.get("courseTasks", event.taskId);
  if (!task || task.classId !== course._id) return;
  const access = await getCourseTaskAccess(ctx, task, studentId);
  if (access.kind !== "student") return;
  if (
    event.kind === "course_task_reminder" &&
    (access.recipient.submittedAt !== undefined ||
      task.manuallyClosedAt !== undefined ||
      task.dueAt !== event.reminderDueAt ||
      task.reminderGeneration !== event.reminderGeneration ||
      Date.now() >= (task.dueAt ?? 0) ||
      !(await canSubmitCourseTask(ctx, course, task, Date.now())))
  )
    return;
  if (
    event.kind === "course_task_reminder" &&
    event.legacyReminderContinuation
  ) {
    const legacy = await ctx.db
      .query("systemNotifications")
      .withIndex("by_dedupe_key", (q) =>
        q.eq(
          "dedupeKey",
          `course_task:reminder:${task._id}:${event.reminderDueAt}:${studentId}`,
        ),
      )
      .unique();
    if (legacy) return;
  }
  await createSystemNotification(ctx, {
    recipientId: studentId,
    kind: event.kind,
    classId: course._id,
    className: course.name,
    taskId: task._id,
    taskTitle: task.title,
    messageId: event.messageId,
    ...(event.kind === "course_task_reminder"
      ? { taskReminderGeneration: event.reminderGeneration }
      : {}),
    ...(await getClassNotificationContext(ctx, course)),
    dedupeKey:
      event.kind === "course_task"
        ? `course_task:assigned:${task._id}:${studentId}`
        : `course_task:reminder:${task._id}:${event.reminderDueAt}:${event.reminderGeneration}:${studentId}`,
    createdAt: event.createdAt,
  });
}
