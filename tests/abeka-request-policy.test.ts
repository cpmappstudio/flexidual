import test from "node:test";
import assert from "node:assert/strict";
import { providerRetryAt } from "../lib/abeka/request-policy";

test("Retry-After supports seconds and HTTP dates with a conservative minimum", () => {
  const now = Date.parse("2026-09-25T00:00:00Z");
  assert.equal(providerRetryAt("120", now), now + 120_000);
  assert.equal(
    providerRetryAt(new Date(now + 180_000).toUTCString(), now),
    now + 180_000,
  );
  for (const value of [
    null,
    "invalid",
    "0",
    "-1",
    "99999999999999999999999999999999999999",
  ])
    assert.equal(providerRetryAt(value, now), now + 60_000);
});
