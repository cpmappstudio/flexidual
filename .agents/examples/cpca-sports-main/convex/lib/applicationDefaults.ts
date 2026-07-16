import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { syncApplicationFeeSummary } from "./feeSummary";
import { formatDateString, getDaysInMonth } from "./paymentPlans";

function getSubmissionDateParts(timestamp: number) {
  const date = new Date(timestamp);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function addMonths(year: number, month: number, offset: number) {
  const baseMonth = month - 1 + offset;
  return {
    year: year + Math.floor(baseMonth / 12),
    month: (baseMonth % 12) + 1,
  };
}

function buildDueDatesFromInstallmentCount(
  submittedAt: number,
  dueDayOfMonth: number,
  installmentCount: number,
) {
  const { year, month, day } = getSubmissionDateParts(submittedAt);
  const firstOffset = day <= dueDayOfMonth ? 0 : 1;

  return Array.from({ length: installmentCount }, (_, index) => {
    const target = addMonths(year, month, firstOffset + index);
    const dueDay = Math.min(
      dueDayOfMonth,
      getDaysInMonth(target.year, target.month),
    );

    return formatDateString(target.year, target.month, dueDay);
  });
}

function sortRecurringFees<
  T extends {
    installmentIndex?: number;
    _creationTime?: number;
    createdAt?: number;
  },
>(fees: T[]) {
  return [...fees].sort((a, b) => {
    const aIndex = a.installmentIndex ?? Number.MAX_SAFE_INTEGER;
    const bIndex = b.installmentIndex ?? Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) {
      return aIndex - bIndex;
    }

    return (
      (a.createdAt ?? a._creationTime ?? 0) -
      (b.createdAt ?? b._creationTime ?? 0)
    );
  });
}

export async function cloneProgramDocumentConfigsToApplication(
  ctx: MutationCtx,
  params: {
    programId: Id<"programs">;
    applicationId: Id<"applications">;
    userId: Id<"users">;
    updatedAt?: number;
  },
) {
  const documentConfigs = await ctx.db
    .query("programDocumentConfig")
    .withIndex("byProgram", (q) => q.eq("programId", params.programId))
    .collect();

  const updatedAt = params.updatedAt ?? Date.now();

  for (const config of documentConfigs) {
    await ctx.db.insert("applicationDocumentConfig", {
      applicationId: params.applicationId,
      documentTypeId: config.documentTypeId,
      visibility: config.visibility,
      updatedAt,
      updatedBy: params.userId,
      name: config.name,
      description: config.description,
      isCustom: true,
    });
  }
}

export async function cloneProgramPaymentConfigsToApplication(
  ctx: MutationCtx,
  params: {
    programId: Id<"programs">;
    applicationId: Id<"applications">;
    userId: Id<"users">;
    submittedAt?: number;
  },
) {
  const [feeConfigs, planConfigs] = await Promise.all([
    ctx.db
      .query("programFeeConfig")
      .withIndex("byProgram", (q) => q.eq("programId", params.programId))
      .collect(),
    ctx.db
      .query("programRecurringFeeConfig")
      .withIndex("byProgram", (q) => q.eq("programId", params.programId))
      .collect(),
  ]);

  const submittedAt = params.submittedAt ?? Date.now();
  const planById = new Map(planConfigs.map((plan) => [plan._id, plan]));
  const recurringFeesByPlan = new Map<
    Id<"programRecurringFeeConfig">,
    typeof feeConfigs
  >();

  for (const fee of feeConfigs) {
    if (!fee.recurringPlanId) {
      await ctx.db.insert("fees", {
        applicationId: params.applicationId,
        name: fee.name,
        totalAmount: fee.totalAmount,
        downPaymentPercent: fee.downPaymentPercent,
        isRefundable: fee.isRefundable,
        isIncluded: fee.isIncluded,
        isDefault: true,
        isRequired: fee.isRequired,
        status: "pending",
        paidAmount: 0,
        createdAt: submittedAt,
        createdBy: params.userId,
      });
      continue;
    }

    const current = recurringFeesByPlan.get(fee.recurringPlanId) ?? [];
    current.push(fee);
    recurringFeesByPlan.set(fee.recurringPlanId, current);
  }

  for (const [planId, rawFees] of recurringFeesByPlan.entries()) {
    const plan = planById.get(planId);
    if (!plan) {
      continue;
    }

    const fees = sortRecurringFees(rawFees);
    const installmentCount = fees.length || plan.installmentCount;
    if (installmentCount <= 0) {
      continue;
    }

    const dueDates = buildDueDatesFromInstallmentCount(
      submittedAt,
      plan.dueDayOfMonth,
      installmentCount,
    );

    const recurringPlanId = await ctx.db.insert("recurringFeePlans", {
      applicationId: params.applicationId,
      name: plan.name,
      cadence: "monthly",
      startDate: dueDates[0],
      endDate: dueDates[dueDates.length - 1],
      dueDayOfMonth: plan.dueDayOfMonth,
      timezone: plan.timezone,
      totalAmount: plan.totalAmount,
      downPaymentAmount: plan.downPaymentAmount,
      installmentCount,
      status: "active",
      createdBy: params.userId,
      createdAt: submittedAt,
      updatedAt: submittedAt,
    });

    for (const [index, fee] of fees.entries()) {
      await ctx.db.insert("fees", {
        applicationId: params.applicationId,
        name: fee.name,
        totalAmount: fee.totalAmount,
        downPaymentPercent: fee.downPaymentPercent,
        isRefundable: fee.isRefundable,
        isIncluded: fee.isIncluded,
        isDefault: true,
        isRequired: fee.isRequired,
        status: "pending",
        paidAmount: 0,
        createdAt: submittedAt,
        createdBy: params.userId,
        recurringPlanId,
        installmentIndex: fee.installmentIndex ?? index + 1,
        installmentCount,
        dueDate: dueDates[index],
        timezone: plan.timezone,
        isRecurring: true,
      });
    }
  }

  await syncApplicationFeeSummary(ctx, params.applicationId);
}
