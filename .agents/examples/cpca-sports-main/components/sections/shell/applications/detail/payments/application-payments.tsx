"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FeeCard } from "./fee-card";
import { PaymentActions } from "./payment-actions";
import { Id } from "@/convex/_generated/dataModel";
import { type Fee } from "@/lib/applications/fee-types";
import { useTranslations } from "next-intl";
import { isRecurringFee } from "@/lib/payments/due-status";

type RecurringScope = "single" | "this_and_following";

interface ApplicationPaymentsProps {
  applicationId: Id<"applications">;
  organizationSlug: string;
  fees: Fee[];
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
  onRemoveFee: (args: {
    feeId: Id<"fees">;
    scope?: RecurringScope;
  }) => Promise<null>;
  onRecordPayment: (args: {
    feeId: Id<"fees">;
    amount: number;
    method: "cash" | "wire";
    reference?: string;
  }) => Promise<Id<"transactions">>;
  onUpdateFee: (args: {
    feeId: Id<"fees">;
    name: string;
    totalAmount?: number;
    scope?: RecurringScope;
  }) => Promise<null>;
  onUpdateRecurringFee: (args: {
    feeId: Id<"fees">;
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
  }) => Promise<null>;
  onCreatePaymentLink: (args: {
    applicationId: Id<"applications">;
    feeIds: Id<"fees">[];
    redirectUrl: string;
  }) => Promise<{ paymentUrl: string; paymentLinkId: string; orderId: string }>;
}

export function ApplicationPayments({
  applicationId,
  organizationSlug,
  fees,
  onAddFee,
  onAddRecurringPlan,
  onRemoveFee,
  onRecordPayment,
  onUpdateFee,
  onUpdateRecurringFee,
  onCreatePaymentLink,
}: ApplicationPaymentsProps) {
  const t = useTranslations("Applications.payments");

  const pendingFees = useMemo(
    () => fees.filter((fee) => fee.status !== "paid"),
    [fees],
  );

  const sortedPendingFees = useMemo(() => {
    return [...pendingFees].sort((a, b) => {
      const aRecurring = isRecurringFee(a);
      const bRecurring = isRecurringFee(b);

      if (aRecurring && bRecurring) {
        return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
      }

      if (!aRecurring && !bRecurring) {
        return b.createdAt - a.createdAt;
      }

      return aRecurring ? 1 : -1;
    });
  }, [pendingFees]);

  const { actionableFees, projectionFees } = useMemo(() => {
    const actionableIds = new Set<Id<"fees">>();
    const projectionIds = new Set<Id<"fees">>();
    const recurringByPlan = new Map<string, Fee[]>();

    for (const fee of sortedPendingFees) {
      if (!isRecurringFee(fee)) {
        actionableIds.add(fee._id);
        continue;
      }

      const planKey = fee.recurringPlanId
        ? String(fee.recurringPlanId)
        : `__orphan_${fee._id}`;
      const current = recurringByPlan.get(planKey) ?? [];
      current.push(fee);
      recurringByPlan.set(planKey, current);
    }

    for (const installments of recurringByPlan.values()) {
      const ordered = [...installments].sort((a, b) => {
        const aIndex = a.installmentIndex ?? Number.MAX_SAFE_INTEGER;
        const bIndex = b.installmentIndex ?? Number.MAX_SAFE_INTEGER;
        if (aIndex !== bIndex) {
          return aIndex - bIndex;
        }

        const dueCompare = (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
        if (dueCompare !== 0) {
          return dueCompare;
        }

        return a.createdAt - b.createdAt;
      });

      const nextInstallment = ordered[0];
      if (nextInstallment) {
        actionableIds.add(nextInstallment._id);
      }

      for (const installment of ordered.slice(1)) {
        projectionIds.add(installment._id);
      }
    }

    const actionable = sortedPendingFees.filter((fee) =>
      actionableIds.has(fee._id),
    );
    const projection = sortedPendingFees.filter((fee) =>
      projectionIds.has(fee._id),
    );

    return {
      actionableFees: actionable,
      projectionFees: projection,
    };
  }, [sortedPendingFees]);

  const [selectedFeeIds, setSelectedFeeIds] = useState<Set<Id<"fees">>>(
    new Set(),
  );
  const recurringInstallmentsByPlan = useMemo(() => {
    const map = new Map<string, Fee[]>();

    for (const fee of fees) {
      if (!fee.recurringPlanId) {
        continue;
      }
      const key = String(fee.recurringPlanId);
      const current = map.get(key) ?? [];
      current.push(fee);
      map.set(key, current);
    }

    for (const [key, installments] of map.entries()) {
      map.set(
        key,
        [...installments].sort((a, b) => {
          const aIndex = a.installmentIndex ?? Number.MAX_SAFE_INTEGER;
          const bIndex = b.installmentIndex ?? Number.MAX_SAFE_INTEGER;
          if (aIndex !== bIndex) {
            return aIndex - bIndex;
          }
          return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
        }),
      );
    }

    return map;
  }, [fees]);

  const selectedFees = useMemo(
    () => fees.filter((fee) => selectedFeeIds.has(fee._id)),
    [fees, selectedFeeIds],
  );
  const hasSelectedRecurringFees = useMemo(
    () => selectedFees.some((fee) => isRecurringFee(fee)),
    [selectedFees],
  );

  useEffect(() => {
    const actionableIds = new Set(actionableFees.map((fee) => fee._id));
    setSelectedFeeIds((prev) => {
      const next = new Set(
        [...prev].filter((feeId) => actionableIds.has(feeId)),
      );
      return next.size === prev.size ? prev : next;
    });
  }, [actionableFees]);

  const handleFeeSelect = useCallback((feeId: Id<"fees">, checked: boolean) => {
    setSelectedFeeIds((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(feeId);
      } else {
        newSet.delete(feeId);
      }
      return newSet;
    });
  }, []);

  const handleUpdateFee = useCallback(
    async (
      feeId: Id<"fees">,
      name: string,
      totalAmount?: number,
      scope?: RecurringScope,
    ) => {
      try {
        await onUpdateFee({
          feeId,
          name,
          totalAmount,
          scope,
        });
      } catch (error) {
        console.error("Failed to update fee:", error);
        throw error;
      }
    },
    [onUpdateFee],
  );

  const handleDeleteSelected = useCallback(
    async (scope: RecurringScope = "single") => {
      const oneTimeFeeIds: Id<"fees">[] = [];
      const recurringTargetsByPlan = new Map<string, Fee>();
      const recurringOrphanTargets = new Map<string, Fee>();

      for (const fee of selectedFees) {
        if (!isRecurringFee(fee)) {
          oneTimeFeeIds.push(fee._id);
          continue;
        }

        if (fee.recurringPlanId) {
          const planKey = String(fee.recurringPlanId);
          const currentTarget = recurringTargetsByPlan.get(planKey);
          if (
            !currentTarget ||
            (fee.installmentIndex ?? Number.MAX_SAFE_INTEGER) <
              (currentTarget.installmentIndex ?? Number.MAX_SAFE_INTEGER)
          ) {
            recurringTargetsByPlan.set(planKey, fee);
          }
          continue;
        }

        recurringOrphanTargets.set(String(fee._id), fee);
      }

      const recurringTargets = [
        ...recurringTargetsByPlan.values(),
        ...recurringOrphanTargets.values(),
      ];

      if (oneTimeFeeIds.length === 0 && recurringTargets.length === 0) {
        setSelectedFeeIds(new Set());
        return;
      }

      try {
        await Promise.all([
          ...oneTimeFeeIds.map((feeId) => onRemoveFee({ feeId })),
          ...recurringTargets.map((fee) =>
            onRemoveFee({ feeId: fee._id, scope }),
          ),
        ]);
        setSelectedFeeIds(new Set());
      } catch (error) {
        console.error("Failed to delete fees:", error);
      }
    },
    [selectedFees, onRemoveFee],
  );

  const handleUpdateRecurringFee = useCallback(
    async (args: {
      feeId: Id<"fees">;
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
    }) => {
      try {
        await onUpdateRecurringFee(args);
      } catch (error) {
        console.error("Failed to update recurring series:", error);
        throw error;
      }
    },
    [onUpdateRecurringFee],
  );

  const handlePay = useCallback(async () => {
    const feeIds = Array.from(selectedFeeIds);
    if (feeIds.length === 0) return;

    const redirectUrl = `${window.location.origin}/${organizationSlug}/applications/${applicationId}?tab=payments&payment=success`;

    const result = await onCreatePaymentLink({
      applicationId,
      feeIds,
      redirectUrl,
    });

    window.location.href = result.paymentUrl;
  }, [selectedFeeIds, applicationId, organizationSlug, onCreatePaymentLink]);

  const handleMarkAsPaid = useCallback(
    async (args?: { amountCents?: number }) => {
      const feesToMark = fees.filter((fee) => selectedFeeIds.has(fee._id));

      try {
        if (feesToMark.length === 1) {
          const fee = feesToMark[0];
          const remainingAmount = fee.totalAmount - fee.paidAmount;
          if (remainingAmount <= 0) {
            setSelectedFeeIds(new Set());
            return;
          }

          const amount = args?.amountCents ?? remainingAmount;
          await onRecordPayment({
            feeId: fee._id,
            amount,
            method: "cash",
          });
          setSelectedFeeIds(new Set());
          return;
        }

        await Promise.all(
          feesToMark.map((fee) => {
            const remainingAmount = fee.totalAmount - fee.paidAmount;
            if (remainingAmount > 0) {
              return onRecordPayment({
                feeId: fee._id,
                amount: remainingAmount,
                method: "cash",
              });
            }
          }),
        );
        setSelectedFeeIds(new Set());
      } catch (error) {
        console.error("Failed to mark fees as paid:", error);
      }
    },
    [selectedFeeIds, fees, onRecordPayment],
  );

  const selectedRemainingTotalCents = useMemo(() => {
    return fees.reduce((sum, fee) => {
      if (!selectedFeeIds.has(fee._id)) {
        return sum;
      }
      return sum + Math.max(0, fee.totalAmount - fee.paidAmount);
    }, 0);
  }, [fees, selectedFeeIds]);

  const selectedSingleRemainingCents = useMemo(() => {
    if (selectedFeeIds.size !== 1) {
      return null;
    }
    const [feeId] = Array.from(selectedFeeIds);
    const fee = fees.find((item) => item._id === feeId);
    if (!fee) {
      return null;
    }
    return Math.max(0, fee.totalAmount - fee.paidAmount);
  }, [fees, selectedFeeIds]);

  return (
    <div className="space-y-6">
      <PaymentActions
        applicationId={applicationId}
        organizationSlug={organizationSlug}
        selectedFeeIds={Array.from(selectedFeeIds)}
        selectedRemainingTotalCents={selectedRemainingTotalCents}
        selectedSingleRemainingCents={selectedSingleRemainingCents}
        hasSelectedRecurringFees={hasSelectedRecurringFees}
        onAddFee={onAddFee}
        onAddRecurringPlan={onAddRecurringPlan}
        onDeleteSelected={handleDeleteSelected}
        onPay={handlePay}
        onMarkAsPaid={handleMarkAsPaid}
      />

      {pendingFees.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">{t("emptyState")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b px-4 py-3">
              <CardTitle className="text-sm">{t("activeFees.title")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {actionableFees.length === 0 ? (
                <div className="px-4 py-4 text-sm text-muted-foreground">
                  {t("activeFees.empty")}
                </div>
              ) : (
                actionableFees.map((fee, index, array) => (
                  <div key={fee._id}>
                    <FeeCard
                      fee={fee}
                      recurringInstallments={
                        fee.recurringPlanId
                          ? recurringInstallmentsByPlan.get(
                              String(fee.recurringPlanId),
                            )
                          : undefined
                      }
                      showCheckbox={true}
                      isSelected={selectedFeeIds.has(fee._id)}
                      onSelect={(checked) => handleFeeSelect(fee._id, checked)}
                      onUpdate={handleUpdateFee}
                      onUpdateRecurring={handleUpdateRecurringFee}
                    />
                    {index < array.length - 1 && <Separator />}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {projectionFees.length > 0 && (
            <Card className="gap-0 overflow-hidden border-dashed bg-muted/25 py-0">
              <CardHeader className="border-b px-4 py-3">
                <CardTitle className="text-sm">
                  {t("projection.title")}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t("projection.description")}
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {projectionFees.map((fee, index, array) => (
                  <div key={fee._id}>
                    <FeeCard
                      fee={fee}
                      recurringInstallments={
                        fee.recurringPlanId
                          ? recurringInstallmentsByPlan.get(
                              String(fee.recurringPlanId),
                            )
                          : undefined
                      }
                      onUpdate={handleUpdateFee}
                      onUpdateRecurring={handleUpdateRecurringFee}
                    />
                    {index < array.length - 1 && <Separator />}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
