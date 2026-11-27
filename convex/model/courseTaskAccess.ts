import { isCourseTeacher } from "./courseAssignments";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  getUtcDayRange,
  isValidCivilDate,
  isValidTimeZone,
  toCivilDate,
} from "../../lib/time-zone";
import { isStudentEnrolled } from "./enrollments";
import { getClassTimeZone } from "./timeZone";
import { canManageClass } from "../permissions";

export async function requireTaskManager(
  ctx: QueryCtx | MutationCtx,
  classId: Id<"classes">,
  userId: Id<"users">,
) {
  const course = await ctx.db.get("classes", classId);
  if (!course) throw new ConvexError("CLASS_NOT_FOUND");
  if (
    !isCourseTeacher(course, userId) &&
    !(await canManageClass(ctx, userId, course))
  ) {
    throw new ConvexError("PERMISSION_DENIED");
  }
  return course;
}

export async function requireOpenCourse(
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

export async function getCourseEndAt(
  ctx: QueryCtx | MutationCtx,
  course: Doc<"classes">,
) {
  if (course.endDate !== undefined) {
    return Number.isFinite(course.endDate) ? course.endDate : undefined;
  }
  const period = course.academicPeriodId
    ? await ctx.db.get("academicPeriods", course.academicPeriodId)
    : null;
  if (!period) return undefined;
  const timeZone = await getClassTimeZone(ctx, course);
  if (!timeZone || !isValidTimeZone(timeZone)) return undefined;
  if (
    typeof period.endDate === "number" &&
    !Number.isFinite(new Date(period.endDate).getTime())
  )
    return undefined;
  const endDate = toCivilDate(period.endDate);
  if (!isValidCivilDate(endDate)) return undefined;
  return getUtcDayRange(endDate, timeZone).to - 1;
}

export async function canSubmitCourseTask(
  ctx: QueryCtx | MutationCtx,
  course: Doc<"classes">,
  task: Doc<"courseTasks">,
  now: number,
) {
  if (task.classId !== course._id || !course.isActive) return false;
  if (
    task.releasedAt === undefined ||
    now < task.releasedAt ||
    task.manuallyClosedAt !== undefined
  )
    return false;
  const endAt = await getCourseEndAt(ctx, course);
  if (endAt === undefined || now > endAt) return false;
  if (task.kind === "quiz")
    return (
      task.quiz !== undefined && task.dueAt !== undefined && now < task.dueAt
    );
  return (
    task.dueAt === undefined || now <= task.dueAt || task.allowLateSubmissions
  );
}

export async function getCourseTaskAccess(
  ctx: QueryCtx | MutationCtx,
  task: Doc<"courseTasks">,
  userId: Id<"users">,
) {
  const [course, user] = await Promise.all([
    ctx.db.get("classes", task.classId),
    ctx.db.get("users", userId),
  ]);
  if (!course || !user?.isActive) return { kind: "none" } as const;
  if (
    isCourseTeacher(course, userId) ||
    (await canManageClass(ctx, userId, course))
  ) {
    return { kind: "manager", course } as const;
  }
  if (
    task.releasedAt === undefined ||
    !(await isStudentEnrolled(ctx, course, userId))
  ) {
    return { kind: "none" } as const;
  }
  const recipient = await ctx.db
    .query("courseTaskRecipients")
    .withIndex("by_taskId_and_studentId", (q) =>
      q.eq("taskId", task._id).eq("studentId", userId),
    )
    .unique();
  return recipient
    ? ({ kind: "student", course, recipient } as const)
    : ({ kind: "none" } as const);
}
