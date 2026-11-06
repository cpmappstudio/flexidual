import aggregate from "@convex-dev/aggregate/test";
import { Triggers } from "convex-helpers/server/triggers";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import type { DataModel } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { modules } from "./test.setup";
import {
  backfillDashboardTaughtLesson,
  getLightCourseProgress,
  registerCourseProgressTriggers,
  syncDashboardLesson,
  syncDashboardTaughtLesson,
} from "./model/courseProgressSummary";
import { dashboardAggregate } from "./model/dashboardAggregates";
import { api, internal } from "./_generated/api";

async function setup(enabled = true) {
  const t = convexTest({ schema, modules, transactionLimits: true });
  aggregate.register(t, "dashboardAggregate");
  const triggers = new Triggers<DataModel>();
  registerCourseProgressTriggers(triggers);
  const write = <T>(fn: (ctx: MutationCtx) => Promise<T>) =>
    t.run((ctx) => fn(triggers.wrapDB(ctx)));
  const ids = await write(async (ctx) => {
    const stateId = enabled
      ? await ctx.db.insert("dashboardSummaryState", {
          key: "v1",
          ready: true,
          phase: 0,
          cursor: null,
        })
      : null;
    const userId = await ctx.db.insert("users", {
      clerkId: "teacher",
      firstName: "Teacher",
      lastName: "Test",
      fullName: "Teacher Test",
      isActive: true,
      createdAt: 1,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Math",
      isActive: true,
      createdAt: 1,
      createdBy: userId,
    });
    const otherCurriculumId = await ctx.db.insert("curriculums", {
      title: "Science",
      isActive: true,
      createdAt: 1,
      createdBy: userId,
    });
    const classFields = {
      name: "Class",
      curriculumId,
      isActive: true,
      createdAt: 1,
      createdBy: userId,
    };
    const classId = await ctx.db.insert("classes", classFields);
    const otherClassId = await ctx.db.insert("classes", classFields);
    const scheduleId = await ctx.db.insert("classSchedule", {
      classId,
      scheduledStart: 1,
      scheduledEnd: 2,
      roomName: "room",
      status: "completed",
      createdAt: 1,
      createdBy: userId,
    });
    const lessonIds = [];
    for (let i = 0; i < 3; i++)
      lessonIds.push(
        await ctx.db.insert("lessons", {
          curriculumId,
          title: `Lesson ${i}`,
          content: "heavy-content ".repeat(5000),
          order: i,
          isActive: true,
          createdAt: 1,
          createdBy: userId,
        }),
      );
    const reportId = await ctx.db.insert("classSessionReports", {
      classId,
      scheduleId,
      closedAt: 1,
      closedBy: userId,
    });
    const live = await ctx.db.insert("classSessionReportLessons", {
      classId,
      scheduleId,
      reportId,
      lessonId: lessonIds[0],
    });
    const repeatedLive = await ctx.db.insert("classSessionReportLessons", {
      classId,
      scheduleId,
      reportId,
      lessonId: lessonIds[0],
    });
    const prerecorded = await ctx.db.insert("classPrerecordedLessonRecords", {
      classId,
      scheduleId,
      lessonId: lessonIds[0],
      taughtAt: 1,
    });
    return {
      userId,
      curriculumId,
      otherCurriculumId,
      classId,
      otherClassId,
      scheduleId,
      lessonIds,
      reportId,
      live,
      repeatedLive,
      prerecorded,
      stateId,
    };
  });
  const read = (classId = ids.classId) =>
    t.run(async (ctx) => {
      const progress = await getLightCourseProgress(
        ctx,
        (await ctx.db.get(classId))!,
      );
      return { progress, metrics: await ctx.meta.getTransactionMetrics() };
    });
  return { t, write, read, ...ids };
}

test("authorized metadata edits reuse a large lesson across 60 courses and preserve atomic counts", async () => {
  const f = await setup();
  const lessonId = f.lessonIds[0];
  await f.t.run((ctx) =>
    ctx.db.insert("roleAssignments", {
      userId: f.userId,
      role: "superadmin",
      orgType: "system",
      assignedAt: 1,
      assignedBy: f.userId,
    }),
  );
  await f.write((ctx) =>
    ctx.db.patch("lessons", lessonId, { content: "x".repeat(300_000) }),
  );
  const courses = [f.classId];
  for (let i = 0; i < 60; i++) {
    courses.push(
      await f.write(async (ctx) => {
        const classId = await ctx.db.insert("classes", {
          name: `Shared ${i}`,
          curriculumId: f.curriculumId,
          isActive: true,
          createdAt: 1,
          createdBy: f.userId,
        });
        const scheduleId = await ctx.db.insert("classSchedule", {
          classId,
          scheduledStart: 1,
          scheduledEnd: 2,
          roomName: `shared-${i}`,
          status: "completed",
          createdAt: 1,
          createdBy: f.userId,
        });
        await ctx.db.insert("classPrerecordedLessonRecords", {
          classId,
          scheduleId,
          lessonId,
          taughtAt: 1,
        });
        return classId;
      }),
    );
  }
  await expect(
    f.t.mutation(api.lessons.update, { id: lessonId, isActive: false }),
  ).rejects.toThrow();
  const editor = f.t.withIdentity({ subject: "teacher" });
  const metrics = await editor.mutation(async (ctx) => {
    await ctx.runMutation(api.lessons.update, {
      id: lessonId,
      isActive: false,
    });
    return ctx.meta.getTransactionMetrics();
  });
  // The public edit reads the large source for authorization and the trigger's
  // before/after snapshots, but never reads its content once per course.
  expect(metrics.bytesRead.used).toBeLessThan(2_000_000);
  for (const classId of courses)
    expect((await f.read(classId)).progress).toMatchObject({
      totalLessons: 2,
      taughtLessons: 0,
    });
  const retry = await editor.mutation(async (ctx) => {
    await ctx.runMutation(api.lessons.update, {
      id: lessonId,
      isActive: false,
    });
    return ctx.meta.getTransactionMetrics();
  });
  expect(retry.documentsWritten.used).toBe(1);
  await editor.mutation(api.lessons.update, { id: lessonId, isActive: true });
  for (const classId of courses)
    expect((await f.read(classId)).progress.taughtLessons).toBe(1);
  process.stdout.write(
    `Shared lesson edit bytesRead (61 courses): ${metrics.bytesRead.used}\n`,
  );
});

test.each(["live", "prerecorded"] as const)(
  "%s backfill resumes across large hydrated documents without skipping sources or enabling readers early",
  async (kind) => {
    const f = await setup(false);
    await f.t.run(async (ctx) => {
      await ctx.db.patch("classes", f.classId, {
        description: "c".repeat(850_000),
      });
      await ctx.db.patch("classSessionReports", f.reportId, {
        notes: "r".repeat(850_000),
      });
    });
    for (let i = 0; i < 20; i++) {
      await f.t.run(async (ctx) => {
        const lessonId = await ctx.db.insert("lessons", {
          curriculumId: f.curriculumId,
          title: `Large ${i}`,
          content: "x".repeat(850_000),
          order: i + 3,
          isActive: true,
          createdAt: 1,
          createdBy: f.userId,
        });
        const fields = {
          classId: f.classId,
          scheduleId: f.scheduleId,
          lessonId,
        };
        if (kind === "live")
          await ctx.db.insert("classSessionReportLessons", {
            ...fields,
            reportId: f.reportId,
          });
        else
          await ctx.db.insert("classPrerecordedLessonRecords", {
            ...fields,
            taughtAt: 1,
          });
      });
    }
    const targetPhase = kind === "live" ? 3 : 4;
    let done = false;
    let sourceBatches = 0;
    let maxRead = 0;
    let insertedDuringBackfill = false;
    for (let i = 0; i < 100 && !done; i++) {
      const state = await f.t.run((ctx) =>
        ctx.db.query("dashboardSummaryBackfill").unique(),
      );
      if (state?.phase === targetPhase && sourceBatches === 0) {
        const factCount = () =>
          f.t.run((ctx) =>
            dashboardAggregate.count(ctx, {
              namespace: `taught:${f.classId}`,
            }),
          );
        const beforeCount = await factCount();
        await expect(
          f.t.mutation(async (ctx) => {
            await ctx.runMutation(internal.dashboardSummaries.backfill, {});
            throw new Error("test rollback before cursor commit");
          }),
        ).rejects.toThrow("test rollback before cursor commit");
        expect(
          await f.t.run((ctx) =>
            ctx.db.query("dashboardSummaryBackfill").unique(),
          ),
        ).toEqual(state);
        expect(await factCount()).toBe(beforeCount);
      }
      const batch = await f.t.mutation(async (ctx) => {
        const result = await ctx.runMutation(
          internal.dashboardSummaries.backfill,
          {},
        );
        return { ...result, metrics: await ctx.meta.getTransactionMetrics() };
      });
      maxRead = Math.max(maxRead, batch.metrics.bytesRead.used);
      const after = await f.t.run((ctx) =>
        ctx.db.query("dashboardSummaryBackfill").unique(),
      );
      expect(
        await f.t.run((ctx) =>
          ctx.db.query("dashboardSummaryState").unique(),
        ),
      ).toMatchObject({ ready: batch.done });
      if (state?.phase === targetPhase) {
        sourceBatches++;
        // Every partial page commits a native cursor, including after resuming
        // a previous invocation. It cannot retry the same failing large batch.
        if (after?.phase === targetPhase)
          expect(after.cursor).not.toBe(state.cursor);
        if (!insertedDuringBackfill && after?.phase === targetPhase) {
          // A live write after the lesson phase but before source initialization
          // finishes must survive later cursor pages and duplicate processing.
          await f.write(async (ctx) => {
            const lessonId = await ctx.db.insert("lessons", {
              curriculumId: f.curriculumId,
              title: "Published during initialization",
              order: 30,
              isActive: true,
              createdAt: 2,
              createdBy: f.userId,
            });
            await ctx.db.insert("classPrerecordedLessonRecords", {
              classId: f.classId,
              scheduleId: f.scheduleId,
              lessonId,
              taughtAt: 2,
            });
          });
          insertedDuringBackfill = true;
        }
      }
      done = batch.done;
    }
    expect(done).toBe(true);
    expect(sourceBatches).toBeGreaterThan(1);
    expect(insertedDuringBackfill).toBe(true);
    expect(maxRead).toBeLessThan(12 * 1024 * 1024);
    expect((await f.read()).progress).toEqual({
      totalLessons: 24,
      taughtLessons: 22,
      pendingLessons: 2,
      percentage: 92,
    });
    const retry = await f.t.mutation(async (ctx) => {
      const result = await ctx.runMutation(
        internal.dashboardSummaries.backfill,
        {},
      );
      return { ...result, metrics: await ctx.meta.getTransactionMetrics() };
    });
    expect(retry.done).toBe(true);
    expect(retry.metrics.documentsWritten.used).toBe(0);
    process.stdout.write(
      `${kind} large-source backfill max bytesRead: ${maxRead}\n`,
    );
  },
);

test("source backfill skips orphan/mismatched parents without erasing another valid source or rescanning history", async () => {
  const f = await setup();
  const rows = await f.t.run(async (ctx) => {
    const orphanReportId = await ctx.db.insert("classSessionReports", {
      classId: f.classId,
      scheduleId: f.scheduleId,
      closedAt: 1,
      closedBy: f.userId,
    });
    await ctx.db.delete("classSessionReports", orphanReportId);
    const mismatchedReportId = await ctx.db.insert("classSessionReports", {
      classId: f.otherClassId,
      scheduleId: f.scheduleId,
      closedAt: 1,
      closedBy: f.userId,
    });
    const ids = [];
    for (let i = 0; i < 40; i++)
      ids.push(
        await ctx.db.insert("classSessionReportLessons", {
          classId: f.classId,
          scheduleId: f.scheduleId,
          lessonId: f.lessonIds[0],
          reportId: i % 2 ? orphanReportId : mismatchedReportId,
        }),
      );
    return Promise.all(
      ids.map(
        async (id) => (await ctx.db.get("classSessionReportLessons", id))!,
      ),
    );
  });
  const replay = () =>
    f.write(async (ctx) => {
      for (const source of rows)
        await backfillDashboardTaughtLesson(ctx, source);
      return ctx.meta.getTransactionMetrics();
    });
  const metrics = await replay();
  // Missing parents consume an indexed lookup, but no document read.
  expect(metrics.databaseQueries.used).toBe(40);
  expect(metrics.documentsRead.used).toBe(20);
  expect(metrics.documentsWritten.used).toBe(0);
  expect((await f.read()).progress.taughtLessons).toBe(1);
  await f.write(async (ctx) => {
    await ctx.db.delete("classSessionReportLessons", f.live);
    await ctx.db.delete("classSessionReportLessons", f.repeatedLive);
    await ctx.db.delete("classPrerecordedLessonRecords", f.prerecorded);
  });
  expect((await f.read()).progress.taughtLessons).toBe(0);
  await replay();
  expect((await f.read()).progress.taughtLessons).toBe(0);
});

test("unique taught facts deduplicate repeated live reports and overlapping prerecorded sources", async () => {
  const f = await setup();
  expect((await f.read()).progress).toEqual({
    totalLessons: 3,
    taughtLessons: 1,
    pendingLessons: 2,
    percentage: 33,
  });
  expect(
    await f.t.run((ctx) => ctx.db.query("dashboardTaughtLessons").collect()),
  ).toHaveLength(1);
  await f.write((ctx) => ctx.db.delete(f.live));
  await f.write((ctx) => ctx.db.delete(f.repeatedLive));
  expect((await f.read()).progress.taughtLessons).toBe(1);
  await f.write((ctx) => ctx.db.delete(f.prerecorded));
  expect((await f.read()).progress.taughtLessons).toBe(0);
  expect(
    await f.t.run((ctx) => ctx.db.query("dashboardTaughtLessons").collect()),
  ).toEqual([]);
  const source = await f.write((ctx) =>
    ctx.db.insert("classPrerecordedLessonRecords", {
      classId: f.classId,
      scheduleId: f.scheduleId,
      lessonId: f.lessonIds[1],
      taughtAt: 2,
    }),
  );
  expect((await f.read()).progress.taughtLessons).toBe(1);
  await f.write((ctx) => ctx.db.patch(source, { lessonId: f.lessonIds[2] }));
  expect((await f.read()).progress.taughtLessons).toBe(1);
});

test("parent class moves/deletion and orphan children only count valid report sources", async () => {
  const f = await setup();
  await f.write((ctx) => ctx.db.delete(f.prerecorded));
  await f.write((ctx) => ctx.db.patch(f.reportId, { classId: f.otherClassId }));
  expect((await f.read()).progress.taughtLessons).toBe(0);
  await f.write((ctx) => ctx.db.patch(f.live, { classId: f.otherClassId }));
  expect((await f.read(f.otherClassId)).progress.taughtLessons).toBe(1);
  await f.write((ctx) => ctx.db.delete(f.reportId));
  expect((await f.read(f.otherClassId)).progress.taughtLessons).toBe(0);
  await f.write((ctx) =>
    ctx.db.patch(f.repeatedLive, { lessonId: f.lessonIds[1] }),
  );
  expect((await f.read()).progress.taughtLessons).toBe(0);
  const report = await f.write((ctx) =>
    ctx.db.insert("classSessionReports", {
      classId: f.classId,
      scheduleId: f.scheduleId,
      closedAt: 2,
      closedBy: f.userId,
    }),
  );
  await f.write((ctx) => ctx.db.patch(f.repeatedLive, { reportId: report }));
  expect((await f.read()).progress.taughtLessons).toBe(1);
});

test("lesson activation, curriculum moves and deletion update both aggregate dimensions; content edits do not", async () => {
  const f = await setup();
  await f.write((ctx) => ctx.db.patch(f.lessonIds[0], { isActive: false }));
  expect((await f.read()).progress).toMatchObject({
    totalLessons: 2,
    taughtLessons: 0,
    pendingLessons: 2,
  });
  await f.write((ctx) => ctx.db.patch(f.lessonIds[0], { isActive: true }));
  expect((await f.read()).progress.taughtLessons).toBe(1);
  const contentMetrics = await f.write(async (ctx) => {
    await ctx.db.patch(f.lessonIds[0], { content: "updated content" });
    return ctx.meta.getTransactionMetrics();
  });
  // Only the source document is written: no aggregate or derived fact writes.
  expect(contentMetrics.documentsWritten.used).toBe(1);
  await f.write((ctx) =>
    ctx.db.patch(f.lessonIds[0], { curriculumId: f.otherCurriculumId }),
  );
  expect((await f.read()).progress).toMatchObject({
    totalLessons: 2,
    taughtLessons: 0,
  });
  await f.write((ctx) =>
    ctx.db.patch(f.classId, { curriculumId: f.otherCurriculumId }),
  );
  expect((await f.read()).progress).toEqual({
    totalLessons: 1,
    taughtLessons: 1,
    pendingLessons: 0,
    percentage: 100,
  });
  await f.write((ctx) => ctx.db.delete(f.lessonIds[0]));
  expect((await f.read()).progress).toEqual({
    totalLessons: 0,
    taughtLessons: 0,
    pendingLessons: 0,
    percentage: 0,
  });
});

test("legacy fallback survives disabled/incomplete rollout; backfill is idempotent and avoids heavy lesson reads after readiness", async () => {
  const f = await setup(false);
  expect(
    await f.t.run((ctx) => ctx.db.query("dashboardTaughtLessons").collect()),
  ).toEqual([]);
  const before = await f.read();
  const stateId = await f.t.run((ctx) =>
    ctx.db.insert("dashboardSummaryState", {
      key: "v1",
      ready: false,
      phase: 0,
      cursor: null,
    }),
  );
  await f.write(async (ctx) => {
    for (const lessonId of f.lessonIds) {
      const lesson = (await ctx.db.get(lessonId))!;
      await syncDashboardLesson(ctx, lesson);
      await syncDashboardLesson(ctx, lesson);
      await syncDashboardTaughtLesson(ctx, f.classId, lessonId);
      await syncDashboardTaughtLesson(ctx, f.classId, lessonId);
    }
  });
  expect((await f.read()).progress).toEqual(before.progress);
  await f.t.run((ctx) => ctx.db.patch(stateId, { ready: true }));
  const after = await f.read();
  expect(after.progress).toEqual(before.progress);
  expect(after.metrics.bytesRead.used).toBeLessThan(
    before.metrics.bytesRead.used / 20,
  );
  process.stdout.write(
    `Curriculum progress bytesRead (3 heavy lessons): ${before.metrics.bytesRead.used} -> ${after.metrics.bytesRead.used}\n`,
  );
});

test("source writes and derived counters roll back together on transaction failure", async () => {
  const f = await setup();
  await expect(
    f.write(async (ctx) => {
      await ctx.db.delete(f.lessonIds[0]);
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  expect((await f.read()).progress).toMatchObject({
    totalLessons: 3,
    taughtLessons: 1,
  });
  expect(await f.t.run((ctx) => ctx.db.get(f.lessonIds[0]))).not.toBeNull();
});

test("overlapping writes and replayed backfills preserve one fact until the final valid source disappears", async () => {
  const f = await setup();
  const lessonId = f.lessonIds[1];
  const sources = await Promise.all(
    Array.from({ length: 8 }, () =>
      f.write((ctx) =>
        ctx.db.insert("classPrerecordedLessonRecords", {
          classId: f.classId,
          scheduleId: f.scheduleId,
          lessonId,
          taughtAt: 2,
        }),
      ),
    ),
  );
  await f.write(async (ctx) => {
    for (let i = 0; i < 3; i++)
      await syncDashboardTaughtLesson(ctx, f.classId, lessonId);
  });
  expect((await f.read()).progress.taughtLessons).toBe(2);
  expect(
    await f.t.run((ctx) =>
      ctx.db
        .query("dashboardTaughtLessons")
        .withIndex("by_classId_and_lessonId", (q) =>
          q.eq("classId", f.classId).eq("lessonId", lessonId),
        )
        .collect(),
    ),
  ).toHaveLength(1);
  await Promise.all(
    sources.slice(1).map((id) => f.write((ctx) => ctx.db.delete(id))),
  );
  expect((await f.read()).progress.taughtLessons).toBe(2);
  await f.write((ctx) => ctx.db.delete(sources[0]));
  expect((await f.read()).progress.taughtLessons).toBe(1);
});

test("class deletion removes only its derived facts and aggregate items; orphan source backfill cannot revive them", async () => {
  const f = await setup();
  await f.write((ctx) =>
    ctx.db.insert("classPrerecordedLessonRecords", {
      classId: f.otherClassId,
      scheduleId: f.scheduleId,
      lessonId: f.lessonIds[0],
      taughtAt: 2,
    }),
  );
  const sources = () =>
    f.t.run(async (ctx) => ({
      live: await ctx.db.query("classSessionReportLessons").collect(),
      reports: await ctx.db.query("classSessionReports").collect(),
      prerecorded: await ctx.db
        .query("classPrerecordedLessonRecords")
        .collect(),
      lessons: await ctx.db.query("lessons").collect(),
    }));
  const before = await sources();
  await f.write((ctx) => ctx.db.delete(f.classId));
  expect(await sources()).toEqual(before);
  expect(
    await f.t.run((ctx) =>
      dashboardAggregate.count(ctx, { namespace: `taught:${f.classId}` }),
    ),
  ).toBe(0);
  const facts = await f.t.run((ctx) =>
    ctx.db.query("dashboardTaughtLessons").collect(),
  );
  expect(facts).toHaveLength(1);
  expect(facts[0].classId).toBe(f.otherClassId);
  expect((await f.read(f.otherClassId)).progress.taughtLessons).toBe(1);
  await f.write(async (ctx) => {
    await syncDashboardTaughtLesson(ctx, f.classId, f.lessonIds[0]);
    await syncDashboardTaughtLesson(ctx, f.classId, f.lessonIds[0]);
    await ctx.db.patch(f.live, { lessonId: f.lessonIds[1] });
    await ctx.db.insert("classPrerecordedLessonRecords", {
      classId: f.classId,
      scheduleId: f.scheduleId,
      lessonId: f.lessonIds[2],
      taughtAt: 3,
    });
  });
  expect(
    await f.t.run((ctx) => ctx.db.query("dashboardTaughtLessons").collect()),
  ).toEqual(facts);
  expect(
    await f.t.run((ctx) =>
      dashboardAggregate.count(ctx, { namespace: `taught:${f.classId}` }),
    ),
  ).toBe(0);
});
