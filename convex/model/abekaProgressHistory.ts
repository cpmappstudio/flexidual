import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// Only read after the caller has authorized access to this report.
export async function getAbekaProgressHistory(
  ctx: QueryCtx,
  reportId: Id<"abekaProgress">,
) {
  // ponytail: a sparkline needs only the last 30 observed days; retain older data.
  const points = await ctx.db
    .query("abekaProgressHistory")
    .withIndex("by_reportId_and_date", (q) => q.eq("reportId", reportId))
    .order("desc")
    .take(30);
  return points.reverse().map(({ date, percentage }) => ({ date, percentage }));
}

export async function saveAbekaProgressHistory(
  ctx: MutationCtx,
  point: { reportId: Id<"abekaProgress">; date: string; percentage: number },
) {
  const existing = await ctx.db
    .query("abekaProgressHistory")
    .withIndex("by_reportId_and_date", (q) =>
      q.eq("reportId", point.reportId).eq("date", point.date),
    )
    .unique();
  // The latest observation wins, including provider corrections/decreases.
  if (existing)
    await ctx.db.patch(existing._id, { percentage: point.percentage });
  else await ctx.db.insert("abekaProgressHistory", point);
}
