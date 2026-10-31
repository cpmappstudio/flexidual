import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { canAccessClass, getCourseChatCapabilities } from "../permissions";
import { getCurrentUserOrThrow } from "../users";

export async function requireCourseNotebookAccess(
  ctx: QueryCtx | MutationCtx,
  classId: Id<"classes">,
  edit = false,
) {
  const user = await getCurrentUserOrThrow(ctx);
  const course = await ctx.db.get("classes", classId);
  if (!course || !(await canAccessClass(ctx, user._id, course)))
    throw new ConvexError("PERMISSION_DENIED");
  // Reuse course role capabilities, not the independent chat state or mute rules.
  const capabilities = await getCourseChatCapabilities(ctx, user._id, course);
  if (edit && !capabilities.canModerate)
    throw new ConvexError("PERMISSION_DENIED");
  return {
    user,
    course,
    canEdit: capabilities.canModerate,
    canArchive: capabilities.canDisable,
  };
}

export function assertNotebookActive(course: Doc<"classes">) {
  if (
    course.notebookArchivedAt !== undefined ||
    (course.notebookInitializedAt === undefined &&
      course.endDate !== undefined &&
      course.endDate < Date.now())
  )
    throw new ConvexError("NOTEBOOK_ARCHIVED");
}

export async function requireNotebookPage(
  ctx: QueryCtx | MutationCtx,
  pageId: Id<"courseNotebookPages">,
  edit = false,
) {
  const page = await ctx.db.get("courseNotebookPages", pageId);
  if (!page) throw new ConvexError("NOTEBOOK_PAGE_NOT_FOUND");
  const access = await requireCourseNotebookAccess(ctx, page.classId, edit);
  if (access.course.notebookArchivedAt !== undefined)
    throw new ConvexError("NOTEBOOK_ARCHIVED");
  if (edit) assertNotebookActive(access.course);
  return { ...access, page };
}
