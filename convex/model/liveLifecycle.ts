import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

export const liveLifecycleSnapshotValidator = v.object({
  scheduledEnd: v.number(),
  sessionStartedAt: v.union(v.number(), v.null()),
  sessionLeaderId: v.union(v.id("users"), v.null()),
  sessionLeaderSince: v.union(v.number(), v.null()),
  liveLeaderAbsentSince: v.union(v.number(), v.null()),
  liveExtensionEndsAt: v.union(v.number(), v.null()),
  liveDecisionEndsAt: v.union(v.number(), v.null()),
});

export function getLiveLifecycleSnapshot(
  session: Pick<
    Doc<"classSchedule">,
    | "scheduledEnd"
    | "sessionStartedAt"
    | "sessionLeaderId"
    | "sessionLeaderSince"
    | "liveLeaderAbsentSince"
    | "liveExtensionEndsAt"
    | "liveDecisionEndsAt"
  >,
) {
  return {
    scheduledEnd: session.scheduledEnd,
    sessionStartedAt: session.sessionStartedAt ?? null,
    sessionLeaderId: session.sessionLeaderId ?? null,
    sessionLeaderSince: session.sessionLeaderSince ?? null,
    liveLeaderAbsentSince: session.liveLeaderAbsentSince ?? null,
    liveExtensionEndsAt: session.liveExtensionEndsAt ?? null,
    liveDecisionEndsAt: session.liveDecisionEndsAt ?? null,
  };
}

export function matchesLiveLifecycleSnapshot(
  session: Parameters<typeof getLiveLifecycleSnapshot>[0],
  expected: ReturnType<typeof getLiveLifecycleSnapshot>,
) {
  const current = getLiveLifecycleSnapshot(session);
  return Object.entries(expected).every(
    ([key, value]) => current[key as keyof typeof current] === value,
  );
}
