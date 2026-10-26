import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { canAccessClass, getCourseChatCapabilities } from "../permissions";
import {
  canAttachToCourseChat,
  canManageCourseChatContent,
  isChatMutedForUser,
} from "./courseChatAccess";
import { getBroadcastRole, getBroadcastWriter } from "./broadcastAccess";
import { chatTarget, type ChatTarget } from "./chatTarget";

type Ctx = QueryCtx | MutationCtx;
export type ChatSource =
  | { kind: "course"; data: Doc<"classes"> }
  | { kind: "broadcast"; data: Doc<"broadcasts"> };

export async function getChatSource(
  ctx: Ctx,
  target: ChatTarget,
): Promise<ChatSource | null> {
  chatTarget(target);
  if (target.broadcastId) {
    const data = await ctx.db.get("broadcasts", target.broadcastId);
    return data ? { kind: "broadcast", data } : null;
  }
  const data = await ctx.db.get("classes", target.classId!);
  return data ? { kind: "course", data } : null;
}

export async function chatCapabilities(
  ctx: Ctx,
  source: Extract<ChatSource, { kind: "broadcast" }>,
  userId: Id<"users">,
) {
  const role = await getBroadcastRole(ctx, userId, source.data);
  const manage = role === "admin";
  const writer =
    role === "teacher" &&
    (await getBroadcastWriter(ctx, source.data._id, userId))?.enabled === true;
  const write =
    manage ||
    (writer && !source.data.professorsMuted && !source.data.chatDisabled);
  return {
    read: role !== null,
    write,
    attach: write && (manage || source.data.professorAttachmentsEnabled),
    pin: manage,
  };
}

export function sourceTarget(source: ChatSource): ChatTarget {
  return source.kind === "course"
    ? { classId: source.data._id }
    : { broadcastId: source.data._id };
}

export async function chatPermission(
  ctx: Ctx,
  source: ChatSource,
  userId: Id<"users">,
  permission: "read" | "pin" | "manage" | "moderate",
) {
  if (source.kind === "broadcast") {
    const role = await getBroadcastRole(ctx, userId, source.data);
    return permission === "read" ? role !== null : role === "admin";
  }
  if (permission === "read") return canAccessClass(ctx, userId, source.data);
  if (permission === "pin")
    return canManageCourseChatContent(ctx, source.data, userId);
  const caps = await getCourseChatCapabilities(ctx, userId, source.data);
  return permission === "manage" ? caps.canDisable : caps.canModerate;
}

export async function patchChat(
  ctx: MutationCtx,
  source: ChatSource,
  fields: {
    chatArchivedAt?: number;
    chatNotificationsClearedThrough?: number;
    chatLastPinnedAt?: number;
    chatDisabled?: boolean;
  },
) {
  if (source.kind === "course")
    await ctx.db.patch("classes", source.data._id, fields);
  else await ctx.db.patch("broadcasts", source.data._id, fields);
}

export function requireActiveChat(source: ChatSource) {
  if (source.data.chatArchivedAt !== undefined)
    throw new ConvexError("CHAT_ARCHIVED");
}

export function chatMessages(
  ctx: Ctx,
  target: ChatTarget,
  range?: { after?: number; through?: number },
) {
  chatTarget(target);
  return target.broadcastId
    ? ctx.db
        .query("courseChatMessages")
        .withIndex("by_broadcastId", (q) =>
          range?.after !== undefined
            ? q
                .eq("broadcastId", target.broadcastId)
                .gt("_creationTime", range.after)
            : range?.through !== undefined
              ? q
                  .eq("broadcastId", target.broadcastId)
                  .lte("_creationTime", range.through)
              : q.eq("broadcastId", target.broadcastId),
        )
    : ctx.db
        .query("courseChatMessages")
        .withIndex("by_class", (q) =>
          range?.after !== undefined
            ? q.eq("classId", target.classId).gt("_creationTime", range.after)
            : range?.through !== undefined
              ? q
                  .eq("classId", target.classId)
                  .lte("_creationTime", range.through)
              : q.eq("classId", target.classId),
        );
}

export function pinnedChatMessages(ctx: Ctx, source: ChatSource) {
  const after =
    source.data.chatArchivedAt === undefined ? 0 : Number.MAX_SAFE_INTEGER;
  return source.kind === "broadcast"
    ? ctx.db
        .query("courseChatMessages")
        .withIndex("by_broadcastId_and_pinnedAt", (q) =>
          q.eq("broadcastId", source.data._id).gt("pinnedAt", after),
        )
    : ctx.db
        .query("courseChatMessages")
        .withIndex("by_classId_and_pinnedAt", (q) =>
          q.eq("classId", source.data._id).gt("pinnedAt", after),
        );
}

export async function requireChatWriter(
  ctx: Ctx,
  target: ChatTarget,
  userId: Id<"users">,
  attach = false,
) {
  const source = await getChatSource(ctx, target);
  if (!source) throw new ConvexError("PERMISSION_DENIED");
  if (!(await chatPermission(ctx, source, userId, "read")))
    throw new ConvexError("PERMISSION_DENIED");
  requireActiveChat(source);
  if (source.kind === "course") {
    if (await isChatMutedForUser(ctx, source.data, userId))
      throw new ConvexError("CHAT_MUTED");
    if (attach && !(await canAttachToCourseChat(ctx, source.data, userId)))
      throw new ConvexError("CHAT_ATTACHMENTS_DISABLED");
  } else {
    const caps = await chatCapabilities(ctx, source, userId);
    if (!caps.write) throw new ConvexError("CHAT_MUTED");
    if (attach && !caps.attach)
      throw new ConvexError("CHAT_ATTACHMENTS_DISABLED");
  }
  return { source };
}
