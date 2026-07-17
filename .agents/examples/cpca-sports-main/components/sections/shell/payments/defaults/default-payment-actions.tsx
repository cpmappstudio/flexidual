"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
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
import { dollarsToCents } from "@/lib/utils/currency";

const FEE_NAME_SUGGESTIONS = [
  "I-20 Application Fee",
  "Contract Fee",
  "Sport Fee",
  "Club Fee",
  "Sport Uniform Fee",
] as const;

interface DefaultPaymentActionsProps {
  onAddFee: (args: {
    name: string;
    totalAmount: number;
    downPaymentPercent: number;
    isRefundable: boolean;
    isIncluded: boolean;
    isRequired: boolean;
  }) => Promise<void>;
  onAddRecurringPlan: (args: {
    name: string;
    totalAmount: number;
    downPaymentAmount?: number;
    installmentCount: number;
    dueDayOfMonth: number;
    timezone: string;
    isRefundable: boolean;
    isIncluded: boolean;
    isRequired: boolean;
  }) => Promise<void>;
}

function createInitialForm() {
  return {
    name: "",
    totalAmountDollars: 0,
    downPaymentAmountDollars: 0,
    installmentCount: 6,
    isRecurring: false,
    dueDayOfMonth: 5,
    timezone: "America/New_York",
    isRefundable: false,
    isIncluded: false,
    isRequired: false,
  };
}

export function DefaultPaymentActions({
  onAddFee,
  onAddRecurringPlan,
}: DefaultPaymentActionsProps) {
  const t = useTranslations("Applications.payments");
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [form, setForm] = useState(createInitialForm);

  useEffect(() => {
    if (!open) {
      setForm(createInitialForm());
      setShowSuggestions(false);
    }
  }, [open]);

  const filteredFeeNameSuggestions = useMemo(() => {
    if (!showSuggestions) {
      return [];
    }

    const query = form.name.trim().toLowerCase();
    if (!query) {
      return [...FEE_NAME_SUGGESTIONS];
    }

    const startsWith = FEE_NAME_SUGGESTIONS.filter((name) =>
      name.toLowerCase().startsWith(query),
    );
    const includes = FEE_NAME_SUGGESTIONS.filter(
      (name) =>
        !name.toLowerCase().startsWith(query) &&
        name.toLowerCase().includes(query),
    );

    return [...startsWith, ...includes];
  }, [form.name, showSuggestions]);

  const handleSubmit = async () => {
    const name = form.name.trim();
    if (!name || form.totalAmountDollars <= 0) {
      return;
    }

    if (
      form.isRecurring &&
      (form.installmentCount <= 0 ||
        form.downPaymentAmountDollars < 0 ||
        form.downPaymentAmountDollars > form.totalAmountDollars)
    ) {
      return;
    }

    setIsSubmitting(true);
    try {
      if (form.isRecurring) {
        await onAddRecurringPlan({
          name,
          totalAmount: dollarsToCents(form.totalAmountDollars),
          downPaymentAmount:
            form.downPaymentAmountDollars > 0
              ? dollarsToCents(form.downPaymentAmountDollars)
              : undefined,
          installmentCount: form.installmentCount,
          dueDayOfMonth: form.dueDayOfMonth,
          timezone: form.timezone,
          isRefundable: form.isRefundable,
          isIncluded: form.isIncluded,
          isRequired: form.isRequired,
        });
      } else {
        await onAddFee({
          name,
          totalAmount: dollarsToCents(form.totalAmountDollars),
          downPaymentPercent: 100,
          isRefundable: form.isRefundable,
          isIncluded: form.isIncluded,
          isRequired: form.isRequired,
        });
      }

      setOpen(false);
    } catch (error) {
      console.error("Failed to add payment default:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuggestionSelect = (suggestion: string) => {
    setForm((current) => ({ ...current, name: suggestion }));
    setShowSuggestions(false);
  };

  return (
    <>
      <div className="flex justify-start">
        <Button type="button" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          {t("actions.addFee")}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("actions.addFee")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="default-fee-name">{t("form.feeName")}</Label>
              <div className="relative">
                <Input
                  id="default-fee-name"
                  value={form.name}
                  placeholder={t("form.feeNamePlaceholder")}
                  autoComplete="off"
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setShowSuggestions(false)}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }));
                    setShowSuggestions(true);
                  }}
                />
                {filteredFeeNameSuggestions.length > 0 ? (
                  <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
                    {filteredFeeNameSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleSuggestionSelect(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="default-fee-amount">{t("form.totalAmount")}</Label>
                <Input
                  id="default-fee-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.totalAmountDollars || ""}
                  placeholder={t("form.amountPlaceholder")}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      totalAmountDollars: Number(event.target.value) || 0,
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="default-recurring"
                checked={form.isRecurring}
                onCheckedChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    isRecurring: checked === true,
                  }))
                }
              />
              <Label htmlFor="default-recurring">{t("form.recurring")}</Label>
            </div>

            {form.isRecurring ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="default-fee-down-payment">
                    {t("form.downPaymentAmount")}
                  </Label>
                  <Input
                    id="default-fee-down-payment"
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.downPaymentAmountDollars || ""}
                    placeholder={t("form.amountPlaceholder")}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        downPaymentAmountDollars:
                          Number(event.target.value) || 0,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="default-fee-installment-count">
                    {t("form.installmentCount")}
                  </Label>
                  <Input
                    id="default-fee-installment-count"
                    type="number"
                    min={1}
                    step={1}
                    value={form.installmentCount || ""}
                    placeholder={t("form.installmentCountPlaceholder")}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        installmentCount: Number(event.target.value) || 0,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="default-fee-due-day">
                    {t("form.dueDayOfMonth")}
                  </Label>
                  <Input
                    id="default-fee-due-day"
                    type="number"
                    min={1}
                    max={31}
                    value={form.dueDayOfMonth}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        dueDayOfMonth: Number(event.target.value) || 1,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="default-fee-timezone">{t("form.timezone")}</Label>
                  <Select
                    value={form.timezone}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        timezone: value,
                      }))
                    }
                  >
                    <SelectTrigger id="default-fee-timezone">
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
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.isRefundable}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({
                      ...current,
                      isRefundable: checked === true,
                    }))
                  }
                />
                <span>{t("form.refundable")}</span>
              </label>

              <label className="inline-flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.isIncluded}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({
                      ...current,
                      isIncluded: checked === true,
                    }))
                  }
                />
                <span>{t("form.included")}</span>
              </label>

              <label className="inline-flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.isRequired}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({
                      ...current,
                      isRequired: checked === true,
                    }))
                  }
                />
                <span>{t("form.required")}</span>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              {t("actions.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isSubmitting}
            >
              {isSubmitting ? t("form.adding") : t("form.addButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
