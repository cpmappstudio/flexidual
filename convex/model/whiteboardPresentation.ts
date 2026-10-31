import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Resolve only the selected page of this course, never the rest of its notebook. */
export async function resolveWhiteboardPresentation(
  ctx: QueryCtx | MutationCtx,
  room: Doc<"whiteboardSceneManifests">,
) {
  if (!room.presentedPageId) return room;
  const page = await ctx.db.get("courseNotebookPages", room.presentedPageId);
  const roomName = room.roomName;
  const schedule = roomName
    ? await ctx.db
        .query("classSchedule")
        .withIndex("by_room", (q) => q.eq("roomName", roomName))
        .first()
    : null;
  if (!page || !schedule || page.classId !== schedule.classId) return room;
  const course = await ctx.db.get("classes", page.classId);
  if (!course || course.notebookArchivedAt !== undefined) return room;
  return (
    (await ctx.db
      .query("whiteboardSceneManifests")
      .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
      .unique()) ?? room
  );
}
