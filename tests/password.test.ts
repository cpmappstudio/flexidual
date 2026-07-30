import assert from "node:assert/strict";
import test from "node:test";
import {
  isPasswordLongEnough,
  MIN_PASSWORD_LENGTH,
} from "../lib/password";

test("passwords meet Clerk's documented minimum length", () => {
  assert.equal(isPasswordLongEnough("a".repeat(MIN_PASSWORD_LENGTH - 1)), false);
  assert.equal(isPasswordLongEnough("a".repeat(MIN_PASSWORD_LENGTH)), true);
});
