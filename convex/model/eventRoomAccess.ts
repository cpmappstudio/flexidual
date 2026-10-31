import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { canAccessEvent, canManageEvent, isEventTeacher } from "./eventAccess";
import type { SessionLeaderRole } from "./sessionLeadership";

type DbCtx = QueryCtx | MutationCtx;

export async function hasActiveEventRoom(ctx: DbCtx, eventId: Id<"events">) {
  return Boolean(
    await ctx.db
      .query("eventOccurrences")
      .withIndex("by_eventId_and_status_and_scheduledStart", (q) =>
        q.eq("eventId", eventId).eq("status", "active"),
      )
      .first(),
  );
}

export async function assertNoActiveEventRoom(
  ctx: DbCtx,
  eventId: Id<"events">,
) {
  if (await hasActiveEventRoom(ctx, eventId))
    throw new ConvexError("EVENT_ROOM_ACTIVE");
}

export async function findEventRoom(ctx: DbCtx, roomName: string) {
  const occurrence = await ctx.db
    .query("eventOccurrences")
    .withIndex("by_room", (q) => q.eq("roomName", roomName))
    .unique();
  if (!occurrence) return null;
  const event = await ctx.db.get("events", occurrence.eventId);
  return event ? { occurrence, event } : null;
}

export async function getEventLeaderRole(
  ctx: DbCtx,
  userId: Id<"users">,
  event: Doc<"events">,
): Promise<SessionLeaderRole | null> {
  if (
    (event.responsibleId === userId || event.teacherIds.includes(userId)) &&
    (await isEventTeacher(ctx, userId, event))
  )
    return "teacher";
  if (!(await canManageEvent(ctx, userId, event))) return null;
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  if (
    assignments.some(
      (item) => item.role === "superadmin" && item.orgType === "system",
    )
  )
    return "superadmin";
  if (
    assignments.some(
      (item) =>
        item.role === "admin" &&
        item.orgType === "school" &&
        item.orgId === event.schoolId,
    )
  )
    return "admin";
  return "principal";
}

export async function getEventRoomAccess(
  ctx: DbCtx,
  userId: Id<"users">,
  event: Doc<"events">,
  occurrence: Doc<"eventOccurrences">,
) {
  const authorized = await canAccessEvent(ctx, userId, event);
  const leadershipRole = authorized
    ? await getEventLeaderRole(ctx, userId, event)
    : null;
  const isSessionLeader = authorized && occurrence.sessionLeaderId === userId;
  const roomAdmin = leadershipRole !== null;
  return {
    authorized,
    roomAdmin,
    isPrimaryTeacher: leadershipRole === "teacher",
    isSessionLeader,
    leadershipRole,
    canJoinEarly: roomAdmin,
    computedRole:
      leadershipRole === "teacher"
        ? ("teacher" as const)
        : roomAdmin
          ? ("admin" as const)
          : ("student" as const),
  };
}
