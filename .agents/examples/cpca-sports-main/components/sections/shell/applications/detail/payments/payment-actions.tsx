"use client";

import { useEffect, useMemo, useState } from "react";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import {
  Dialog,
  DialogClose,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, CreditCard, Trash2, Banknote, FileDown } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import {
  centsToDollars,
  dollarsToCents,
  formatCurrency,
} from "@/lib/utils/currency";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { DateRangePopover } from "./date-range-popover";
import { toast } from "sonner";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

type RecurringScope = "single" | "this_and_following";

interface PaymentActionsProps {
  applicationId: Id<"applications">;
  organizationSlug: string;
  selectedFeeIds: Id<"fees">[];
  selectedRemainingTotalCents: number;
  selectedSingleRemainingCents: number | null;
  hasSelectedRecurringFees: boolean;
  onAddFee: (args: {
    applicationId: Id<"applications">;
    name: string;
    description?: string;
    totalAmount: number;
    downPaymentPercent: number;
    isRefundable: boolean;
    isIncluded: boolean;
    isRequired: boolean;
  }) => Promise<Id<"fees">>;
  onAddRecurringPlan: (args: {
    applicationId: Id<"applications">;
    name: string;
    description?: string;
    totalAmount: number;
    downPaymentAmount?: number;
    startDate: string;
    endDate: string;
    dueDayOfMonth: number;
    timezone: string;
    isRefundable: boolean;
    isIncluded: boolean;
    isRequired: boolean;
  }) => Promise<{ planId: Id<"recurringFeePlans">; feeIds: Id<"fees">[] }>;
  onDeleteSelected: (scope?: RecurringScope) => Promise<void>;
  onPay: () => Promise<void>;
  onMarkAsPaid: (args?: { amountCents?: number }) => Promise<void>;
}

const FEE_NAME_SUGGESTIONS = [
  "I-20 Application Fee",
  "Contract Fee",
  "Sport Fee",
  "Club Fee",
  "Sport Uniform Fee",
] as const;

function toDateInputValue(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function toMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0);
}

export function PaymentActions({
  applicationId,
  organizationSlug,
  selectedFeeIds,
  selectedRemainingTotalCents,
  selectedSingleRemainingCents,
  hasSelectedRecurringFees,
  onAddFee,
  onAddRecurringPlan,
  onDeleteSelected,
  onPay,
  onMarkAsPaid,
}: PaymentActionsProps) {
  const t = useTranslations("Applications.payments");
  const { isAdmin } = useIsAdmin();
  const [isAddingFee, setIsAddingFee] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isMarkingAsPaid, setIsMarkingAsPaid] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMarkAsPaidDialogOpen, setIsMarkAsPaidDialogOpen] = useState(false);
  const [markAsPaidUseFullAmount, setMarkAsPaidUseFullAmount] = useState(true);
  const [markAsPaidAmountDollars, setMarkAsPaidAmountDollars] = useState(0);
  const [showFeeNameSuggestions, setShowFeeNameSuggestions] = useState(false);
  const [recurringDateRange, setRecurringDateRange] = useState<
    DateRange | undefined
  >(undefined);
  const [isWireTransferDialogOpen, setIsWireTransferDialogOpen] =
    useState(false);
  const paymentSettings = useQuery(api.paymentSettings.getByOrganizationSlug, {
    organizationSlug,
  });

  const hasSelectedFees = selectedFeeIds.length > 0;
  const canMarkAsPaid = hasSelectedFees && !isMarkingAsPaid;
  const canDeleteSelected = hasSelectedFees && !isDeleting;
  const isWireTransferSettingsLoading = paymentSettings === undefined;
  const wireTransferEnabled = paymentSettings?.wireTransferEnabled ?? false;
  const wireTransferThresholdCents =
    paymentSettings?.wireTransferThresholdCents ?? null;
  const wireTransferPdfHref = paymentSettings?.wireTransferPdfUrl ?? null;
  const wireTransferPdfName = paymentSettings?.wireTransferPdfFileName ?? null;
  const [newFee, setNewFee] = useState({
    name: "",
    totalAmountDollars: 0,
    downPaymentAmountDollars: 0,
    isRecurring: false,
    dueDayOfMonth: 5,
    timezone: "America/New_York",
    isRefundable: false,
    isIncluded: false,
    isRequired: false,
  });

  const getInstallmentCount = (startDate: string, endDate: string) => {
    if (!startDate || !endDate) return 0;
    const [startYear, startMonth] = startDate.split("-").map(Number);
    const [endYear, endMonth] = endDate.split("-").map(Number);
    if (!startYear || !startMonth || !endYear || !endMonth) return 0;
    const startKey = startYear * 12 + startMonth;
    const endKey = endYear * 12 + endMonth;
    return endKey >= startKey ? endKey - startKey + 1 : 0;
  };

  const resetNewFee = () => {
    setNewFee({
      name: "",
      totalAmountDollars: 0,
      downPaymentAmountDollars: 0,
      isRecurring: false,
      dueDayOfMonth: 5,
      timezone: "America/New_York",
      isRefundable: false,
      isIncluded: false,
      isRequired: false,
    });
    setRecurringDateRange(undefined);
  };

  const handleAddFee = async () => {
    if (!newFee.name || !newFee.totalAmountDollars) return;

    setIsSubmitting(true);
    try {
      if (newFee.isRecurring) {
        const startDate = recurringDateRange?.from
          ? toDateInputValue(toMonthStart(recurringDateRange.from))
          : "";
        const endDate = recurringDateRange?.to
          ? toDateInputValue(toMonthStart(recurringDateRange.to))
          : "";

        if (!startDate || !endDate) {
          throw new Error("Start date and end date are required");
        }

        const installmentCount = getInstallmentCount(startDate, endDate);
        if (installmentCount <= 0) {
          throw new Error("Recurring period is invalid");
        }

        if (
          newFee.downPaymentAmountDollars < 0 ||
          newFee.downPaymentAmountDollars > newFee.totalAmountDollars
        ) {
          throw new Error("Down payment amount is invalid");
        }

        await onAddRecurringPlan({
          applicationId,
          name: newFee.name,
          totalAmount: dollarsToCents(newFee.totalAmountDollars),
          downPaymentAmount:
            newFee.downPaymentAmountDollars > 0
              ? dollarsToCents(newFee.downPaymentAmountDollars)
              : undefined,
          startDate,
          endDate,
          dueDayOfMonth: newFee.dueDayOfMonth,
          timezone: newFee.timezone,
          isRefundable: newFee.isRefundable,
          isIncluded: newFee.isIncluded,
          isRequired: newFee.isRequired,
        });
      } else {
        await onAddFee({
          applicationId,
          name: newFee.name,
          totalAmount: dollarsToCents(newFee.totalAmountDollars),
          downPaymentPercent: 100,
          isRefundable: newFee.isRefundable,
          isIncluded: newFee.isIncluded,
          isRequired: newFee.isRequired,
        });
      }

      resetNewFee();
      setIsAddingFee(false);
    } catch (error) {
      console.error("Failed to add fee:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePay = async () => {
    if (
      !hasSelectedFees ||
      isProcessingPayment ||
      isWireTransferSettingsLoading
    )
      return;

    if (wireTransferEnabled) {
      if (
        wireTransferThresholdCents === null ||
        wireTransferThresholdCents <= 0 ||
        !wireTransferPdfHref ||
        !wireTransferPdfName
      ) {
        toast.error(
          t("actions.wireTransferDialog.errors.invalidConfiguration"),
        );
        return;
      }

      if (selectedRemainingTotalCents >= wireTransferThresholdCents) {
        setIsWireTransferDialogOpen(true);
        return;
      }
    }

    setIsProcessingPayment(true);
    try {
      await onPay();
    } catch (error) {
      console.error("Failed to create payment link:", error);
      setIsProcessingPayment(false);
    }
  };

  const canEnterPartialAmount =
    selectedSingleRemainingCents !== null && selectedSingleRemainingCents > 0;
  const markAsPaidMaxCents =
    selectedSingleRemainingCents ?? selectedRemainingTotalCents;
  const markAsPaidMaxDollars = centsToDollars(markAsPaidMaxCents);

  useEffect(() => {
    setMarkAsPaidUseFullAmount(true);
    setMarkAsPaidAmountDollars(markAsPaidMaxDollars);
  }, [markAsPaidMaxDollars]);

  const markAsPaidAmountCents = useMemo(() => {
    if (!Number.isFinite(markAsPaidAmountDollars)) {
      return NaN;
    }
    return dollarsToCents(markAsPaidAmountDollars);
  }, [markAsPaidAmountDollars]);

  const markAsPaidResolvedAmountCents = markAsPaidUseFullAmount
    ? markAsPaidMaxCents
    : markAsPaidAmountCents;

  const markAsPaidAmountValid =
    markAsPaidResolvedAmountCents > 0 &&
    markAsPaidResolvedAmountCents <= markAsPaidMaxCents;

  const handleMarkAsPaidConfirm = async () => {
    if (!hasSelectedFees || isMarkingAsPaid) {
      return;
    }

    if (!markAsPaidAmountValid) {
      toast.error(
        t("actions.markAsPaidDialog.errors.invalidAmount", {
          max: formatCurrency(markAsPaidMaxCents),
        }),
      );
      return;
    }

    setIsMarkingAsPaid(true);
    try {
      if (canEnterPartialAmount && !markAsPaidUseFullAmount) {
        await onMarkAsPaid({ amountCents: markAsPaidResolvedAmountCents });
      } else {
        await onMarkAsPaid();
      }
      setIsMarkAsPaidDialogOpen(false);
    } catch (error) {
      console.error("Failed to mark fees as paid:", error);
    } finally {
      setIsMarkingAsPaid(false);
    }
  };

  const handleDelete = async (scope: RecurringScope = "single") => {
    if (!hasSelectedFees || isDeleting) return;

    setIsDeleting(true);
    try {
      await onDeleteSelected(scope);
    } catch (error) {
      console.error("Failed to delete fees:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const recurringStartDate = recurringDateRange?.from
    ? toDateInputValue(toMonthStart(recurringDateRange.from))
    : "";
  const recurringEndDate = recurringDateRange?.to
    ? toDateInputValue(toMonthStart(recurringDateRange.to))
    : "";
  const recurringInstallmentCount = getInstallmentCount(
    recurringStartDate,
    recurringEndDate,
  );
  const filteredFeeNameSuggestions = useMemo(() => {
    if (!showFeeNameSuggestions) {
      return [];
    }

    const query = newFee.name.trim().toLowerCase();
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
  }, [newFee.name, showFeeNameSuggestions]);
  const startMonthText = useMemo(() => {
    return recurringDateRange?.from
      ? format(recurringDateRange.from, "LLL yyyy")
      : "-";
  }, [recurringDateRange]);
  const endMonthText = useMemo(() => {
    return recurringDateRange?.to
      ? format(recurringDateRange.to, "LLL yyyy")
      : "-";
  }, [recurringDateRange]);

  const handleFeeNameSuggestionSelect = (suggestion: string) => {
    setNewFee({ ...newFee, name: suggestion });
    setShowFeeNameSuggestions(false);
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block w-fit">
                <Button
                  size="sm"
                  variant="default"
                  disabled={
                    !hasSelectedFees ||
                    isProcessingPayment ||
                    isWireTransferSettingsLoading
                  }
                  onClick={handlePay}
                >
                  <CreditCard />
                  {isProcessingPayment
                    ? t("actions.processing")
                    : t("actions.pay")}
                </Button>
              </span>
            </TooltipTrigger>
            {isWireTransferSettingsLoading && (
              <TooltipContent>
                <p>{t("actions.tooltips.loadingPaymentRules")}</p>
              </TooltipContent>
            )}
            {!hasSelectedFees &&
              !isProcessingPayment &&
              !isWireTransferSettingsLoading && (
                <TooltipContent>
                  <p>{t("actions.tooltips.selectToPay")}</p>
                </TooltipContent>
              )}
          </Tooltip>
          {isAdmin && (
            <>
              {canMarkAsPaid ? (
                <AlertDialog
                  open={isMarkAsPaidDialogOpen}
                  onOpenChange={setIsMarkAsPaidDialogOpen}
                >
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      className="bg-green-500 hover:bg-green-400"
                    >
                      <Banknote />
                      <span className="hidden md:inline">
                        {isMarkingAsPaid
                          ? t("actions.markingAsPaid")
                          : t("actions.markAsPaid")}
                      </span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                      <AlertDialogMedia className="bg-green-500/10 text-green-500 dark:bg-green-500/20 dark:text-green-500">
                        <Banknote />
                      </AlertDialogMedia>
                      <AlertDialogTitle>
                        {t("actions.markAsPaidDialog.title")}
                      </AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-2">
                          <div>{t("actions.markAsPaidDialog.description")}</div>
                          <div className="text-muted-foreground text-xs">
                            {t("actions.markAsPaidDialog.accountability")}
                          </div>
                          <Card className="border-dashed">
                            <CardContent className="p-3">
                              <div className="flex items-center justify-between gap-2 text-sm font-medium">
                                <span>
                                  {t(
                                    "actions.markAsPaidDialog.amount.totalSelected",
                                  )}
                                </span>
                                <span className="tabular-nums">
                                  {formatCurrency(selectedRemainingTotalCents)}
                                </span>
                              </div>

                              {canEnterPartialAmount ? (
                                <div className="mt-3 space-y-3">
                                  <label className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                      checked={markAsPaidUseFullAmount}
                                      onCheckedChange={(checked) =>
                                        setMarkAsPaidUseFullAmount(
                                          checked === true,
                                        )
                                      }
                                    />
                                    <span>
                                      {t(
                                        "actions.markAsPaidDialog.amount.payFullRemaining",
                                      )}
                                    </span>
                                  </label>

                                  <div className="grid gap-2">
                                    <Label>
                                      {t(
                                        "actions.markAsPaidDialog.amount.amountLabel",
                                      )}
                                    </Label>
                                    <Input
                                      type="number"
                                      inputMode="decimal"
                                      step="0.01"
                                      min={0}
                                      max={markAsPaidMaxDollars}
                                      disabled={markAsPaidUseFullAmount}
                                      value={markAsPaidAmountDollars}
                                      placeholder={t(
                                        "actions.markAsPaidDialog.amount.amountPlaceholder",
                                      )}
                                      onChange={(e) => {
                                        const next = e.target.value;
                                        const parsed = next
                                          ? Number.parseFloat(next)
                                          : 0;
                                        setMarkAsPaidAmountDollars(parsed);
                                      }}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                      {t(
                                        "actions.markAsPaidDialog.amount.maxHelp",
                                        {
                                          max: formatCurrency(
                                            markAsPaidMaxCents,
                                          ),
                                        },
                                      )}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <p className="mt-3 text-xs text-muted-foreground">
                                  {t(
                                    "actions.markAsPaidDialog.amount.multiFeeNote",
                                  )}
                                </p>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel variant="outline">
                        {t("actions.markAsPaidDialog.cancel")}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        style={{
                          backgroundColor: "#22c55e",
                          color: "white",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "#4ade80";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "#22c55e";
                        }}
                        disabled={!markAsPaidAmountValid}
                        onClick={handleMarkAsPaidConfirm}
                      >
                        {canEnterPartialAmount && !markAsPaidUseFullAmount
                          ? t("actions.markAsPaidDialog.confirmPartial")
                          : t("actions.markAsPaidDialog.confirm")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-block w-fit">
                      <Button
                        size="sm"
                        className="bg-green-500 hover:bg-green-400"
                        disabled={true}
                      >
                        <Banknote />
                        <span className="hidden md:inline">
                          {isMarkingAsPaid
                            ? t("actions.markingAsPaid")
                            : t("actions.markAsPaid")}
                        </span>
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!hasSelectedFees && (
                    <TooltipContent>
                      <p>{t("actions.tooltips.selectToMarkAsPaid")}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              )}
              {canDeleteSelected ? (
                hasSelectedRecurringFees ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive">
                        <Trash2 />
                        <span className="hidden md:inline">
                          {isDeleting
                            ? t("actions.deleting")
                            : t("actions.delete")}
                        </span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent size="sm">
                      <AlertDialogHeader>
                        <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
                          <Trash2 />
                        </AlertDialogMedia>
                        <AlertDialogTitle>
                          {t("actions.deleteRecurringScopeDialog.title")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("actions.deleteRecurringScopeDialog.description")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="flex flex-col gap-2 sm:flex-col">
                        <AlertDialogAction
                          variant="destructive"
                          className="w-full sm:w-auto"
                          onClick={() =>
                            void handleDelete("this_and_following")
                          }
                        >
                          {t(
                            "actions.deleteRecurringScopeDialog.thisAndFollowing",
                          )}
                        </AlertDialogAction>

                        <AlertDialogAction
                            variant="outline"
                            className="w-full sm:w-auto border-destructive"
                            onClick={() => void handleDelete("single")}
                          >
                            {t("actions.deleteRecurringScopeDialog.single")}
                          </AlertDialogAction>

                        <AlertDialogCancel
                          variant="outline"
                          className="w-full mt-0"
                        >
                          {t("actions.deleteDialog.cancel")}
                        </AlertDialogCancel>
                      </div>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive">
                        <Trash2 />
                        <span className="hidden md:inline">
                          {isDeleting
                            ? t("actions.deleting")
                            : t("actions.delete")}
                        </span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent size="sm">
                      <AlertDialogHeader>
                        <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive">
                          <Trash2 />
                        </AlertDialogMedia>
                        <AlertDialogTitle>
                          {t("actions.deleteDialog.title")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("actions.deleteDialog.description")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel variant="outline">
                          {t("actions.deleteDialog.cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => void handleDelete("single")}
                        >
                          {t("actions.deleteDialog.confirm")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-block w-fit">
                      <Button size="sm" variant="destructive" disabled={true}>
                        <Trash2 />
                        <span className="hidden md:inline">
                          {isDeleting
                            ? t("actions.deleting")
                            : t("actions.delete")}
                        </span>
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t("actions.tooltips.selectToDelete")}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </>
          )}
        </div>
        {isAdmin && (
          <Button
            size="sm"
            variant={isAddingFee ? "outline" : "default"}
            onClick={() => setIsAddingFee(!isAddingFee)}
          >
            {isAddingFee ? (
              <span className="hidden md:inline">{t("actions.cancel")}</span>
            ) : (
              <>
                <Plus />
                <span className="hidden md:inline">{t("actions.addFee")}</span>
              </>
            )}
          </Button>
        )}
      </div>
      <Dialog
        open={isWireTransferDialogOpen}
        onOpenChange={setIsWireTransferDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("actions.wireTransferDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("actions.wireTransferDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("actions.wireTransferDialog.amountInfo", {
                amount: formatCurrency(selectedRemainingTotalCents),
                threshold: formatCurrency(wireTransferThresholdCents ?? 0),
              })}
            </p>
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {t("actions.wireTransferDialog.instructionTitle")}
              </p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>{t("actions.wireTransferDialog.stepVerify")}</li>
                <li>{t("actions.wireTransferDialog.stepReference")}</li>
                <li>{t("actions.wireTransferDialog.stepProof")}</li>
              </ol>
              <p className="text-xs text-muted-foreground">
                {t("actions.wireTransferDialog.safetyNote")}
              </p>
            </div>
            <Item variant="outline" size="sm">
              <ItemMedia variant="icon">
                <FileDown />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>
                  {t("actions.wireTransferDialog.downloadTitle")}
                </ItemTitle>
                <ItemDescription>
                  {t("actions.wireTransferDialog.downloadDescription")}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                {wireTransferPdfHref && wireTransferPdfName && (
                  <Button type="button" variant="outline" asChild>
                    <a
                      href={wireTransferPdfHref}
                      download={wireTransferPdfName}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("actions.wireTransferDialog.downloadAction")}
                    </a>
                  </Button>
                )}
              </ItemActions>
            </Item>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("actions.wireTransferDialog.close")}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {isAddingFee && (
        <Card>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="fee-name">{t("form.feeName")}</Label>
                <div className="relative">
                  <Input
                    id="fee-name"
                    placeholder={t("form.feeNamePlaceholder")}
                    value={newFee.name}
                    autoComplete="off"
                    onFocus={() => setShowFeeNameSuggestions(true)}
                    onBlur={() => setShowFeeNameSuggestions(false)}
                    onChange={(e) => {
                      setNewFee({ ...newFee, name: e.target.value });
                      setShowFeeNameSuggestions(true);
                    }}
                  />
                  {filteredFeeNameSuggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
                      {filteredFeeNameSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() =>
                            handleFeeNameSuggestionSelect(suggestion)
                          }
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="total-amount">{t("form.totalAmount")}</Label>
                <Input
                  id="total-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={t("form.amountPlaceholder")}
                  value={newFee.totalAmountDollars || ""}
                  onChange={(e) =>
                    setNewFee({
                      ...newFee,
                      totalAmountDollars: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="flex items-center space-x-2 md:col-span-2">
                <input
                  type="checkbox"
                  id="is-recurring"
                  checked={newFee.isRecurring}
                  onChange={(e) =>
                    setNewFee({ ...newFee, isRecurring: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="is-recurring" className="cursor-pointer">
                  {t("form.recurring")}
                </Label>
              </div>

              {newFee.isRecurring && (
                <>
                  <div className="space-y-2 md:col-span-2">
                    <Label>{`${t("form.startDate")} - ${t("form.endDate")}`}</Label>
                    <DateRangePopover
                      dateRange={recurringDateRange}
                      onSelect={setRecurringDateRange}
                      placeholder={t("form.selectDateRange")}
                      className="w-full justify-start px-2.5 font-normal"
                      displayFormat="month"
                      disabled={(date) =>
                        date < new Date("1900-01-01") ||
                        date > new Date("2100-12-31")
                      }
                    />
                    <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                      <p>{`${t("form.startDate")}: ${startMonthText}`}</p>
                      <p>{`${t("form.endDate")}: ${endMonthText}`}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="due-day">{t("form.dueDayOfMonth")}</Label>
                    <Input
                      id="due-day"
                      type="number"
                      min="1"
                      max="31"
                      value={newFee.dueDayOfMonth}
                      onChange={(e) =>
                        setNewFee({
                          ...newFee,
                          dueDayOfMonth: Math.max(
                            1,
                            Math.min(31, Number(e.target.value) || 1),
                          ),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("form.timezone")}</Label>
                    <Select
                      value={newFee.timezone}
                      onValueChange={(value) =>
                        setNewFee({ ...newFee, timezone: value })
                      }
                    >
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
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="down-payment">
                      {t("form.downPaymentAmount")}
                    </Label>
                    <Input
                      id="down-payment"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={t("form.amountPlaceholder")}
                      value={newFee.downPaymentAmountDollars || ""}
                      onChange={(e) =>
                        setNewFee({
                          ...newFee,
                          downPaymentAmountDollars:
                            parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  {recurringInstallmentCount > 0 && (
                    <div className="md:col-span-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      {t("form.recurringPreview", {
                        count: recurringInstallmentCount,
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="refundable"
                  checked={newFee.isRefundable}
                  onChange={(e) =>
                    setNewFee({ ...newFee, isRefundable: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="refundable" className="cursor-pointer">
                  {t("form.refundable")}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="included"
                  checked={newFee.isIncluded}
                  onChange={(e) =>
                    setNewFee({ ...newFee, isIncluded: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="included" className="cursor-pointer">
                  {t("form.included")}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="required"
                  checked={newFee.isRequired}
                  onChange={(e) =>
                    setNewFee({ ...newFee, isRequired: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="required" className="cursor-pointer">
                  {t("form.required")}
                </Label>
              </div>
            </div>
            <Button
              onClick={handleAddFee}
              className="w-full"
              disabled={
                isSubmitting ||
                !newFee.name ||
                !newFee.totalAmountDollars ||
                (newFee.isRecurring &&
                  (!recurringStartDate ||
                    !recurringEndDate ||
                    recurringInstallmentCount <= 0))
              }
            >
              {isSubmitting ? t("form.adding") : t("form.addButton")}
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}
