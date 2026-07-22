import assert from "node:assert/strict";
import test from "node:test";
import { createGradeCode } from "../lib/grades";

test("grade codes remain stable identifiers for custom names", () => {
  assert.equal(createGradeCode("Jardín de niños"), "JARDIN-DE-NINOS");
  assert.equal(createGradeCode("  1.er grado  "), "1-ER-GRADO");
});
