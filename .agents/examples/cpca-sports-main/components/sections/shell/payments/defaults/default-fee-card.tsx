"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  centsToDollars,
  dollarsToCents,
  formatCurrency,
} from "@/lib/utils/currency";
import { Check, CreditCard, Pencil, Repeat, Trash2 } from "lucide-react";
import { DefaultRecurringFeeEditDialog } from "./default-recurring-fee-edit-dialog";
import {
  type PaymentDefaultFeeLike,
  isRecurringPaymentDefault,
} from "./payment-default-types";

interface DefaultFeeCardProps<TFee extends PaymentDefaultFeeLike> {
  fee: TFee;
  recurringInstallments?: TFee[];
  onUpdate: (args: {
    feeId: TFee["_id"];
    name: string;
    totalAmount?: number;
  }) => Promise<void>;
  onUpdateRecurring: (args: {
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
  onRemove: (args: {
    feeId: TFee["_id"];
    scope?: "single" | "this_and_following";
  }) => Promise<void>;
}

export function DefaultFeeCard<TFee extends PaymentDefaultFeeLike>({
  fee,
  recurringInstallments,
  onUpdate,
  onUpdateRecurring,
  onRemove,
}: DefaultFeeCardProps<TFee>) {
  const t = useTranslations("Applications.payments");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRecurringDialogOpen, setIsRecurringDialogOpen] = useState(false);
  const [isDeleteScopeDialogOpen, setIsDeleteScopeDialogOpen] = useState(false);
  const [editedName, setEditedName] = useState(fee.name);
  const [editedAmountDollars, setEditedAmountDollars] = useState(
    centsToDollars(fee.totalAmount),
  );
  const recurring = isRecurringPaymentDefault(fee);

  const handleInlineSave = async () => {
    const name = editedName.trim();
    if (!name) {
      return;
    }

    setIsSaving(true);
    try {
      await onUpdate({
        feeId: fee._id,
        name,
        totalAmount:
          dollarsToCents(editedAmountDollars) !== fee.totalAmount
            ? dollarsToCents(editedAmountDollars)
            : undefined,
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update payment default:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async (scope?: "single" | "this_and_following") => {
    try {
      await onRemove({
        feeId: fee._id,
        scope,
      });
    } catch (error) {
      console.error("Failed to remove payment default:", error);
    } finally {
      setIsDeleting(false);
      setIsDeleteScopeDialogOpen(false);
    }
  };

  const badges = (
    <>
      {recurring ? (
        <Badge variant="secondary">{t("feeBadges.recurring")}</Badge>
      ) : null}
      {fee.isRequired ? (
        <Badge variant="outline">{t("feeBadges.required")}</Badge>
      ) : null}
      {fee.isIncluded ? (
        <Badge variant="outline">{t("feeBadges.included")}</Badge>
      ) : null}
      {fee.isRefundable ? (
        <Badge variant="outline">{t("feeBadges.refundable")}</Badge>
      ) : null}
    </>
  );

  return (
    <>
      <Item variant="outline" size="sm" className="rounded-lg">
        <ItemMedia variant="icon">
          {recurring ? (
            <Repeat className="text-muted-foreground" />
          ) : (
            <CreditCard className="text-muted-foreground" />
          )}
        </ItemMedia>

        <ItemContent>
          {isEditing ? (
            <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
              <Input
                value={editedName}
                onChange={(event) => setEditedName(event.target.value)}
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                value={editedAmountDollars || ""}
                onChange={(event) =>
                  setEditedAmountDollars(Number(event.target.value))
                }
              />
              <Button
                type="button"
                size="icon"
                onClick={() => void handleInlineSave()}
                disabled={isSaving}
              >
                <Check className="size-4" />
              </Button>
            </div>
          ) : (
            <>
              <ItemTitle className="flex flex-wrap items-center gap-2">
                <span>{fee.name}</span>
                {badges}
              </ItemTitle>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span>{formatCurrency(fee.totalAmount)}</span>
                {fee.installmentIndex && fee.installmentCount ? (
                  <span>
                    {fee.installmentIndex}/{fee.installmentCount}
                  </span>
                ) : null}
              </div>
            </>
          )}
        </ItemContent>

        {!isEditing ? (
          <ItemActions>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (recurring) {
                      setIsRecurringDialogOpen(true);
                      return;
                    }

                    setEditedName(fee.name);
                    setEditedAmountDollars(centsToDollars(fee.totalAmount));
                    setIsEditing(true);
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("actions.edit")}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (recurring) {
                      setIsDeleteScopeDialogOpen(true);
                      return;
                    }

                    setIsDeleting(true);
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("actions.delete")}</TooltipContent>
            </Tooltip>
          </ItemActions>
        ) : null}
      </Item>

      <AlertDialog open={isDeleting} onOpenChange={setIsDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("actions.deleteFeeDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("actions.deleteFeeDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("actions.deleteFeeDialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRemove()}>
              {t("actions.deleteFeeDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isDeleteScopeDialogOpen}
        onOpenChange={setIsDeleteScopeDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("actions.deleteRecurringScopeDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("actions.deleteRecurringScopeDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-start">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleRemove("single")}
            >
              {t("actions.deleteRecurringScopeDialog.single")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleRemove("this_and_following")}
            >
              {t("actions.deleteRecurringScopeDialog.thisAndFollowing")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {recurring && recurringInstallments ? (
        <DefaultRecurringFeeEditDialog
          open={isRecurringDialogOpen}
          onOpenChange={setIsRecurringDialogOpen}
          fee={fee}
          installments={recurringInstallments}
          onSave={onUpdateRecurring}
        />
      ) : null}
    </>
  );
}
