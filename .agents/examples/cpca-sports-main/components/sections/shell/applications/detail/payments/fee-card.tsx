"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Pencil,
  Check,
  ExternalLink,
  User,
  Repeat,
  type LucideIcon,
} from "lucide-react";
import {
  type PaymentMethod,
  type RegisteredByUser,
} from "@/lib/applications/payment-types";
import { type Fee } from "@/lib/applications/fee-types";
import {
  formatCurrency,
  centsToDollars,
  dollarsToCents,
} from "@/lib/utils/currency";
import { format } from "date-fns";
import { Id } from "@/convex/_generated/dataModel";
import { useLocale, useTranslations } from "next-intl";
import { getFeeDueBucket, isRecurringFee } from "@/lib/payments/due-status";
import { toast } from "sonner";
import { RecurringFeeEditDialog } from "./recurring-fee-edit-dialog";

interface TransactionInfo {
  method: PaymentMethod;
  receiptUrl?: string;
  registeredByUser?: RegisteredByUser;
}

interface FeeCardProps {
  fee: Fee;
  recurringInstallments?: Fee[];
  showCheckbox?: boolean;
  isSelected?: boolean;
  onSelect?: (checked: boolean) => void;
  onRemove?: (feeId: Id<"fees">) => void;
  onMarkAsPaid?: (feeId: Id<"fees">) => void;
  onUpdate?: (
    feeId: Id<"fees">,
    name: string,
    totalAmount?: number,
    scope?: "single" | "this_and_following",
  ) => Promise<void>;
  onUpdateRecurring?: (args: {
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
  }) => Promise<void>;
  transactionInfo?: TransactionInfo;
}

type StatusConfig = {
  icon: LucideIcon;
  iconColor: string;
  badgeVariant: "secondary" | "outline";
  badgeClassName: string;
  label: string;
};

type StatusTranslator = (key: string) => string;

type DueBadgeConfig = {
  variant: "outline" | "destructive";
  className?: string;
  label: string;
};

const getStatusConfig = (
  t: StatusTranslator,
): Record<Fee["status"], StatusConfig> => ({
  paid: {
    icon: CheckCircle2,
    iconColor: "text-green-500",
    badgeVariant: "secondary" as const,
    badgeClassName:
      "gap-1 bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20",
    label: t("feeStatuses.paid"),
  },
  partially_paid: {
    icon: CreditCard,
    iconColor: "text-blue-500",
    badgeVariant: "secondary" as const,
    badgeClassName: "gap-1",
    label: t("feeStatuses.partiallyPaid"),
  },
  pending: {
    icon: Clock,
    iconColor: "text-muted-foreground",
    badgeVariant: "outline" as const,
    badgeClassName: "gap-1",
    label: t("feeStatuses.pending"),
  },
});

const getDueBadgeConfig = (
  t: StatusTranslator,
  dueBucket: ReturnType<typeof getFeeDueBucket>,
): DueBadgeConfig | null => {
  if (dueBucket === "none") {
    return null;
  }

  if (dueBucket === "overdue") {
    return {
      variant: "destructive",
      className: "gap-1",
      label: t("dueStatuses.overdue"),
    };
  }

  if (dueBucket === "due_today") {
    return {
      variant: "outline",
      className:
        "gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      label: t("dueStatuses.dueToday"),
    };
  }

  return {
    variant: "outline",
    className:
      "gap-1 border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    label: t("dueStatuses.upcoming"),
  };
};

function parseDueDateString(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function FeeCard({
  fee,
  recurringInstallments,
  showCheckbox = false,
  isSelected = false,
  onSelect,
  onUpdate,
  onUpdateRecurring,
  transactionInfo,
}: FeeCardProps) {
  const tTransactions = useTranslations("Applications.transactions");
  const t = useTranslations("Applications.payments");
  const locale = useLocale();
  const { isAdmin } = useIsAdmin();
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(fee.name);
  const [editedAmountDollars, setEditedAmountDollars] = useState(
    centsToDollars(fee.totalAmount),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isRecurringDialogOpen, setIsRecurringDialogOpen] = useState(false);
  const editContainerRef = useRef<HTMLDivElement>(null);

  const statusConfig = getStatusConfig(t)[fee.status];
  const StatusIcon = statusConfig.icon;

  const canEditAmount = fee.paidAmount === 0;
  const recurring = isRecurringFee(fee);
  const dueBucket = getFeeDueBucket(fee);
  const dueBadgeConfig = getDueBadgeConfig(t, dueBucket);
  const formattedDueDate = useMemo(() => {
    if (!fee.dueDate) {
      return null;
    }

    const parsedDate = parseDueDateString(fee.dueDate);
    if (!parsedDate) {
      return fee.dueDate;
    }

    try {
      return new Intl.DateTimeFormat(locale, {
        timeZone: fee.timezone ?? "America/New_York",
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(parsedDate);
    } catch {
      return fee.dueDate;
    }
  }, [fee.dueDate, fee.timezone, locale]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditedName(fee.name);
    setEditedAmountDollars(centsToDollars(fee.totalAmount));
    setIsRecurringDialogOpen(false);
  }, [fee.name, fee.totalAmount]);

  // Handle click outside to cancel editing
  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        editContainerRef.current &&
        !editContainerRef.current.contains(event.target as Node)
      ) {
        handleCancel();
      }
    };

    // Add listener after a small delay to avoid immediate cancellation
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isEditing, handleCancel]);

  const dateText =
    fee.status === "paid" && fee.paidAt
      ? format(new Date(fee.paidAt), "MMM d, yyyy")
      : fee.createdAt
        ? format(new Date(fee.createdAt), "MMM d, yyyy")
        : null;

  const handleEdit = () => {
    if (recurring && onUpdateRecurring) {
      setIsRecurringDialogOpen(true);
      return;
    }

    setIsEditing(true);
    setEditedName(fee.name);
    setEditedAmountDollars(centsToDollars(fee.totalAmount));
  };

  const handleSaveInline = async () => {
    if (!onUpdate || !editedName.trim()) {
      return;
    }

    const nextAmount = canEditAmount
      ? dollarsToCents(editedAmountDollars)
      : fee.totalAmount;
    const amountChanged = canEditAmount && nextAmount !== fee.totalAmount;
    const nameChanged = editedName.trim() !== fee.name;
    const totalAmountToSend = amountChanged ? nextAmount : undefined;

    if (!amountChanged && !nameChanged) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onUpdate(fee._id, editedName.trim(), totalAmountToSend, "single");
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update fee:", error);
      toast.error(t("errors.saveFeeFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const content = (
    <div ref={editContainerRef} className="contents">
      <ItemMedia variant="icon">
        <StatusIcon className={statusConfig.iconColor} />
      </ItemMedia>

      <ItemContent>
        <div className="flex items-start justify-between gap-4 w-full">
          <div className="flex-1 ">
            <div className="flex items-center gap-2 flex-wrap">
              {isEditing ? (
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="h-7 max-w-xs"
                  autoFocus
                />
              ) : (
                <ItemTitle>{fee.name}</ItemTitle>
              )}
              {fee.isRequired && (
                <Badge variant="secondary" className="text-xs">
                  {t("feeBadges.required")}
                </Badge>
              )}
              {fee.isDefault && (
                <Badge variant="outline" className="text-xs">
                  {t("feeBadges.default")}
                </Badge>
              )}
              {dueBadgeConfig && (
                <Badge
                  variant={dueBadgeConfig.variant}
                  className={dueBadgeConfig.className}
                >
                  <Repeat className="size-3" />
                  {dueBadgeConfig.label}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap text-sm">
              {dateText && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs text-muted-foreground">
                      {dateText}
                    </span>
                  </TooltipTrigger>
                  {(fee.createdAt || fee.paidAt) && (
                    <TooltipContent>
                      <div className="space-y-1">
                        {fee.createdAt && (
                          <div className="text-xs">
                            <span className="text-muted-foreground">
                              {t("feeTooltips.created")}:
                            </span>{" "}
                            {format(
                              new Date(fee.createdAt),
                              "MMM d, yyyy 'at' h:mm:ss a",
                            )}
                          </div>
                        )}
                        {fee.paidAt && (
                          <div className="text-xs">
                            <span className="text-muted-foreground">
                              {t("feeTooltips.paid")}:
                            </span>{" "}
                            {format(
                              new Date(fee.paidAt),
                              "MMM d, yyyy 'at' h:mm:ss a",
                            )}
                          </div>
                        )}
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>
              )}

              <span className="text-muted-foreground">•</span>

              {isEditing && canEditAmount ? (
                <div className="flex items-center gap-1">
                  <span className="text-sm">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editedAmountDollars}
                    onChange={(e) =>
                      setEditedAmountDollars(parseFloat(e.target.value) || 0)
                    }
                    className="h-7 w-24"
                  />
                </div>
              ) : (
                <span className="font-semibold">
                  {formatCurrency(fee.totalAmount)}
                </span>
              )}

              {recurring && fee.dueDate && (
                <>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">
                    {t("dueDate", { date: formattedDueDate ?? fee.dueDate })}
                  </span>
                </>
              )}
            </div>

            {fee.paidAmount > 0 && fee.status !== "paid" && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t("feeProgress.progress")}
                  </span>
                  <span className="font-medium">
                    {formatCurrency(fee.paidAmount)} /{" "}
                    {formatCurrency(fee.totalAmount)}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all"
                    style={{
                      width: `${(fee.paidAmount / fee.totalAmount) * 100}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {t("feeProgress.remaining")}:{" "}
                    {formatCurrency(fee.totalAmount - fee.paidAmount)}
                  </span>
                  <span>
                    {Math.round((fee.paidAmount / fee.totalAmount) * 100)}%
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap pt-1">
              {fee.isRefundable && (
                <Badge variant="outline" className="text-xs">
                  {t("feeBadges.refundable")}
                </Badge>
              )}
              {fee.isIncluded && (
                <Badge variant="outline" className="text-xs">
                  {t("feeBadges.included")}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </ItemContent>

      {isAdmin && onUpdate && !fee.isDefault && (
        <ItemActions>
          {isEditing ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={handleSaveInline}
                    disabled={isSaving || !editedName.trim()}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t("actions.tooltips.saveChanges")}
                </TooltipContent>
              </Tooltip>
            </>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="rounded-full"
                  onClick={handleEdit}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("actions.tooltips.editFee")}</TooltipContent>
            </Tooltip>
          )}
        </ItemActions>
      )}

      {transactionInfo && (
        <ItemActions>
          {transactionInfo.method === "online" && transactionInfo.receiptUrl ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={transactionInfo.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-full size-8 hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </TooltipTrigger>
              <TooltipContent>
                {tTransactions("actions.viewReceipt")}
              </TooltipContent>
            </Tooltip>
          ) : transactionInfo.registeredByUser ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="inline-flex items-center justify-center rounded-full size-8 text-muted-foreground">
                  <User className="h-4 w-4" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">
                  <div className="font-medium">
                    {tTransactions("actions.registeredByTooltip")}
                  </div>
                  <div>
                    {transactionInfo.registeredByUser.firstName}{" "}
                    {transactionInfo.registeredByUser.lastName}
                  </div>
                  <div className="text-muted-foreground">
                    {transactionInfo.registeredByUser.email}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          ) : null}
        </ItemActions>
      )}
    </div>
  );

  const recurringEditDialog =
    recurring && onUpdateRecurring ? (
      <RecurringFeeEditDialog
        open={isRecurringDialogOpen}
        onOpenChange={setIsRecurringDialogOpen}
        fee={fee}
        installments={recurringInstallments ?? [fee]}
        onSave={onUpdateRecurring}
      />
    ) : null;

  if (showCheckbox && onSelect) {
    const handleClick = (e: React.MouseEvent) => {
      // Don't toggle if clicking on buttons or inputs
      const target = e.target as HTMLElement;
      if (target.closest("button") || target.closest("input")) {
        return;
      }
      onSelect(!isSelected);
    };

    return (
      <>
        <FieldLabel
          htmlFor={`fee-${fee._id}`}
          className="!border-0 !rounded-none w-full [&>[data-slot=field]]:!border-0 [&>[data-slot=field]]:!rounded-none [&>[data-slot=field]]:!p-0"
        >
          <Field orientation="horizontal" className="w-full">
            <Checkbox
              id={`fee-${fee._id}`}
              name={`fee-${fee._id}`}
              checked={isSelected}
              className="sr-only"
            />
            <FieldContent
              onClick={handleClick}
              className="cursor-pointer w-full"
            >
              <Item>{content}</Item>
            </FieldContent>
          </Field>
        </FieldLabel>
        {recurringEditDialog}
      </>
    );
  }

  return (
    <>
      <Item>{content}</Item>
      {recurringEditDialog}
    </>
  );
}
