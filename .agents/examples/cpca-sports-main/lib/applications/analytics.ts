const DAY_MS = 24 * 60 * 60 * 1000;

export type AnalyticsApplication = {
  _creationTime: number;
  programId?: string;
  program: { name: string };
  paymentSummary: {
    totalDue: number;
    totalPaid: number;
    totalPending: number;
  };
};

export type TrendVariation = number | "new" | "none";
export type PaymentStatusKey =
  "paid" | "partial" | "unpaid" | "noPaymentRequired";

export function calculateApplicationAnalytics(
  applications: AnalyticsApplication[],
  rangeDays: number,
  otherLabel: string,
  now = Date.now(),
) {
  const end = startOfUtcDay(now) + DAY_MS;
  const start = end - rangeDays * DAY_MS;
  const previousStart = start - rangeDays * DAY_MS;
  const bucketDays = rangeDays <= 30 ? 1 : 7;
  const bucketMs = bucketDays * DAY_MS;
  const trend = Array.from(
    { length: Math.ceil(rangeDays / bucketDays) },
    (_, index) => ({
      start: start + index * bucketMs,
      end: Math.min(start + (index + 1) * bucketMs, end) - 1,
      applications: 0,
    }),
  );
  const programCounts = new Map<string, { name: string; count: number }>();
  let currentTotal = 0;
  let previousTotal = 0;
  let totalDue = 0;
  let totalPaid = 0;

  for (const application of applications) {
    const createdAt = application._creationTime;
    if (createdAt >= start && createdAt < end) {
      currentTotal += 1;
      const bucketIndex = Math.floor((createdAt - start) / bucketMs);
      if (trend[bucketIndex]) trend[bucketIndex].applications += 1;
    } else if (createdAt >= previousStart && createdAt < start) {
      previousTotal += 1;
    }

    const programName = application.program.name || "—";
    const programKey = application.programId ?? programName;
    const program = programCounts.get(programKey) ?? {
      name: programName,
      count: 0,
    };
    program.count += 1;
    programCounts.set(programKey, program);

    const summary = application.paymentSummary;
    totalDue += summary.totalDue;
    totalPaid += summary.totalPaid;
  }

  const sortedPrograms = [...programCounts.entries()]
    .map(([id, program]) => ({ id, ...program }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const topPrograms = sortedPrograms.slice(0, 3);
  const otherCount = sortedPrograms
    .slice(3)
    .reduce((sum, program) => sum + program.count, 0);
  const programData = [
    ...topPrograms,
    ...(otherCount > 0
      ? [{ id: "other", name: otherLabel, count: otherCount }]
      : []),
  ].map((program) => ({
    ...program,
    percentage:
      applications.length > 0 ? (program.count / applications.length) * 100 : 0,
  }));
  const variation: TrendVariation =
    previousTotal === 0
      ? currentTotal > 0
        ? "new"
        : "none"
      : ((currentTotal - previousTotal) / previousTotal) * 100;
  const collectionRate = totalDue > 0 ? (totalPaid / totalDue) * 100 : null;
  const paymentStatusData = calculatePaymentStatusDistribution(applications);

  return {
    trend: {
      data: trend,
      currentTotal,
      previousTotal,
      variation,
      bucketDays,
    },
    programs: programData,
    payments: {
      totalDue,
      totalPaid,
      totalRemaining: totalDue - totalPaid,
      collectionRate,
      collectionRateVisual:
        collectionRate === null
          ? 0
          : Math.min(100, Math.max(0, collectionRate)),
      statuses: paymentStatusData,
    },
  };
}

export function calculatePaymentStatusDistribution(
  applications: Pick<AnalyticsApplication, "paymentSummary">[],
) {
  const counts: Record<PaymentStatusKey, number> = {
    paid: 0,
    partial: 0,
    unpaid: 0,
    noPaymentRequired: 0,
  };

  for (const { paymentSummary } of applications) {
    const status =
      paymentSummary.totalDue <= 0
        ? "noPaymentRequired"
        : paymentSummary.totalPending <= 0
          ? "paid"
          : paymentSummary.totalPaid > 0
            ? "partial"
            : "unpaid";
    counts[status] += 1;
  }

  return (Object.entries(counts) as Array<[PaymentStatusKey, number]>).map(
    ([status, count]) => ({
      status,
      count,
      percentage:
        applications.length > 0 ? (count / applications.length) * 100 : 0,
    }),
  );
}

function startOfUtcDay(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
