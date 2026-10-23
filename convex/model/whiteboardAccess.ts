import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { canManageRoom } from "../permissions";
import { getCurrentUserOrThrow, getCurrentUserFromAuth } from "../users";
import { canAccessSchedule } from "./scheduleAccess";

export function hasWhiteboardRecordingAccess(
  recordingToken: string | undefined,
  storedToken: string | undefined,
) {
  return Boolean(
    recordingToken && storedToken && recordingToken === storedToken,
  );
}

export async function requireLiveWhiteboardManager(
  ctx: QueryCtx | MutationCtx,
  roomName: string,
) {
  const user = await getCurrentUserOrThrow(ctx);
  const schedule = await ctx.db
    .query("classSchedule")
    .withIndex("by_room", (q) => q.eq("roomName", roomName))
    .first();
  if (
    !schedule ||
    schedule.status !== "active" ||
    !schedule.isLive ||
    !(await canManageRoom(ctx, user._id, roomName))
  ) {
    throw new ConvexError("PERMISSION_DENIED");
  }
  return { schedule, user };
}

export async function requireLiveWhiteboardReader(
  ctx: QueryCtx | MutationCtx,
  roomName: string,
  recordingToken: string | undefined,
  storedRecordingToken: string | undefined,
) {
  const user = await getCurrentUserFromAuth(ctx);
  if (!user) {
    if (hasWhiteboardRecordingAccess(recordingToken, storedRecordingToken))
      return;
    throw new ConvexError("PERMISSION_DENIED");
  }
  const schedule = await ctx.db
    .query("classSchedule")
    .withIndex("by_room", (q) => q.eq("roomName", roomName))
    .first();
  if (
    !schedule ||
    schedule.status !== "active" ||
    !schedule.isLive ||
    !(await canAccessSchedule(ctx, user._id, schedule))
  )
    throw new ConvexError("PERMISSION_DENIED");
}
