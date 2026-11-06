import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { abekaProgressPercentage } from "../../lib/abeka/progress-percentage";

export const abekaProgressSummaryFields = {
  reportId: v.id("abekaProgress"),
  studentId: v.id("abekaStudents"),
  subjectId: v.string(),
  completed: v.number(),
  total: v.number(),
  percentage: v.number(),
  syncedAt: v.number(),
  runId: v.id("abekaSyncRuns"),
};

export function summarizeAbekaProgress(
  report: Pick<Doc<"abekaProgress">, "lessons" | "syncedAt">,
) {
  return {
    completed: report.lessons.filter((lesson) => lesson.completed).length,
    total: report.lessons.length,
    percentage: Math.round(abekaProgressPercentage(report.lessons) * 100) / 100,
    syncedAt: report.syncedAt,
  };
}

// Writers and the explicit legacy backfill use the same snapshot calculation.
export async function saveAbekaProgressSummary(
  ctx: MutationCtx,
  report: Pick<
    Doc<"abekaProgress">,
    "_id" | "studentId" | "subjectId" | "lessons" | "syncedAt" | "runId"
  >,
) {
  const fields = {
    reportId: report._id,
    studentId: report.studentId,
    subjectId: report.subjectId,
    runId: report.runId,
    ...summarizeAbekaProgress(report),
  };
  const existing = await ctx.db
    .query("abekaProgressSummaries")
    .withIndex("by_studentId_and_subjectId", (q) =>
      q.eq("studentId", report.studentId).eq("subjectId", report.subjectId),
    )
    .unique();
  if (!existing) {
    await ctx.db.insert("abekaProgressSummaries", fields);
  } else if (
    existing.reportId !== fields.reportId ||
    existing.runId !== fields.runId ||
    existing.syncedAt !== fields.syncedAt ||
    existing.completed !== fields.completed ||
    existing.total !== fields.total ||
    existing.percentage !== fields.percentage
  ) {
    await ctx.db.replace("abekaProgressSummaries", existing._id, fields);
  }
}

export async function deleteAbekaProgressSummary(
  ctx: MutationCtx,
  report: Pick<Doc<"abekaProgress">, "_id" | "studentId" | "subjectId">,
) {
  const summary = await ctx.db
    .query("abekaProgressSummaries")
    .withIndex("by_studentId_and_subjectId", (q) =>
      q.eq("studentId", report.studentId).eq("subjectId", report.subjectId),
    )
    .unique();
  if (summary?.reportId === report._id)
    await ctx.db.delete("abekaProgressSummaries", summary._id);
}
