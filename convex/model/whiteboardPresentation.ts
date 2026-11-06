import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { getWhiteboardRoom } from "./whiteboardAccess";

/** Resolve only the selected page of this course, never the rest of its notebook. */
export async function resolveWhiteboardPresentation(
  ctx: QueryCtx | MutationCtx,
  room: Doc<"whiteboardSceneManifests">,
  authorizedRoom?: NonNullable<Awaited<ReturnType<typeof getWhiteboardRoom>>>,
) {
  if (!room.presentedPageId) return room;
  const page = await ctx.db.get("courseNotebookPages", room.presentedPageId);
  const roomName = room.roomName;
  // Authenticated readers/managers already loaded this room in the same
  // transaction. Recording-token readers still resolve and validate it here.
  const schedule = authorizedRoom
    ? authorizedRoom.kind === "class"
      ? authorizedRoom.schedule
      : null
    : roomName
      ? await ctx.db
          .query("classSchedule")
          .withIndex("by_room", (q) => q.eq("roomName", roomName))
          .first()
      : null;
  if (
    !page ||
    !schedule ||
    schedule.roomName !== roomName ||
    page.classId !== schedule.classId
  )
    return room;
  const course = await ctx.db.get("classes", page.classId);
  if (!course || course.notebookArchivedAt !== undefined) return room;
  return (
    (await ctx.db
      .query("whiteboardSceneManifests")
      .withIndex("by_pageId", (q) => q.eq("pageId", page._id))
      .unique()) ?? room
  );
}
