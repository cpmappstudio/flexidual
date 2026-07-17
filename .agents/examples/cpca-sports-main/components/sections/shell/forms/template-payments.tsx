"use client";

import { useTranslations } from "next-intl";
import { PaymentDefaultsEditor } from "@/components/sections/shell/payments/defaults/payment-defaults-editor";
import type { EditablePaymentDefault } from "@/components/sections/shell/payments/defaults/payment-default-state";

interface TemplatePaymentsProps {
  fees: EditablePaymentDefault[] | null;
  onChange: (fees: EditablePaymentDefault[]) => void;
}

export function TemplatePayments({ fees, onChange }: TemplatePaymentsProps) {
  const t = useTranslations("Forms.template");

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
