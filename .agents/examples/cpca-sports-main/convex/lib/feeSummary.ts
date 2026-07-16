import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const feeSummaryValidator = v.object({
  totalDue: v.number(),
  totalPaid: v.number(),
  totalPending: v.number(),
  feeCount: v.number(),
  paidCount: v.number(),
});

export const paymentFeeListItemValidator = v.object({
  _id: v.id("fees"),
  name: v.string(),
  totalAmount: v.number(),
  paidAmount: v.number(),
  status: v.union(
    v.literal("pending"),
    v.literal("partially_paid"),
    v.literal("paid"),
  ),
  dueDate: v.optional(v.string()),
});

async function getFeesByApplication(
  ctx: QueryCtx | MutationCtx,
  applicationId: Id<"applications">,
) {
  return await ctx.db
    .query("fees")
    .withIndex("byApplication", (q) => q.eq("applicationId", applicationId))
    .collect();
}

export async function getPaymentDetails(
  ctx: QueryCtx,
  applicationId: Id<"applications">,
) {
  const fees = await getFeesByApplication(ctx, applicationId);

  return fees.map((fee) => ({
    _id: fee._id,
    name: fee.name,
    totalAmount: fee.totalAmount,
    paidAmount: fee.paidAmount,
    status: fee.status,
    ...(fee.dueDate ? { dueDate: fee.dueDate } : {}),
  }));
}

function calculateFeeSummary(
  fees: Array<{
    totalAmount: number;
    paidAmount: number;
    status: "pending" | "partially_paid" | "paid";
  }>,
) {
  const totals = fees.reduce(
    (summary, fee) => ({
      totalDue: summary.totalDue + fee.totalAmount,
      totalPaid: summary.totalPaid + fee.paidAmount,
      paidCount: summary.paidCount + (fee.status === "paid" ? 1 : 0),
    }),
    { totalDue: 0, totalPaid: 0, paidCount: 0 },
  );

  return {
    ...totals,
    totalPending: Math.max(0, totals.totalDue - totals.totalPaid),
    feeCount: fees.length,
  };
}

export async function getFeeSummary(
  ctx: QueryCtx,
  applicationId: Id<"applications">,
) {
  const fees = await getFeesByApplication(ctx, applicationId);
  return calculateFeeSummary(fees);
}

export async function syncApplicationFeeSummary(
  ctx: MutationCtx,
  applicationId: Id<"applications">,
) {
  const [application, fees] = await Promise.all([
    ctx.db.get("applications", applicationId),
    getFeesByApplication(ctx, applicationId),
  ]);

  if (!application) {
    throw new Error("Cannot sync payment summary for a missing application");
  }

  const paymentSummary = calculateFeeSummary(fees);
  const current = application.paymentSummary;
  const isCurrent =
    current?.totalDue === paymentSummary.totalDue &&
    current.totalPaid === paymentSummary.totalPaid &&
    current.totalPending === paymentSummary.totalPending &&
    current.feeCount === paymentSummary.feeCount &&
    current.paidCount === paymentSummary.paidCount;

  if (isCurrent) return false;

  await ctx.db.patch("applications", applicationId, { paymentSummary });
  return true;
}
