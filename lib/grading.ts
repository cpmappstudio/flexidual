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
  return (
    Number.isFinite(points) &&
    points >= 0 &&
    points <= maxPoints &&
    Math.abs(points * factor - Math.round(points * factor)) < 1e-7
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

export function gradeToScale(
  points: number,
  configuration: GradingConfiguration,
) {
  const factor = 10 ** configuration.decimalPlaces;
  return (
    Math.round(
      (points / configuration.maxPoints) * configuration.scaleMax * factor,
    ) / factor
  );
}
