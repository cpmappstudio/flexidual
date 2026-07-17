import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { distributeAmounts, isValidTimeZone } from "./paymentPlans";

type PaymentDefaultOwnerField = "programId" | "templateId";
type PaymentDefaultOwnerId = Id<"programs"> | Id<"formTemplates">;
type PaymentDefaultFeeTable = "programFeeConfig" | "templateFeeConfig";
type PaymentDefaultPlanTable =
  | "programRecurringFeeConfig"
  | "templateRecurringFeeConfig";

type PaymentDefaultInstallment<
  TFeeTable extends PaymentDefaultFeeTable,
  TPlanTable extends PaymentDefaultPlanTable,
> = {
  _id: Id<TFeeTable>;
  totalAmount: number;
  createdAt: number;
  installmentIndex?: number;
  recurringPlanId?: Id<TPlanTable>;
};

type PaymentDefaultRecurringPlan<TPlanTable extends PaymentDefaultPlanTable> = {
  _id: Id<TPlanTable>;
  planKey: string;
  totalAmount: number;
  installmentCount: number;
};

export const recurringUpdateScopeValidator = v.union(
  v.literal("single"),
  v.literal("this_and_following"),
);

export function buildPaymentDefaultKey(prefix: string, name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  return `${prefix}_${base}_${Date.now().toString(36)}`;
}

export function sortPaymentDefaultInstallments<
  T extends { installmentIndex?: number; createdAt: number },
>(installments: T[]) {
  return [...installments].sort((a, b) => {
    const aIndex = a.installmentIndex ?? Number.MAX_SAFE_INTEGER;
    const bIndex = b.installmentIndex ?? Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) {
      return aIndex - bIndex;
    }

    return a.createdAt - b.createdAt;
  });
}

export function resolvePaymentDefaultInstallmentAmounts(args: {
  totalAmount: number;
  installmentCount: number;
  installmentAmounts?: number[];
}) {
  if (args.installmentAmounts === undefined) {
    return distributeAmounts(args.totalAmount, args.installmentCount);
  }

  if (args.installmentAmounts.length !== args.installmentCount) {
    throw new Error(
      "Installment amounts count must match projected installment count",
    );
  }
  if (
    args.installmentAmounts.some(
      (amount) => !Number.isInteger(amount) || amount < 0,
    )
  ) {
    throw new Error("Installment amounts must be non-negative integers");
  }

  const total = args.installmentAmounts.reduce(
    (sum, amount) => sum + amount,
    0,
  );
  if (total !== args.totalAmount) {
    throw new Error("Installment amounts total must match total amount");
  }

  return args.installmentAmounts;
}

export function validatePaymentDefaultFeeArgs(args: {
  name: string;
  totalAmount: number;
  downPaymentPercent?: number;
}) {
  const name = args.name.trim();

  if (!name) {
    throw new Error("Fee name is required");
  }
  if (args.totalAmount <= 0) {
    throw new Error("Total amount must be greater than 0");
  }
  if (
    args.downPaymentPercent !== undefined &&
    (args.downPaymentPercent < 0 || args.downPaymentPercent > 100)
  ) {
    throw new Error("Down payment percent must be between 0 and 100");
  }

  return name;
}

export function validateRecurringPaymentDefaultArgs(args: {
  name: string;
  totalAmount: number;
  installmentCount: number;
  dueDayOfMonth: number;
  timezone: string;
  downPaymentAmount?: number;
}) {
  const name = args.name.trim();

  if (!name) {
    throw new Error("Fee name is required");
  }
  if (args.totalAmount <= 0) {
    throw new Error("Total amount must be greater than 0");
  }
  if (args.installmentCount <= 0) {
    throw new Error("Installment count must be greater than 0");
  }
  if (args.dueDayOfMonth < 1 || args.dueDayOfMonth > 31) {
    throw new Error("Due day of month must be between 1 and 31");
  }
  if (!isValidTimeZone(args.timezone)) {
    throw new Error("Invalid timezone");
  }
  if (args.downPaymentAmount !== undefined) {
    if (args.downPaymentAmount < 0) {
      throw new Error("Down payment amount cannot be negative");
    }
    if (args.downPaymentAmount > args.totalAmount) {
      throw new Error("Down payment amount cannot exceed total amount");
    }
  }

  return name;
}

export async function syncPaymentDefaultRecurringPlan<
  TFeeTable extends PaymentDefaultFeeTable,
  TPlanTable extends PaymentDefaultPlanTable,
>(
  ctx: MutationCtx,
  args: {
    feeTable: TFeeTable;
    recurringPlanId: Id<TPlanTable>;
  },
) {
  const plan = (await ctx.db.get(
    args.recurringPlanId,
  )) as PaymentDefaultRecurringPlan<TPlanTable> | null;
  if (!plan) {
    throw new Error("Recurring plan not found");
  }

  const installments = (await ctx.db
    .query(args.feeTable)
    .withIndex("byRecurringPlan", (q) =>
      q.eq("recurringPlanId", args.recurringPlanId as never),
    )
    .collect()) as PaymentDefaultInstallment<TFeeTable, TPlanTable>[];

  if (installments.length === 0) {
    await ctx.db.delete(args.recurringPlanId);
    return;
  }

  const sortedInstallments = sortPaymentDefaultInstallments(installments);
  await Promise.all(
    sortedInstallments.map((installment, index) =>
      ctx.db.patch(installment._id, {
        installmentIndex: index + 1,
        installmentCount: sortedInstallments.length,
      } as never),
    ),
  );

  const totalAmount = sortedInstallments.reduce(
    (sum, installment) => sum + installment.totalAmount,
    0,
  );

  await ctx.db.patch(args.recurringPlanId, {
    installmentCount: sortedInstallments.length,
    totalAmount,
    updatedAt: Date.now(),
  } as never);
}

export async function createRecurringPaymentDefaultSeries<
  TFeeTable extends PaymentDefaultFeeTable,
  TPlanTable extends PaymentDefaultPlanTable,
  TOwnerField extends PaymentDefaultOwnerField,
>(
  ctx: MutationCtx,
  args: {
    feeTable: TFeeTable;
    planTable: TPlanTable;
    ownerField: TOwnerField;
    ownerId: PaymentDefaultOwnerId;
    planKeyPrefix: string;
    userId: Id<"users">;
    name: string;
    totalAmount: number;
    downPaymentAmount?: number;
    installmentCount: number;
    dueDayOfMonth: number;
    timezone: string;
    isRefundable: boolean;
    isIncluded: boolean;
    isRequired: boolean;
  },
) {
  const name = validateRecurringPaymentDefaultArgs(args);
  const planKey = buildPaymentDefaultKey(args.planKeyPrefix, name);
  const installmentAmounts = distributeAmounts(
    args.totalAmount,
    args.installmentCount,
    args.downPaymentAmount,
  );
  const now = Date.now();

  const planId = await ctx.db.insert(args.planTable, {
    [args.ownerField]: args.ownerId,
    planKey,
    name,
    cadence: "monthly",
    dueDayOfMonth: args.dueDayOfMonth,
    timezone: args.timezone,
    totalAmount: args.totalAmount,
    downPaymentAmount: args.downPaymentAmount,
    installmentCount: args.installmentCount,
    createdBy: args.userId,
    createdAt: now,
    updatedAt: now,
  } as never);

  const feeIds: Id<TFeeTable>[] = [];
  for (let index = 0; index < args.installmentCount; index += 1) {
    const feeId = await ctx.db.insert(args.feeTable, {
      [args.ownerField]: args.ownerId,
      feeKey: `${planKey}_installment_${String(index + 1).padStart(2, "0")}`,
      name,
      totalAmount: installmentAmounts[index] ?? 0,
      downPaymentPercent: 100,
      isRefundable: args.isRefundable,
      isIncluded: args.isIncluded,
      isRequired: args.isRequired,
      createdAt: now,
      createdBy: args.userId,
      recurringPlanId: planId,
      installmentIndex: index + 1,
      installmentCount: args.installmentCount,
      dueDayOfMonth: args.dueDayOfMonth,
      timezone: args.timezone,
      isRecurring: true,
    } as never);
    feeIds.push(feeId);
  }

  return { planId, feeIds };
}

export async function removePaymentDefaultFee<
  TFeeTable extends PaymentDefaultFeeTable,
  TPlanTable extends PaymentDefaultPlanTable,
>(
  ctx: MutationCtx,
  args: {
    feeTable: TFeeTable;
    fee: {
      _id: Id<TFeeTable>;
      recurringPlanId?: Id<TPlanTable>;
      installmentIndex?: number;
    };
    scope?: "single" | "this_and_following";
  },
) {
  if (!args.fee.recurringPlanId) {
    await ctx.db.delete(args.fee._id);
    return;
  }

  const installments = (await ctx.db
    .query(args.feeTable)
    .withIndex("byRecurringPlan", (q) =>
      q.eq("recurringPlanId", args.fee.recurringPlanId as never),
    )
    .collect()) as PaymentDefaultInstallment<TFeeTable, TPlanTable>[];

  const sortedInstallments = sortPaymentDefaultInstallments(installments);
  const targetInstallment = sortedInstallments.find(
    (installment) => installment._id === args.fee._id,
  );
  if (!targetInstallment || targetInstallment.installmentIndex === undefined) {
    throw new Error("Recurring installment metadata is invalid");
  }

  const targetInstallmentIndex = targetInstallment.installmentIndex;
  const installmentsToDelete =
    (args.scope ?? "single") === "this_and_following"
      ? sortedInstallments.filter(
          (installment) =>
            (installment.installmentIndex ?? 0) >= targetInstallmentIndex,
        )
      : [targetInstallment];

  await Promise.all(
    installmentsToDelete.map((installment) => ctx.db.delete(installment._id)),
  );

  await syncPaymentDefaultRecurringPlan(ctx, {
    feeTable: args.feeTable,
    recurringPlanId: args.fee.recurringPlanId,
  });
}

export async function updatePaymentDefaultFee<
  TPlanTable extends PaymentDefaultPlanTable,
  TFeeTable extends PaymentDefaultFeeTable,
>(
  ctx: MutationCtx,
  args: {
    fee: {
      _id: Id<TFeeTable>;
      totalAmount: number;
      recurringPlanId?: Id<TPlanTable>;
    };
    name: string;
    totalAmount?: number;
  },
) {
  const name = args.name.trim();
  if (!name) {
    throw new Error("Fee name cannot be empty");
  }
  if (args.totalAmount !== undefined && args.totalAmount <= 0) {
    throw new Error("Total amount must be greater than 0");
  }

  const previousTotalAmount = args.fee.totalAmount;
  await ctx.db.patch(args.fee._id, {
    name,
    ...(args.totalAmount !== undefined
      ? { totalAmount: args.totalAmount }
      : {}),
  } as never);

  if (args.fee.recurringPlanId && args.totalAmount !== undefined) {
    const recurringPlan = (await ctx.db.get(
      args.fee.recurringPlanId,
    )) as PaymentDefaultRecurringPlan<TPlanTable> | null;
    if (recurringPlan) {
      await ctx.db.patch(args.fee.recurringPlanId, {
        totalAmount:
          recurringPlan.totalAmount + (args.totalAmount - previousTotalAmount),
        updatedAt: Date.now(),
      } as never);
    }
  } else if (args.fee.recurringPlanId) {
    await ctx.db.patch(args.fee.recurringPlanId, {
      updatedAt: Date.now(),
    } as never);
  }
}

export async function updateRecurringPaymentDefaultSeries<
  TFeeTable extends PaymentDefaultFeeTable,
  TPlanTable extends PaymentDefaultPlanTable,
  TOwnerField extends PaymentDefaultOwnerField,
>(
  ctx: MutationCtx,
  args: {
    feeTable: TFeeTable;
    ownerField: TOwnerField;
    ownerId: PaymentDefaultOwnerId;
    userId: Id<"users">;
    fee: {
      _id: Id<TFeeTable>;
      recurringPlanId: Id<TPlanTable>;
      installmentIndex?: number;
    };
    recurringPlan: {
      _id: Id<TPlanTable>;
      planKey: string;
    };
    name: string;
    totalAmount: number;
    installmentCount: number;
    dueDayOfMonth: number;
    timezone: string;
    isRefundable: boolean;
    isIncluded: boolean;
    isRequired: boolean;
    installmentAmounts?: number[];
  },
) {
  const name = validateRecurringPaymentDefaultArgs(args);
  const installments = (await ctx.db
    .query(args.feeTable)
    .withIndex("byRecurringPlan", (q) =>
      q.eq("recurringPlanId", args.fee.recurringPlanId as never),
    )
    .collect()) as PaymentDefaultInstallment<TFeeTable, TPlanTable>[];

  const sortedInstallments = sortPaymentDefaultInstallments(installments);
  const targetInstallment = sortedInstallments.find(
    (installment) => installment._id === args.fee._id,
  );
  if (!targetInstallment || targetInstallment.installmentIndex === undefined) {
    throw new Error("Recurring installment metadata is invalid");
  }

  const targetInstallmentIndex = targetInstallment.installmentIndex;
  const installmentsFromTarget = sortedInstallments.filter(
    (installment) =>
      (installment.installmentIndex ?? 0) >= targetInstallmentIndex,
  );
  const scopeAmounts = resolvePaymentDefaultInstallmentAmounts({
    totalAmount: args.totalAmount,
    installmentCount: args.installmentCount,
    installmentAmounts: args.installmentAmounts,
  });
  const reusableInstallments = installmentsFromTarget.slice(
    0,
    args.installmentCount,
  );
  const installmentsToDelete = installmentsFromTarget.slice(
    args.installmentCount,
  );
  const now = Date.now();

  await Promise.all(
    reusableInstallments.map((installment, index) =>
      ctx.db.patch(installment._id, {
        name,
        totalAmount: scopeAmounts[index] ?? 0,
        isRefundable: args.isRefundable,
        isIncluded: args.isIncluded,
        isRequired: args.isRequired,
        dueDayOfMonth: args.dueDayOfMonth,
        timezone: args.timezone,
      } as never),
    ),
  );

  await Promise.all(
    installmentsToDelete.map((installment) => ctx.db.delete(installment._id)),
  );

  for (
    let index = reusableInstallments.length;
    index < args.installmentCount;
    index += 1
  ) {
    await ctx.db.insert(args.feeTable, {
      [args.ownerField]: args.ownerId,
      feeKey: `${args.recurringPlan.planKey}_installment_${String(index + 1).padStart(2, "0")}`,
      name,
      totalAmount: scopeAmounts[index] ?? 0,
      downPaymentPercent: 100,
      isRefundable: args.isRefundable,
      isIncluded: args.isIncluded,
      isRequired: args.isRequired,
      createdAt: now,
      createdBy: args.userId,
      recurringPlanId: args.fee.recurringPlanId,
      installmentIndex: 0,
      installmentCount: 0,
      dueDayOfMonth: args.dueDayOfMonth,
      timezone: args.timezone,
      isRecurring: true,
    } as never);
  }

  await syncPaymentDefaultRecurringPlan(ctx, {
    feeTable: args.feeTable,
    recurringPlanId: args.fee.recurringPlanId,
  });

  const refreshedInstallments = (await ctx.db
    .query(args.feeTable)
    .withIndex("byRecurringPlan", (q) =>
      q.eq("recurringPlanId", args.fee.recurringPlanId as never),
    )
    .collect()) as PaymentDefaultInstallment<TFeeTable, TPlanTable>[];
  const totalAmount = refreshedInstallments.reduce(
    (sum, installment) => sum + installment.totalAmount,
    0,
  );

  await ctx.db.patch(args.fee.recurringPlanId, {
    name,
    dueDayOfMonth: args.dueDayOfMonth,
    timezone: args.timezone,
    totalAmount,
    downPaymentAmount: undefined,
    installmentCount: refreshedInstallments.length,
    updatedAt: Date.now(),
  } as never);
}
