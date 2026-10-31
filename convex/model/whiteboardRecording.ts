import type { MutationCtx } from "../_generated/server";
import { findWhiteboardManifest } from "./whiteboardSceneStorage";

// Compare each format independently: old webhooks must never revoke a newer token.
export async function revokeWhiteboardRecordingToken(
  ctx: MutationCtx,
  roomName: string,
  expectedToken: string,
) {
  const [session, manifest] = await Promise.all([
    ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique(),
    findWhiteboardManifest(ctx, roomName),
  ]);
  const revokeSession = session?.recordingToken === expectedToken;
  const revokeManifest = manifest?.recordingToken === expectedToken;
  if (session && revokeSession)
    await ctx.db.patch("whiteboardSessions", session._id, {
      recordingToken: undefined,
    });
  if (manifest && revokeManifest)
    await ctx.db.patch("whiteboardSceneManifests", manifest._id, {
      recordingToken: undefined,
    });
  return revokeSession || revokeManifest;
}

export async function clearWhiteboardRecordingTokens(
  ctx: MutationCtx,
  roomName: string,
) {
  const [session, manifest] = await Promise.all([
    ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique(),
    findWhiteboardManifest(ctx, roomName),
  ]);
  if (session?.recordingToken)
    await ctx.db.patch("whiteboardSessions", session._id, {
      recordingToken: undefined,
    });
  if (manifest?.recordingToken)
    await ctx.db.patch("whiteboardSceneManifests", manifest._id, {
      recordingToken: undefined,
    });
}
