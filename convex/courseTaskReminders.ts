import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { canSubmitCourseTask } from "./model/courseTaskAccess";
import { isStudentEnrolled } from "./model/enrollments";
import { getClassNotificationContext } from "./model/systemNotificationEvents";
import { createSystemNotification } from "./model/systemNotifications";
import { getClassTimeZone } from "./model/timeZone";
import {
  dateInTimeZone,
  isValidTimeZone,
  shiftZonedDateTime,
} from "../lib/time-zone";

const BATCH_SIZE = 50;

export const send = internalMutation({
  args: {
    taskId: v.id("courseTasks"),
    expectedDueAt: v.number(),
    generation: v.number(),
    cursor: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("courseTasks", args.taskId);
    if (
      !task ||
      task.dueAt !== args.expectedDueAt ||
      task.reminderGeneration !== args.generation
    )
      return null;
    const course = await ctx.db.get("classes", task.classId);
    const now = Date.now();
    if (
      !course ||
      now >= args.expectedDueAt ||
      !(await canSubmitCourseTask(ctx, course, task, now))
    )
      return null;
    const timeZone = await getClassTimeZone(ctx, course);
    if (!timeZone || !isValidTimeZone(timeZone)) return null;
    const reminderAt = shiftZonedDateTime(task.dueAt, timeZone, -1, 8, 0);
    if (
      now < reminderAt ||
      dateInTimeZone(now, timeZone) !== dateInTimeZone(reminderAt, timeZone)
    )
      return null;

    const page = await ctx.db
      .query("courseTaskRecipients")
      .withIndex("by_taskId_and_studentId", (q) => q.eq("taskId", task._id))
      .paginate({ cursor: args.cursor ?? null, numItems: BATCH_SIZE });
    const context = await getClassNotificationContext(ctx, course);
    for (const recipient of page.page) {
      if (
        recipient.submittedAt !== undefined ||
        !(await isStudentEnrolled(ctx, course, recipient.studentId))
      )
        continue;
      await createSystemNotification(ctx, {
        recipientId: recipient.studentId,
        kind: "course_task_reminder",
        actorId: task.createdBy,
        classId: course._id,
        className: course.name,
        taskId: task._id,
        taskTitle: task.title,
        ...context,
        dedupeKey: `course_task:reminder:${task._id}:${args.expectedDueAt}:${recipient.studentId}`,
      });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.courseTaskReminders.send, {
        ...args,
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});
