"use client";

import { useState, useMemo } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Search } from "lucide-react";
import { FeeCard } from "./fee-card";
import { DateRangePopover } from "./date-range-popover";
import { useTranslations } from "next-intl";
import { format, isWithinInterval } from "date-fns";
import { type DateRange } from "react-day-picker";
import { type TransactionWithFee } from "@/lib/applications/payment-types";
import { type Fee } from "@/lib/applications/fee-types";
import { formatCurrency } from "@/lib/utils/currency";
import { Id } from "@/convex/_generated/dataModel";

interface ApplicationTransactionHistoryProps {
  transactionsWithFees: TransactionWithFee[];
}

export function ApplicationTransactionHistory({
  transactionsWithFees,
}: ApplicationTransactionHistoryProps) {
  const t = useTranslations("Applications.transactions");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const filteredTransactions = useMemo(() => {
    return transactionsWithFees.filter((item) => {
      const matchesSearch =
        searchQuery === "" ||
        item.feeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.transaction.amount.toString().includes(searchQuery) ||
        (item.transaction.reference
          ?.toLowerCase()
          .includes(searchQuery.toLowerCase()) ??
          false);

      const matchesDateRange =
        !dateRange?.from ||
        !dateRange?.to ||
        isWithinInterval(new Date(item.transaction.createdAt), {
          start: dateRange.from,
          end: dateRange.to,
        });

      return matchesSearch && matchesDateRange;
    });
  }, [transactionsWithFees, searchQuery, dateRange]);

  const groupedByMonth = useMemo(() => {
    const groups = new Map<string, typeof filteredTransactions>();

    filteredTransactions.forEach((item) => {
      const monthKey = format(
        new Date(item.transaction.createdAt),
        "MMMM yyyy",
      );
      if (!groups.has(monthKey)) {
        groups.set(monthKey, []);
      }
      groups.get(monthKey)!.push(item);
    });

    return Array.from(groups.entries()).sort((a, b) => {
      const dateA = new Date(a[1][0]?.transaction.createdAt ?? 0);
      const dateB = new Date(b[1][0]?.transaction.createdAt ?? 0);
      return dateB.getTime() - dateA.getTime();
    });
  }, [filteredTransactions]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <InputGroup className="flex-1 bg-card">
          <InputGroupInput
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>

        <DateRangePopover
          dateRange={dateRange}
          onSelect={setDateRange}
          placeholder={t("filterDate")}
          className="w-72 shrink-0 justify-start px-2.5 font-normal"
          variant="default"
        />
      </div>

      {groupedByMonth.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-muted/20">
          <p className="text-sm text-muted-foreground">{t("emptyMessage")}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedByMonth.map(([month, items]) => (
            <div key={month} className="space-y-4">
              <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 pb-2">
                <h3 className="text-lg font-semibold">{month}</h3>
                <p className="text-sm text-muted-foreground">
                  {items.length}{" "}
                  {items.length === 1
                    ? t("counter.payment")
                    : t("counter.payments")}{" "}
                  -{" "}
                  {formatCurrency(
                    items.reduce(
                      (sum, item) => sum + item.transaction.amount,
                      0,
                    ),
                  )}
                </p>
              </div>
              <Card className="py-0">
                <CardContent className="p-0">
                  {items.map((item, index, array) => {
                    const fee: Fee = {
                      _id: item.transaction.feeId,
                      _creationTime: item.transaction.createdAt,
                      applicationId: item.transaction.applicationId,
                      name: item.feeName,
                      description: item.feeDescription,
                      totalAmount: item.transaction.amount,
                      downPaymentPercent: 0,
                      isRefundable: false,
                      isIncluded: false,
                      isDefault: false,
                      isRequired: false,
                      status: "paid",
                      paidAmount: item.transaction.amount,
                      createdAt: item.transaction.createdAt,
                      paidAt: item.transaction.createdAt,
                      createdBy:
                        item.transaction.registeredBy ?? ("" as Id<"users">),
                    };
                    return (
                      <div key={item.transaction._id}>
                        <FeeCard
                          fee={fee}
                          transactionInfo={{
                            method: item.transaction.method,
                            receiptUrl: item.transaction.receiptUrl,
                            registeredByUser: item.registeredByUser,
                          }}
                        />
                        {index < array.length - 1 && <Separator />}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
