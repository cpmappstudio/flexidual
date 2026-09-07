import assert from "node:assert/strict";
import test from "node:test";
import {
  isLiveClassSession,
  isUpcomingClassSession,
} from "../lib/class-session";

const now = Date.UTC(2026, 8, 7, 16, 22);

test("LIVE requires an active broadcast, never just the scheduled time or presence", () => {
  for (const status of ["scheduled", "completed", "cancelled"] as const) {
    assert.equal(isLiveClassSession({ status, isLive: true }), false);
  }
  assert.equal(isLiveClassSession({ status: "active", isLive: false }), false);
  assert.equal(isLiveClassSession({ status: "active", isLive: true }), true);
  for (const sessionType of ["abeka", "ignitia"] as const) {
    assert.equal(
      isLiveClassSession({ status: "active", isLive: true, sessionType }),
      false,
    );
  }
});

test("upcoming excludes early closures but preserves real live extensions", () => {
  for (const status of ["completed", "cancelled"] as const) {
    assert.equal(
      isUpcomingClassSession({ status, isLive: true }, now + 60_000, now),
      false,
    );
  }
  assert.equal(
    isUpcomingClassSession({ status: "scheduled" }, now + 60_000, now),
    true,
  );
  assert.equal(
    isUpcomingClassSession({ status: "scheduled" }, now, now),
    false,
  );
  assert.equal(
    isUpcomingClassSession(
      { status: "active", isLive: true },
      now - 60_000,
      now,
    ),
    true,
  );
  assert.equal(
    isUpcomingClassSession(
      { status: "active", isLive: false },
      now - 60_000,
      now,
    ),
    false,
  );
});
