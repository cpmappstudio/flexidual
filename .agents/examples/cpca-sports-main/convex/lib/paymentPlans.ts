export function parseDateString(value: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("Date must be in YYYY-MM-DD format");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new Error("Invalid date");
  }

  return { year, month, day };
}

export function formatDateString(
  year: number,
  month: number,
  day: number,
): string {
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function buildMonthlyDueDates(
  startDate: string,
  endDate: string,
  dueDayOfMonth: number,
): string[] {
  const start = parseDateString(startDate);
  const end = parseDateString(endDate);

  const startKey = Number(
    `${start.year}${String(start.month).padStart(2, "0")}`,
  );
  const endKey = Number(`${end.year}${String(end.month).padStart(2, "0")}`);
  if (endKey < startKey) {
    throw new Error("End date must be equal or after start date");
  }

  const dueDates: string[] = [];
  let year = start.year;
  let month = start.month;

  while (year < end.year || (year === end.year && month <= end.month)) {
    const daysInMonth = getDaysInMonth(year, month);
    const dueDay = Math.min(dueDayOfMonth, daysInMonth);
    dueDates.push(formatDateString(year, month, dueDay));

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return dueDates;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function distributeAmounts(
  totalAmount: number,
  installmentCount: number,
  firstInstallmentAmount?: number,
): number[] {
  if (installmentCount <= 0) {
    throw new Error("Installment count must be greater than 0");
  }

  if (firstInstallmentAmount === undefined) {
    const base = Math.floor(totalAmount / installmentCount);
    const remainder = totalAmount - base * installmentCount;
    return Array.from(
      { length: installmentCount },
      (_, index) => base + (index < remainder ? 1 : 0),
    );
  }

  if (firstInstallmentAmount < 0 || firstInstallmentAmount > totalAmount) {
    throw new Error("Down payment amount must be between 0 and total amount");
  }

  if (installmentCount === 1) {
    return [totalAmount];
  }

  const remaining = totalAmount - firstInstallmentAmount;
  const restCount = installmentCount - 1;
  const base = Math.floor(remaining / restCount);
  const remainder = remaining - base * restCount;

  return [
    firstInstallmentAmount,
    ...Array.from(
      { length: restCount },
      (_, index) => base + (index < remainder ? 1 : 0),
    ),
  ];
}
