import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";

// Optional fields preserve existing course records and API callers without a migration.
export const chatTargetFields = {
  classId: v.optional(v.id("classes")),
  broadcastId: v.optional(v.id("broadcasts")),
};

export type ChatTarget = {
  classId?: Id<"classes">;
  broadcastId?: Id<"broadcasts">;
};

export function chatTarget(value: ChatTarget): ChatTarget {
  if (Boolean(value.classId) === Boolean(value.broadcastId))
    throw new ConvexError("INVALID_CHAT_TARGET");
  return value.broadcastId
    ? { broadcastId: value.broadcastId }
    : { classId: value.classId! };
}

export function sameChat(a: ChatTarget, b: ChatTarget) {
  return a.classId === b.classId && a.broadcastId === b.broadcastId;
}
