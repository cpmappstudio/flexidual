import { query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./lib/auth";
import { hasOrgAdminAccess } from "./lib/permissions";
import { Id } from "./_generated/dataModel";

const paymentMethod = v.union(
  v.literal("online"),
  v.literal("cash"),
  v.literal("wire"),
);

const transactionStatus = v.union(
  v.literal("pending"),
  v.literal("completed"),
  v.literal("failed"),
);

const transactionValidator = v.object({
  _id: v.id("transactions"),
  _creationTime: v.number(),
  applicationId: v.id("applications"),
  feeId: v.id("fees"),
  amount: v.number(),
  method: paymentMethod,
  status: transactionStatus,
  squarePaymentId: v.optional(v.string()),
  squareOrderId: v.optional(v.string()),
  receiptUrl: v.optional(v.string()),
  reference: v.optional(v.string()),
  registeredBy: v.optional(v.id("users")),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
});

const registeredByUserValidator = v.object({
  _id: v.id("users"),
  firstName: v.string(),
  lastName: v.string(),
  email: v.string(),
});

/**
 * Helper to verify user has access to an application.
 */
async function verifyApplicationAccess(
  ctx: QueryCtx,
  applicationId: Id<"applications">,
  userId: Id<"users">,
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

  if (!isOwner && !isAdmin) {
    throw new Error("Unauthorized");
  }

  return { application, isOwner, isAdmin };
}

/**
 * Get all transactions for an application.
 */
export const getByApplication = query({
  args: { applicationId: v.id("applications") },
  returns: v.array(transactionValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyApplicationAccess(ctx, args.applicationId, user._id);

    return await ctx.db
      .query("transactions")
      .withIndex("byApplication", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .order("desc")
      .collect();
  },
});

/**
 * Get transactions with fee details for display.
 */
export const getWithFeeDetails = query({
  args: { applicationId: v.id("applications") },
  returns: v.array(
    v.object({
      transaction: transactionValidator,
      feeName: v.string(),
      feeDescription: v.optional(v.string()),
      registeredByUser: v.optional(registeredByUserValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await verifyApplicationAccess(ctx, args.applicationId, user._id);

    const transactions = await ctx.db
      .query("transactions")
      .withIndex("byApplication", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .order("desc")
      .collect();

    // Batch fetch fees and users to avoid N+1 queries
    const feeIds = [...new Set(transactions.map((t) => t.feeId))];
    const userIds = [
      ...new Set(
        transactions
          .map((t) => t.registeredBy)
          .filter((id): id is Id<"users"> => id !== undefined),
      ),
    ];

    const [fees, users] = await Promise.all([
      Promise.all(feeIds.map((id) => ctx.db.get(id))),
      Promise.all(userIds.map((id) => ctx.db.get(id))),
    ]);

    const feeMap = new Map(fees.filter(Boolean).map((f) => [f!._id, f!]));
    const userMap = new Map(users.filter(Boolean).map((u) => [u!._id, u!]));

    const result = transactions.map((transaction) => {
      const fee = feeMap.get(transaction.feeId);
      const registeredByUser = transaction.registeredBy
        ? userMap.get(transaction.registeredBy)
        : undefined;

      return {
        transaction,
        feeName: fee?.name || "Unknown Fee",
        feeDescription: fee?.description,
        registeredByUser: registeredByUser
          ? {
              _id: registeredByUser._id,
              firstName: registeredByUser.firstName,
              lastName: registeredByUser.lastName,
              email: registeredByUser.email,
            }
          : undefined,
      };
    });

    return result;
  },
});

/**
 * Get transactions for a specific fee.
 */
export const getByFee = query({
  args: { feeId: v.id("fees") },
  returns: v.array(transactionValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const fee = await ctx.db.get(args.feeId);

    if (!fee) {
      throw new Error("Fee not found");
    }

    await verifyApplicationAccess(ctx, fee.applicationId, user._id);

    return await ctx.db
      .query("transactions")
      .withIndex("byFee", (q) => q.eq("feeId", args.feeId))
      .order("desc")
      .collect();
  },
});
