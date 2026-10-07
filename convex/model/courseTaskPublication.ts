import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { canSubmitCourseTask } from "./courseTaskAccess";
import { ensureCourseTaskRecipient } from "./courseTaskRecipients";
import { listClassStudentIds } from "./enrollments";
import {
  prepareCourseTaskEvent,
  publishCourseTaskEvent,
  deliverCourseTaskEvent,
} from "./courseChatEvents";
import { refreshCourseTaskReminder } from "./courseTaskReminders";

async function assignTaskToStudents(
  ctx: MutationCtx,
  task: Doc<"courseTasks">,
  course: Doc<"classes">,
  studentIds: Iterable<Id<"users">>,
  notify = true,
) {
  const event = notify
    ? await prepareCourseTaskEvent(ctx, task, course, "course_task")
    : null;
  for (const studentId of new Set(studentIds)) {
    const student = await ctx.db.get("users", studentId);
    if (!student?.isActive) continue;
    await ensureCourseTaskRecipient(ctx, task._id, studentId);
    if (event) await deliverCourseTaskEvent(ctx, event, course, studentId);
  }
}

export async function releaseCourseTask(
  ctx: MutationCtx,
  task: Doc<"courseTasks">,
  course: Doc<"classes">,
  now: number,
) {
  if (task.releasedAt !== undefined) return false;
  const releasedTask = {
    ...task,
    releasedAt: now,
  };
  if (!(await canSubmitCourseTask(ctx, course, releasedTask, now)))
    return false;
  await ctx.db.patch("courseTasks", task._id, {
    releasedAt: now,
    availabilitySortAt: now,
  });
  await assignCurrentStudentsToTask(ctx, releasedTask, course, false);
  const event = await prepareCourseTaskEvent(
    ctx,
    releasedTask,
    course,
    "course_task",
  );
  if (event) await publishCourseTaskEvent(ctx, event);
  await refreshCourseTaskReminder(ctx, releasedTask, course, now);
  return true;
}

export async function assignCurrentStudentsToTask(
  ctx: MutationCtx,
  task: Doc<"courseTasks">,
  course: Doc<"classes">,
  notify = true,
) {
  await assignTaskToStudents(
    ctx,
    task,
    course,
    await listClassStudentIds(ctx, course),
    notify,
  );
}

export async function assignOpenCourseTasksToStudent(
  ctx: MutationCtx,
  course: Doc<"classes">,
  studentId: Id<"users">,
) {
  const tasks = ctx.db
    .query("courseTasks")
    .withIndex("by_classId_and_releasedAt", (q) =>
      q.eq("classId", course._id).gte("releasedAt", 0),
    );
  for await (const task of tasks) {
    if (!(await canSubmitCourseTask(ctx, course, task, Date.now()))) continue;
    await assignTaskToStudents(ctx, task, course, [studentId]);
  }
}
