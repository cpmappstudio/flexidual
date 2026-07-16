import type { Fee } from "@/lib/applications/fee-types";

export type FeeDueBucket = "none" | "overdue" | "due_today" | "upcoming";

export function isRecurringFee(fee: Fee): boolean {
  return fee.isRecurring === true || fee.recurringPlanId !== undefined;
}

export function getTodayDateInTimeZone(timezone?: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date());
}

export function getFeeDueBucket(fee: Fee): FeeDueBucket {
  if (!isRecurringFee(fee) || !fee.dueDate || fee.status === "paid") {
    return "none";
  }

  const today = getTodayDateInTimeZone(fee.timezone);
  if (today > fee.dueDate) return "overdue";
  if (today === fee.dueDate) return "due_today";
  return "upcoming";
}

export function isFeeActionableNow(fee: Fee): boolean {
  if (!isRecurringFee(fee)) return fee.status !== "paid";
  const dueBucket = getFeeDueBucket(fee);
  return dueBucket === "overdue" || dueBucket === "due_today";
}
