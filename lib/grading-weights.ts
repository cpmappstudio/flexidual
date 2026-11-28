import type { Infer } from "convex/values";
import type { gradingWeightsValidator } from "../convex/model/gradingWeights";
import { isValidPoints } from "./grading";

export const GRADING_CATEGORIES = ["quiz", "assignment"] as const;
export const GRADING_WEIGHT_TOTAL = 10_000;
export type GradingCategory = (typeof GRADING_CATEGORIES)[number];
export type GradingWeights = Infer<typeof gradingWeightsValidator>;
export type GradingWeightInputs = Record<GradingCategory, string>;

export function isValidGradingWeights(weights: GradingWeights) {
  return (
    weights.length > 0 &&
    weights.length <= GRADING_CATEGORIES.length &&
    new Set(weights.map(({ category }) => category)).size === weights.length &&
    weights.every(
      ({ category, weightBps }) =>
        GRADING_CATEGORIES.includes(category) &&
        Number.isSafeInteger(weightBps) &&
        weightBps >= 0 &&
        weightBps <= GRADING_WEIGHT_TOTAL,
    ) &&
    weights.reduce((sum, { weightBps }) => sum + weightBps, 0) ===
      GRADING_WEIGHT_TOTAL
  );
}

export function sameGradingWeights(
  a: GradingWeights | null | undefined,
  b: GradingWeights | null | undefined,
) {
  if (a == null || b == null) return a == null && b == null;
  return GRADING_CATEGORIES.every(
    (category) =>
      (a.find((entry) => entry.category === category)?.weightBps ?? 0) ===
      (b.find((entry) => entry.category === category)?.weightBps ?? 0),
  );
}

export function gradingWeightInputs(weights?: GradingWeights | null) {
  return Object.fromEntries(
    GRADING_CATEGORIES.map((category) => [
      category,
      weights == null
        ? ""
        : String(
            (weights.find((entry) => entry.category === category)?.weightBps ??
              0) / 100,
          ),
    ]),
  ) as GradingWeightInputs;
}

export function parseGradingWeightInputs(
  inputs: GradingWeightInputs,
): GradingWeights | null {
  const weights = GRADING_CATEGORIES.map((category) => ({
    category,
    weightBps:
      inputs[category].trim() !== "" &&
      isValidPoints(Number(inputs[category]), 100, 2)
        ? Math.round(Number(inputs[category]) * 100)
        : -1,
  }));
  return isValidGradingWeights(weights) ? weights : null;
}
