import { internalMutation } from "./functions";
import { v } from "convex/values";
import {
  dashboardSummaryState,
  syncDashboardAttendance,
  syncDashboardSchedule,
} from "./model/dashboardAggregates";
import {
  backfillDashboardTaughtLesson,
  syncDashboardLesson,
} from "./model/courseProgressSummary";

// Explicit operator-driven initialization. No production data is changed unless
// this internal function is deliberately invoked; only derived state is written.
// A persisted cursor also makes concurrent/retried calls resume the same job.
export const backfill = internalMutation({
  args: {},
  returns: v.object({ done: v.boolean(), phase: v.number() }),
  handler: async (ctx) => {
    let state = await dashboardSummaryState(ctx);
    if (state?.ready) return { done: true, phase: state.phase };
    if (!state) {
      const id = await ctx.db.insert("dashboardSummaryState", {
        key: "v1",
        ready: false,
        phase: 0,
        cursor: null,
      });
      state = (await ctx.db.get("dashboardSummaryState", id))!;
    }
    let progress = await ctx.db
      .query("dashboardSummaryBackfill")
      .withIndex("by_key", (q) => q.eq("key", "v1"))
      .unique();
    if (!progress) {
      // Resume the cursor of an initialization started by the earlier backend.
      const id = await ctx.db.insert("dashboardSummaryBackfill", {
        key: "v1",
        phase: state.phase,
        cursor: state.cursor,
      });
      progress = (await ctx.db.get("dashboardSummaryBackfill", id))!;
    }
    // Page byte limits cover source rows, not documents hydrated afterwards.
    // Attendance loads a schedule; taught sources load a lesson + class and may
    // load a report. Each document can be 1 MiB: leave transaction headroom for
    // aggregate maintenance, rather than applying the 20-row batch everywhere.
    const batchSize = progress.phase === 1 ? 4 : progress.phase >= 3 ? 3 : 20;
    const options = {
      cursor: progress.cursor,
      numItems: batchSize,
      maximumRowsRead: batchSize,
      maximumBytesRead: 500_000,
    };
    let isDone: boolean, continueCursor: string;
    if (progress.phase === 0) {
      const page = await ctx.db.query("classSchedule").paginate(options);
      for (const row of page.page) await syncDashboardSchedule(ctx, row);
      ({ isDone, continueCursor } = page);
    } else if (progress.phase === 1) {
      const page = await ctx.db
        .query("studentAttendanceRecords")
        .paginate(options);
      for (const row of page.page) await syncDashboardAttendance(ctx, row);
      ({ isDone, continueCursor } = page);
    } else if (progress.phase === 2) {
      const page = await ctx.db.query("lessons").paginate(options);
      for (const row of page.page) await syncDashboardLesson(ctx, row);
      ({ isDone, continueCursor } = page);
    } else if (progress.phase === 3) {
      const page = await ctx.db
        .query("classSessionReportLessons")
        .paginate(options);
      for (const row of page.page)
        await backfillDashboardTaughtLesson(ctx, row);
      ({ isDone, continueCursor } = page);
    } else {
      const page = await ctx.db
        .query("classPrerecordedLessonRecords")
        .paginate(options);
      for (const row of page.page)
        await backfillDashboardTaughtLesson(ctx, row);
      ({ isDone, continueCursor } = page);
    }
    const done = progress.phase === 4 && isDone;
    const phase = isDone ? progress.phase + 1 : progress.phase;
    await ctx.db.patch("dashboardSummaryBackfill", progress._id, {
      phase,
      cursor: isDone ? null : continueCursor,
    });
    if (done)
      await ctx.db.patch("dashboardSummaryState", state._id, {
        phase,
        cursor: null,
        ready: true,
      });
    return { done, phase };
  },
});
