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

test("students only enter an immediate, active, or live class", () => {
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
    "go-to-classroom",
  );
});

test("staff prepare future classes and enter live classes", () => {
  assert.equal(
    getCalendarEventPrimaryAction({ ...baseEvent, isStudent: false }),
    "prepare-room",
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
