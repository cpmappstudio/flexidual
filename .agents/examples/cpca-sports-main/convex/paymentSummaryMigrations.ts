import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { syncApplicationFeeSummary } from "./lib/feeSummary";

const BATCH_SIZE = 25;

function assertMigrationSecret(secret: string) {
  const expected = process.env.LEGACY_MIGRATION_SECRET;
  if (!expected || secret !== expected) {
    throw new Error("Invalid migration secret");
  }
}

export const startBackfill = mutation({
  args: { secret: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertMigrationSecret(args.secret);

    await ctx.scheduler.runAfter(
      0,
      internal.paymentSummaryMigrations.backfillBatch,
      { cursor: null },
    );
    return null;
  },
});

export const backfillBatch = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    processed: v.number(),
    updated: v.number(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("applications")
      .paginate({ cursor: args.cursor, numItems: BATCH_SIZE });

    let updated = 0;
    for (const application of result.page) {
      if (await syncApplicationFeeSummary(ctx, application._id)) {
        updated += 1;
      }
    }

    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.paymentSummaryMigrations.backfillBatch,
        { cursor: result.continueCursor },
      );
    }

    console.info("Payment summary backfill batch completed", {
      processed: result.page.length,
      updated,
      isDone: result.isDone,
    });

    return {
      processed: result.page.length,
      updated,
      isDone: result.isDone,
    };
  },
});
