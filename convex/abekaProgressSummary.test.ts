import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import type { WorkflowId } from "@convex-dev/workflow";
import workflow from "@convex-dev/workflow/test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import {
  getAbekaStudentCourseProgress,
  getAbekaStudentCourseReports,
} from "./model/abekaStudentProgress";
import { saveAbekaProgressSummary } from "./model/abekaProgressSummary";
import { setAbekaNextSync } from "./model/abekaScheduling";

afterEach(() => vi.useRealTimers());

const lessons = Array.from({ length: 170 }, (_, index) => ({
  subjectName: "Math",
  lessonNumber: index + 1,
  percentage: index < 50 ? 100 : 37.53,
  completed: index < 50,
  lengthSeconds: 600,
  watchedSeconds: index < 50 ? 600 : 225,
  lastViewed: "2026-11-05",
  segmentId: `${index}-${"segment".repeat(40)}`,
  subscriptionItem: "subscription-item".repeat(20),
  subscriptionNumber: "subscription-number".repeat(20),
}));

async function setup(mapping: "class" | "curriculum" = "curriculum") {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkId: "student",
      firstName: "Student",
      lastName: "Test",
      fullName: "Student Test",
      isActive: true,
      createdAt: 1,
    });
    await ctx.db.insert("users", {
      clerkId: "outsider",
      firstName: "Outsider",
      lastName: "Test",
      fullName: "Outsider Test",
      isActive: true,
      createdAt: 1,
    });
    const schoolId = await ctx.db.insert("schools", {
      name: "School",
      slug: "school",
      isActive: true,
      createdAt: 1,
      createdBy: userId,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Campus",
      slug: "campus",
      isActive: true,
      createdAt: 1,
      createdBy: userId,
    });
    await ctx.db.insert("roleAssignments", {
      userId,
      orgId: campusId,
      orgType: "campus",
      role: "student",
      assignedAt: 1,
      schoolId,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      schoolId,
      title: "Math",
      isActive: true,
      createdAt: 1,
      createdBy: userId,
    });
    const classId = await ctx.db.insert("classes", {
      name: "Math",
      campusId,
      schoolId,
      curriculumId,
      students: [userId],
      isActive: true,
      classType: "abeka",
      createdAt: 1,
      createdBy: userId,
    });
    const connectionId = await ctx.db.insert("abekaConnections", {
      schoolId,
      status: "connected",
      confirmed: true,
      revision: 1,
      connectedBy: userId,
      ...(mapping === "curriculum" ? { curriculumLinksMigratedAt: 1 } : {}),
    });
    const runId = await ctx.db.insert("abekaSyncRuns", {
      connectionId,
      revision: 1,
      status: "running",
      startedAt: 1,
      studentsSynced: 0,
    });
    await ctx.db.patch(connectionId, {
      latestRunId: runId,
      rosterRunId: runId,
    });
    const studentId = await ctx.db.insert("abekaStudents", {
      connectionId,
      userId,
      name: "Student",
      loginId: "42",
      rosterRunId: runId,
    });
    const courseId = await ctx.db.insert("abekaCourses", {
      connectionId,
      subjectId: "math",
      name: "Math",
      available: true,
      totalLessons: 170,
    });
    const linkId =
      mapping === "curriculum"
        ? await ctx.db.insert("abekaCurriculumLinks", {
            connectionId,
            courseId,
            curriculumId,
          })
        : await ctx.db.insert("abekaCourseLinks", {
            connectionId,
            courseId,
            classId,
          });
    const reportId = await ctx.db.insert("abekaProgress", {
      studentId,
      subjectId: "math",
      subjectName: "Math",
      syncedAt: 123,
      runId,
      lessons,
    });
    return {
      userId,
      schoolId,
      campusId,
      curriculumId,
      classId,
      connectionId,
      runId,
      studentId,
      courseId,
      linkId,
      reportId,
    };
  });
  async function read() {
    return t.run(async (ctx) => {
      const course = (await ctx.db.get(ids.classId))!;
      const result = await getAbekaStudentCourseProgress(ctx, ids.userId, [
        course,
      ]);
      return {
        progress: result.get(ids.classId) ?? null,
        metrics: await ctx.meta.getTransactionMetrics(),
      };
    });
  }
  return { t, ...ids, read };
}

test("170 heavy lessons retain legacy progress and detail while summary cuts dashboard bytesRead", async () => {
  const f = await setup();
  const before = await f.read();
  expect(before.progress).toEqual({
    completed: 50,
    total: 170,
    percentage: 55.9,
    syncedAt: 123,
  });
  const backfill = await f.t.mutation(
    internal.abekaSync.backfillProgressSummaries,
    { cursor: null },
  );
  expect(backfill).toMatchObject({ isDone: true, processed: 1 });
  const after = await f.read();
  expect(after.progress).toEqual(before.progress);
  expect(before.metrics.bytesRead.used).toBeGreaterThan(150_000);
  expect(after.metrics.bytesRead.used).toBeLessThan(5_000);
  expect(after.metrics.bytesRead.used).toBeLessThan(
    before.metrics.bytesRead.used / 20,
  );
  const detail = await f.t.run(async (ctx) => {
    const reports = await getAbekaStudentCourseReports(ctx, f.userId, [
      (await ctx.db.get(f.classId))!,
    ]);
    return reports.get(f.classId);
  });
  expect(detail?.lessons).toEqual(lessons);
  process.stdout.write(
    `Abeka dashboard bytesRead (170 heavy lessons): ${before.metrics.bytesRead.used} -> ${after.metrics.bytesRead.used}\n`,
  );
});

test("saveProgress updates summary atomically, including partial corrections, removed lessons and run metadata", async () => {
  const f = await setup();
  const save = (snapshot: typeof lessons) =>
    f.t.mutation(internal.abekaSync.saveProgress, {
      runId: f.runId,
      studentId: f.studentId,
      subjectId: "math",
      lessons: snapshot,
    });
  expect(await save(lessons)).toBe(true);
  const nextRun = await f.t.run(async (ctx) => {
    const runId = await ctx.db.insert("abekaSyncRuns", {
      connectionId: f.connectionId,
      revision: 1,
      status: "running",
      startedAt: 2,
      studentsSynced: 0,
    });
    await ctx.db.patch(f.connectionId, {
      latestRunId: runId,
      rosterRunId: runId,
    });
    await ctx.db.patch(f.studentId, { rosterRunId: runId });
    return runId;
  });
  const corrected = [{ ...lessons[0], completed: false, percentage: 8.75 }];
  for (let i = 0; i < 2; i++)
    expect(
      await f.t.mutation(internal.abekaSync.saveProgress, {
        runId: nextRun,
        studentId: f.studentId,
        subjectId: "math",
        lessons: corrected,
      }),
    ).toBe(true);
  expect((await f.read()).progress).toMatchObject({
    completed: 0,
    total: 1,
    percentage: 8.75,
  });
  const snapshot = await f.t.run(async (ctx) => ({
    report: await ctx.db.get(f.reportId),
    summaries: await ctx.db.query("abekaProgressSummaries").collect(),
  }));
  expect(snapshot.summaries).toHaveLength(1);
  expect(snapshot.summaries[0]).toMatchObject({
    reportId: f.reportId,
    runId: nextRun,
    syncedAt: snapshot.report!.syncedAt,
  });
  expect(snapshot.report?.lessons).toEqual(corrected);
  expect(await save(lessons)).toBe(false); // Fenced previous run cannot overwrite either snapshot.
  expect((await f.read()).progress?.percentage).toBe(8.75);
});

test("backfill is bounded, manually advanced, idempotent, and preserves existing reports and empty snapshots", async () => {
  const f = await setup();
  await f.t.run(async (ctx) => {
    for (let i = 0; i < 24; i++)
      await ctx.db.insert("abekaProgress", {
        studentId: f.studentId,
        subjectId: `subject-${i}`,
        subjectName: "Subject",
        syncedAt: i,
        runId: f.runId,
        lessons: i === 0 ? [] : [lessons[0]],
      });
  });
  const before = await f.t.run((ctx) =>
    ctx.db.query("abekaProgress").collect(),
  );
  let batch = await f.t.mutation(internal.abekaSync.backfillProgressSummaries, {
    cursor: null,
  });
  expect(batch.processed).toBeLessThanOrEqual(10);
  expect(batch.isDone).toBe(false);
  expect(
    await f.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    ),
  ).toEqual([]);
  let processed = batch.processed;
  while (!batch.isDone) {
    batch = await f.t.mutation(internal.abekaSync.backfillProgressSummaries, {
      cursor: batch.continueCursor,
    });
    processed += batch.processed;
  }
  expect(processed).toBe(25);
  const summaries = await f.t.run((ctx) =>
    ctx.db.query("abekaProgressSummaries").collect(),
  );
  expect(summaries).toHaveLength(25);
  expect(summaries.find((s) => s.subjectId === "subject-0")).toMatchObject({
    total: 0,
    percentage: 0,
  });
  const replay = await f.t.mutation(
    internal.abekaSync.backfillProgressSummaries,
    { cursor: null },
  );
  expect(replay.processed).toBeLessThanOrEqual(10);
  expect(
    await f.t.run((ctx) => ctx.db.query("abekaProgressSummaries").collect()),
  ).toEqual(summaries);
  expect(
    await f.t.run((ctx) => ctx.db.query("abekaProgress").collect()),
  ).toEqual(before);
});

test("weekly activity reuses completion writes and exposes only the successful institutional snapshot", async () => {
  vi.useFakeTimers();
  const now = Date.parse("2026-11-09T07:00:00Z");
  vi.setSystemTime(now);
  const f = await setup();
  const admin = await f.t.run(async (ctx) => {
    await ctx.db.patch(f.schoolId, { timeZone: "America/Tegucigalpa" });
    await ctx.db.patch(f.runId, { updateId: f.runId, startedAt: now });
    await ctx.db.patch(f.connectionId, {
      weeklyActivity: {
        weekStart: "2026-11-02",
        timeZone: "America/Tegucigalpa",
        viewers: 1,
        students: 1,
        syncedAt: now - 86400000,
      },
    });
    const person = await ctx.db.insert("users", {
      clerkId: "admin",
      firstName: "Admin",
      lastName: "Test",
      fullName: "Admin Test",
      isActive: true,
      createdAt: 1,
    });
    await ctx.db.insert("roleAssignments", {
      userId: person,
      orgType: "school",
      orgId: f.schoolId,
      schoolId: f.schoolId,
      role: "admin",
      assignedAt: 1,
    });
    await ctx.db.patch(f.reportId, {
      lessons: lessons.map((lesson) => ({
        ...lesson,
        lastViewed: "2026-11-09",
      })),
    });
    const otherReport = (await ctx.db.get(f.reportId))!;
    await ctx.db.insert("abekaProgress", {
      studentId: f.studentId,
      subjectId: "another",
      subjectName: "Another",
      runId: f.runId,
      syncedAt: now,
      lessons: otherReport.lessons,
    });
    return person;
  });
  const asAdmin = f.t.withIdentity({ subject: "admin" });
  const query = api.abeka.getWeeklyActivity;
  const args = { schoolId: f.schoolId };
  const nextSyncAt = now + 86400_000;
  await f.t.run((ctx) => ctx.db.patch(f.connectionId, { nextSyncAt }));
  expect(await asAdmin.query(query, args)).toEqual({
    snapshot: null,
    lastSyncedAt: null,
    nextSyncAt: null,
  });
  await f.t.run((ctx) => setAbekaNextSync(ctx, f.connectionId, nextSyncAt));
  expect(await asAdmin.query(query, args)).toEqual({
    snapshot: null,
    lastSyncedAt: null,
    nextSyncAt,
  });
  await expect(
    f.t.withIdentity({ subject: "student" }).query(query, args),
  ).rejects.toThrow("FORBIDDEN");
  const complete = {
    runId: f.runId,
    studentId: f.studentId,
    subjectIds: ["math", "another"],
  };
  const cost = await f.t.run(async (ctx) => {
    await ctx.runMutation(internal.abekaSync.studentComplete, complete);
    return ctx.meta.getTransactionMetrics();
  });
  expect(cost.documentsWritten.used).toBe(2);
  await f.t.mutation(internal.abekaSync.studentComplete, complete);
  expect(await asAdmin.query(query, args)).toEqual({
    snapshot: null,
    lastSyncedAt: null,
    nextSyncAt,
  });
  await f.t.mutation(internal.abekaSync.onComplete, {
    workflowId: "test-workflow" as WorkflowId,
    result: { kind: "success", returnValue: null },
    context: { runId: f.runId },
  });
  const { snapshot, bytes } = await asAdmin.run(async (ctx) => ({
    snapshot: await ctx.runQuery(query, args),
    bytes: (await ctx.meta.getTransactionMetrics()).bytesRead.used,
  }));
  expect(snapshot).toEqual({
    lastSyncedAt: now,
    nextSyncAt: now + 7 * 86400_000,
    snapshot: {
      viewers: 1,
      students: 1,
      fromDate: "2026-11-03",
      throughDate: "2026-11-09",
      timeZone: "America/Tegucigalpa",
      syncedAt: now,
    },
  });
  expect(bytes).toBeGreaterThan(0);
  expect(bytes).toBeLessThan(4 * 1024);
  process.stdout.write(
    `Abeka weekly activity bytesRead: ${bytes}; completion writes: ${cost.documentsWritten.used}\n`,
  );
  const roles = await f.t.run((ctx) =>
    ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", admin))
      .collect(),
  );
  await f.t.run(async (ctx) => {
    await ctx.db.patch(f.connectionId, { status: "disconnected" });
  });
  expect(await asAdmin.query(query, args)).toBeNull();
  await f.t.run(async (ctx) => {
    await ctx.db.patch(f.connectionId, { status: "connected" });
    await ctx.db.patch(roles[0]._id, {
      role: "principal",
      orgType: "campus",
      orgId: f.campusId,
    });
  });
  await expect(asAdmin.query(query, args)).rejects.toThrow("FORBIDDEN");
});

test.each([
  { date: "2026-11-02", count: 0 },
  { date: "2026-11-03", count: 1 },
  { date: "2026-11-08", count: 1 },
  { date: "2026-11-09", count: 1 },
  { date: null, count: null },
  { date: "2026-11-10", count: null },
  { date: "2026-11-09T00:00:00Z", count: null },
])(
  "weekly activity does not turn ambiguous dates into inactivity ($date)",
  async ({ date, count }) => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-11-09T07:00:00Z"));
    const f = await setup();
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.schoolId, { timeZone: "America/Tegucigalpa" });
      await ctx.db.patch(f.runId, { startedAt: Date.now() });
      await ctx.db.patch(f.reportId, {
        lessons: [{ ...lessons[0], lastViewed: date }],
      });
    });
    await f.t.mutation(internal.abekaSync.studentComplete, {
      runId: f.runId,
      studentId: f.studentId,
      subjectIds: ["math"],
    });
    const run = await f.t.run((ctx) => ctx.db.get(f.runId));
    expect(run?.weeklyActivity?.viewers ?? null).toBe(count);
  },
);

test("a resumed update deduplicates retries and retains the last snapshot if it finishes after local midnight", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-11-13T05:59:00Z"));
  const f = await setup();
  workflow.register(f.t);
  const timeZone = "America/Tegucigalpa";
  const previousSnapshot = {
    timeZone,
    fromDate: "2026-11-05",
    throughDate: "2026-11-11",
    viewers: 1,
    students: 2,
    syncedAt: Date.parse("2026-11-12T05:00:00Z"),
  };
  const resumed = await f.t.run(async (ctx) => {
    await ctx.db.patch(f.schoolId, { timeZone });
    await ctx.db.patch(f.runId, {
      status: "failed",
      updateId: f.runId,
      studentsSynced: 1,
      startedAt: Date.now(),
      weeklyActivity: {
        timeZone,
        fromDate: "2026-11-06",
        throughDate: "2026-11-12",
        viewers: 1,
      },
    });
    const resumed = await ctx.db.insert("abekaSyncRuns", {
      connectionId: f.connectionId,
      status: "running",
      revision: 1,
      startedAt: Date.now(),
      updateId: f.runId,
      studentsSynced: 1,
    });
    await ctx.db.patch(f.connectionId, {
      latestRunId: resumed,
      rosterRunId: resumed,
      weeklyActivity: previousSnapshot,
    });
    await ctx.db.patch(f.studentId, { rosterRunId: resumed });
    await ctx.db.patch(f.reportId, {
      runId: resumed,
      lessons: [{ ...lessons[0], lastViewed: "2026-11-11" }],
    });
    return resumed;
  });
  const args = { runId: resumed, studentId: f.studentId, subjectIds: ["math"] };
  await f.t.mutation(internal.abekaSync.studentComplete, args);
  await f.t.mutation(internal.abekaSync.studentComplete, args);
  expect(await f.t.run((ctx) => ctx.db.get(f.runId))).toMatchObject({
    studentsSynced: 2,
    weeklyActivity: { viewers: 2 },
  });
  vi.setSystemTime(Date.parse("2026-11-13T06:01:00Z"));
  await f.t.mutation(internal.abekaSync.onComplete, {
    workflowId: "test-workflow" as WorkflowId,
    result: { kind: "success", returnValue: null },
    context: { runId: resumed },
  });
  expect(
    (await f.t.run((ctx) => ctx.db.get(f.connectionId)))?.weeklyActivity,
  ).toEqual(previousSnapshot);
  const connection = (await f.t.run((ctx) => ctx.db.get(f.connectionId)))!;
  expect(connection.lastSyncStartedAt).toBeUndefined();
  expect(connection.latestRunId).not.toBe(resumed);
  expect(
    await f.t.run((ctx) => ctx.db.get(connection.latestRunId!)),
  ).toMatchObject({
    status: "running",
    studentsSynced: 0,
    startedAt: Date.now(),
  });
  expect((await f.t.run((ctx) => ctx.db.get(f.runId)))?.status).toBe("failed");
});

test("completion cleanup removes obsolete summaries with their reports, retaining current summary and legacy fallback", async () => {
  vi.useFakeTimers();
  const f = await setup();
  await f.t.run(async (ctx) => {
    await saveAbekaProgressSummary(ctx, (await ctx.db.get(f.reportId))!);
    const old = await ctx.db.insert("abekaProgress", {
      studentId: f.studentId,
      subjectId: "obsolete",
      subjectName: "Old",
      syncedAt: 1,
      runId: f.runId,
      lessons: [lessons[0]],
    });
    await saveAbekaProgressSummary(ctx, (await ctx.db.get(old))!);
  });
  await f.t.mutation(internal.abekaSync.studentComplete, {
    runId: f.runId,
    studentId: f.studentId,
    subjectIds: ["math"],
  });
  const state = await f.t.run(async (ctx) => ({
    reports: await ctx.db.query("abekaProgress").collect(),
    summaries: await ctx.db.query("abekaProgressSummaries").collect(),
  }));
  expect(state.reports.map((r) => r.subjectId)).toEqual(["math"]);
  expect(state.summaries.map((r) => r.subjectId)).toEqual(["math"]);
  expect((await f.read()).progress?.total).toBe(170);
  await f.t.run((ctx) => ctx.db.delete(state.summaries[0]._id));
  expect((await f.read()).progress?.total).toBe(170);
});

test.each(["class", "curriculum"] as const)(
  "%s links preserve public auth, enrollment, course, connection and roster checks",
  async (mapping) => {
    const f = await setup(mapping);
    await f.t.mutation(internal.abekaSync.backfillProgressSummaries, {
      cursor: null,
    });
    const args = { now: 1, studentId: f.userId, orgSlug: "campus" };
    const client = f.t.withIdentity({ subject: "student" });
    expect(
      (await client.query(api.student.getStudentDashboardStats, args))
        ?.classes[0].abekaProgress?.total,
    ).toBe(170);
    expect(
      await f.t.query(api.student.getStudentDashboardStats, args),
    ).toBeNull();
    expect(
      await f.t
        .withIdentity({ subject: "outsider" })
        .query(api.student.getStudentDashboardStats, args),
    ).toBeNull();
    await f.t.run((ctx) => ctx.db.patch(f.classId, { students: [] }));
    expect(
      (await client.query(api.student.getStudentDashboardStats, args))?.classes,
    ).toEqual([]);
    await f.t.run((ctx) => ctx.db.patch(f.classId, { students: [f.userId] }));
    await f.t.run((ctx) => ctx.db.patch(f.connectionId, { confirmed: false }));
    expect((await f.read()).progress).toBeNull();
    await f.t.run((ctx) =>
      ctx.db.patch(f.connectionId, { confirmed: true, status: "disconnected" }),
    );
    expect((await f.read()).progress).toBeNull();
    await f.t.run((ctx) =>
      ctx.db.patch(f.connectionId, {
        status: "connected",
        rosterRunId: undefined,
      }),
    );
    expect((await f.read()).progress).toBeNull();
    await f.t.run((ctx) =>
      ctx.db.patch(f.connectionId, { rosterRunId: f.runId }),
    );
    await f.t.run((ctx) => ctx.db.patch(f.courseId, { available: false }));
    expect((await f.read()).progress).toBeNull();
    await f.t.run((ctx) => ctx.db.patch(f.courseId, { available: true }));
    await f.t.run((ctx) => ctx.db.patch(f.studentId, { userId: undefined }));
    expect((await f.read()).progress).toBeNull();
    await f.t.run((ctx) => ctx.db.patch(f.studentId, { userId: f.userId }));
    expect((await f.read()).progress?.total).toBe(170);
    await f.t.run((ctx) => ctx.db.delete(f.linkId));
    expect((await f.read()).progress).toBeNull();
  },
);
