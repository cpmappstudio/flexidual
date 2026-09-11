import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { canAccessClass, getCourseChatCapabilities } from "../permissions";
import { getCurrentUserOrThrow } from "../users";
import { isStudentEnrolled } from "./enrollments";

export function assertChatActive(course: Doc<"classes">) {
  if (course.chatArchivedAt !== undefined)
    throw new ConvexError("CHAT_ARCHIVED");
}

export function getChatMute(
  ctx: QueryCtx | MutationCtx,
  classId: Id<"classes">,
  userId: Id<"users">,
) {
  return ctx.db
    .query("courseChatMutes")
    .withIndex("by_class_and_user", (q) =>
      q.eq("classId", classId).eq("userId", userId),
    )
    .unique();
}

export async function isChatMutedForUser(
  ctx: QueryCtx | MutationCtx,
  course: Doc<"classes">,
  userId: Id<"users">,
) {
  if (await getChatMute(ctx, course._id, userId)) return true;
  if (!course.chatDisabled && !course.chatStudentsMuted) return false;
  if ((await getCourseChatCapabilities(ctx, userId, course)).canDisable)
    return false;
  if (course.chatDisabled) return true;
  return await isStudentEnrolled(ctx, course, userId);
}

export async function canManageCourseChatContent(
  ctx: QueryCtx | MutationCtx,
  course: Doc<"classes">,
  userId: Id<"users">,
) {
  return (
    course.teacherId === userId ||
    (await getCourseChatCapabilities(ctx, userId, course)).canDisable
  );
}

export async function canAttachToCourseChat(
  ctx: QueryCtx | MutationCtx,
  course: Doc<"classes">,
  userId: Id<"users">,
) {
  return (
    (await canManageCourseChatContent(ctx, course, userId)) ||
    (course.chatStudentAttachmentsEnabled === true &&
      (await isStudentEnrolled(ctx, course, userId)))
  );
}

export async function requireChatAttachmentAccess(
  ctx: QueryCtx | MutationCtx,
  classId: Id<"classes">,
) {
  const user = await getCurrentUserOrThrow(ctx);
  const course = await ctx.db.get("classes", classId);
  if (!course || !(await canAccessClass(ctx, user._id, course)))
    throw new ConvexError("PERMISSION_DENIED");
  assertChatActive(course);
  if (await isChatMutedForUser(ctx, course, user._id))
    throw new ConvexError("CHAT_MUTED");
  if (!(await canAttachToCourseChat(ctx, course, user._id)))
    throw new ConvexError("CHAT_ATTACHMENTS_DISABLED");
  return { user, course };
}
