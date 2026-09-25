import assert from "node:assert/strict";
import test from "node:test";
import { getCalendarEventPrimaryAction } from "../lib/calendar-event-action";

const now = Date.UTC(2026, 6, 28, 15);
const baseEvent = {
  now,
  start: now + 60 * 60 * 1000,
  end: now + 2 * 60 * 60 * 1000,
  status: "scheduled" as const,
  isLive: false,
  roomName: "class-room",
  canLeadSession: false,
};

test("past classes show a recording only when one is playable", () => {
  const pastEvent = {
    ...baseEvent,
    start: now - 2 * 60 * 60 * 1000,
    end: now - 60 * 60 * 1000,
  };

  assert.equal(
    getCalendarEventPrimaryAction({
      ...pastEvent,
      isStudent: true,
      hasRecording: true,
    }),
    "watch-recording",
  );
  assert.equal(
    getCalendarEventPrimaryAction({
      ...pastEvent,
      isStudent: false,
      hasRecording: false,
    }),
    null,
  );
});

test("students enter only while the class is live", () => {
  assert.equal(
    getCalendarEventPrimaryAction({ ...baseEvent, isStudent: true }),
    null,
  );
  assert.equal(
    getCalendarEventPrimaryAction({
      ...baseEvent,
      isStudent: true,
      start: now + 5 * 60 * 1000,
    }),
    null,
  );
  assert.equal(
    getCalendarEventPrimaryAction({
      ...baseEvent,
      isStudent: true,
      isLive: true,
      status: "active",
    }),
    "go-to-classroom",
  );
});

test("staff start only inside the one-hour window and enter live classes", () => {
  assert.equal(
    getCalendarEventPrimaryAction({ ...baseEvent, isStudent: false }),
    null,
  );
  assert.equal(
    getCalendarEventPrimaryAction({
      ...baseEvent,
      isStudent: false,
      canLeadSession: true,
      start: now + 60 * 60 * 1000,
    }),
    "start-live",
  );
  assert.equal(
    getCalendarEventPrimaryAction({
      ...baseEvent,
      isStudent: false,
      isLive: true,
    }),
    "enter-live",
  );
});

test("staff reopen a previously started class before the recovery deadline", () => {
  assert.equal(
    getCalendarEventPrimaryAction({
      ...baseEvent,
      isStudent: false,
      canLeadSession: true,
      start: now - 60 * 60 * 1000,
      end: now - 5 * 60 * 1000,
      status: "completed",
      sessionStartedAt: now - 60 * 60 * 1000,
      sessionReopenUntil: now + 5 * 60 * 1000,
    }),
    "reopen-live",
  );
  assert.equal(
    getCalendarEventPrimaryAction({
      ...baseEvent,
      isStudent: false,
      canLeadSession: true,
      start: now - 60 * 60 * 1000,
      end: now - 10 * 60 * 1000,
      status: "completed",
      sessionStartedAt: now - 60 * 60 * 1000,
      sessionReopenUntil: now,
    }),
    null,
  );
});

test("external classes open their platform for students and staff", () => {
  for (const sessionType of ["abeka", "ignitia"] as const) {
    assert.equal(
      getCalendarEventPrimaryAction({
        ...baseEvent,
        isStudent: true,
        roomName: undefined,
        sessionType,
      }),
      "open-external",
    );
    assert.equal(
      getCalendarEventPrimaryAction({
        ...baseEvent,
        isStudent: false,
        sessionType,
      }),
      "open-external",
    );
  }
});

test("students and staff can reenter a live class after its scheduled end", () => {
  const overrunEvent = {
    ...baseEvent,
    start: now - 2 * 60 * 60 * 1000,
    end: now - 30 * 60 * 1000,
    status: "active" as const,
    isLive: true,
  };

  assert.equal(
    getCalendarEventPrimaryAction({ ...overrunEvent, isStudent: true }),
    "go-to-classroom",
  );
  assert.equal(
    getCalendarEventPrimaryAction({ ...overrunEvent, isStudent: false }),
    "enter-live",
  );
});

test("cancelled classes and classes without rooms have no room action", () => {
  assert.equal(
    getCalendarEventPrimaryAction({
      ...baseEvent,
      isStudent: false,
      status: "cancelled",
    }),
    null,
  );
  assert.equal(
    getCalendarEventPrimaryAction({
      ...baseEvent,
      isStudent: false,
      roomName: undefined,
    }),
    null,
  );
});
