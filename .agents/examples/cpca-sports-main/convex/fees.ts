import { query, mutation, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./lib/auth";
import { hasOrgAdminAccess } from "./lib/permissions";
import { Id } from "./_generated/dataModel";
import {
  buildMonthlyDueDates,
  distributeAmounts,
  isValidTimeZone,
  parseDateString,
} from "./lib/paymentPlans";
import {
  feeSummaryValidator,
  getFeeSummary,
  getPaymentDetails as buildPaymentDetails,
  paymentFeeListItemValidator,
  syncApplicationFeeSummary,
} from "./lib/feeSummary";

const feeStatus = v.union(
  v.literal("pending"),
  v.literal("partially_paid"),
  v.literal("paid"),
);

const recurringUpdateScope = v.union(
  v.literal("single"),
  v.literal("this_and_following"),
);

const feeValidator = v.object({
  _id: v.id("fees"),
  _creationTime: v.number(),
  applicationId: v.id("applications"),
  name: v.string(),
  description: v.optional(v.string()),
  totalAmount: v.number(),
  downPaymentPercent: v.number(),
  isRefundable: v.boolean(),
  isIncluded: v.boolean(),
  isDefault: v.boolean(),
  isRequired: v.boolean(),
  status: feeStatus,
  paidAmount: v.number(),
  createdAt: v.number(),
  paidAt: v.optional(v.number()),
  createdBy: v.id("users"),
  recurringPlanId: v.optional(v.id("recurringFeePlans")),
  installmentIndex: v.optional(v.number()),
  installmentCount: v.optional(v.number()),
  dueDate: v.optional(v.string()),
  timezone: v.optional(v.string()),
  isRecurring: v.optional(v.boolean()),
});

/**
 * Helper to verify user has access to an application (owner or org admin).
 */
async function verifyApplicationAccess(
  ctx: QueryCtx | MutationCtx,
  applicationId: Id<"applications">,
  userId: Id<"users">,
  requireAdmin: boolean = false,
) {
  const application = await ctx.db.get(applicationId);
  if (!application) {
    throw new Error("Application not found");
  }

  const isOwner = application.userId === userId;
  const isAdmin = await hasOrgAdminAccess(
    ctx,
    userId,
    application.organizationId,
  );

  if (requireAdmin && !isAdmin) {
    throw new Error("Admin access required");
  }

  if (!isOwner && !isAdmin) {
    throw new Error("Unauthorized");
  }

  return { application, isOwner, isAdmin };
}

/**
 * Get all fees for an application.
 */
export const getByApplication = query({
  args: { applicationId: v.id("applications") },
  returns: v.array(feeValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyApplicationAccess(ctx, args.applicationId, user._id);

    return await ctx.db
      .query("fees")
      .withIndex("byApplication", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();
  },
});

/**
 * Get fee summary (totals) for an application.
 */
export const getSummary = query({
  args: { applicationId: v.id("applications") },
  returns: feeSummaryValidator,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const { application } = await verifyApplicationAccess(
      ctx,
      args.applicationId,
      user._id,
    );

    return application.paymentSummary ?? getFeeSummary(ctx, args.applicationId);
  },
});

/**
 * Get lightweight fee details for payment previews.
 */
export const getPaymentDetails = query({
  args: { applicationId: v.id("applications") },
  returns: v.array(paymentFeeListItemValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyApplicationAccess(ctx, args.applicationId, user._id);

    return await buildPaymentDetails(ctx, args.applicationId);
  },
});

/**
 * Create a new fee for an application (admin only).
 */
export const create = mutation({
  args: {
    applicationId: v.id("applications"),
    name: v.string(),
    description: v.optional(v.string()),
    totalAmount: v.number(), // In cents
    downPaymentPercent: v.number(), // 0-100
    isRefundable: v.boolean(),
    isIncluded: v.boolean(),
    isRequired: v.boolean(),
  },
  returns: v.id("fees"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyApplicationAccess(ctx, args.applicationId, user._id, true);

    if (args.totalAmount <= 0) {
      throw new Error("Total amount must be greater than 0");
    }

    if (args.downPaymentPercent < 0 || args.downPaymentPercent > 100) {
      throw new Error("Down payment percent must be between 0 and 100");
    }

    const feeId = await ctx.db.insert("fees", {
      applicationId: args.applicationId,
      name: args.name,
      description: args.description,
      totalAmount: args.totalAmount,
      downPaymentPercent: args.downPaymentPercent,
      isRefundable: args.isRefundable,
      isIncluded: args.isIncluded,
      isDefault: false,
      isRequired: args.isRequired,
      status: "pending",
      paidAmount: 0,
      createdAt: Date.now(),
      createdBy: user._id,
    });

    await syncApplicationFeeSummary(ctx, args.applicationId);
    return feeId;
  },
});

/**
 * Create a recurring fee plan and generate monthly installments (admin only).
 */
export const createRecurringPlan = mutation({
  args: {
    applicationId: v.id("applications"),
    name: v.string(),
    description: v.optional(v.string()),
    totalAmount: v.number(), // In cents
    downPaymentAmount: v.optional(v.number()), // In cents
    startDate: v.string(), // YYYY-MM-DD
    endDate: v.string(), // YYYY-MM-DD
    dueDayOfMonth: v.number(), // 1-31
    timezone: v.string(), // IANA timezone
    isRefundable: v.boolean(),
    isIncluded: v.boolean(),
    isRequired: v.boolean(),
  },
  returns: v.object({
    planId: v.id("recurringFeePlans"),
    feeIds: v.array(v.id("fees")),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyApplicationAccess(ctx, args.applicationId, user._id, true);

    if (args.totalAmount <= 0) {
      throw new Error("Total amount must be greater than 0");
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

    const dueDates = buildMonthlyDueDates(
      args.startDate,
      args.endDate,
      args.dueDayOfMonth,
    );
    const installmentCount = dueDates.length;
    if (installmentCount === 0) {
      throw new Error("No installments were generated for the provided dates");
    }

    const installmentAmounts = distributeAmounts(
      args.totalAmount,
      installmentCount,
      args.downPaymentAmount,
    );

    const now = Date.now();
    const planId = await ctx.db.insert("recurringFeePlans", {
      applicationId: args.applicationId,
      name: args.name.trim(),
      description: args.description,
      cadence: "monthly",
      startDate: args.startDate,
      endDate: args.endDate,
      dueDayOfMonth: args.dueDayOfMonth,
      timezone: args.timezone,
      totalAmount: args.totalAmount,
      downPaymentAmount: args.downPaymentAmount,
      installmentCount,
      status: "active",
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    const feeIds: Id<"fees">[] = [];
    for (let index = 0; index < installmentCount; index += 1) {
      const feeId = await ctx.db.insert("fees", {
        applicationId: args.applicationId,
        name: args.name.trim(),
        description: args.description,
        totalAmount: installmentAmounts[index] ?? 0,
        downPaymentPercent: 100,
        isRefundable: args.isRefundable,
        isIncluded: args.isIncluded,
        isDefault: false,
        isRequired: args.isRequired,
        status: "pending",
        paidAmount: 0,
        createdAt: now,
        createdBy: user._id,
        recurringPlanId: planId,
        installmentIndex: index + 1,
        installmentCount,
        dueDate: dueDates[index],
        timezone: args.timezone,
        isRecurring: true,
      });
      feeIds.push(feeId);
    }

    await syncApplicationFeeSummary(ctx, args.applicationId);
    return { planId, feeIds };
  },
});

/**
 * Create default fees for an application (admin only).
 * Used when setting up fees for a new application.
 */
export const createDefaults = mutation({
  args: {
    applicationId: v.id("applications"),
    fees: v.array(
      v.object({
        name: v.string(),
        description: v.optional(v.string()),
        totalAmount: v.number(),
        downPaymentPercent: v.number(),
        isRefundable: v.boolean(),
        isIncluded: v.boolean(),
        isRequired: v.boolean(),
      }),
    ),
  },
  returns: v.array(v.id("fees")),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyApplicationAccess(ctx, args.applicationId, user._id, true);

    const feeIds: Id<"fees">[] = [];

    for (const fee of args.fees) {
      const feeId = await ctx.db.insert("fees", {
        applicationId: args.applicationId,
        name: fee.name,
        description: fee.description,
        totalAmount: fee.totalAmount,
        downPaymentPercent: fee.downPaymentPercent,
        isRefundable: fee.isRefundable,
        isIncluded: fee.isIncluded,
        isDefault: true,
        isRequired: fee.isRequired,
        status: "pending",
        paidAmount: 0,
        createdAt: Date.now(),
        createdBy: user._id,
      });
      feeIds.push(feeId);
    }

    await syncApplicationFeeSummary(ctx, args.applicationId);
    return feeIds;
  },
});

/**
 * Remove a fee (admin only, non-default fees only).
 */
export const remove = mutation({
  args: {
    feeId: v.id("fees"),
    scope: v.optional(recurringUpdateScope),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const fee = await ctx.db.get(args.feeId);

    if (!fee) {
      throw new Error("Fee not found");
    }

    await verifyApplicationAccess(ctx, fee.applicationId, user._id, true);

    if (fee.isDefault) {
      throw new Error("Cannot remove default fees");
    }

    if (fee.paidAmount > 0) {
      throw new Error("Cannot remove a fee that has payments");
    }

    if (fee.recurringPlanId) {
      const recurringPlan = await ctx.db.get(fee.recurringPlanId);
      if (!recurringPlan) {
        throw new Error("Recurring plan not found");
      }

      const scope = args.scope ?? "single";
      const installments = await ctx.db
        .query("fees")
        .withIndex("byRecurringPlan", (q) =>
          q.eq("recurringPlanId", fee.recurringPlanId),
        )
        .collect();

      const sortedInstallments = installments
        .filter((installment) => installment.installmentIndex !== undefined)
        .sort(
          (a, b) =>
            (a.installmentIndex ?? Number.MAX_SAFE_INTEGER) -
            (b.installmentIndex ?? Number.MAX_SAFE_INTEGER),
        );

      const targetInstallment = sortedInstallments.find(
        (installment) => installment._id === fee._id,
      );
      if (
        !targetInstallment ||
        targetInstallment.installmentIndex === undefined
      ) {
        throw new Error("Recurring installment metadata is invalid");
      }
      const targetInstallmentIndex = targetInstallment.installmentIndex;

      const deleteFromTarget =
        scope === "this_and_following"
          ? sortedInstallments.filter(
              (installment) =>
                (installment.installmentIndex ?? 0) >= targetInstallmentIndex,
            )
          : [targetInstallment];

      if (deleteFromTarget.some((installment) => installment.paidAmount > 0)) {
        throw new Error(
          "Cannot remove a recurring installment that has payments",
        );
      }

      await Promise.all(
        deleteFromTarget.map((installment) => ctx.db.delete(installment._id)),
      );

      const remainingInstallments = await ctx.db
        .query("fees")
        .withIndex("byRecurringPlan", (q) =>
          q.eq("recurringPlanId", fee.recurringPlanId),
        )
        .collect();

      if (remainingInstallments.length === 0) {
        await ctx.db.delete(recurringPlan._id);
        await syncApplicationFeeSummary(ctx, fee.applicationId);
        return null;
      }

      const normalizedInstallments = remainingInstallments
        .filter((installment) => installment.installmentIndex !== undefined)
        .sort(
          (a, b) =>
            (a.installmentIndex ?? Number.MAX_SAFE_INTEGER) -
            (b.installmentIndex ?? Number.MAX_SAFE_INTEGER),
        );

      const installmentCount = normalizedInstallments.length;
      const totalAmount = normalizedInstallments.reduce(
        (sum, installment) => sum + installment.totalAmount,
        0,
      );
      const nextPlanStatus = normalizedInstallments.some(
        (installment) => installment.status !== "paid",
      )
        ? "active"
        : "completed";
      const dueDates = normalizedInstallments
        .map((installment) => installment.dueDate)
        .filter((value): value is string => value !== undefined)
        .sort();

      await Promise.all(
        normalizedInstallments.map((installment, index) =>
          ctx.db.patch(installment._id, {
            installmentIndex: index + 1,
            installmentCount,
          }),
        ),
      );

      await ctx.db.patch(recurringPlan._id, {
        installmentCount,
        totalAmount,
        startDate: dueDates[0] ?? recurringPlan.startDate,
        endDate: dueDates[dueDates.length - 1] ?? recurringPlan.endDate,
        status: nextPlanStatus,
        updatedAt: Date.now(),
      });

      await syncApplicationFeeSummary(ctx, fee.applicationId);
      return null;
    }

    await ctx.db.delete(args.feeId);
    await syncApplicationFeeSummary(ctx, fee.applicationId);
    return null;
  },
});

/**
 * Record a manual payment (admin only - cash/wire).
 */
export const recordManualPayment = mutation({
  args: {
    feeId: v.id("fees"),
    amount: v.number(), // In cents
    method: v.union(v.literal("cash"), v.literal("wire")),
    reference: v.optional(v.string()),
  },
  returns: v.id("transactions"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const fee = await ctx.db.get(args.feeId);

    if (!fee) {
      throw new Error("Fee not found");
    }

    await verifyApplicationAccess(ctx, fee.applicationId, user._id, true);

    if (fee.status === "paid") {
      throw new Error("Fee is already fully paid");
    }

    if (args.amount <= 0) {
      throw new Error("Amount must be greater than 0");
    }

    const remainingAmount = fee.totalAmount - fee.paidAmount;
    if (args.amount > remainingAmount) {
      throw new Error(
        `Amount exceeds remaining balance of ${remainingAmount} cents`,
      );
    }

    // Create transaction record
    const transactionId = await ctx.db.insert("transactions", {
      applicationId: fee.applicationId,
      feeId: args.feeId,
      amount: args.amount,
      method: args.method,
      status: "completed",
      reference: args.reference || `${args.method.toUpperCase()}-${Date.now()}`,
      registeredBy: user._id,
      createdAt: Date.now(),
      completedAt: Date.now(),
    });

    // Update fee
    const newPaidAmount = fee.paidAmount + args.amount;
    const newStatus =
      newPaidAmount >= fee.totalAmount ? "paid" : "partially_paid";

    await ctx.db.patch(args.feeId, {
      paidAmount: newPaidAmount,
      status: newStatus,
      ...(newStatus === "paid" ? { paidAt: Date.now() } : {}),
    });

    await syncApplicationFeeSummary(ctx, fee.applicationId);
    return transactionId;
  },
});

/**
 * Update a fee (admin only).
 * Cannot update totalAmount if the fee has any payments.
 */
export const update = mutation({
  args: {
    feeId: v.id("fees"),
    name: v.string(),
    totalAmount: v.optional(v.number()),
    scope: v.optional(recurringUpdateScope),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const fee = await ctx.db.get(args.feeId);

    if (!fee) {
      throw new Error("Fee not found");
    }

    await verifyApplicationAccess(ctx, fee.applicationId, user._id, true);

    if (fee.isDefault) {
      throw new Error("Cannot edit default fees");
    }

    const nextName = args.name.trim();
    if (nextName.length === 0) {
      throw new Error("Fee name cannot be empty");
    }

    if (args.totalAmount !== undefined) {
      if (args.totalAmount <= 0) {
        throw new Error("Total amount must be greater than 0");
      }
    }

    const scope = args.scope ?? "single";

    // Update this installment and rebalance this and following installments.
    if (fee.recurringPlanId && scope === "this_and_following") {
      const recurringPlan = await ctx.db.get(fee.recurringPlanId);
      if (!recurringPlan) {
        throw new Error("Recurring plan not found");
      }

      const installments = await ctx.db
        .query("fees")
        .withIndex("byRecurringPlan", (q) =>
          q.eq("recurringPlanId", fee.recurringPlanId),
        )
        .collect();

      const sortedInstallments = installments
        .filter((installment) => installment.installmentIndex !== undefined)
        .sort(
          (a, b) =>
            (a.installmentIndex ?? Number.MAX_SAFE_INTEGER) -
            (b.installmentIndex ?? Number.MAX_SAFE_INTEGER),
        );

      const targetInstallment = sortedInstallments.find(
        (installment) => installment._id === fee._id,
      );
      if (
        !targetInstallment ||
        targetInstallment.installmentIndex === undefined
      ) {
        throw new Error("Recurring installment metadata is invalid");
      }

      if (targetInstallment.paidAmount > 0) {
        throw new Error(
          "Cannot rebalance from an installment that already has payments",
        );
      }

      const targetIndex = targetInstallment.installmentIndex;
      const installmentsBeforeTarget = sortedInstallments.filter(
        (installment) => (installment.installmentIndex ?? 0) < targetIndex,
      );
      const installmentsFromTarget = sortedInstallments.filter(
        (installment) => (installment.installmentIndex ?? 0) >= targetIndex,
      );

      const editableInstallments = installmentsFromTarget.filter(
        (installment) => installment.paidAmount === 0,
      );
      const lockedPaidInstallments = installmentsFromTarget.filter(
        (installment) => installment.paidAmount > 0,
      );

      const editableTarget = editableInstallments.find(
        (installment) => installment._id === fee._id,
      );
      if (!editableTarget) {
        throw new Error("Target installment is not editable");
      }

      const updateNameForEditable = async () => {
        await Promise.all(
          editableInstallments.map((installment) =>
            ctx.db.patch(installment._id, { name: nextName }),
          ),
        );
      };

      if (args.totalAmount === undefined) {
        await updateNameForEditable();
        await ctx.db.patch(recurringPlan._id, { updatedAt: Date.now() });
        return null;
      }

      const totalBeforeTarget = installmentsBeforeTarget.reduce(
        (sum, installment) => sum + installment.totalAmount,
        0,
      );
      const totalLockedPaidInScope = lockedPaidInstallments.reduce(
        (sum, installment) => sum + installment.totalAmount,
        0,
      );
      const availableForEditable =
        recurringPlan.totalAmount - totalBeforeTarget - totalLockedPaidInScope;

      if (availableForEditable < 0) {
        throw new Error("Recurring plan total is inconsistent");
      }

      if (args.totalAmount > availableForEditable) {
        throw new Error(
          `Amount exceeds available balance of ${availableForEditable} cents`,
        );
      }

      const otherEditableInstallments = editableInstallments
        .filter((installment) => installment._id !== fee._id)
        .sort(
          (a, b) =>
            (a.installmentIndex ?? Number.MAX_SAFE_INTEGER) -
            (b.installmentIndex ?? Number.MAX_SAFE_INTEGER),
        );

      const redistributedAmounts =
        otherEditableInstallments.length > 0
          ? distributeAmounts(
              availableForEditable - args.totalAmount,
              otherEditableInstallments.length,
            )
          : [];

      if (
        otherEditableInstallments.length === 0 &&
        args.totalAmount !== availableForEditable
      ) {
        throw new Error(
          `Amount must be exactly ${availableForEditable} cents for the last editable installment`,
        );
      }

      await ctx.db.patch(fee._id, {
        name: nextName,
        totalAmount: args.totalAmount,
      });

      await Promise.all(
        otherEditableInstallments.map((installment, index) =>
          ctx.db.patch(installment._id, {
            totalAmount: redistributedAmounts[index] ?? 0,
            ...(installment.name !== nextName ? { name: nextName } : {}),
          }),
        ),
      );

      await ctx.db.patch(recurringPlan._id, { updatedAt: Date.now() });
      await syncApplicationFeeSummary(ctx, fee.applicationId);
      return null;
    }

    if (args.totalAmount !== undefined && fee.paidAmount > 0) {
      throw new Error("Cannot update total amount for a fee that has payments");
    }

    const previousTotalAmount = fee.totalAmount;
    const updates: {
      name: string;
      totalAmount?: number;
    } = {
      name: nextName,
    };

    if (args.totalAmount !== undefined) {
      updates.totalAmount = args.totalAmount;
    }

    await ctx.db.patch(args.feeId, updates);

    if (fee.recurringPlanId && args.totalAmount !== undefined) {
      const recurringPlan = await ctx.db.get(fee.recurringPlanId);
      if (recurringPlan) {
        const delta = args.totalAmount - previousTotalAmount;
        await ctx.db.patch(recurringPlan._id, {
          totalAmount: recurringPlan.totalAmount + delta,
          updatedAt: Date.now(),
        });
      }
    } else if (fee.recurringPlanId) {
      const recurringPlan = await ctx.db.get(fee.recurringPlanId);
      if (recurringPlan) {
        await ctx.db.patch(recurringPlan._id, { updatedAt: Date.now() });
      }
    }

    if (args.totalAmount !== undefined) {
      await syncApplicationFeeSummary(ctx, fee.applicationId);
    }
    return null;
  },
});

/**
 * Update recurring installments from a selected installment forward
 * Reconfigures the projected recurring schedule (from this installment forward),
 * keeping paid history intact.
 */
export const updateRecurringSeries = mutation({
  args: {
    feeId: v.id("fees"),
    name: v.string(),
    totalAmount: v.number(),
    startDate: v.string(),
    endDate: v.string(),
    dueDayOfMonth: v.number(),
    timezone: v.string(),
    isRefundable: v.boolean(),
    isIncluded: v.boolean(),
    isRequired: v.boolean(),
    installmentAmounts: v.optional(v.array(v.number())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const fee = await ctx.db.get(args.feeId);

    if (!fee) {
      throw new Error("Fee not found");
    }

    await verifyApplicationAccess(ctx, fee.applicationId, user._id, true);

    if (!fee.recurringPlanId) {
      throw new Error("Fee is not part of a recurring plan");
    }

    const recurringPlan = await ctx.db.get(fee.recurringPlanId);
    if (!recurringPlan) {
      throw new Error("Recurring plan not found");
    }

    const nextName = args.name.trim();
    if (nextName.length === 0) {
      throw new Error("Fee name cannot be empty");
    }

    if (args.totalAmount <= 0) {
      throw new Error("Total amount must be greater than 0");
    }

    const nextDueDay = args.dueDayOfMonth;
    if (nextDueDay < 1 || nextDueDay > 31) {
      throw new Error("Due day of month must be between 1 and 31");
    }

    const nextTimezone = args.timezone;
    if (!isValidTimeZone(nextTimezone)) {
      throw new Error("Invalid timezone");
    }

    const installments = await ctx.db
      .query("fees")
      .withIndex("byRecurringPlan", (q) =>
        q.eq("recurringPlanId", fee.recurringPlanId),
      )
      .collect();

    const sortedInstallments = installments
      .filter((installment) => installment.installmentIndex !== undefined)
      .sort(
        (a, b) =>
          (a.installmentIndex ?? Number.MAX_SAFE_INTEGER) -
          (b.installmentIndex ?? Number.MAX_SAFE_INTEGER),
      );

    const targetInstallment = sortedInstallments.find(
      (installment) => installment._id === fee._id,
    );
    if (
      !targetInstallment ||
      targetInstallment.installmentIndex === undefined
    ) {
      throw new Error("Recurring installment metadata is invalid");
    }

    if (targetInstallment.paidAmount > 0) {
      throw new Error(
        "Cannot edit recurring series from an installment that has payments",
      );
    }

    const targetInstallmentIndex = targetInstallment.installmentIndex;
    const installmentsBeforeTarget = sortedInstallments.filter(
      (installment) =>
        (installment.installmentIndex ?? 0) < targetInstallmentIndex,
    );
    const installmentsFromTarget = sortedInstallments.filter(
      (installment) =>
        (installment.installmentIndex ?? 0) >= targetInstallmentIndex,
    );

    if (
      installmentsFromTarget.some((installment) => installment.paidAmount > 0)
    ) {
      throw new Error(
        "Cannot edit recurring series when a following installment already has payments",
      );
    }

    if (!targetInstallment.dueDate) {
      throw new Error("Target installment due date is missing");
    }

    const start = parseDateString(args.startDate);
    const end = parseDateString(args.endDate);
    const startKey = start.year * 12 + start.month;
    const endKey = end.year * 12 + end.month;
    if (endKey < startKey) {
      throw new Error("End date must be equal or after start date");
    }

    if (installmentsBeforeTarget.length > 0) {
      const previousInstallment =
        installmentsBeforeTarget[installmentsBeforeTarget.length - 1];
      if (!previousInstallment?.dueDate) {
        throw new Error("Recurring installment due date is missing");
      }

      const previousDate = parseDateString(previousInstallment.dueDate);
      const previousKey = previousDate.year * 12 + previousDate.month;
      if (startKey <= previousKey) {
        throw new Error(
          "Start date must be after the previous installment month",
        );
      }
    }

    const scopeDueDates = buildMonthlyDueDates(
      args.startDate,
      args.endDate,
      nextDueDay,
    );
    const scopeInstallmentCount = scopeDueDates.length;
    if (scopeInstallmentCount <= 0) {
      throw new Error("Recurring period is invalid");
    }

    let scopeAmounts: number[] = [];
    if (args.installmentAmounts !== undefined) {
      if (args.installmentAmounts.length !== scopeInstallmentCount) {
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

      const scopedTotalAmount = args.installmentAmounts.reduce(
        (sum, amount) => sum + amount,
        0,
      );
      if (scopedTotalAmount !== args.totalAmount) {
        throw new Error("Installment amounts total must match total amount");
      }

      scopeAmounts = args.installmentAmounts;
    } else {
      scopeAmounts = distributeAmounts(args.totalAmount, scopeInstallmentCount);
    }
    const patchByInstallmentId = new Map<
      string,
      {
        name: string;
        totalAmount: number;
        dueDate: string;
        timezone: string;
        isRefundable: boolean;
        isIncluded: boolean;
        isRequired: boolean;
      }
    >();

    const reusableInstallments = installmentsFromTarget.slice(
      0,
      scopeInstallmentCount,
    );
    const installmentsToDelete = installmentsFromTarget.slice(
      scopeInstallmentCount,
    );

    for (let index = 0; index < reusableInstallments.length; index += 1) {
      const installment = reusableInstallments[index];
      patchByInstallmentId.set(String(installment._id), {
        name: nextName,
        totalAmount: scopeAmounts[index] ?? 0,
        dueDate: scopeDueDates[index] ?? args.endDate,
        timezone: nextTimezone,
        isRefundable: args.isRefundable,
        isIncluded: args.isIncluded,
        isRequired: args.isRequired,
      });
    }

    const feeDescription = targetInstallment.description;
    const now = Date.now();
    const insertedInstallmentIds: Id<"fees">[] = [];
    if (scopeInstallmentCount > reusableInstallments.length) {
      for (
        let index = reusableInstallments.length;
        index < scopeInstallmentCount;
        index += 1
      ) {
        const insertedFeeId = await ctx.db.insert("fees", {
          applicationId: fee.applicationId,
          name: nextName,
          description: feeDescription,
          totalAmount: scopeAmounts[index] ?? 0,
          downPaymentPercent: 100,
          isRefundable: args.isRefundable,
          isIncluded: args.isIncluded,
          isDefault: false,
          isRequired: args.isRequired,
          status: "pending",
          paidAmount: 0,
          createdAt: now,
          createdBy: user._id,
          recurringPlanId: fee.recurringPlanId,
          installmentIndex: 0,
          installmentCount: 0,
          dueDate: scopeDueDates[index] ?? args.endDate,
          timezone: nextTimezone,
          isRecurring: true,
        });
        insertedInstallmentIds.push(insertedFeeId);
      }
    }

    await Promise.all(
      reusableInstallments.map((installment) => {
        const patch = patchByInstallmentId.get(String(installment._id));
        if (!patch) {
          throw new Error("Recurring installment patch is missing");
        }
        return ctx.db.patch(installment._id, patch);
      }),
    );

    await Promise.all(
      installmentsToDelete.map((installment) => ctx.db.delete(installment._id)),
    );

    const insertedInstallments = await Promise.all(
      insertedInstallmentIds.map(async (installmentId) => {
        const insertedInstallment = await ctx.db.get(installmentId);
        if (!insertedInstallment) {
          throw new Error("Inserted recurring installment not found");
        }
        return insertedInstallment;
      }),
    );

    const projectedInstallments = [
      ...installmentsBeforeTarget,
      ...reusableInstallments.map((installment) => {
        const patch = patchByInstallmentId.get(String(installment._id));
        return patch ? { ...installment, ...patch } : installment;
      }),
      ...insertedInstallments,
    ].sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

    const fullInstallmentCount = projectedInstallments.length;
    await Promise.all(
      projectedInstallments.map((installment, index) =>
        ctx.db.patch(installment._id, {
          installmentIndex: index + 1,
          installmentCount: fullInstallmentCount,
        }),
      ),
    );

    const projectedInstallmentsWithPatch = projectedInstallments.map(
      (installment) => {
        const patch = patchByInstallmentId.get(String(installment._id));
        return patch ? { ...installment, ...patch } : installment;
      },
    );

    const dueDates = projectedInstallmentsWithPatch
      .map((installment) => installment.dueDate)
      .filter((value): value is string => value !== undefined)
      .sort();

    const totalAmount = projectedInstallmentsWithPatch.reduce(
      (sum, installment) => sum + installment.totalAmount,
      0,
    );

    const nextPlanStatus = projectedInstallmentsWithPatch.some(
      (installment) => installment.status !== "paid",
    )
      ? "active"
      : "completed";

    await ctx.db.patch(recurringPlan._id, {
      name: nextName,
      dueDayOfMonth: nextDueDay,
      timezone: nextTimezone,
      totalAmount,
      downPaymentAmount: undefined,
      installmentCount: fullInstallmentCount,
      startDate: dueDates[0] ?? recurringPlan.startDate,
      endDate: dueDates[dueDates.length - 1] ?? recurringPlan.endDate,
      status: nextPlanStatus,
      updatedAt: Date.now(),
    });

    await syncApplicationFeeSummary(ctx, fee.applicationId);
    return null;
  },
});

/**
 * Get minimum payment amount for selected fees.
 * Returns the sum of down payments for pending fees.
 */
export const getMinimumPayment = query({
  args: {
    feeIds: v.array(v.id("fees")),
  },
  returns: v.object({
    minimumAmount: v.number(),
    totalRemaining: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    let minimumAmount = 0;
    let totalRemaining = 0;

    for (const feeId of args.feeIds) {
      const fee = await ctx.db.get(feeId);
      if (!fee) continue;

      await verifyApplicationAccess(ctx, fee.applicationId, user._id);

      const remaining = fee.totalAmount - fee.paidAmount;
      if (remaining <= 0) continue;

      totalRemaining += remaining;

      // Minimum is the down payment percentage of the remaining amount
      const downPayment = Math.ceil((remaining * fee.downPaymentPercent) / 100);
      minimumAmount += downPayment > 0 ? downPayment : remaining;
    }

    return { minimumAmount, totalRemaining };
  },
});
