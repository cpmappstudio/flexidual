import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateLiveSession,
  canReopenLiveSession,
  canStartLiveSession,
  getConfirmedExtensionEnd,
  getEffectiveLiveEnd,
  getLiveSessionReopenUntil,
  getLiveSessionStartAvailableAt,
  getLiveParticipantSnapshot,
  LIVE_DECISION_WINDOW_MS,
  LIVE_EXTENSION_BLOCK_MS,
  MAX_LIVE_OVERRUN_MS,
  LIVE_SESSION_REOPEN_GRACE_MS,
  STUDENT_ONLY_GRACE_MS,
} from "../lib/live-session-policy";

const scheduledEnd = 1_000_000;

test("opens initial start exactly one hour before the scheduled class", () => {
  const scheduledStart = scheduledEnd - 60 * 60 * 1000;
  const availability = {
    scheduledStart,
    scheduledEnd,
    status: "scheduled" as const,
    isLive: false,
  };

  assert.equal(
    getLiveSessionStartAvailableAt(scheduledStart),
    scheduledStart - 60 * 60 * 1000,
  );
  assert.equal(
    canStartLiveSession({
      ...availability,
      now: getLiveSessionStartAvailableAt(scheduledStart) - 1,
    }),
    false,
  );
  assert.equal(
    canStartLiveSession({
      ...availability,
      now: getLiveSessionStartAvailableAt(scheduledStart),
    }),
    true,
  );
  assert.equal(
    canStartLiveSession({ ...availability, now: scheduledEnd }),
    false,
  );
});

test("reopens only a previously started completed class before its deadline", () => {
  const scheduledStart = scheduledEnd - 60 * 60 * 1000;
  const sessionReopenUntil = getLiveSessionReopenUntil(scheduledEnd);
  const availability = {
    scheduledStart,
    scheduledEnd,
    status: "completed" as const,
    isLive: false,
    sessionStartedAt: scheduledStart,
    sessionReopenUntil,
  };

  assert.equal(sessionReopenUntil, scheduledEnd + LIVE_SESSION_REOPEN_GRACE_MS);
  assert.equal(
    canReopenLiveSession({
      ...availability,
      now: sessionReopenUntil - 1,
    }),
    true,
  );
  assert.equal(
    canReopenLiveSession({ ...availability, now: sessionReopenUntil }),
    false,
  );
  assert.equal(
    canReopenLiveSession({
      ...availability,
      now: scheduledEnd,
      sessionStartedAt: undefined,
    }),
    false,
  );
});

test("uses the effective extension end without exceeding the hard limit", () => {
  assert.equal(
    getLiveSessionReopenUntil(scheduledEnd, scheduledEnd + 20 * 60 * 1000),
    scheduledEnd + 30 * 60 * 1000,
  );
  assert.equal(
    getLiveSessionReopenUntil(scheduledEnd, scheduledEnd + MAX_LIVE_OVERRUN_MS),
    scheduledEnd + MAX_LIVE_OVERRUN_MS,
  );
});

test("classifies responsible people and students from LiveKit metadata", () => {
  assert.deepEqual(
    getLiveParticipantSnapshot([
      JSON.stringify({ role: "admin", userId: "admin_1", roomAdmin: true }),
      JSON.stringify({ role: "student", userId: "student_1" }),
      JSON.stringify({ role: "student", userId: "student_2" }),
    ]),
    { responsibleCount: 1, studentCount: 2 },
  );
});

test("ignores companion devices and technical participants", () => {
  assert.deepEqual(
    getLiveParticipantSnapshot([
      JSON.stringify({
        role: "admin",
        userId: "admin_companion",
        roomAdmin: true,
        isCompanion: true,
      }),
      JSON.stringify({ role: "agent" }),
      "invalid-json",
      undefined,
    ]),
    { responsibleCount: 0, studentCount: 0 },
  );
});

test("counts only the persisted leader when one is defined", () => {
  assert.deepEqual(
    getLiveParticipantSnapshot(
      [
        JSON.stringify({
          role: "admin",
          userId: "clerk_admin",
          convexUserId: "admin_1",
          roomAdmin: true,
        }),
        JSON.stringify({
          role: "teacher",
          userId: "clerk_teacher",
          convexUserId: "teacher_1",
          roomAdmin: true,
        }),
        JSON.stringify({ role: "student", userId: "student_1" }),
      ],
      "teacher_1",
    ),
    { responsibleCount: 1, studentCount: 1 },
  );
});

test("does not let an observing administrator replace an absent leader", () => {
  assert.deepEqual(
    getLiveParticipantSnapshot(
      [
        JSON.stringify({
          role: "admin",
          userId: "clerk_admin",
          convexUserId: "admin_1",
          roomAdmin: true,
        }),
        JSON.stringify({ role: "student", userId: "student_1" }),
      ],
      "teacher_1",
    ),
    { responsibleCount: 0, studentCount: 1 },
  );
});

test("uses the scheduled end until an extension is confirmed", () => {
  assert.equal(getEffectiveLiveEnd(scheduledEnd), scheduledEnd);
  assert.equal(
    getEffectiveLiveEnd(scheduledEnd, scheduledEnd + LIVE_EXTENSION_BLOCK_MS),
    scheduledEnd + LIVE_EXTENSION_BLOCK_MS,
  );
});

test("gives students five minutes when the leader leaves during class", () => {
  const now = scheduledEnd - 10 * 60 * 1000;

  assert.deepEqual(
    evaluateLiveSession({
      now,
      scheduledEnd,
      participants: { responsibleCount: 0, studentCount: 2 },
    }),
    {
      action: "continue",
      nextCheckAt: now + STUDENT_ONLY_GRACE_MS,
      leaderAbsentSince: now,
      extensionEndsAt: undefined,
    },
  );
});

test("opens a five-minute decision window instead of extending automatically", () => {
  assert.equal(LIVE_DECISION_WINDOW_MS, 5 * 60 * 1000);
  assert.deepEqual(
    evaluateLiveSession({
      now: scheduledEnd,
      scheduledEnd,
      participants: { responsibleCount: 1, studentCount: 4 },
    }),
    {
      action: "continue",
      nextCheckAt: scheduledEnd + LIVE_DECISION_WINDOW_MS,
      extensionEndsAt: undefined,
      decisionEndsAt: scheduledEnd + LIVE_DECISION_WINDOW_MS,
    },
  );
});

test("keeps an existing decision deadline stable", () => {
  const decisionEndsAt = scheduledEnd + LIVE_DECISION_WINDOW_MS;
  assert.deepEqual(
    evaluateLiveSession({
      now: scheduledEnd + 30_000,
      scheduledEnd,
      decisionEndsAt,
      participants: { responsibleCount: 1, studentCount: 2 },
    }),
    {
      action: "continue",
      nextCheckAt: decisionEndsAt,
      extensionEndsAt: undefined,
      decisionEndsAt,
    },
  );
});

test("ends when the responsible person does not answer", () => {
  assert.deepEqual(
    evaluateLiveSession({
      now: scheduledEnd + LIVE_DECISION_WINDOW_MS,
      scheduledEnd,
      decisionEndsAt: scheduledEnd + LIVE_DECISION_WINDOW_MS,
      participants: { responsibleCount: 1, studentCount: 2 },
    }),
    { action: "end", reason: "decision-timeout" },
  );
});

test("ends at the scheduled end without a responsible person", () => {
  assert.deepEqual(
    evaluateLiveSession({
      now: scheduledEnd,
      scheduledEnd,
      participants: { responsibleCount: 0, studentCount: 2 },
    }),
    { action: "end", reason: "no-responsible" },
  );
});

test("ends at the scheduled end when no students remain", () => {
  assert.deepEqual(
    evaluateLiveSession({
      now: scheduledEnd,
      scheduledEnd,
      participants: { responsibleCount: 1, studentCount: 0 },
    }),
    { action: "end", reason: "no-students" },
  );
});

test("ends an empty room", () => {
  assert.deepEqual(
    evaluateLiveSession({
      now: scheduledEnd,
      scheduledEnd,
      participants: { responsibleCount: 0, studentCount: 0 },
    }),
    { action: "end", reason: "empty-room" },
  );
});

test("continues until the confirmed extension ends", () => {
  const extensionEndsAt = scheduledEnd + LIVE_EXTENSION_BLOCK_MS;
  assert.deepEqual(
    evaluateLiveSession({
      now: scheduledEnd + 2 * 60 * 1000,
      scheduledEnd,
      extensionEndsAt,
      participants: { responsibleCount: 1, studentCount: 2 },
    }),
    {
      action: "continue",
      nextCheckAt: extensionEndsAt,
      extensionEndsAt,
    },
  );
});

test("gives students five minutes when the responsible person leaves an extension", () => {
  const extensionEndsAt = scheduledEnd + LIVE_EXTENSION_BLOCK_MS;
  const now = scheduledEnd + 2 * 60 * 1000;

  assert.deepEqual(
    evaluateLiveSession({
      now,
      scheduledEnd,
      extensionEndsAt,
      participants: { responsibleCount: 0, studentCount: 2 },
    }),
    {
      action: "continue",
      nextCheckAt: now + STUDENT_ONLY_GRACE_MS,
      leaderAbsentSince: now,
      extensionEndsAt,
    },
  );
});

test("student-only grace never exceeds the confirmed extension", () => {
  const extensionEndsAt = scheduledEnd + LIVE_EXTENSION_BLOCK_MS;
  const now = extensionEndsAt - 2 * 60 * 1000;

  const decision = evaluateLiveSession({
    now,
    scheduledEnd,
    extensionEndsAt,
    participants: { responsibleCount: 0, studentCount: 1 },
  });

  assert.equal(decision.action, "continue");
  if (decision.action === "continue") {
    assert.equal(decision.nextCheckAt, extensionEndsAt);
  }
});

test("ends when the student-only grace period expires", () => {
  const extensionEndsAt = scheduledEnd + LIVE_EXTENSION_BLOCK_MS;
  const leaderAbsentSince = scheduledEnd + 60_000;

  assert.deepEqual(
    evaluateLiveSession({
      now: leaderAbsentSince + STUDENT_ONLY_GRACE_MS,
      scheduledEnd,
      extensionEndsAt,
      leaderAbsentSince,
      participants: { responsibleCount: 0, studentCount: 1 },
    }),
    { action: "end", reason: "leader-grace-expired" },
  );
});

test("clears the student-only grace state when a responsible person returns", () => {
  const decision = evaluateLiveSession({
    now: scheduledEnd + 3 * 60 * 1000,
    scheduledEnd,
    extensionEndsAt: scheduledEnd + LIVE_EXTENSION_BLOCK_MS,
    leaderAbsentSince: scheduledEnd + 60_000,
    participants: { responsibleCount: 1, studentCount: 2 },
  });

  assert.equal(decision.action, "continue");
  if (decision.action === "continue") {
    assert.equal(decision.leaderAbsentSince, undefined);
  }
});

test("adds ten-minute confirmation blocks without exceeding one hour", () => {
  assert.equal(
    getConfirmedExtensionEnd(scheduledEnd, scheduledEnd),
    scheduledEnd + LIVE_EXTENSION_BLOCK_MS,
  );
  assert.equal(
    getConfirmedExtensionEnd(
      scheduledEnd + MAX_LIVE_OVERRUN_MS - 5 * 60 * 1000,
      scheduledEnd,
    ),
    scheduledEnd + MAX_LIVE_OVERRUN_MS,
  );
});

test("enforces the absolute one-hour limit", () => {
  assert.deepEqual(
    evaluateLiveSession({
      now: scheduledEnd + MAX_LIVE_OVERRUN_MS,
      scheduledEnd,
      extensionEndsAt: scheduledEnd + MAX_LIVE_OVERRUN_MS,
      participants: { responsibleCount: 1, studentCount: 1 },
    }),
    { action: "end", reason: "hard-limit" },
  );
});
