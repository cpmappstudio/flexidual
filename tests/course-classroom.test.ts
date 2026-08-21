import assert from "node:assert/strict";
import test from "node:test";
import { findLiveStandardClassroom } from "../lib/course-classroom";

const schedules = [
  {
    id: "external-live",
    sessionType: "ignitia" as const,
    status: "active" as const,
    isLive: true,
  },
  {
    id: "standard-upcoming",
    sessionType: "live" as const,
    status: "scheduled" as const,
    isLive: false,
  },
  {
    id: "standard-live",
    sessionType: "live" as const,
    status: "active" as const,
    isLive: true,
  },
];

test("opens only an active standard classroom", () => {
  assert.equal(findLiveStandardClassroom(schedules)?.id, "standard-live");
  assert.equal(findLiveStandardClassroom(schedules.slice(0, 2)), null);
});
