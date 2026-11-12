import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_GRADING_POLICY,
  gradeOutcome,
  gradeToScale,
  isValidGradingPolicy,
  isValidPoints,
  sameGradingConfiguration,
} from "../lib/grading";

test("grading validates zero, finite ranges and decimal precision", () => {
  assert.equal(isValidPoints(0, 20, 2), true);
  assert.equal(isValidPoints(18.25, 20, 2), true);
  assert.equal(isValidPoints(0.1 + 0.2, 20, 2), true);
  for (const points of [-1, 21, Infinity, NaN, 18.255])
    assert.equal(isValidPoints(points, 20, 2), false);
  assert.equal(isValidPoints(18.5, 20, 0), false);
  assert.equal(isValidPoints(10, 20, -1), false);
  assert.equal(isValidPoints(10, Infinity, 2), false);
});

test("institution policy and scale conversion use explicit precision", () => {
  assert.equal(
    isValidGradingPolicy({
      scaleMax: 10,
      decimalPlaces: 1,
      defaultMaxPoints: 20,
    }),
    true,
  );
  assert.equal(
    isValidGradingPolicy({
      scaleMax: 10,
      decimalPlaces: 0.5,
      defaultMaxPoints: 20,
    }),
    false,
  );
  assert.equal(
    isValidGradingPolicy({
      scaleMax: 0,
      decimalPlaces: 2,
      defaultMaxPoints: 20,
    }),
    false,
  );
  assert.equal(
    isValidGradingPolicy({
      scaleMax: 100,
      decimalPlaces: 2,
      defaultMaxPoints: 0,
    }),
    false,
  );
  assert.equal(
    gradeToScale(18, { maxPoints: 20, scaleMax: 100, decimalPlaces: 2 }),
    90,
  );
  assert.equal(
    gradeToScale(1, { maxPoints: 3, scaleMax: 10, decimalPlaces: 1 }),
    3.3,
  );
});

test("grading snapshots compare all evaluation dimensions", () => {
  const original = { maxPoints: 20, scaleMax: 100, decimalPlaces: 2 };
  assert.equal(sameGradingConfiguration(original, { ...original }), true);
  assert.equal(sameGradingConfiguration(original, null), false);
  assert.equal(
    sameGradingConfiguration(original, { ...original, maxPoints: 100 }),
    false,
  );
  assert.equal(
    sameGradingConfiguration(original, { ...original, scaleMax: 10 }),
    false,
  );
  assert.equal(
    sameGradingConfiguration(original, { ...original, decimalPlaces: 1 }),
    false,
  );
  assert.equal(
    sameGradingConfiguration(original, { ...original, passingPercentage: 0 }),
    false,
  );
});

test("passing is optional, inclusive, and independent of display rounding", () => {
  const grading = { maxPoints: 20, scaleMax: 10, decimalPlaces: 2 };
  assert.equal(DEFAULT_GRADING_POLICY.passingPercentage, undefined);
  assert.equal(gradeOutcome(14, grading), undefined);
  assert.equal(gradeOutcome(14, { ...grading, passingPercentage: 70 }), "passed");
  assert.equal(
    gradeOutcome(13.99, { ...grading, passingPercentage: 70 }),
    "failed",
  );
  assert.equal(gradeOutcome(0, { ...grading, passingPercentage: 0 }), "passed");
  assert.equal(gradeOutcome(20, { ...grading, passingPercentage: 100 }), "passed");
  const large = { ...grading, maxPoints: 100, passingPercentage: 70 };
  assert.equal(gradeToScale(69.99, large), 7);
  assert.equal(gradeOutcome(69.99, large), "failed");
  assert.equal(
    gradeOutcome(0.07, { ...grading, maxPoints: 0.1, passingPercentage: 70 }),
    "passed",
  );
});

test("institutional passing percentages allow 0 through 100 with up to two decimals", () => {
  for (const passingPercentage of [0, 70.25, 100])
    assert.equal(
      isValidGradingPolicy({ ...DEFAULT_GRADING_POLICY, passingPercentage }),
      true,
    );
  for (const passingPercentage of [-1, 70.001, 100.01, Infinity, NaN])
    assert.equal(
      isValidGradingPolicy({ ...DEFAULT_GRADING_POLICY, passingPercentage }),
      false,
    );
});
