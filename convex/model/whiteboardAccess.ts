import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { canManageRoom } from "../permissions";
import { getCurrentUserOrThrow, getCurrentUserFromAuth } from "../users";
import { canAccessSchedule } from "./scheduleAccess";
import { findEventRoom, getEventRoomAccess } from "./eventRoomAccess";
import { canAccessEvent } from "./eventAccess";

export async function getWhiteboardRoom(
  ctx: QueryCtx | MutationCtx,
  roomName: string,
) {
  const schedule = await ctx.db
    .query("classSchedule")
    .withIndex("by_room", (q) => q.eq("roomName", roomName))
    .first();
  if (schedule) return { kind: "class" as const, schedule };
  const eventRoom = await findEventRoom(ctx, roomName);
  return eventRoom
    ? {
        kind: "event" as const,
        schedule: eventRoom.occurrence,
        event: eventRoom.event,
      }
    : null;
}

export async function canManageWhiteboardRoom(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  room: NonNullable<Awaited<ReturnType<typeof getWhiteboardRoom>>>,
) {
  return room.kind === "class"
    ? await canManageRoom(ctx, userId, room.schedule.roomName)
    : (await getEventRoomAccess(ctx, userId, room.event, room.schedule))
        .roomAdmin;
}

export async function canReadWhiteboardRoom(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  room: NonNullable<Awaited<ReturnType<typeof getWhiteboardRoom>>>,
) {
  return room.kind === "class"
    ? await canAccessSchedule(ctx, userId, room.schedule)
    : await canAccessEvent(ctx, userId, room.event);
}

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
  const room = await getWhiteboardRoom(ctx, roomName);
  if (
    !room ||
    room.schedule.status !== "active" ||
    !room.schedule.isLive ||
    !(await canManageWhiteboardRoom(ctx, user._id, room))
  ) {
    throw new ConvexError("PERMISSION_DENIED");
  }
  return { ...room, user };
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
  const room = await getWhiteboardRoom(ctx, roomName);
  if (
    !room ||
    room.schedule.status !== "active" ||
    !room.schedule.isLive ||
    !(await canReadWhiteboardRoom(ctx, user._id, room))
  )
    throw new ConvexError("PERMISSION_DENIED");
}
