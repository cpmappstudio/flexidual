import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { getLiveSessionHardEnd } from "../../lib/live-session-policy";

export async function scheduleLiveReconciliation(
  ctx: MutationCtx,
  roomName: string,
  scheduledEnd: number,
  activationId: string,
  firstCheckAt = scheduledEnd,
) {
  await ctx.scheduler.runAt(
    Math.max(Date.now(), firstCheckAt),
    internal.livekit.reconcileLiveSession,
    { roomName, expectedActivationId: activationId },
  );
  await ctx.scheduler.runAt(
    Math.max(Date.now(), getLiveSessionHardEnd(scheduledEnd)),
    internal.livekit.reconcileLiveSession,
    { roomName, expectedActivationId: activationId },
  );
}
