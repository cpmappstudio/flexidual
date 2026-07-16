import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const defaultPaymentConfigValidator = v.object({
  feeKey: v.string(),
  name: v.string(),
  totalAmount: v.number(),
  downPaymentPercent: v.number(),
  isRefundable: v.boolean(),
  isIncluded: v.boolean(),
  isRequired: v.boolean(),
  recurringPlanId: v.optional(v.string()),
  installmentIndex: v.optional(v.number()),
  installmentCount: v.optional(v.number()),
  dueDayOfMonth: v.optional(v.number()),
  timezone: v.optional(v.string()),
  isRecurring: v.optional(v.boolean()),
});

type DefaultPaymentConfig = {
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

type PaymentDefaultOwnerSpec =
  | {
      feeTable: "programFeeConfig";
      planTable: "programRecurringFeeConfig";
      ownerField: "programId";
      ownerIndex: "byProgram";
      ownerId: Id<"programs">;
    }
  | {
      feeTable: "templateFeeConfig";
      planTable: "templateRecurringFeeConfig";
      ownerField: "templateId";
      ownerIndex: "byTemplate";
      ownerId: Id<"formTemplates">;
    };

type PaymentDefaultFeeDoc = DefaultPaymentConfig & {
  _id: Id<"programFeeConfig"> | Id<"templateFeeConfig">;
  createdAt: number;
  recurringPlanId?:
    | Id<"programRecurringFeeConfig">
    | Id<"templateRecurringFeeConfig">;
};

type PaymentDefaultPlanDoc = {
  _id: Id<"programRecurringFeeConfig"> | Id<"templateRecurringFeeConfig">;
  planKey: string;
  name: string;
  cadence: string;
  dueDayOfMonth: number;
  timezone: string;
  totalAmount: number;
  downPaymentAmount?: number;
  installmentCount: number;
};

function getProgramPaymentOwner(
  programId: Id<"programs">,
): PaymentDefaultOwnerSpec {
  return {
    feeTable: "programFeeConfig",
    planTable: "programRecurringFeeConfig",
    ownerField: "programId",
    ownerIndex: "byProgram",
    ownerId: programId,
  };
}

function getTemplatePaymentOwner(
  templateId: Id<"formTemplates">,
): PaymentDefaultOwnerSpec {
  return {
    feeTable: "templateFeeConfig",
    planTable: "templateRecurringFeeConfig",
    ownerField: "templateId",
    ownerIndex: "byTemplate",
    ownerId: templateId,
  };
}

function sortRecurringPaymentDefaults<
  T extends { installmentIndex?: number; createdAt?: number },
>(fees: T[]) {
  return [...fees].sort((a, b) => {
    const aIndex = a.installmentIndex ?? Number.MAX_SAFE_INTEGER;
    const bIndex = b.installmentIndex ?? Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) {
      return aIndex - bIndex;
    }

    return (a.createdAt ?? 0) - (b.createdAt ?? 0);
  });
}

function splitPaymentConfigsByPlan(fees: DefaultPaymentConfig[]) {
  const recurringGroups = new Map<string, DefaultPaymentConfig[]>();
  const oneTimeFees: DefaultPaymentConfig[] = [];

  for (const fee of fees) {
    if (!fee.recurringPlanId) {
      oneTimeFees.push(fee);
      continue;
    }

    const current = recurringGroups.get(fee.recurringPlanId) ?? [];
    current.push(fee);
    recurringGroups.set(fee.recurringPlanId, current);
  }

  return {
    recurringGroups,
    oneTimeFees,
  };
}

async function getOwnerFees(
  ctx: MutationCtx,
  owner: PaymentDefaultOwnerSpec,
): Promise<PaymentDefaultFeeDoc[]> {
  if (owner.ownerField === "programId") {
    return (await ctx.db
      .query("programFeeConfig")
      .withIndex("byProgram", (q) => q.eq("programId", owner.ownerId))
      .collect()) as PaymentDefaultFeeDoc[];
  }

  return (await ctx.db
    .query("templateFeeConfig")
    .withIndex("byTemplate", (q) => q.eq("templateId", owner.ownerId))
    .collect()) as PaymentDefaultFeeDoc[];
}

async function getOwnerPlans(
  ctx: MutationCtx,
  owner: PaymentDefaultOwnerSpec,
): Promise<PaymentDefaultPlanDoc[]> {
  if (owner.ownerField === "programId") {
    return (await ctx.db
      .query("programRecurringFeeConfig")
      .withIndex("byProgram", (q) => q.eq("programId", owner.ownerId))
      .collect()) as PaymentDefaultPlanDoc[];
  }

  return (await ctx.db
    .query("templateRecurringFeeConfig")
    .withIndex("byTemplate", (q) => q.eq("templateId", owner.ownerId))
    .collect()) as PaymentDefaultPlanDoc[];
}

async function clearPaymentConfigs(
  ctx: MutationCtx,
  owner: PaymentDefaultOwnerSpec,
) {
  const [fees, plans] = await Promise.all([
    getOwnerFees(ctx, owner),
    getOwnerPlans(ctx, owner),
  ]);

  for (const fee of fees) {
    await ctx.db.delete(fee._id);
  }

  for (const plan of plans) {
    await ctx.db.delete(plan._id);
  }
}

async function insertPaymentFee(
  ctx: MutationCtx,
  args: {
    owner: PaymentDefaultOwnerSpec;
    userId: Id<"users">;
    createdAt: number;
    fee: DefaultPaymentConfig;
    recurringPlanId?:
      | Id<"programRecurringFeeConfig">
      | Id<"templateRecurringFeeConfig">;
  },
) {
  await ctx.db.insert(args.owner.feeTable, {
    [args.owner.ownerField]: args.owner.ownerId,
    feeKey: args.fee.feeKey,
    name: args.fee.name,
    totalAmount: args.fee.totalAmount,
    downPaymentPercent: args.fee.downPaymentPercent,
    isRefundable: args.fee.isRefundable,
    isIncluded: args.fee.isIncluded,
    isRequired: args.fee.isRequired,
    createdAt: args.createdAt,
    createdBy: args.userId,
    ...(args.recurringPlanId !== undefined && {
      recurringPlanId: args.recurringPlanId,
      installmentIndex: args.fee.installmentIndex,
      installmentCount: args.fee.installmentCount,
      dueDayOfMonth: args.fee.dueDayOfMonth,
      timezone: args.fee.timezone,
      isRecurring: args.fee.isRecurring,
    }),
  } as never);
}

async function insertRecurringPlan(
  ctx: MutationCtx,
  args: {
    owner: PaymentDefaultOwnerSpec;
    userId: Id<"users">;
    createdAt: number;
    plan: {
      planKey: string;
      name: string;
      cadence: string;
      dueDayOfMonth: number;
      timezone: string;
      totalAmount: number;
      downPaymentAmount?: number;
      installmentCount: number;
    };
  },
) {
  return (await ctx.db.insert(args.owner.planTable, {
    [args.owner.ownerField]: args.owner.ownerId,
    planKey: args.plan.planKey,
    name: args.plan.name,
    cadence: args.plan.cadence,
    dueDayOfMonth: args.plan.dueDayOfMonth,
    timezone: args.plan.timezone,
    totalAmount: args.plan.totalAmount,
    downPaymentAmount: args.plan.downPaymentAmount,
    installmentCount: args.plan.installmentCount,
    createdAt: args.createdAt,
    createdBy: args.userId,
    updatedAt: args.createdAt,
  } as never)) as
    | Id<"programRecurringFeeConfig">
    | Id<"templateRecurringFeeConfig">;
}

async function insertPaymentConfigs(
  ctx: MutationCtx,
  args: {
    owner: PaymentDefaultOwnerSpec;
    userId: Id<"users">;
    fees: DefaultPaymentConfig[];
  },
) {
  const { oneTimeFees, recurringGroups } = splitPaymentConfigsByPlan(args.fees);
  const createdAt = Date.now();

  for (const fee of oneTimeFees) {
    await insertPaymentFee(ctx, {
      owner: args.owner,
      userId: args.userId,
      createdAt,
      fee,
    });
  }

  for (const [planKey, rawFees] of recurringGroups.entries()) {
    const fees = sortRecurringPaymentDefaults(
      rawFees.map((fee) => ({
        ...fee,
        createdAt: fee.installmentIndex ?? 0,
      })),
    );
    const first = fees[0];
    if (!first) {
      continue;
    }

    if (!first.dueDayOfMonth || !first.timezone) {
      throw new Error("Recurring payment defaults are invalid");
    }

    const planId = await insertRecurringPlan(ctx, {
      owner: args.owner,
      userId: args.userId,
      createdAt,
      plan: {
        planKey,
        name: first.name,
        cadence: "monthly",
        dueDayOfMonth: first.dueDayOfMonth,
        timezone: first.timezone,
        totalAmount: fees.reduce((sum, fee) => sum + fee.totalAmount, 0),
        installmentCount: fees.length,
      },
    });

    for (const [index, fee] of fees.entries()) {
      await insertPaymentFee(ctx, {
        owner: args.owner,
        userId: args.userId,
        createdAt,
        recurringPlanId: planId,
        fee: {
          ...fee,
          installmentIndex: index + 1,
          installmentCount: fees.length,
          dueDayOfMonth: first.dueDayOfMonth,
          timezone: first.timezone,
          isRecurring: true,
        },
      });
    }
  }
}

async function replacePaymentConfigs(
  ctx: MutationCtx,
  args: {
    owner: PaymentDefaultOwnerSpec;
    userId: Id<"users">;
    fees: DefaultPaymentConfig[];
  },
) {
  await clearPaymentConfigs(ctx, args.owner);
  await insertPaymentConfigs(ctx, args);
}

async function clonePaymentConfigs(
  ctx: MutationCtx,
  args: {
    source: PaymentDefaultOwnerSpec;
    target: PaymentDefaultOwnerSpec;
    userId: Id<"users">;
  },
) {
  const [plans, fees] = await Promise.all([
    getOwnerPlans(ctx, args.source),
    getOwnerFees(ctx, args.source),
  ]);
  const createdAt = Date.now();
  const targetPlanIdsBySourceId = new Map<
    string,
    Id<"programRecurringFeeConfig"> | Id<"templateRecurringFeeConfig">
  >();
  const sourcePlansById = new Map(
    plans.map((plan) => [String(plan._id), plan]),
  );

  for (const plan of plans) {
    const targetPlanId = await insertRecurringPlan(ctx, {
      owner: args.target,
      userId: args.userId,
      createdAt,
      plan: {
        planKey: plan.planKey,
        name: plan.name,
        cadence: plan.cadence,
        dueDayOfMonth: plan.dueDayOfMonth,
        timezone: plan.timezone,
        totalAmount: plan.totalAmount,
        downPaymentAmount: plan.downPaymentAmount,
        installmentCount: plan.installmentCount,
      },
    });
    targetPlanIdsBySourceId.set(String(plan._id), targetPlanId);
  }

  for (const fee of fees) {
    const sourcePlan = fee.recurringPlanId
      ? sourcePlansById.get(String(fee.recurringPlanId))
      : undefined;

    await insertPaymentFee(ctx, {
      owner: args.target,
      userId: args.userId,
      createdAt,
      recurringPlanId: fee.recurringPlanId
        ? targetPlanIdsBySourceId.get(String(fee.recurringPlanId))
        : undefined,
      fee: {
        feeKey: fee.feeKey,
        name: fee.name,
        totalAmount: fee.totalAmount,
        downPaymentPercent: fee.downPaymentPercent,
        isRefundable: fee.isRefundable,
        isIncluded: fee.isIncluded,
        isRequired: fee.isRequired,
        installmentIndex: fee.installmentIndex,
        installmentCount: fee.installmentCount,
        dueDayOfMonth: fee.dueDayOfMonth ?? sourcePlan?.dueDayOfMonth,
        timezone: fee.timezone,
        isRecurring: fee.isRecurring,
      },
    });
  }
}

export async function clearProgramPaymentConfigs(
  ctx: MutationCtx,
  programId: Id<"programs">,
) {
  await clearPaymentConfigs(ctx, getProgramPaymentOwner(programId));
}

export async function clearTemplatePaymentConfigs(
  ctx: MutationCtx,
  templateId: Id<"formTemplates">,
) {
  await clearPaymentConfigs(ctx, getTemplatePaymentOwner(templateId));
}

export async function replaceProgramPaymentConfigs(
  ctx: MutationCtx,
  params: {
    programId: Id<"programs">;
    userId: Id<"users">;
    fees: DefaultPaymentConfig[];
  },
) {
  await replacePaymentConfigs(ctx, {
    owner: getProgramPaymentOwner(params.programId),
    userId: params.userId,
    fees: params.fees,
  });
}

export async function replaceTemplatePaymentConfigs(
  ctx: MutationCtx,
  params: {
    templateId: Id<"formTemplates">;
    userId: Id<"users">;
    fees: DefaultPaymentConfig[];
  },
) {
  await replacePaymentConfigs(ctx, {
    owner: getTemplatePaymentOwner(params.templateId),
    userId: params.userId,
    fees: params.fees,
  });
}

export async function cloneProgramPaymentsToTemplate(
  ctx: MutationCtx,
  params: {
    programId: Id<"programs">;
    templateId: Id<"formTemplates">;
    userId: Id<"users">;
  },
) {
  await clonePaymentConfigs(ctx, {
    source: getProgramPaymentOwner(params.programId),
    target: getTemplatePaymentOwner(params.templateId),
    userId: params.userId,
  });
}

export async function cloneTemplatePaymentsToTemplate(
  ctx: MutationCtx,
  params: {
    sourceTemplateId: Id<"formTemplates">;
    targetTemplateId: Id<"formTemplates">;
    userId: Id<"users">;
  },
) {
  await clonePaymentConfigs(ctx, {
    source: getTemplatePaymentOwner(params.sourceTemplateId),
    target: getTemplatePaymentOwner(params.targetTemplateId),
    userId: params.userId,
  });
}
