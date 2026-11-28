import assert from "node:assert/strict";
import test from "node:test";
import { ConvexError } from "convex/values";
import { getErrorMessage, parseConvexError } from "../lib/error-utils";
import {
  gradingWeightInputs,
  isValidGradingWeights,
  parseGradingWeightInputs,
  sameGradingWeights,
} from "../lib/grading-weights";

test("weights use exact integer hundredths and distinguish zero from missing configuration", () => {
  const weights = [
    { category: "quiz" as const, weightBps: 2_025 },
    { category: "assignment" as const, weightBps: 7_975 },
  ];
  assert.equal(isValidGradingWeights(weights), true);
  assert.deepEqual(
    parseGradingWeightInputs({ quiz: "20.25", assignment: "79.75" }),
    weights,
  );
  assert.deepEqual(gradingWeightInputs(weights), {
    quiz: "20.25",
    assignment: "79.75",
  });
  assert.deepEqual(gradingWeightInputs(null), { quiz: "", assignment: "" });
  assert.equal(parseGradingWeightInputs({ quiz: "", assignment: "" }), null);
  assert.equal(
    parseGradingWeightInputs({ quiz: "0", assignment: "100" })?.[0].weightBps,
    0,
  );
});

test("invalid totals, duplicate categories, unknown categories and non-integer units are rejected", () => {
  for (const weights of [
    [],
    [{ category: "quiz", weightBps: 9_999 }],
    [{ category: "quiz", weightBps: Infinity }],
    [{ category: "quiz", weightBps: NaN }],
    [{ category: "quiz", weightBps: 10_000.1 }],
    [
      { category: "quiz", weightBps: -1 },
      { category: "assignment", weightBps: 10_001 },
    ],
    [
      { category: "quiz", weightBps: 5_000 },
      { category: "quiz", weightBps: 5_000 },
    ],
    [{ category: "unknown", weightBps: 10_000 }],
  ])
    assert.equal(isValidGradingWeights(weights as never), false);
  for (const quiz of ["", "0.001", "NaN", "Infinity", "-1", "101"])
    assert.equal(parseGradingWeightInputs({ quiz, assignment: "100" }), null);
});

test("weight equality is independent of order and omitted categories have zero weight", () => {
  const weights = [
    { category: "quiz" as const, weightBps: 2_000 },
    { category: "assignment" as const, weightBps: 8_000 },
  ];
  assert.equal(sameGradingWeights(weights, [...weights].reverse()), true);
  assert.equal(sameGradingWeights(weights, null), false);
  assert.equal(sameGradingWeights(undefined, null), true);
  assert.equal(
    sameGradingWeights(
      [{ category: "quiz", weightBps: 10_000 }],
      [
        { category: "quiz", weightBps: 10_000 },
        { category: "assignment", weightBps: 0 },
      ],
    ),
    true,
  );
});

test("course weight failures use the shared translated error handling", () => {
  for (const [code, key] of [
    ["GRADING_WEIGHTS_CHANGED", "grading.weights.stale"],
    ["INVALID_GRADING_WEIGHTS_VERSION", "grading.weights.stale"],
    ["INVALID_GRADING_WEIGHTS", "grading.weights.validation"],
  ]) {
    const error = parseConvexError(new ConvexError(code));
    assert.deepEqual(error, { code });
    assert.equal(
      getErrorMessage(error!, (key) => key),
      key,
    );
  }
});
