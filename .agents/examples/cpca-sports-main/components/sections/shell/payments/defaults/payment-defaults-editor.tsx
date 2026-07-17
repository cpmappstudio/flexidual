"use client";

import { PaymentDefaultsManager } from "./payment-defaults-manager";
import {
  createOneTimeEditablePaymentDefault,
  createRecurringEditablePaymentDefaults,
  type EditablePaymentDefault,
  updateRecurringEditablePaymentDefaults,
} from "./payment-default-state";

interface PaymentDefaultsEditorProps {
  fees: EditablePaymentDefault[] | null;
  loadingText: string;
  emptyTitle: string;
  emptyDescription: string;
  activeHint: string;
  onChange: (fees: EditablePaymentDefault[]) => void;
}

export function PaymentDefaultsEditor({
  fees,
  loadingText,
  emptyTitle,
  emptyDescription,
  activeHint,
  onChange,
}: PaymentDefaultsEditorProps) {
  return (
    <PaymentDefaultsManager
      fees={fees ?? undefined}
      loadingText={loadingText}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      activeHint={activeHint}
      onAddFee={async (args) => {
        onChange([...(fees ?? []), createOneTimeEditablePaymentDefault(args)]);
      }}
      onAddRecurringPlan={async (args) => {
        onChange([
          ...(fees ?? []),
          ...createRecurringEditablePaymentDefaults(args),
        ]);
      }}
      onUpdateFee={async ({ feeId, name, totalAmount }) => {
        if (!fees) {
          return;
        }

        onChange(
          fees.map((fee) =>
            fee._id !== feeId
              ? fee
              : {
                  ...fee,
                  name,
                  totalAmount: totalAmount ?? fee.totalAmount,
                },
          ),
        );
      }}
      onUpdateRecurringFee={async ({ feeId, ...args }) => {
        if (!fees) {
          return;
        }

        const fee = fees.find((current) => current._id === feeId);
        if (!fee?.recurringPlanId) {
          return;
        }

        onChange(
          updateRecurringEditablePaymentDefaults(fees, {
            recurringPlanId: fee.recurringPlanId,
            ...args,
          }),
        );
      }}
      onRemoveFee={async ({ feeId, scope }) => {
        if (!fees) {
          return;
        }

        const fee = fees.find((current) => current._id === feeId);
        if (!fee?.recurringPlanId) {
          onChange(fees.filter((current) => current._id !== feeId));
          return;
        }

        const relatedFees = fees
          .filter((current) => current.recurringPlanId === fee.recurringPlanId)
          .sort((left, right) => {
            const leftIndex = left.installmentIndex ?? Number.MAX_SAFE_INTEGER;
            const rightIndex = right.installmentIndex ?? Number.MAX_SAFE_INTEGER;
            if (leftIndex !== rightIndex) {
              return leftIndex - rightIndex;
            }

            return left.createdAt - right.createdAt;
          });
        const targetIndex = relatedFees.findIndex(
          (current) => current._id === feeId,
        );

        if (targetIndex === -1) {
          return;
        }

        const keptInstallments =
          scope === "this_and_following"
            ? relatedFees.slice(0, targetIndex)
            : relatedFees.filter((current) => current._id !== feeId);

        const nextRecurringFees = keptInstallments.map((installment, index) => ({
          ...installment,
          installmentIndex: index + 1,
          installmentCount: keptInstallments.length,
        }));

        onChange([
          ...fees.filter(
            (current) => current.recurringPlanId !== fee.recurringPlanId,
          ),
          ...nextRecurringFees,
        ]);
      }}
    />
  );
}
