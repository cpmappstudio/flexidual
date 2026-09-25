import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultAbekaSchedule,
  nextAbekaSync,
  type AbekaSchedule,
} from "../lib/abeka/schedule";
import { localDateTimeToUtc } from "../lib/time-zone";

const schedule: AbekaSchedule = {
  mode: "weekdays",
  time: "08:00",
  weekday: 1,
  stopAtPeriodEnd: false,
};
const zone = "America/Bogota";
const at = (value: string) => localDateTimeToUtc(value, zone);

test("weekdays schedule runs Friday then skips Saturday and Sunday", () => {
  assert.equal(
    nextAbekaSync(schedule, zone, at("2026-09-25T07:59")),
    at("2026-09-25T08:00"),
  );
  assert.equal(
    nextAbekaSync(schedule, zone, at("2026-09-25T08:00")),
    at("2026-09-28T08:00"),
  );
  assert.equal(
    nextAbekaSync(schedule, zone, at("2026-09-26T07:00")),
    at("2026-09-28T08:00"),
  );
});

test("weekly schedule permits any weekday and uses institution civil time", () => {
  assert.equal(
    nextAbekaSync(
      { ...schedule, mode: "weekly", weekday: 0 },
      zone,
      at("2026-09-25T23:00"),
    ),
    at("2026-09-27T08:00"),
  );
  assert.deepEqual(defaultAbekaSchedule(at("2026-10-02T00:29"), zone), {
    mode: "weekly",
    weekday: 5,
    time: "00:29",
    stopAtPeriodEnd: true,
  });
});

test("manual, missing academic period and ended academic period do not schedule", () => {
  const limited = { ...schedule, stopAtPeriodEnd: true };
  assert.equal(
    nextAbekaSync(
      { ...schedule, mode: "manual" },
      zone,
      at("2026-09-25T07:00"),
    ),
    undefined,
  );
  assert.equal(nextAbekaSync(limited, zone, at("2026-09-25T07:00")), undefined);
  assert.equal(
    nextAbekaSync(limited, zone, at("2026-09-25T07:00"), {
      startDate: "2026-01-01",
      endDate: "2026-09-24",
    }),
    undefined,
  );
});

test("academic period is inclusive, respects future start and stops after final occurrence", () => {
  const limited = { ...schedule, stopAtPeriodEnd: true };
  const period = { startDate: "2026-09-28", endDate: "2026-09-30" };
  assert.equal(
    nextAbekaSync(limited, zone, at("2026-09-25T07:00"), period),
    at("2026-09-28T08:00"),
  );
  assert.equal(
    nextAbekaSync(limited, zone, at("2026-09-30T07:00"), period),
    at("2026-09-30T08:00"),
  );
  assert.equal(
    nextAbekaSync(limited, zone, at("2026-09-30T08:00"), period),
    undefined,
  );
});

test("DST retains wall time, skips nonexistent time and never repeats ambiguous time", () => {
  const ny = "America/New_York";
  const weekly = { ...schedule, mode: "weekly" as const, weekday: 0 };
  assert.equal(
    nextAbekaSync(weekly, ny, Date.parse("2026-03-07T12:00Z")),
    Date.parse("2026-03-08T12:00Z"),
  );
  assert.equal(
    nextAbekaSync(
      { ...weekly, time: "02:30" },
      ny,
      Date.parse("2026-03-07T12:00Z"),
    ),
    Date.parse("2026-03-15T06:30Z"),
  );
  const repeated = { ...weekly, time: "01:30" };
  const first = nextAbekaSync(repeated, ny, Date.parse("2026-10-31T12:00Z"))!;
  assert.equal(
    nextAbekaSync(repeated, ny, first),
    Date.parse("2026-11-08T06:30Z"),
  );
});
