"use client";

import type { PaymentDefaultFeeLike } from "./payment-default-types";

export interface EditablePaymentDefault extends PaymentDefaultFeeLike {
  _id: string;
  feeKey: string;
  recurringPlanId?: string;
}

export type SavablePaymentDefault = {
  feeKey: string;
  name: string;
  totalAmount: number;
  downPaymentPercent: number;
  isRefundable: boolean;
  isIncluded: boolean;
  isRequired: boolean;
  recurringPlanId?: string;
  installmentIndex?: number;
  installmentCount?: number;
  dueDayOfMonth?: number;
  timezone?: string;
  isRecurring?: boolean;
};

function createLocalKey(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function distributeAmounts(totalAmount: number, installmentCount: number) {
  if (installmentCount <= 0) {
    return [];
  }

  const base = Math.floor(totalAmount / installmentCount);
  const remainder = totalAmount - base * installmentCount;

  return Array.from(
    { length: installmentCount },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

export function createEditableFeeKey() {
  return createLocalKey("fee");
}

export function createEditablePlanKey() {
  return createLocalKey("plan");
}

export function mapEditablePaymentDefaults(
  fees: Array<{
    feeKey: string;
    name: string;
    totalAmount: number;
    downPaymentPercent: number;
    isRefundable: boolean;
    isIncluded: boolean;
    isRequired: boolean;
    createdAt: number;
    recurringPlanId?: string | { toString(): string };
    installmentIndex?: number;
    installmentCount?: number;
    dueDayOfMonth?: number;
    timezone?: string;
    isRecurring?: boolean;
  }>,
): EditablePaymentDefault[] {
  return fees.map((fee) => ({
    _id: fee.feeKey,
    feeKey: fee.feeKey,
    name: fee.name,
    totalAmount: fee.totalAmount,
    downPaymentPercent: fee.downPaymentPercent,
    isRefundable: fee.isRefundable,
    isIncluded: fee.isIncluded,
    isRequired: fee.isRequired,
    createdAt: fee.createdAt,
    _creationTime: fee.createdAt,
    recurringPlanId: fee.recurringPlanId
      ? String(fee.recurringPlanId)
      : undefined,
    installmentIndex: fee.installmentIndex,
    installmentCount: fee.installmentCount,
    dueDayOfMonth: fee.dueDayOfMonth,
    timezone: fee.timezone,
    isRecurring: fee.isRecurring,
  }));
}

function normalizeEditablePaymentDefault(
  fee: EditablePaymentDefault,
): SavablePaymentDefault {
  return {
    feeKey: fee.feeKey,
    name: fee.name.trim(),
    totalAmount: fee.totalAmount,
    downPaymentPercent: fee.downPaymentPercent,
    isRefundable: fee.isRefundable,
    isIncluded: fee.isIncluded,
    isRequired: fee.isRequired,
    recurringPlanId: fee.recurringPlanId,
    installmentIndex: fee.installmentIndex,
    installmentCount: fee.installmentCount,
    dueDayOfMonth: fee.dueDayOfMonth,
    timezone: fee.timezone,
    isRecurring: fee.isRecurring,
  };
}

export function getSavablePaymentDefaults(
  fees: EditablePaymentDefault[],
): SavablePaymentDefault[] {
  return fees.map(normalizeEditablePaymentDefault);
}

export function serializeEditablePaymentDefaults(
  fees: EditablePaymentDefault[],
) {
  const normalized = [...fees].sort((left, right) => {
    if (left.recurringPlanId !== right.recurringPlanId) {
      return (left.recurringPlanId ?? "").localeCompare(
        right.recurringPlanId ?? "",
      );
    }

    const leftIndex = left.installmentIndex ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = right.installmentIndex ?? Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.feeKey.localeCompare(right.feeKey);
  });

  return JSON.stringify(normalized.map(normalizeEditablePaymentDefault));
}

export function createOneTimeEditablePaymentDefault(args: {
  name: string;
  totalAmount: number;
  downPaymentPercent: number;
  isRefundable: boolean;
  isIncluded: boolean;
  isRequired: boolean;
}): EditablePaymentDefault {
  const feeKey = createEditableFeeKey();
  const createdAt = Date.now();

  return {
    _id: feeKey,
    feeKey,
    name: args.name,
    totalAmount: args.totalAmount,
    downPaymentPercent: args.downPaymentPercent,
    isRefundable: args.isRefundable,
    isIncluded: args.isIncluded,
    isRequired: args.isRequired,
    createdAt,
    _creationTime: createdAt,
  };
}

export function createRecurringEditablePaymentDefaults(args: {
  name: string;
  totalAmount: number;
  installmentCount: number;
  dueDayOfMonth: number;
  timezone: string;
  isRefundable: boolean;
  isIncluded: boolean;
  isRequired: boolean;
  installmentAmounts?: number[];
}): EditablePaymentDefault[] {
  const recurringPlanId = createEditablePlanKey();
  const createdAt = Date.now();
  const installmentAmounts =
    args.installmentAmounts ??
    distributeAmounts(args.totalAmount, args.installmentCount);

  return installmentAmounts.map((amount, index) => {
    const feeKey = createEditableFeeKey();

    return {
      _id: feeKey,
      feeKey,
      name: args.name,
      totalAmount: amount,
      downPaymentPercent: 100,
      isRefundable: args.isRefundable,
      isIncluded: args.isIncluded,
      isRequired: args.isRequired,
      createdAt,
      _creationTime: createdAt,
      recurringPlanId,
      installmentIndex: index + 1,
      installmentCount: installmentAmounts.length,
      dueDayOfMonth: args.dueDayOfMonth,
      timezone: args.timezone,
      isRecurring: true,
    };
  });
}

export function updateRecurringEditablePaymentDefaults(
  currentFees: EditablePaymentDefault[],
  args: {
    recurringPlanId: string;
    name: string;
    totalAmount: number;
    installmentCount: number;
    dueDayOfMonth: number;
    timezone: string;
    isRefundable: boolean;
    isIncluded: boolean;
    isRequired: boolean;
    installmentAmounts: number[];
  },
): EditablePaymentDefault[] {
  const existingInstallments = currentFees
    .filter((fee) => fee.recurringPlanId === args.recurringPlanId)
    .sort((left, right) => {
      const leftIndex = left.installmentIndex ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = right.installmentIndex ?? Number.MAX_SAFE_INTEGER;
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }

      return left.createdAt - right.createdAt;
    });

  const nextInstallments = args.installmentAmounts.map((amount, index) => {
    const currentInstallment = existingInstallments[index];
    const feeKey = currentInstallment?.feeKey ?? createEditableFeeKey();
    const createdAt = currentInstallment?.createdAt ?? Date.now();

    return {
      _id: feeKey,
      feeKey,
      name: args.name,
      totalAmount: amount,
      downPaymentPercent: 100,
      isRefundable: args.isRefundable,
      isIncluded: args.isIncluded,
      isRequired: args.isRequired,
      createdAt,
      _creationTime: createdAt,
      recurringPlanId: args.recurringPlanId,
      installmentIndex: index + 1,
      installmentCount: args.installmentCount,
      dueDayOfMonth: args.dueDayOfMonth,
      timezone: args.timezone,
      isRecurring: true,
    };
  });

  return [
    ...currentFees.filter(
      (fee) => fee.recurringPlanId !== args.recurringPlanId,
    ),
    ...nextInstallments,
  ];
}
