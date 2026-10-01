import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { isValidTimeZone, shiftZonedDateTime } from "../../lib/time-zone";
import { getClassTimeZone } from "./timeZone";

export async function refreshCourseTaskReminder(
  ctx: MutationCtx,
  task: Doc<"courseTasks">,
  course: Doc<"classes">,
  now: number,
) {
  if (task.reminderScheduledId) {
    const scheduled = await ctx.db.system.get(
      "_scheduled_functions",
      task.reminderScheduledId,
    );
    if (scheduled?.state.kind === "pending") {
      await ctx.scheduler.cancel(task.reminderScheduledId);
    }
  }

  const generation = (task.reminderGeneration ?? 0) + 1;
  let reminderScheduledId: Doc<"courseTasks">["reminderScheduledId"];
  if (
    task.releasedAt !== undefined &&
    task.manuallyClosedAt === undefined &&
    task.dueAt !== undefined &&
    course.isActive
  ) {
    const timeZone = await getClassTimeZone(ctx, course);
    if (timeZone && isValidTimeZone(timeZone)) {
      const reminderAt = shiftZonedDateTime(task.dueAt, timeZone, -1, 8, 0);
      if (reminderAt > now) {
        reminderScheduledId = await ctx.scheduler.runAt(
          reminderAt,
          internal.courseTaskReminders.send,
          { taskId: task._id, expectedDueAt: task.dueAt, generation },
        );
      }
    }
  }
  await ctx.db.patch("courseTasks", task._id, {
    reminderScheduledId,
    reminderGeneration: generation,
  });
}
