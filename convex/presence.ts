import { Presence } from "@convex-dev/presence";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUserOrThrow } from "./users";
import { canAccessClass } from "./permissions";
import { isStudentEnrolled } from "./model/enrollments";
import { resolveStudentDashboardAccess } from "./model/studentDashboardAccess";

const presence = new Presence(components.presence);
const statusValidator = v.object({
  online: v.boolean(),
  lastDisconnected: v.number(),
});

// Each user owns one private presence room, shared by all their tabs/devices.
async function getStatus(ctx: QueryCtx, userId: Id<"users">) {
  const [status] = await presence.listRoom(ctx, userId, false, 1);
  return status
    ? { online: status.online, lastDisconnected: status.lastDisconnected }
    : null;
}

export const heartbeat = mutation({
  args: {
    roomId: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    interval: v.number(),
  },
  returns: v.object({ roomToken: v.string(), sessionToken: v.string() }),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    if (args.userId !== user._id || args.roomId !== user._id)
      throw new ConvexError("PERMISSION_DENIED");
    if (!args.sessionId || args.sessionId.length > 256)
      throw new ConvexError("INVALID_SESSION");
    return presence.heartbeat(
      ctx,
      user._id,
      user._id,
      `${user._id}:${args.sessionId}`,
      30_000,
    );
  },
});

// Required by the official hook. A room token never exposes another user's status.
export const list = query({
  args: { roomToken: v.string() },
  returns: v.array(v.object({ userId: v.string(), ...statusValidator.fields })),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const rows = await presence.list(ctx, args.roomToken, 1);
    return rows
      .filter((row) => row.userId === user._id)
      .map(({ userId, online, lastDisconnected }) => ({
        userId,
        online,
        lastDisconnected,
      }));
  },
});

export const disconnect = mutation({
  args: { sessionToken: v.string() },
  returns: v.null(),
  // The secret session token authorizes unload/sendBeacon, which has no auth header.
  handler: (ctx, args) => presence.disconnect(ctx, args.sessionToken),
});

export const studentProfile = query({
  args: { studentId: v.optional(v.string()), orgSlug: v.optional(v.string()) },
  returns: v.union(statusValidator, v.null()),
  handler: async (ctx, args) => {
    const access = await resolveStudentDashboardAccess(ctx, args);
    return access ? getStatus(ctx, access.student._id) : null;
  },
});

export const chatParticipants = query({
  args: { classId: v.id("classes"), userIds: v.array(v.id("users")) },
  returns: v.array(
    v.object({
      userId: v.id("users"),
      status: v.union(statusValidator, v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.userIds.length > 100) throw new ConvexError("TOO_MANY_USERS");
    const viewer = await getCurrentUserOrThrow(ctx);
    const course = await ctx.db.get("classes", args.classId);
    if (
      !course ||
      course.chatArchivedAt !== undefined ||
      !(await canAccessClass(ctx, viewer._id, course))
    )
      return [];
    const results = await Promise.all(
      [...new Set(args.userIds)].map(async (userId) => {
        if (
          userId !== course.teacherId &&
          userId !== course.tutorId &&
          !(await isStudentEnrolled(ctx, course, userId))
        )
          return null;
        return { userId, status: await getStatus(ctx, userId) };
      }),
    );
    return results.filter((row) => row !== null);
  },
});
