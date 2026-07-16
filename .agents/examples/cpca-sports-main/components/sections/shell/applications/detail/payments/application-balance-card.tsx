"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, CheckCircle2, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/utils/currency";

interface ApplicationBalanceCardProps {
  totalDue: number;
  totalPaid: number;
  totalPending: number;
}

export function ApplicationBalanceCard({
  totalDue,
  totalPaid,
  totalPending,
}: ApplicationBalanceCardProps) {
  const t = useTranslations("Applications.payments.summary");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex flex-col gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-center gap-2">
              <div
                className="size-4 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0"
                aria-hidden="true"
              >
                <DollarSign className="size-3 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                {t("totalDue")}
              </p>
            </div>
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(totalDue)}
            </p>
          </div>

          <div className="flex flex-col gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-2">
              <div
                className="size-4 rounded-full bg-green-500/20 flex items-center justify-center shrink-0"
                aria-hidden="true"
              >
                <CheckCircle2 className="size-3 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                {t("totalPaid")}
              </p>
            </div>
            <p className="text-lg font-bold text-green-600 dark:text-green-400">
              {formatCurrency(totalPaid)}
            </p>
          </div>

          <div className="flex flex-col gap-2 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <div className="flex items-center gap-2">
              <div
                className="size-4 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0"
                aria-hidden="true"
              >
                <Clock className="size-3 text-orange-600 dark:text-orange-400" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                {t("pending")}
              </p>
            </div>
            <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
              {formatCurrency(totalPending)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
