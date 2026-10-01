import assert from "node:assert/strict";
import test from "node:test";
import { ConvexError } from "convex/values";
import { getErrorMessage, parseConvexError } from "../lib/error-utils";

test("class edits and deletion explain the temporary Abeka migration guard", () => {
  const error = parseConvexError(
    new ConvexError("ABEKA_CURRICULUM_MIGRATION_IN_PROGRESS"),
  );
  assert.deepEqual(error, { code: "ABEKA_CURRICULUM_MIGRATION_IN_PROGRESS" });
  assert.equal(
    getErrorMessage(error!, (key) => key),
    "errors.abekaCurriculumMigrationInProgress",
  );
});
