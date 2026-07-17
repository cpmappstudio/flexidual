import assert from "node:assert/strict";
import test from "node:test";
import { calculateApplicationAnalytics } from "./analytics.ts";

const now = Date.UTC(2026, 0, 10, 12);
const application = (
  createdAt,
  program,
  totalDue,
  totalPaid,
  totalPending,
) => ({
  _creationTime: createdAt,
  programId: program,
  program: { name: program },
  paymentSummary: { totalDue, totalPaid, totalPending },
});

test("calculates non-cumulative trends and weighted payment health", () => {
  const result = calculateApplicationAnalytics(
    [
      application(Date.UTC(2026, 0, 10), "A", 100, 100, 0),
      application(Date.UTC(2026, 0, 5), "A", 300, 100, 200),
      application(Date.UTC(2025, 11, 1), "B", 600, 0, 600),
      application(Date.UTC(2025, 10, 1), "C", 0, 0, 0),
    ],
    30,
    "Other",
    now,
  );

  assert.equal(result.trend.currentTotal, 2);
  assert.equal(result.trend.previousTotal, 1);
  assert.equal(result.trend.variation, 100);
  assert.equal(
    result.trend.data.reduce((sum, bucket) => sum + bucket.applications, 0),
    2,
  );
  assert.equal(result.payments.collectionRate, 20);
  assert.deepEqual(
    Object.fromEntries(
      result.payments.statuses.map(({ status, count }) => [status, count]),
    ),
    { paid: 1, partial: 1, unpaid: 1, noPaymentRequired: 1 },
  );
});

test("preserves real overpayment totals while clamping only the visual rate", () => {
  const result = calculateApplicationAnalytics(
    [application(Date.UTC(2026, 0, 10), "A", 100, 125, -25)],
    30,
    "Other",
    now,
  );

  assert.equal(result.payments.totalDue, 100);
  assert.equal(result.payments.totalPaid, 125);
  assert.equal(result.payments.totalRemaining, -25);
  assert.equal(result.payments.collectionRate, 125);
  assert.equal(result.payments.collectionRateVisual, 100);
});

test("groups programs after the top three and handles empty comparisons", () => {
  const programs = ["A", "A", "A", "A", "B", "B", "B", "C", "C", "D"];
  const result = calculateApplicationAnalytics(
    programs.map((program) =>
      application(Date.UTC(2026, 0, 10), program, 0, 0, 0),
    ),
    56,
    "Other",
    now,
  );

  assert.deepEqual(
    result.programs.map(({ name, count }) => [name, count]),
    [
      ["A", 4],
      ["B", 3],
      ["C", 2],
      ["Other", 1],
    ],
  );
  assert.equal(result.trend.variation, "new");
  assert.equal(
    calculateApplicationAnalytics([], 56, "Other", now).trend.variation,
    "none",
  );
});
