import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser } from "./lib/auth";
import { hasOrgAdminAccess } from "./lib/permissions";
import {
  buildPaymentDefaultKey,
  createRecurringPaymentDefaultSeries,
  recurringUpdateScopeValidator,
  removePaymentDefaultFee,
  updatePaymentDefaultFee,
  updateRecurringPaymentDefaultSeries,
  validatePaymentDefaultFeeArgs,
} from "./lib/paymentDefaultsRuntime";

const programFeeConfigValidator = v.object({
  _id: v.id("programFeeConfig"),
  _creationTime: v.number(),
  programId: v.id("programs"),
  feeKey: v.string(),
  name: v.string(),
  totalAmount: v.number(),
  downPaymentPercent: v.number(),
  isRefundable: v.boolean(),
  isIncluded: v.boolean(),
  isRequired: v.boolean(),
  createdAt: v.number(),
  createdBy: v.id("users"),
  recurringPlanId: v.optional(v.id("programRecurringFeeConfig")),
  installmentIndex: v.optional(v.number()),
  installmentCount: v.optional(v.number()),
  dueDayOfMonth: v.optional(v.number()),
  timezone: v.optional(v.string()),
  isRecurring: v.optional(v.boolean()),
});

async function verifyProgramAdminAccess(
  ctx: QueryCtx | MutationCtx,
  programId: Id<"programs">,
  userId: Id<"users">,
) {
  const program = await ctx.db.get(programId);
  if (!program) {
    throw new Error("Program not found");
  }

  const isAdmin = await hasOrgAdminAccess(ctx, userId, program.organizationId);
  if (!isAdmin) {
    throw new Error("Admin access required");
  }

  return program;
}

export const getByProgram = query({
  args: { programId: v.id("programs") },
  returns: v.array(programFeeConfigValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyProgramAdminAccess(ctx, args.programId, user._id);

    return await ctx.db
      .query("programFeeConfig")
      .withIndex("byProgram", (q) => q.eq("programId", args.programId))
      .collect();
  },
});

export const createFee = mutation({
  args: {
    programId: v.id("programs"),
    name: v.string(),
    totalAmount: v.number(),
    downPaymentPercent: v.number(),
    isRefundable: v.boolean(),
    isIncluded: v.boolean(),
    isRequired: v.boolean(),
  },
  returns: v.id("programFeeConfig"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const name = validatePaymentDefaultFeeArgs(args);

    await verifyProgramAdminAccess(ctx, args.programId, user._id);

    return await ctx.db.insert("programFeeConfig", {
      programId: args.programId,
      feeKey: buildPaymentDefaultKey("program_fee", name),
      name,
      totalAmount: args.totalAmount,
      downPaymentPercent: args.downPaymentPercent,
      isRefundable: args.isRefundable,
      isIncluded: args.isIncluded,
      isRequired: args.isRequired,
      createdAt: Date.now(),
      createdBy: user._id,
    });
  },
});

export const createRecurringPlan = mutation({
  args: {
    programId: v.id("programs"),
    name: v.string(),
    totalAmount: v.number(),
    downPaymentAmount: v.optional(v.number()),
    installmentCount: v.number(),
    dueDayOfMonth: v.number(),
    timezone: v.string(),
    isRefundable: v.boolean(),
    isIncluded: v.boolean(),
    isRequired: v.boolean(),
  },
  returns: v.object({
    planId: v.id("programRecurringFeeConfig"),
    feeIds: v.array(v.id("programFeeConfig")),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyProgramAdminAccess(ctx, args.programId, user._id);

    return await createRecurringPaymentDefaultSeries(ctx, {
      feeTable: "programFeeConfig",
      planTable: "programRecurringFeeConfig",
      ownerField: "programId",
      ownerId: args.programId,
      planKeyPrefix: "program_plan",
      userId: user._id,
      name: args.name,
      totalAmount: args.totalAmount,
      downPaymentAmount: args.downPaymentAmount,
      installmentCount: args.installmentCount,
      dueDayOfMonth: args.dueDayOfMonth,
      timezone: args.timezone,
      isRefundable: args.isRefundable,
      isIncluded: args.isIncluded,
      isRequired: args.isRequired,
    });
  },
});

export const removeFee = mutation({
  args: {
    feeId: v.id("programFeeConfig"),
    scope: v.optional(recurringUpdateScopeValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const fee = await ctx.db.get(args.feeId);

    if (!fee) {
      throw new Error("Fee not found");
    }

    await verifyProgramAdminAccess(ctx, fee.programId, user._id);
    await removePaymentDefaultFee(ctx, {
      feeTable: "programFeeConfig",
      fee,
      scope: args.scope,
    });
    return null;
  },
});

export const updateFee = mutation({
  args: {
    feeId: v.id("programFeeConfig"),
    name: v.string(),
    totalAmount: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const fee = await ctx.db.get(args.feeId);

    if (!fee) {
      throw new Error("Fee not found");
    }

    await verifyProgramAdminAccess(ctx, fee.programId, user._id);
    await updatePaymentDefaultFee(ctx, {
      fee,
      name: args.name,
      totalAmount: args.totalAmount,
    });
    return null;
  },
});

export const updateRecurringSeries = mutation({
  args: {
    feeId: v.id("programFeeConfig"),
    name: v.string(),
    totalAmount: v.number(),
    installmentCount: v.number(),
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
    if (!fee.recurringPlanId) {
      throw new Error("Fee is not part of a recurring plan");
    }

    await verifyProgramAdminAccess(ctx, fee.programId, user._id);

    const recurringPlan = await ctx.db.get(fee.recurringPlanId);
    if (!recurringPlan) {
      throw new Error("Recurring plan not found");
    }
    await updateRecurringPaymentDefaultSeries(ctx, {
      feeTable: "programFeeConfig",
      ownerField: "programId",
      ownerId: fee.programId,
      userId: user._id,
      fee: {
        _id: fee._id,
        recurringPlanId: fee.recurringPlanId,
        installmentIndex: fee.installmentIndex,
      },
      recurringPlan,
      name: args.name,
      totalAmount: args.totalAmount,
      installmentCount: args.installmentCount,
      dueDayOfMonth: args.dueDayOfMonth,
      timezone: args.timezone,
      isRefundable: args.isRefundable,
      isIncluded: args.isIncluded,
      isRequired: args.isRequired,
      installmentAmounts: args.installmentAmounts,
    });
    return null;
  },
});
