import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { canSubmitCourseTask } from "./model/courseTaskAccess";
import {
  prepareCourseTaskEvent,
  publishCourseTaskEvent,
} from "./model/courseChatEvents";
import { getClassTimeZone } from "./model/timeZone";
import {
  dateInTimeZone,
  isValidTimeZone,
  shiftZonedDateTime,
} from "../lib/time-zone";

export const send = internalMutation({
  args: {
    taskId: v.id("courseTasks"),
    expectedDueAt: v.number(),
    generation: v.number(),
    // Already queued legacy batches may still carry this argument after deployment.
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
    // The generation marker and first delivery job commit atomically; retries
    // cannot choose another channel or fan out the same reminder again.
    if (task.reminderPublishedGeneration === args.generation) return null;
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

    const event = await prepareCourseTaskEvent(
      ctx,
      task,
      course,
      "course_task_reminder",
    );
    if (event) {
      await publishCourseTaskEvent(ctx, {
        ...event,
        ...(args.cursor !== undefined
          ? { legacyReminderContinuation: true }
          : {}),
      });
      await ctx.db.patch("courseTasks", task._id, {
        reminderPublishedGeneration: args.generation,
      });
    }
    return null;
  },
});
