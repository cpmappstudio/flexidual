import type { Triggers } from "convex-helpers/server/triggers";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  dashboardAggregate,
  dashboardSummariesEnabled,
  dashboardSummariesReady,
} from "./dashboardAggregates";
import { getClassCurriculumProgress } from "./courseProgress";

const lessonItem = (lesson: Doc<"lessons">) => ({
  namespace: `lessons:${lesson.curriculumId}`,
  key: [] as string[],
  id: lesson._id,
});

const taughtItem = (fact: Doc<"dashboardTaughtLessons">) => ({
  namespace: `taught:${fact.classId}`,
  key: [fact.curriculumId, fact.isActive ? "active" : "inactive"],
  id: fact._id,
});

type LessonMetadata = Pick<Doc<"lessons">, "_id" | "curriculumId" | "isActive">;

async function removeTaughtFact(
  ctx: MutationCtx,
  fact: Doc<"dashboardTaughtLessons">,
) {
  await dashboardAggregate.deleteIfExists(ctx, taughtItem(fact));
  await ctx.db.delete("dashboardTaughtLessons", fact._id);
}

async function setTaughtFact(
  ctx: MutationCtx,
  classId: Id<"classes">,
  lesson: LessonMetadata,
  existing: Doc<"dashboardTaughtLessons"> | null,
) {
  const fields = {
    classId,
    lessonId: lesson._id,
    curriculumId: lesson.curriculumId,
    isActive: lesson.isActive,
  };
  if (!existing) {
    const factId = await ctx.db.insert("dashboardTaughtLessons", fields);
    await dashboardAggregate.insertIfDoesNotExist(ctx, {
      namespace: `taught:${classId}`,
      key: [lesson.curriculumId, lesson.isActive ? "active" : "inactive"],
      id: factId,
    });
  } else if (
    existing.curriculumId !== fields.curriculumId ||
    existing.isActive !== fields.isActive
  ) {
    await ctx.db.patch("dashboardTaughtLessons", existing._id, fields);
    await dashboardAggregate.replaceOrInsert(ctx, taughtItem(existing), {
      namespace: `taught:${classId}`,
      key: [lesson.curriculumId, lesson.isActive ? "active" : "inactive"],
    });
  }
}

async function readTaughtFact(
  ctx: QueryCtx,
  classId: Id<"classes">,
  lessonId: Id<"lessons">,
) {
  const [existing, lesson, classData] = await Promise.all([
    ctx.db
      .query("dashboardTaughtLessons")
      .withIndex("by_classId_and_lessonId", (q) =>
        q.eq("classId", classId).eq("lessonId", lessonId),
      )
      .unique(),
    ctx.db.get("lessons", lessonId),
    ctx.db.get("classes", classId),
  ]);
  return { existing, lesson, classData };
}

// Used by the explicit backfill as well as live mutation triggers.
export async function syncDashboardLesson(
  ctx: MutationCtx,
  lesson: Doc<"lessons">,
) {
  if (lesson.isActive)
    await dashboardAggregate.insertIfDoesNotExist(ctx, lessonItem(lesson));
}

async function hasTaughtSource(
  ctx: QueryCtx,
  classId: Id<"classes">,
  lessonId: Id<"lessons">,
) {
  const prerecorded = await ctx.db
    .query("classPrerecordedLessonRecords")
    .withIndex("by_classId_and_lessonId", (q) =>
      q.eq("classId", classId).eq("lessonId", lessonId),
    )
    .first();
  if (prerecorded) return true;
  // Stop at the first valid live source; orphaned or mismatched parents don't count.
  for await (const source of ctx.db
    .query("classSessionReportLessons")
    .withIndex("by_class_and_lesson", (q) =>
      q.eq("classId", classId).eq("lessonId", lessonId),
    )) {
    const report = await ctx.db.get("classSessionReports", source.reportId);
    if (report?.classId === classId) return true;
  }
  return false;
}

export async function syncDashboardTaughtLesson(
  ctx: MutationCtx,
  classId: Id<"classes">,
  lessonId: Id<"lessons">,
) {
  const { existing, lesson, classData } = await readTaughtFact(
    ctx,
    classId,
    lessonId,
  );
  if (
    !classData ||
    !lesson ||
    !(await hasTaughtSource(ctx, classId, lessonId))
  ) {
    if (existing) await removeTaughtFact(ctx, existing);
    return;
  }
  await setTaughtFact(ctx, classId, lesson, existing);
}

// Initialization already has a canonical source row in its transaction. Check
// that row directly instead of rescanning all historical sources for the pair.
export async function backfillDashboardTaughtLesson(
  ctx: MutationCtx,
  source:
    | Doc<"classSessionReportLessons">
    | Doc<"classPrerecordedLessonRecords">,
) {
  if (!source.classId) return;
  if ("reportId" in source) {
    const report = await ctx.db.get("classSessionReports", source.reportId);
    if (report?.classId !== source.classId) return;
  }
  const { existing, lesson, classData } = await readTaughtFact(
    ctx,
    source.classId,
    source.lessonId,
  );
  // An invalid source must not erase a fact backed by another valid source.
  // Live deletions/moves are reconciled by syncDashboardTaughtLesson instead.
  if (lesson && classData)
    await setTaughtFact(ctx, source.classId, lesson, existing);
}

export function registerCourseProgressTriggers(triggers: Triggers<DataModel>) {
  triggers.register("classes", async (ctx, change) => {
    if (
      change.operation !== "delete" ||
      !(await dashboardSummariesEnabled(ctx))
    )
      return;
    // Historical source rows remain authoritative; only derived dashboard facts
    // and their aggregate items are removed when their class no longer exists.
    for await (const fact of ctx.db
      .query("dashboardTaughtLessons")
      .withIndex("by_classId_and_lessonId", (q) =>
        q.eq("classId", change.id),
      )) {
      await removeTaughtFact(ctx, fact);
    }
  });

  triggers.register("lessons", async (ctx, change) => {
    if (
      change.oldDoc &&
      change.newDoc &&
      change.oldDoc.curriculumId === change.newDoc.curriculumId &&
      change.oldDoc.isActive === change.newDoc.isActive
    )
      return;
    if (!(await dashboardSummariesEnabled(ctx))) return;
    if (change.oldDoc?.isActive)
      await dashboardAggregate.deleteIfExists(ctx, lessonItem(change.oldDoc));
    if (change.newDoc) await syncDashboardLesson(ctx, change.newDoc);
    // Only metadata changed. Source triggers maintain whether each fact exists;
    // reuse this snapshot without reloading the full lesson/class per course.
    for await (const fact of ctx.db
      .query("dashboardTaughtLessons")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", change.id))) {
      if (change.newDoc)
        await setTaughtFact(ctx, fact.classId, change.newDoc, fact);
      else await removeTaughtFact(ctx, fact);
    }
  });

  triggers.register("classSessionReportLessons", async (ctx, change) => {
    if (
      change.oldDoc &&
      change.newDoc &&
      change.oldDoc.classId === change.newDoc.classId &&
      change.oldDoc.lessonId === change.newDoc.lessonId &&
      change.oldDoc.reportId === change.newDoc.reportId
    )
      return;
    if (!(await dashboardSummariesEnabled(ctx))) return;
    const { oldDoc, newDoc } = change;
    if (oldDoc?.classId)
      await syncDashboardTaughtLesson(ctx, oldDoc.classId, oldDoc.lessonId);
    if (
      newDoc?.classId &&
      (newDoc.classId !== oldDoc?.classId ||
        newDoc.lessonId !== oldDoc?.lessonId)
    )
      await syncDashboardTaughtLesson(ctx, newDoc.classId, newDoc.lessonId);
  });

  triggers.register("classPrerecordedLessonRecords", async (ctx, change) => {
    if (
      change.oldDoc &&
      change.newDoc &&
      change.oldDoc.classId === change.newDoc.classId &&
      change.oldDoc.lessonId === change.newDoc.lessonId
    )
      return;
    if (!(await dashboardSummariesEnabled(ctx))) return;
    const { oldDoc, newDoc } = change;
    if (oldDoc)
      await syncDashboardTaughtLesson(ctx, oldDoc.classId, oldDoc.lessonId);
    if (
      newDoc &&
      (newDoc.classId !== oldDoc?.classId ||
        newDoc.lessonId !== oldDoc?.lessonId)
    )
      await syncDashboardTaughtLesson(ctx, newDoc.classId, newDoc.lessonId);
  });

  triggers.register("classSessionReports", async (ctx, change) => {
    if (
      change.oldDoc &&
      change.newDoc &&
      change.oldDoc.classId === change.newDoc.classId
    )
      return;
    if (!(await dashboardSummariesEnabled(ctx))) return;
    // Parent insertion/deletion/moves can make pre-existing child rows valid/invalid.
    const refreshed = new Set<string>();
    for await (const source of ctx.db
      .query("classSessionReportLessons")
      .withIndex("by_report", (q) => q.eq("reportId", change.id))) {
      if (!source.classId) continue;
      const key = `${source.classId}:${source.lessonId}`;
      if (refreshed.has(key)) continue;
      refreshed.add(key);
      await syncDashboardTaughtLesson(ctx, source.classId, source.lessonId);
    }
  });
}

// Call only after authorizing the class/student dashboard, as with the legacy helper.
export async function getLightCourseProgress(
  ctx: QueryCtx,
  classData: Doc<"classes">,
) {
  if (!(await dashboardSummariesReady(ctx))) {
    const { totalLessons, taughtLessons, pendingLessons, percentage } =
      await getClassCurriculumProgress(ctx, classData);
    return { totalLessons, taughtLessons, pendingLessons, percentage };
  }
  const [totalLessons, taughtLessons] = await dashboardAggregate.countBatch(
    ctx,
    [
      { namespace: `lessons:${classData.curriculumId}` },
      {
        namespace: `taught:${classData._id}`,
        bounds: { eq: [classData.curriculumId, "active"] },
      },
    ],
  );
  return {
    totalLessons,
    taughtLessons,
    pendingLessons: totalLessons - taughtLessons,
    percentage: totalLessons
      ? Math.round((taughtLessons / totalLessons) * 100)
      : 0,
  };
}
