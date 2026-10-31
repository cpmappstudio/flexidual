import type { MutationCtx } from "../_generated/server";
import { deleteWhiteboardManifest } from "./whiteboardSceneStorage";

export async function deleteWhiteboardSession(
  ctx: MutationCtx,
  roomName: string,
) {
  await deleteWhiteboardManifest(ctx, roomName);
  const whiteboard = await ctx.db
    .query("whiteboardSessions")
    .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
    .unique();
  if (!whiteboard) return;
  await Promise.allSettled(
    Object.values(whiteboard.fileRefs ?? {}).map((file) =>
      ctx.storage.delete(file.storageId),
    ),
  );
  await ctx.db.delete("whiteboardSessions", whiteboard._id);
}
