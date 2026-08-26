export const STUDENT_ONLY_GRACE_MS = 5 * 60 * 1000;
export const LIVE_EXTENSION_BLOCK_MS = 10 * 60 * 1000;
export const LIVE_EXTENSION_PROMPT_LEAD_MS = 2 * 60 * 1000;
export const LIVE_DECISION_WINDOW_MS = 60 * 1000;
export const MAX_LIVE_OVERRUN_MS = 60 * 60 * 1000;

export type LiveParticipantSnapshot = {
  responsibleCount: number;
  studentCount: number;
};

export function getLiveParticipantSnapshot(
  participantMetadata: Array<string | undefined>,
  expectedLeaderUserId?: string,
): LiveParticipantSnapshot {
  let responsibleCount = 0;
  let studentCount = 0;

  for (const serializedMetadata of participantMetadata) {
    if (!serializedMetadata) continue;

    try {
      const metadata = JSON.parse(serializedMetadata) as {
        role?: string;
        userId?: string;
        convexUserId?: string;
        isCompanion?: boolean;
        roomAdmin?: boolean;
      };
      if (!metadata.userId || metadata.isCompanion) continue;

      const isExpectedLeader =
        expectedLeaderUserId !== undefined &&
        metadata.convexUserId === expectedLeaderUserId;
      const isLegacyResponsible =
        expectedLeaderUserId === undefined &&
        (metadata.roomAdmin === true ||
          (metadata.roomAdmin === undefined &&
            (metadata.role === "teacher" || metadata.role === "admin")));
      if (isExpectedLeader || isLegacyResponsible) {
        responsibleCount += 1;
      } else if (metadata.role === "student") {
        studentCount += 1;
      }
    } catch {
      // Ignore technical participants and clients without application metadata.
    }
  }

  return { responsibleCount, studentCount };
}

export type LiveSessionPolicyInput = {
  now: number;
  scheduledEnd: number;
  leaderAbsentSince?: number;
  extensionEndsAt?: number;
  decisionEndsAt?: number;
  participants: LiveParticipantSnapshot;
};

export type LiveSessionPolicyDecision =
  | {
      action: "end";
      reason:
        | "decision-timeout"
        | "empty-room"
        | "hard-limit"
        | "leader-grace-expired"
        | "no-responsible"
        | "no-students";
    }
  | {
      action: "continue";
      nextCheckAt: number;
      leaderAbsentSince?: number;
      extensionEndsAt?: number;
      decisionEndsAt?: number;
    };

export function getLiveSessionHardEnd(scheduledEnd: number) {
  return scheduledEnd + MAX_LIVE_OVERRUN_MS;
}

export function getEffectiveLiveEnd(
  scheduledEnd: number,
  extensionEndsAt?: number,
) {
  return extensionEndsAt ?? scheduledEnd;
}

export function evaluateLiveSession(
  input: LiveSessionPolicyInput,
): LiveSessionPolicyDecision {
  const hardEnd = getLiveSessionHardEnd(input.scheduledEnd);
  const effectiveEnd = Math.min(
    getEffectiveLiveEnd(input.scheduledEnd, input.extensionEndsAt),
    hardEnd,
  );

  if (input.now >= hardEnd) {
    return { action: "end", reason: "hard-limit" };
  }

  const recognizedParticipants =
    input.participants.responsibleCount + input.participants.studentCount;
  if (recognizedParticipants === 0) {
    return { action: "end", reason: "empty-room" };
  }

  if (
    input.now < effectiveEnd &&
    input.participants.responsibleCount === 0 &&
    input.participants.studentCount > 0
  ) {
    const leaderAbsentSince = input.leaderAbsentSince ?? input.now;
    const graceEndsAt = Math.min(
      leaderAbsentSince + STUDENT_ONLY_GRACE_MS,
      effectiveEnd,
    );

    if (input.now >= graceEndsAt) {
      return { action: "end", reason: "leader-grace-expired" };
    }

    return {
      action: "continue",
      nextCheckAt: graceEndsAt,
      leaderAbsentSince,
      extensionEndsAt: input.extensionEndsAt,
    };
  }

  if (input.now < effectiveEnd) {
    return {
      action: "continue",
      nextCheckAt: effectiveEnd,
      extensionEndsAt: input.extensionEndsAt,
    };
  }

  if (input.participants.responsibleCount === 0) {
    return { action: "end", reason: "no-responsible" };
  }

  if (input.participants.studentCount === 0) {
    return { action: "end", reason: "no-students" };
  }

  if (input.decisionEndsAt && input.now >= input.decisionEndsAt) {
    return { action: "end", reason: "decision-timeout" };
  }

  const decisionEndsAt =
    input.decisionEndsAt ??
    Math.min(input.now + LIVE_DECISION_WINDOW_MS, hardEnd);

  return {
    action: "continue",
    nextCheckAt: decisionEndsAt,
    extensionEndsAt: input.extensionEndsAt,
    decisionEndsAt,
  };
}

export function getConfirmedExtensionEnd(
  currentEffectiveEnd: number,
  scheduledEnd: number,
) {
  return Math.min(
    currentEffectiveEnd + LIVE_EXTENSION_BLOCK_MS,
    getLiveSessionHardEnd(scheduledEnd),
  );
}
