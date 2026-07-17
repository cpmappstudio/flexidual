"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useTranslations } from "next-intl";
import { DefaultFeeCard } from "./default-fee-card";
import { DefaultPaymentActions } from "./default-payment-actions";
import {
  type PaymentDefaultFeeLike,
  isRecurringPaymentDefault,
} from "./payment-default-types";

interface PaymentDefaultsManagerProps<TFee extends PaymentDefaultFeeLike> {
  fees: TFee[] | undefined;
  loadingText: string;
  emptyTitle: string;
  emptyDescription: string;
  activeHint: string;
  hiddenProjectionTitle?: string;
  hiddenProjectionDescription?: string;
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
  onRemoveFee: (args: {
    feeId: TFee["_id"];
    scope?: "single" | "this_and_following";
  }) => Promise<void>;
  onUpdateFee: (args: {
    feeId: TFee["_id"];
    name: string;
    totalAmount?: number;
  }) => Promise<void>;
  onUpdateRecurringFee: (args: {
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

export function PaymentDefaultsManager<TFee extends PaymentDefaultFeeLike>({
  fees,
  loadingText,
  emptyTitle,
  emptyDescription,
  activeHint,
  hiddenProjectionTitle,
  hiddenProjectionDescription,
  onAddFee,
  onAddRecurringPlan,
  onRemoveFee,
  onUpdateFee,
  onUpdateRecurringFee,
}: PaymentDefaultsManagerProps<TFee>) {
  const t = useTranslations("Applications.payments");

  const sortedFees = useMemo(() => {
    if (!fees) {
      return [];
    }

    return [...fees].sort((a, b) => {
      const aRecurring = isRecurringPaymentDefault(a);
      const bRecurring = isRecurringPaymentDefault(b);

      if (aRecurring && bRecurring) {
        const aIndex = a.installmentIndex ?? Number.MAX_SAFE_INTEGER;
        const bIndex = b.installmentIndex ?? Number.MAX_SAFE_INTEGER;
        if (aIndex !== bIndex) {
          return aIndex - bIndex;
        }
        return a.createdAt - b.createdAt;
      }

      if (!aRecurring && !bRecurring) {
        return b.createdAt - a.createdAt;
      }

      return aRecurring ? 1 : -1;
    });
  }, [fees]);

  const { primaryFees, projectedFees, installmentsByPlan } = useMemo(() => {
    const primaryIds = new Set<string>();
    const projectedIds = new Set<string>();
    const grouped = new Map<string, TFee[]>();

    for (const fee of sortedFees) {
      if (!isRecurringPaymentDefault(fee)) {
        primaryIds.add(String(fee._id));
        continue;
      }

      const key = fee.recurringPlanId
        ? String(fee.recurringPlanId)
        : `orphan_${fee._id}`;
      const current = grouped.get(key) ?? [];
      current.push(fee);
      grouped.set(key, current);
    }

    for (const installments of grouped.values()) {
      const ordered = [...installments].sort((a, b) => {
        const aIndex = a.installmentIndex ?? Number.MAX_SAFE_INTEGER;
        const bIndex = b.installmentIndex ?? Number.MAX_SAFE_INTEGER;
        if (aIndex !== bIndex) {
          return aIndex - bIndex;
        }
        return a.createdAt - b.createdAt;
      });

      const first = ordered[0];
      if (first) {
        primaryIds.add(String(first._id));
      }

      for (const installment of ordered.slice(1)) {
        projectedIds.add(String(installment._id));
      }
    }

    return {
      primaryFees: sortedFees.filter((fee) => primaryIds.has(String(fee._id))),
      projectedFees: sortedFees.filter((fee) =>
        projectedIds.has(String(fee._id)),
      ),
      installmentsByPlan: grouped,
    };
  }, [sortedFees]);

  if (fees === undefined) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-5">
        <p className="text-sm text-muted-foreground">{loadingText}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DefaultPaymentActions
        onAddFee={onAddFee}
        onAddRecurringPlan={onAddRecurringPlan}
      />

      {sortedFees.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-5">
          <h3 className="text-sm font-medium">{emptyTitle}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {emptyDescription}
          </p>
        </div>
      ) : (
        <>
          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="border-b px-4 py-3">
              <CardTitle className="text-sm">{t("activeFees.title")}</CardTitle>
              <p className="text-sm text-muted-foreground">{activeHint}</p>
            </CardHeader>
            <CardContent className="p-0">
              {primaryFees.map((fee, index) => (
                <div key={fee._id}>
                  <DefaultFeeCard
                    fee={fee}
                    recurringInstallments={
                      fee.recurringPlanId
                        ? installmentsByPlan.get(String(fee.recurringPlanId))
                        : undefined
                    }
                    onUpdate={onUpdateFee}
                    onUpdateRecurring={onUpdateRecurringFee}
                    onRemove={onRemoveFee}
                  />
                  {index < primaryFees.length - 1 ? <Separator /> : null}
                </div>
              ))}
            </CardContent>
          </Card>

          {projectedFees.length > 0 ? (
            <Card className="gap-0 overflow-hidden border-dashed bg-muted/25 py-0">
              <CardHeader className="border-b px-4 py-3">
                <CardTitle className="text-sm">
                  {hiddenProjectionTitle ?? t("projection.title")}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {hiddenProjectionDescription ?? t("projection.description")}
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {projectedFees.map((fee, index) => (
                  <div key={fee._id}>
                    <DefaultFeeCard
                      fee={fee}
                      recurringInstallments={
                        fee.recurringPlanId
                          ? installmentsByPlan.get(String(fee.recurringPlanId))
                          : undefined
                      }
                      onUpdate={onUpdateFee}
                      onUpdateRecurring={onUpdateRecurringFee}
                      onRemove={onRemoveFee}
                    />
                    {index < projectedFees.length - 1 ? <Separator /> : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
