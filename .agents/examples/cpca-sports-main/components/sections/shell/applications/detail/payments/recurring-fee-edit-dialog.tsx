"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRangePopover } from "./date-range-popover";
import type { Fee } from "@/lib/applications/fee-types";
import {
  centsToDollars,
  dollarsToCents,
  formatCurrency,
} from "@/lib/utils/currency";
import { toast } from "sonner";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  type TooltipContentProps,
} from "recharts";

interface RecurringFeeEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fee: Fee;
  installments: Fee[];
  onSave: (args: {
    feeId: Fee["_id"];
    name: string;
    totalAmount: number;
    startDate: string;
    endDate: string;
    dueDayOfMonth: number;
    timezone: string;
    isRefundable: boolean;
    isIncluded: boolean;
    isRequired: boolean;
    installmentAmounts: number[];
  }) => Promise<void>;
}

type DistributionError = "locked_exceeds_total" | "all_locked_mismatch";

type DistributionChartDatum = {
  key: string;
  installment: number;
  date: string;
  amount: number;
  status: "paid" | "custom" | "automatic";
  fill: string;
};

function parseDateString(value?: string): Date | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function getDueDayFromDateString(value?: string): number {
  const parsed = parseDateString(value);
  if (!parsed) {
    return 1;
  }
  return Math.max(1, Math.min(31, parsed.getUTCDate()));
}

function toMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0);
}

function toDateInputValue(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function buildMonthlyDueDates(
  startDate: string,
  endDate: string,
  dueDayOfMonth: number,
): string[] {
  const startMatch = /^(\d{4})-(\d{2})-\d{2}$/.exec(startDate);
  const endMatch = /^(\d{4})-(\d{2})-\d{2}$/.exec(endDate);
  if (!startMatch || !endMatch) {
    return [];
  }

  const startYear = Number(startMatch[1]);
  const startMonth = Number(startMatch[2]);
  const endYear = Number(endMatch[1]);
  const endMonth = Number(endMatch[2]);
  if (
    !Number.isInteger(startYear) ||
    !Number.isInteger(startMonth) ||
    !Number.isInteger(endYear) ||
    !Number.isInteger(endMonth)
  ) {
    return [];
  }

  const startKey = startYear * 12 + startMonth;
  const endKey = endYear * 12 + endMonth;
  if (endKey < startKey) {
    return [];
  }

  const dueDates: string[] = [];
  let year = startYear;
  let month = startMonth;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    const day = Math.min(dueDayOfMonth, getDaysInMonth(year, month));
    dueDates.push(
      `${year.toString().padStart(4, "0")}-${month
        .toString()
        .padStart(2, "0")}-${day.toString().padStart(2, "0")}`,
    );

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return dueDates;
}

function distributeAmounts(
  totalAmount: number,
  installmentCount: number,
): number[] {
  if (installmentCount <= 0) {
    return [];
  }
  const base = Math.floor(totalAmount / installmentCount);
  const remainder = totalAmount - base * installmentCount;
  return Array.from(
    { length: installmentCount },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

function distributeWithManualAmounts(
  totalAmount: number,
  installmentCount: number,
  manualAmountByIndex: Record<number, number>,
): {
  amounts: number[];
  error: DistributionError | null;
} {
  if (installmentCount <= 0) {
    return { amounts: [], error: null };
  }

  if (!Number.isInteger(totalAmount) || totalAmount < 0) {
    return { amounts: [], error: "locked_exceeds_total" };
  }

  const manualEntries = Object.entries(manualAmountByIndex)
    .map(([key, value]) => [Number(key), value] as const)
    .filter(
      ([index, value]) =>
        Number.isInteger(index) &&
        index >= 0 &&
        index < installmentCount &&
        Number.isInteger(value) &&
        value >= 0,
    )
    .sort((a, b) => a[0] - b[0]);

  const manualMap = new Map<number, number>(manualEntries);
  const manualSum = manualEntries.reduce((sum, [, value]) => sum + value, 0);

  if (manualMap.size === installmentCount) {
    const amounts = Array.from(
      { length: installmentCount },
      (_, index) => manualMap.get(index) ?? 0,
    );

    if (manualSum !== totalAmount) {
      return { amounts, error: "all_locked_mismatch" };
    }

    return { amounts, error: null };
  }

  if (manualSum > totalAmount) {
    const amounts = Array.from(
      { length: installmentCount },
      (_, index) => manualMap.get(index) ?? 0,
    );
    return { amounts, error: "locked_exceeds_total" };
  }

  const unlockedIndexes: number[] = [];
  for (let index = 0; index < installmentCount; index += 1) {
    if (!manualMap.has(index)) {
      unlockedIndexes.push(index);
    }
  }

  const remainingAmount = totalAmount - manualSum;
  const autoAmounts = distributeAmounts(
    remainingAmount,
    unlockedIndexes.length,
  );
  const amounts = Array.from(
    { length: installmentCount },
    (_, index) => manualMap.get(index) ?? 0,
  );
  for (let autoIndex = 0; autoIndex < unlockedIndexes.length; autoIndex += 1) {
    const installmentIndex = unlockedIndexes[autoIndex];
    amounts[installmentIndex] = autoAmounts[autoIndex] ?? 0;
  }

  return { amounts, error: null };
}

function deriveManualAmountByIndexFromPersisted(
  persistedAmounts: number[],
  totalAmount: number,
): Record<number, number> {
  const installmentCount = persistedAmounts.length;
  if (installmentCount === 0) {
    return {};
  }

  let manualAmountByIndex: Record<number, number> = {};
  for (let index = 0; index < installmentCount; index += 1) {
    const currentDistribution = distributeWithManualAmounts(
      totalAmount,
      installmentCount,
      manualAmountByIndex,
    );
    const expectedAmount = currentDistribution.amounts[index] ?? 0;
    const persistedAmount = persistedAmounts[index] ?? 0;
    if (expectedAmount !== persistedAmount) {
      manualAmountByIndex = {
        ...manualAmountByIndex,
        [index]: persistedAmount,
      };
    }
  }

  const validation = distributeWithManualAmounts(
    totalAmount,
    installmentCount,
    manualAmountByIndex,
  );
  const matchesPersisted =
    validation.error === null &&
    validation.amounts.length === installmentCount &&
    validation.amounts.every(
      (amount, index) => amount === persistedAmounts[index],
    );

  if (matchesPersisted) {
    return manualAmountByIndex;
  }

  // Fallback: lock all installments exactly as persisted.
  return Object.fromEntries(
    persistedAmounts.map((amount, index) => [index, amount]),
  );
}

export function RecurringFeeEditDialog({
  open,
  onOpenChange,
  fee,
  installments,
  onSave,
}: RecurringFeeEditDialogProps) {
  const t = useTranslations("Applications.payments");
  const locale = useLocale();
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState(fee.name);
  const [totalAmountDollars, setTotalAmountDollars] = useState(
    centsToDollars(fee.totalAmount),
  );
  const [dueDayOfMonth, setDueDayOfMonth] = useState(
    getDueDayFromDateString(fee.dueDate),
  );
  const [timezone, setTimezone] = useState(fee.timezone ?? "America/New_York");
  const [isRefundable, setIsRefundable] = useState(fee.isRefundable);
  const [isIncluded, setIsIncluded] = useState(fee.isIncluded);
  const [isRequired, setIsRequired] = useState(fee.isRequired);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [manualAmountByIndex, setManualAmountByIndex] = useState<
    Record<number, number>
  >({});
  const [isHoveringDistributionChart, setIsHoveringDistributionChart] =
    useState(false);

  const orderedInstallments = useMemo(() => {
    return [...installments].sort((a, b) => {
      const aIndex = a.installmentIndex ?? Number.MAX_SAFE_INTEGER;
      const bIndex = b.installmentIndex ?? Number.MAX_SAFE_INTEGER;
      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }
      return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
    });
  }, [installments]);

  const targetInstallment = useMemo(() => {
    return (
      orderedInstallments.find((installment) => installment._id === fee._id) ??
      fee
    );
  }, [orderedInstallments, fee]);

  const scopeStartInstallment = useMemo(() => {
    return (
      orderedInstallments.find(
        (installment) => installment.status !== "paid",
      ) ?? targetInstallment
    );
  }, [orderedInstallments, targetInstallment]);

  const scopeStartIndex = scopeStartInstallment.installmentIndex ?? 1;
  const installmentsBeforeScope = useMemo(() => {
    return orderedInstallments.filter(
      (installment) => (installment.installmentIndex ?? 0) < scopeStartIndex,
    );
  }, [orderedInstallments, scopeStartIndex]);

  const scopedInstallments = useMemo(() => {
    return orderedInstallments.filter(
      (installment) => (installment.installmentIndex ?? 0) >= scopeStartIndex,
    );
  }, [orderedInstallments, scopeStartIndex]);

  const hasPaidInScope = useMemo(() => {
    return scopedInstallments.some((installment) => installment.paidAmount > 0);
  }, [scopedInstallments]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const defaultName = scopeStartInstallment.name;
    const defaultTotalAmount = scopedInstallments.reduce(
      (sum, installment) => sum + installment.totalAmount,
      0,
    );
    const defaultStart =
      scopedInstallments[0]?.dueDate ?? scopeStartInstallment.dueDate;
    const defaultEnd =
      scopedInstallments[scopedInstallments.length - 1]?.dueDate ??
      scopeStartInstallment.dueDate;
    const persistedAmounts = scopedInstallments.map(
      (installment) => installment.totalAmount,
    );
    const initialManualAmounts = deriveManualAmountByIndexFromPersisted(
      persistedAmounts,
      defaultTotalAmount,
    );

    setName(defaultName);
    setTotalAmountDollars(centsToDollars(defaultTotalAmount));
    setDueDayOfMonth(getDueDayFromDateString(defaultStart));
    setTimezone(scopeStartInstallment.timezone ?? "America/New_York");
    setIsRefundable(scopeStartInstallment.isRefundable);
    setIsIncluded(scopeStartInstallment.isIncluded);
    setIsRequired(scopeStartInstallment.isRequired);
    const parsedStart = parseDateString(defaultStart);
    const parsedEnd = parseDateString(defaultEnd);
    setDateRange({
      from: parsedStart ? toMonthStart(parsedStart) : undefined,
      to: parsedEnd ? toMonthStart(parsedEnd) : undefined,
    });
    setManualAmountByIndex(initialManualAmounts);
  }, [open, scopeStartInstallment, scopedInstallments]);

  const startDate = dateRange?.from
    ? toDateInputValue(toMonthStart(dateRange.from))
    : "";
  const endDate = dateRange?.to
    ? toDateInputValue(toMonthStart(dateRange.to))
    : "";
  const minimumSelectableMonth = useMemo(() => {
    const parsed = parseDateString(scopeStartInstallment.dueDate);
    return parsed ? toMonthStart(parsed) : undefined;
  }, [scopeStartInstallment.dueDate]);

  const projectedDueDates = useMemo(() => {
    if (!startDate || !endDate) {
      return [];
    }
    return buildMonthlyDueDates(startDate, endDate, dueDayOfMonth);
  }, [startDate, endDate, dueDayOfMonth]);

  useEffect(() => {
    setManualAmountByIndex((previous) => {
      const next: Record<number, number> = {};
      let changed = false;

      for (const [key, value] of Object.entries(previous)) {
        const index = Number(key);
        if (index < projectedDueDates.length) {
          next[index] = value;
        } else {
          changed = true;
        }
      }

      return changed ? next : previous;
    });
  }, [projectedDueDates.length]);

  const totalAmountCents = dollarsToCents(totalAmountDollars);
  const distribution = useMemo(() => {
    return distributeWithManualAmounts(
      totalAmountCents,
      projectedDueDates.length,
      manualAmountByIndex,
    );
  }, [totalAmountCents, projectedDueDates.length, manualAmountByIndex]);

  const projectedAmounts = distribution.amounts;
  const distributionError = distribution.error;

  const schedulePreview = useMemo(() => {
    const installmentsByDueDate = new Map<string, Fee>();
    for (const installment of scopedInstallments) {
      if (
        !installment.dueDate ||
        installmentsByDueDate.has(installment.dueDate)
      ) {
        continue;
      }
      installmentsByDueDate.set(installment.dueDate, installment);
    }

    return projectedDueDates.map((dueDate, index) => {
      const parsedDate = parseDateString(dueDate);
      let formattedDate = dueDate;
      if (parsedDate) {
        try {
          formattedDate = new Intl.DateTimeFormat(locale, {
            timeZone: timezone,
            month: "short",
            day: "numeric",
            year: "numeric",
          }).format(parsedDate);
        } catch {
          formattedDate = dueDate;
        }
      }

      const existingInstallment = installmentsByDueDate.get(dueDate);
      const isPaid = existingInstallment?.status === "paid";

      return {
        key: `${dueDate}-${index}`,
        dueDate,
        formattedDate,
        amount: projectedAmounts[index] ?? 0,
        isManual: manualAmountByIndex[index] !== undefined,
        isPaid,
        index,
      };
    });
  }, [
    projectedDueDates,
    projectedAmounts,
    timezone,
    locale,
    manualAmountByIndex,
    scopedInstallments,
  ]);

  const timelineRows = useMemo(() => {
    const previousRows = installmentsBeforeScope.map((installment) => {
      const dueDate = installment.dueDate ?? "";
      const parsedDate = parseDateString(dueDate);
      let formattedDate = dueDate;
      if (parsedDate) {
        try {
          formattedDate = new Intl.DateTimeFormat(locale, {
            timeZone: installment.timezone ?? timezone,
            month: "short",
            day: "numeric",
            year: "numeric",
          }).format(parsedDate);
        } catch {
          formattedDate = dueDate;
        }
      }

      const isPaid = installment.status === "paid";

      return {
        key: `previous-${installment._id}`,
        dueDate,
        formattedDate,
        amount: installment.totalAmount,
        isManual: false,
        isPaid,
        isEditable: !isPaid,
        projectedIndex: null as number | null,
      };
    });

    const projectedRows = schedulePreview.map((item) => ({
      ...item,
      isEditable: !item.isPaid,
      projectedIndex: item.index,
    }));

    return [...previousRows, ...projectedRows];
  }, [installmentsBeforeScope, schedulePreview, locale, timezone]);

  const distributionChartData = useMemo<DistributionChartDatum[]>(() => {
    return timelineRows
      .filter((item) => item.amount > 0)
      .map((item, index) => {
        const status = item.isPaid
          ? "paid"
          : item.isManual
            ? "custom"
            : "automatic";
        const fill =
          status === "paid"
            ? "#22c55e"
            : status === "custom"
              ? "#f59e0b"
              : "var(--chart-1)";

        return {
          key: item.key,
          installment: index + 1,
          date: item.formattedDate,
          amount: item.amount,
          status,
          fill,
        };
      });
  }, [timelineRows]);

  const fullPlanTotal = useMemo(() => {
    return distributionChartData.reduce((sum, item) => sum + item.amount, 0);
  }, [distributionChartData]);

  const initialDownPaymentAmount = orderedInstallments[0]?.totalAmount ?? 0;

  const distributionTooltip = ({ active, payload }: TooltipContentProps) => {
    if (!active || !payload?.length) {
      return null;
    }

    const segment = payload[0]?.payload as DistributionChartDatum | undefined;
    if (!segment) {
      return null;
    }

    const statusLabel =
      segment.status === "paid"
        ? t("recurringEditDialog.schedule.indicators.paid")
        : segment.status === "custom"
          ? t("recurringEditDialog.schedule.indicators.custom")
          : t("recurringEditDialog.schedule.indicators.automatic");

    return (
      <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
        <p className="font-medium">{`${segment.installment} • ${segment.date}`}</p>
        <p className="text-muted-foreground">{statusLabel}</p>
        <p className="font-semibold">{formatCurrency(segment.amount)}</p>
      </div>
    );
  };

  const canSave =
    !isSaving &&
    !hasPaidInScope &&
    name.trim().length > 0 &&
    totalAmountCents > 0 &&
    startDate.length > 0 &&
    endDate.length > 0 &&
    projectedDueDates.length > 0 &&
    projectedAmounts.length === projectedDueDates.length &&
    distributionError === null;

  const handleInstallmentAmountChange = (index: number, rawValue: string) => {
    const trimmed = rawValue.trim();
    if (trimmed.length === 0) {
      setManualAmountByIndex((previous) => {
        if (previous[index] === undefined) {
          return previous;
        }

        const next = { ...previous };
        delete next[index];
        return next;
      });
      return;
    }

    const parsed = parseFloat(rawValue);
    const normalizedDollars = Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
    const proposedCents = dollarsToCents(normalizedDollars);

    const sumOfOtherManualAmounts = Object.entries(manualAmountByIndex).reduce(
      (sum, [key, value]) => {
        const installmentIndex = Number(key);
        if (!Number.isInteger(installmentIndex) || installmentIndex === index) {
          return sum;
        }
        return sum + value;
      },
      0,
    );
    const maxForInstallment = Math.max(
      totalAmountCents - sumOfOtherManualAmounts,
      0,
    );
    const normalizedCents = Math.min(proposedCents, maxForInstallment);

    setManualAmountByIndex((previous) => ({
      ...previous,
      [index]: normalizedCents,
    }));
  };

  const handleSave = async () => {
    if (!canSave) {
      if (hasPaidInScope) {
        toast.error(t("recurringEditDialog.errors.paidInstallments"));
      } else if (!startDate || !endDate || projectedDueDates.length === 0) {
        toast.error(t("recurringEditDialog.errors.invalidRange"));
      } else if (totalAmountCents <= 0) {
        toast.error(t("recurringEditDialog.errors.invalidAmount"));
      } else if (distributionError === "locked_exceeds_total") {
        toast.error(t("recurringEditDialog.errors.lockedExceedsTotal"));
      } else if (distributionError === "all_locked_mismatch") {
        toast.error(t("recurringEditDialog.errors.totalMismatch"));
      }
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        feeId: scopeStartInstallment._id,
        name: name.trim(),
        totalAmount: totalAmountCents,
        startDate,
        endDate,
        dueDayOfMonth,
        timezone,
        isRefundable,
        isIncluded,
        isRequired,
        installmentAmounts: projectedAmounts,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save recurring schedule:", error);
      toast.error(t("recurringEditDialog.errors.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[92vh] overflow-hidden p-0 sm:max-w-5xl"
      >
        <div className="flex max-h-[92vh] flex-col">
          <DialogHeader className="shrink-0 border-b px-4 pt-5 pb-4 sm:px-6 sm:pt-6">
            <DialogTitle>{t("recurringEditDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("recurringEditDialog.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
            <div className="grid gap-6 md:grid-cols-5">
              <div className="space-y-4 md:col-span-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      {t("recurringEditDialog.form.title")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`recurring-name-${fee._id}`}>
                        {t("recurringEditDialog.fields.name")}
                      </Label>
                      <Input
                        id={`recurring-name-${fee._id}`}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`recurring-total-${fee._id}`}>
                        {t("recurringEditDialog.fields.totalAmount")}
                      </Label>
                      <Input
                        id={`recurring-total-${fee._id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={totalAmountDollars}
                        onChange={(event) =>
                          setTotalAmountDollars(
                            parseFloat(event.target.value) || 0,
                          )
                        }
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>{`${t("recurringEditDialog.fields.startDate")} - ${t("recurringEditDialog.fields.endDate")}`}</Label>
                      <DateRangePopover
                        dateRange={dateRange}
                        onSelect={setDateRange}
                        placeholder={t(
                          "recurringEditDialog.fields.rangePlaceholder",
                        )}
                        className="w-full justify-start px-2.5 font-normal"
                        displayFormat="month"
                        disabled={(date) =>
                          (minimumSelectableMonth
                            ? date < minimumSelectableMonth
                            : date < new Date("1900-01-01")) ||
                          date > new Date("2100-12-31")
                        }
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`recurring-due-day-${fee._id}`}>
                        {t("recurringEditDialog.fields.dueDayOfMonth")}
                      </Label>
                      <Input
                        id={`recurring-due-day-${fee._id}`}
                        type="number"
                        min="1"
                        max="31"
                        value={dueDayOfMonth}
                        onChange={(event) =>
                          setDueDayOfMonth(
                            Math.max(
                              1,
                              Math.min(31, Number(event.target.value) || 1),
                            ),
                          )
                        }
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>{t("recurringEditDialog.fields.timezone")}</Label>
                      <Select value={timezone} onValueChange={setTimezone}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="America/New_York">
                            {t("form.timezones.easternUs")}
                          </SelectItem>
                          <SelectItem value="America/Puerto_Rico">
                            {t("form.timezones.puertoRico")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-wrap gap-4 pt-1">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={isRefundable}
                          onChange={(event) =>
                            setIsRefundable(event.target.checked)
                          }
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        {t("form.refundable")}
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={isIncluded}
                          onChange={(event) =>
                            setIsIncluded(event.target.checked)
                          }
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        {t("form.included")}
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={isRequired}
                          onChange={(event) =>
                            setIsRequired(event.target.checked)
                          }
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        {t("form.required")}
                      </label>
                    </div>

                    {hasPaidInScope && (
                      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {t("recurringEditDialog.warnings.paidInstallments")}
                      </div>
                    )}

                    {distributionError === "locked_exceeds_total" && (
                      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {t("recurringEditDialog.errors.lockedExceedsTotal")}
                      </div>
                    )}

                    {distributionError === "all_locked_mismatch" && (
                      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {t("recurringEditDialog.errors.totalMismatch")}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4 md:col-span-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      {t("recurringEditDialog.projection.title")}
                    </CardTitle>
                    <CardDescription>
                      {t("recurringEditDialog.projection.description")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-md border bg-muted/30 px-3 py-2">
                        <p className="text-xs text-muted-foreground">
                          {t("recurringEditDialog.summary.installments")}
                        </p>
                        <p className="text-sm font-semibold">
                          {distributionChartData.length}
                        </p>
                      </div>
                      <div className="rounded-md border bg-muted/30 px-3 py-2">
                        <p className="text-xs text-muted-foreground">
                          {t("recurringEditDialog.summary.total")}
                        </p>
                        <p className="text-sm font-semibold">
                          {formatCurrency(fullPlanTotal)}
                        </p>
                      </div>
                      <div className="rounded-md border bg-muted/30 px-3 py-2">
                        <p className="text-xs text-muted-foreground">
                          {t("recurringEditDialog.summary.downPayment")}
                        </p>
                        <p className="text-sm font-semibold">
                          {formatCurrency(initialDownPaymentAmount)}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                      <Card className="bg-muted/20">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">
                            {t("recurringEditDialog.chart.title")}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center gap-3">
                          {distributionChartData.length > 0 ? (
                            <div className="relative h-40 w-40">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <RechartsTooltip
                                    cursor={false}
                                    content={distributionTooltip}
                                  />
                                  <Pie
                                    data={distributionChartData}
                                    dataKey="amount"
                                    nameKey="date"
                                    innerRadius={44}
                                    outerRadius={72}
                                    stroke="var(--background)"
                                    strokeWidth={2}
                                    onMouseEnter={() =>
                                      setIsHoveringDistributionChart(true)
                                    }
                                    onMouseLeave={() =>
                                      setIsHoveringDistributionChart(false)
                                    }
                                  >
                                    {distributionChartData.map((entry) => (
                                      <Cell key={entry.key} fill={entry.fill} />
                                    ))}
                                  </Pie>
                                </PieChart>
                              </ResponsiveContainer>
                              {!isHoveringDistributionChart && (
                                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
                                  <div>
                                    <p className="text-xs text-muted-foreground">
                                      {t("recurringEditDialog.summary.total")}
                                    </p>
                                    <p className="text-sm font-semibold">
                                      {formatCurrency(fullPlanTotal)}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex h-40 w-40 items-center justify-center rounded-full border bg-muted/40 text-xs text-muted-foreground">
                              {t("recurringEditDialog.schedule.empty")}
                            </div>
                          )}
                          <p className="text-center text-xs text-muted-foreground">
                            {t("recurringEditDialog.chart.caption")}
                          </p>
                        </CardContent>
                      </Card>

                      <Card className="bg-muted/20">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">
                            {t("recurringEditDialog.schedule.title")}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="max-h-80 overflow-y-auto p-0">
                          {timelineRows.length === 0 ? (
                            <div className="px-4 py-4 text-sm text-muted-foreground">
                              {t("recurringEditDialog.schedule.empty")}
                            </div>
                          ) : (
                            timelineRows.map((item, index, array) => (
                              <div key={item.key}>
                                <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-2">
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span
                                            className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${
                                              item.isPaid
                                                ? "border-green-500/40 bg-green-500/15 text-green-700 dark:text-green-300"
                                                : !item.isEditable
                                                  ? "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300"
                                                  : item.isManual
                                                    ? "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                                    : "border-border bg-background text-muted-foreground"
                                            }`}
                                          >
                                            {index + 1}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p>
                                            {item.isPaid
                                              ? t(
                                                  "recurringEditDialog.schedule.indicators.paid",
                                                )
                                              : !item.isEditable
                                                ? t(
                                                    "recurringEditDialog.schedule.indicators.locked",
                                                  )
                                                : item.isManual
                                                  ? t(
                                                      "recurringEditDialog.schedule.indicators.custom",
                                                    )
                                                  : t(
                                                      "recurringEditDialog.schedule.indicators.automatic",
                                                    )}
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                      <span className="block text-sm text-muted-foreground">
                                        {item.formattedDate}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex w-full items-center gap-2 sm:w-auto">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={centsToDollars(item.amount)}
                                      disabled={!item.isEditable}
                                      onChange={(event) =>
                                        item.projectedIndex !== null
                                          ? handleInstallmentAmountChange(
                                              item.projectedIndex,
                                              event.target.value,
                                            )
                                          : undefined
                                      }
                                      className="h-8 flex-1 sm:w-32 sm:flex-none"
                                    />
                                  </div>
                                </div>
                                {index < array.length - 1 && <Separator />}
                              </div>
                            ))
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          <DialogFooter className="sticky bottom-0 z-10 shrink-0 border-t bg-background px-4 py-4 sm:px-6">
            <Button
              variant="outline"
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
            >
              {t("recurringEditDialog.cancel")}
            </Button>
            <Button disabled={!canSave} onClick={() => void handleSave()}>
              {isSaving
                ? t("recurringEditDialog.saving")
                : t("recurringEditDialog.save")}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
