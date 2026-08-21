import assert from "node:assert/strict";
import test from "node:test";
import type { Id } from "../convex/_generated/dataModel";
import { getCalendarCancellationCapabilities } from "../components/calendar/calendar-cancellation";

const teacherId = "teacher" as Id<"users">;
const future = Date.UTC(2026, 7, 24, 14);
const now = Date.UTC(2026, 7, 20, 17);

test("the assigned teacher can cancel only one future scheduled class", () => {
  assert.deepEqual(
    getCalendarCancellationCapabilities({
      canManageSeries: false,
      currentUserId: teacherId,
      teacherId,
      status: "scheduled",
      start: future,
      now,
      isLive: false,
      isRecurring: true,
    }),
    { canCancelOccurrence: true, canCancelSeries: false },
  );
});

test("course managers can cancel an occurrence or its future series", () => {
  assert.deepEqual(
    getCalendarCancellationCapabilities({
      canManageSeries: true,
      currentUserId: "admin" as Id<"users">,
      teacherId,
      status: "scheduled",
      start: future,
      now,
      isLive: false,
      isRecurring: true,
    }),
    { canCancelOccurrence: true, canCancelSeries: true },
  );
});

test("past, active, live, and cancelled classes cannot be cancelled", () => {
  for (const state of [
    { status: "scheduled" as const, start: now - 1, isLive: false },
    { status: "active" as const, start: future, isLive: true },
    { status: "cancelled" as const, start: future, isLive: false },
  ]) {
    assert.deepEqual(
      getCalendarCancellationCapabilities({
        canManageSeries: true,
        currentUserId: "admin" as Id<"users">,
        teacherId,
        now,
        isRecurring: true,
        ...state,
      }),
      { canCancelOccurrence: false, canCancelSeries: false },
    );
  }
});
