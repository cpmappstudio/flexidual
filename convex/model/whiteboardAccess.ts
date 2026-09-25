import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { canManageRoom } from "../permissions";
import { getCurrentUserOrThrow } from "../users";

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
