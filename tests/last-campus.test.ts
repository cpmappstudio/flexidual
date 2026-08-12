import assert from "node:assert/strict";
import test from "node:test";
import { getCampusDestination } from "../lib/last-campus";

const campuses = [{ slug: "north" }, { slug: "south" }];

test("restores an accessible campus", () => {
  assert.equal(getCampusDestination(campuses, "south"), "south");
});

test("falls back to the first campus when the preference is unavailable", () => {
  assert.equal(getCampusDestination(campuses, "retired"), "north");
  assert.equal(getCampusDestination(campuses, null), "north");
  assert.equal(getCampusDestination([], "south"), null);
});
