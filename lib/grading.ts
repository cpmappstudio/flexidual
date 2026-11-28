export type GradingPolicy = {
  scaleMax: number;
  decimalPlaces: number;
  defaultMaxPoints: number;
  passingPercentage?: number;
};

export type GradingConfiguration = Omit<GradingPolicy, "defaultMaxPoints"> & {
  maxPoints: number;
};

export const DEFAULT_GRADING_POLICY: GradingPolicy = {
  scaleMax: 100,
  decimalPlaces: 2,
  defaultMaxPoints: 100,
};

export function sameGradingConfiguration(
  a: GradingConfiguration | null | undefined,
  b: GradingConfiguration | null | undefined,
) {
  return (
    a === b ||
    (a != null &&
      b != null &&
      a.maxPoints === b.maxPoints &&
      a.scaleMax === b.scaleMax &&
      a.decimalPlaces === b.decimalPlaces &&
      a.passingPercentage === b.passingPercentage)
  );
}

export function isValidPoints(
  points: number,
  maxPoints: number,
  decimalPlaces: number,
) {
  if (
    !Number.isFinite(maxPoints) ||
    maxPoints <= 0 ||
    !Number.isInteger(decimalPlaces) ||
    decimalPlaces < 0 ||
    decimalPlaces > 2
  )
    return false;
  const factor = 10 ** decimalPlaces;
  const units = Math.round(points * factor);
  return (
    Number.isFinite(points) &&
    points >= 0 &&
    points <= maxPoints &&
    (points === 0 || units > 0) &&
    Math.abs(points * factor - units) < 1e-7
  );
}

export function isValidGradingPolicy(policy: GradingPolicy) {
  return (
    Number.isInteger(policy.decimalPlaces) &&
    policy.decimalPlaces >= 0 &&
    policy.decimalPlaces <= 2 &&
    policy.scaleMax > 0 &&
    isValidPoints(policy.scaleMax, 1_000_000, policy.decimalPlaces) &&
    policy.defaultMaxPoints > 0 &&
    isValidPoints(policy.defaultMaxPoints, 1_000_000, policy.decimalPlaces) &&
    (policy.passingPercentage === undefined ||
      isValidPoints(policy.passingPercentage, 100, 2))
  );
}

export function gradeOutcome(
  points: number,
  { maxPoints, passingPercentage, scaleMax }: GradingConfiguration,
  institutionalScale?: true,
) {
  if (passingPercentage === undefined) return undefined;
  // Compare integer hundredths, without rounding the displayed grade.
  return Math.round(points * 100) * 10_000 >=
    Math.round((institutionalScale ? scaleMax : maxPoints) * 100) *
      Math.round(passingPercentage * 100)
    ? "passed"
    : "failed";
}

function decimalParts(value: number) {
  const [coefficient, exponent] = value.toExponential().split("e");
  return {
    coefficient: BigInt(coefficient.replace(".", "")),
    exponent: Number(exponent) - (coefficient.split(".")[1]?.length ?? 0),
  };
}

export function gradeToScale(
  points: number,
  configuration: GradingConfiguration,
) {
  const factor = 10 ** configuration.decimalPlaces;
  // Preserve legacy maxima and projected scores; round only the final ratio.
  const earned = decimalParts(points);
  const maximum = decimalParts(configuration.maxPoints);
  const scale = decimalParts(configuration.scaleMax);
  const shift =
    earned.exponent +
    scale.exponent -
    maximum.exponent +
    configuration.decimalPlaces;
  const numerator =
    earned.coefficient * scale.coefficient * 10n ** BigInt(Math.max(shift, 0));
  const denominator = maximum.coefficient * 10n ** BigInt(Math.max(-shift, 0));
  return Number((numerator + denominator / 2n) / denominator) / factor;
}
