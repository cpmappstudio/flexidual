import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { v, type Infer } from "convex/values";

export const liveDecisionSnapshotValidator = v.object({
  scheduledEnd: v.number(),
  sessionLeaderId: v.optional(v.id("users")),
  liveLeaderAbsentSince: v.optional(v.number()),
  liveExtensionEndsAt: v.optional(v.number()),
  liveDecisionEndsAt: v.optional(v.number()),
});
export type LiveDecisionSnapshot = Infer<typeof liveDecisionSnapshotValidator>;

export const liveRoomActivationFields = {
  scheduleId: v.optional(v.id("classSchedule")),
  eventOccurrenceId: v.optional(v.id("eventOccurrences")),
  activationId: v.string(),
  roomName: v.string(),
  liveRoomName: v.string(),
  status: v.union(
    v.literal("active"),
    v.literal("closing"),
    v.literal("closed"),
  ),
  claimId: v.optional(v.string()),
  cleanupJobId: v.optional(v.id("_scheduled_functions")),
  cleanupAttempts: v.number(),
  nextCleanupAt: v.number(),
  cleanupError: v.optional(v.string()),
  recordingJobId: v.optional(v.id("_scheduled_functions")),
  recordingToken: v.optional(v.string()),
  reconcileJobId: v.optional(v.id("_scheduled_functions")),
  reconcileGeneration: v.optional(v.number()),
  reconcileAgain: v.optional(v.boolean()),
};

export function getLiveActivationId(schedule: Doc<"classSchedule">) {
  return (
    schedule.liveActivationId ??
    `legacy:${schedule._id}:${
      schedule.sessionReopenedAt ??
      schedule.sessionStartedAt ??
      schedule._creationTime
    }`
  );
}

export function getLiveRoomName(
  schedule: Pick<
    Doc<"classSchedule"> | Doc<"eventOccurrences">,
    "liveRoomName" | "roomName"
  >,
) {
  return schedule.liveRoomName ?? schedule.roomName;
}

export function getEventActivationId(occurrence: Doc<"eventOccurrences">) {
  return occurrence.liveActivationId ?? `event:${occurrence._id}`;
}

export function getEventLiveRoomName(occurrence: Doc<"eventOccurrences">) {
  return occurrence.liveRoomName ?? occurrence.roomName;
}

export async function ensureEventActivation(
  ctx: MutationCtx,
  occurrence: Doc<"eventOccurrences">,
) {
  const activationId = getEventActivationId(occurrence);
  const existing = await findLiveActivation(ctx, activationId);
  if (existing) return existing;
  const id = await ctx.db.insert("liveRoomActivations", {
    eventOccurrenceId: occurrence._id,
    activationId,
    roomName: occurrence.roomName,
    liveRoomName: getEventLiveRoomName(occurrence),
    status: "active",
    cleanupAttempts: 0,
    nextCleanupAt: 0,
  });
  return (await ctx.db.get("liveRoomActivations", id))!;
}

export async function ensureLiveActivation(
  ctx: MutationCtx,
  schedule: Doc<"classSchedule">,
) {
  const activationId = getLiveActivationId(schedule);
  const existing = await findLiveActivation(ctx, activationId);
  if (existing) return existing;
  const id = await ctx.db.insert("liveRoomActivations", {
    scheduleId: schedule._id,
    activationId,
    roomName: schedule.roomName,
    liveRoomName: getLiveRoomName(schedule),
    status: "active",
    cleanupAttempts: 0,
    nextCleanupAt: 0,
  });
  return (await ctx.db.get("liveRoomActivations", id))!;
}

export function findLiveActivation(
  ctx: QueryCtx | MutationCtx,
  activationId: string,
) {
  return ctx.db
    .query("liveRoomActivations")
    .withIndex("by_activation_id", (q) => q.eq("activationId", activationId))
    .unique();
}
