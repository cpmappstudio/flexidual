"use client";

import { useTranslations } from "next-intl";
import { PaymentDefaultsEditor } from "@/components/sections/shell/payments/defaults/payment-defaults-editor";
import type { EditablePaymentDefault } from "@/components/sections/shell/payments/defaults/payment-default-state";

interface ProgramPaymentsProps {
  fees: EditablePaymentDefault[] | null;
  onChange: (fees: EditablePaymentDefault[]) => void;
}

export function ProgramPayments({ fees, onChange }: ProgramPaymentsProps) {
  const t = useTranslations("Programs.create");

  return (
    <PaymentDefaultsEditor
      fees={fees}
      loadingText={t("payments.loading")}
      emptyTitle={t("payments.emptyStateTitle")}
      emptyDescription={t("payments.emptyStateDescription")}
      activeHint={t("payments.activeHint")}
      onChange={onChange}
    />
  );
}
