import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { isStudentEnrolled } from "./enrollments";

export async function ensureCourseTaskRecipient(
  ctx: MutationCtx,
  taskId: Id<"courseTasks">,
  studentId: Id<"users">,
) {
  const task = await ctx.db.get("courseTasks", taskId);
  const course = task ? await ctx.db.get("classes", task.classId) : null;
  const student = await ctx.db.get("users", studentId);
  if (
    !course ||
    task?.releasedAt === undefined ||
    !student?.isActive ||
    !(await isStudentEnrolled(ctx, course, studentId))
  ) {
    throw new ConvexError("INVALID_TASK_RECIPIENT");
  }
  const existing = await ctx.db
    .query("courseTaskRecipients")
    .withIndex("by_taskId_and_studentId", (q) =>
      q.eq("taskId", taskId).eq("studentId", studentId),
    )
    .unique();
  if (existing) {
    if (
      existing.classId !== course._id ||
      existing.releasedAt !== task.releasedAt
    ) {
      await ctx.db.patch("courseTaskRecipients", existing._id, {
        classId: course._id,
        releasedAt: task.releasedAt,
      });
    }
    return existing._id;
  }
  return await ctx.db.insert("courseTaskRecipients", {
    taskId,
    studentId,
    classId: course._id,
    releasedAt: task.releasedAt,
    assignedAt: Date.now(),
    submissionRevision: 0,
  });
}
