"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { centsToDollars, dollarsToCents } from "@/lib/utils/currency";
import type { PaymentDefaultFeeLike } from "./payment-default-types";

function resolveInstallmentCount(
  preferredCount: number | undefined,
  fallbackCount: number,
) {
  return Math.max(preferredCount ?? fallbackCount, 1);
}

interface DefaultRecurringFeeEditDialogProps<
  TFee extends PaymentDefaultFeeLike,
> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fee: TFee;
  installments: TFee[];
  onSave: (args: {
    feeId: TFee["_id"];
    name: string;
    totalAmount: number;
    installmentCount: number;
    dueDayOfMonth: number;
    timezone: string;
    isRefundable: boolean;
    isIncluded: boolean;
    isRequired: boolean;
    installmentAmounts: number[];
  }) => Promise<void>;
}

export function DefaultRecurringFeeEditDialog<
  TFee extends PaymentDefaultFeeLike,
>({
  open,
  onOpenChange,
  fee,
  installments,
  onSave,
}: DefaultRecurringFeeEditDialogProps<TFee>) {
  const t = useTranslations("Applications.payments");
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState(fee.name);
  const [totalAmountDollars, setTotalAmountDollars] = useState(
    centsToDollars(fee.totalAmount),
  );
  const [installmentCount, setInstallmentCount] = useState(
    resolveInstallmentCount(fee.installmentCount, installments.length),
  );
  const [dueDayOfMonth, setDueDayOfMonth] = useState(fee.dueDayOfMonth ?? 5);
  const [timezone, setTimezone] = useState(fee.timezone ?? "America/New_York");
  const [isRefundable, setIsRefundable] = useState(fee.isRefundable);
  const [isIncluded, setIsIncluded] = useState(fee.isIncluded);
  const [isRequired, setIsRequired] = useState(fee.isRequired);

  const orderedInstallments = useMemo(
    () =>
      [...installments].sort((a, b) => {
        const aIndex = a.installmentIndex ?? Number.MAX_SAFE_INTEGER;
        const bIndex = b.installmentIndex ?? Number.MAX_SAFE_INTEGER;
        if (aIndex !== bIndex) {
          return aIndex - bIndex;
        }

        return a.createdAt - b.createdAt;
      }),
    [installments],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const totalCents = orderedInstallments.reduce(
      (sum, installment) => sum + installment.totalAmount,
      0,
    );

    setName(fee.name);
    setTotalAmountDollars(centsToDollars(totalCents || fee.totalAmount));
    setInstallmentCount(
      resolveInstallmentCount(fee.installmentCount, orderedInstallments.length),
    );
    setDueDayOfMonth(fee.dueDayOfMonth ?? 5);
    setTimezone(fee.timezone ?? "America/New_York");
    setIsRefundable(fee.isRefundable);
    setIsIncluded(fee.isIncluded);
    setIsRequired(fee.isRequired);
  }, [open, orderedInstallments, fee]);

  const installmentAmounts = useMemo(() => {
    if (installmentCount <= 0) {
      return [];
    }

    const totalCents = dollarsToCents(totalAmountDollars);
    const base = Math.floor(totalCents / installmentCount);
    const remainder = totalCents - base * installmentCount;

    return Array.from(
      { length: installmentCount },
      (_, index) => base + (index < remainder ? 1 : 0),
    );
  }, [installmentCount, totalAmountDollars]);

  const handleSave = async () => {
    if (
      !name.trim() ||
      totalAmountDollars <= 0 ||
      installmentCount <= 0 ||
      dueDayOfMonth < 1 ||
      dueDayOfMonth > 31
    ) {
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        feeId: fee._id,
        name: name.trim(),
        totalAmount: dollarsToCents(totalAmountDollars),
        installmentCount,
        dueDayOfMonth,
        timezone,
        isRefundable,
        isIncluded,
        isRequired,
        installmentAmounts,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to update recurring payment default:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("recurringEditDialog.title")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>{t("recurringEditDialog.fields.name")}</Label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("recurringEditDialog.fields.totalAmount")}</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={totalAmountDollars || ""}
              onChange={(event) =>
                setTotalAmountDollars(Number(event.target.value) || 0)
              }
            />
          </div>

          <div className="space-y-2">
            <Label>{t("recurringEditDialog.fields.installmentCount")}</Label>
            <Input
              type="number"
              min={1}
              step={1}
              value={installmentCount || ""}
              onChange={(event) =>
                setInstallmentCount(Number(event.target.value) || 0)
              }
            />
          </div>

          <div className="space-y-2">
            <Label>{t("recurringEditDialog.fields.dueDayOfMonth")}</Label>
            <Input
              type="number"
              min={1}
              max={31}
              value={dueDayOfMonth}
              onChange={(event) => setDueDayOfMonth(Number(event.target.value))}
            />
          </div>

          <div className="space-y-2">
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

          <label className="inline-flex items-center gap-2 text-sm">
            <Checkbox
              checked={isRefundable}
              onCheckedChange={(checked) => setIsRefundable(checked === true)}
            />
            <span>{t("form.refundable")}</span>
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <Checkbox
              checked={isIncluded}
              onCheckedChange={(checked) => setIsIncluded(checked === true)}
            />
            <span>{t("form.included")}</span>
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <Checkbox
              checked={isRequired}
              onCheckedChange={(checked) => setIsRequired(checked === true)}
            />
            <span>{t("form.required")}</span>
          </label>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            {t("actions.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
          >
            {isSaving ? t("actions.saving") : t("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
