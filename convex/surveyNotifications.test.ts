import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import {
  SURVEY_REMINDER_INTERVAL_MS as week,
  matchesSurveyDestination,
} from "./surveyNotifications";

let ended = false;
let audience = true;
let unavailable = false;
beforeEach(() => {
  vi.useFakeTimers();
  ended = false;
  audience = true;
  unavailable = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      if (unavailable) throw new Error("offline");
      return new Response(
        JSON.stringify(
          String(url).includes("/flags")
            ? {
                flags: { audience: { enabled: audience } },
                errorsWhileComputingFlags: false,
              }
            : {
                surveys: [
                  {
                    id: "test",
                    start_date: "2020-01-01",
                    end_date: ended ? "2026-01-01" : null,
                    targeting_flag_key: "audience",
                    conditions: {
                      url: "http://localhost:3000/",
                      urlMatchType: "icontains",
                    },
                  },
                ],
              },
        ),
        { status: 200 },
      );
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const insertUser = (clerkId: string) =>
      ctx.db.insert("users", {
        clerkId,
        firstName: clerkId,
        lastName: "Test",
        fullName: clerkId,
        isActive: true,
        createdAt: Date.now(),
      });
    const teacherId = await insertUser("teacher");
    const studentId = await insertUser("student");
    const schoolId = await ctx.db.insert("schools", {
      name: "School",
      slug: "school",
      isActive: true,
      createdAt: Date.now(),
      createdBy: teacherId,
    });
    const campusId = await ctx.db.insert("campuses", {
      name: "Campus",
      slug: "campus",
      schoolId,
      isActive: true,
      createdAt: Date.now(),
      createdBy: teacherId,
    });
    const assignmentId = await ctx.db.insert("roleAssignments", {
      userId: teacherId,
      orgId: campusId,
      orgType: "campus",
      role: "teacher",
      assignedAt: Date.now(),
    });
    return { teacherId, studentId, assignmentId };
  });
  const campaignId = await t.mutation(internal.surveyNotifications.configure, {
    surveyId: "test",
    projectToken: "phc_fake",
    enabled: true,
    origin: "http://localhost:3000",
  });
  const teacher = t.withIdentity({ subject: "teacher" });
  const acknowledge = (completed = false) =>
    teacher.mutation(api.surveyNotifications.acknowledge, {
      surveyId: "test",
      organizationSlug: "campus",
      completed,
    });
  const refresh = () =>
    t.action(internal.surveyNotifications.refreshCampaign, { campaignId });
  const list = () =>
    teacher.query(api.systemNotifications.list, {
      paginationOpts: { cursor: null, numItems: 20 },
    });
  return { t, teacher, campaignId, acknowledge, refresh, list, ...ids };
}

test("initial invitation + at most three weekly reminders reuse one notification", async () => {
  const s = await setup();
  await s.acknowledge();
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const first = (await s.list()).page[0];
  expect(first.kind).toBe("survey_invitation");
  await s.acknowledge();
  await s.refresh();
  expect((await s.list()).page).toHaveLength(1);
  for (let i = 1; i <= 3; i++) {
    await s.teacher.mutation(api.systemNotifications.markRead, {
      notificationId: first._id,
    });
    vi.setSystemTime(Date.now() + week - 1);
    await s.refresh();
    expect((await s.list()).page[0].readAt).toBeDefined();
    vi.setSystemTime(Date.now() + 1);
    await s.refresh();
    expect((await s.list()).page[0]._id).toBe(first._id);
    expect((await s.list()).page[0].readAt).toBeUndefined();
  }
  await s.teacher.mutation(api.systemNotifications.markRead, {
    notificationId: first._id,
  });
  vi.setSystemTime(Date.now() + week);
  await s.refresh();
  expect((await s.list()).page[0].readAt).toBeDefined();
  const rows = await s.t.run((ctx) =>
    ctx.db.query("surveyParticipation").collect(),
  );
  expect(rows[0].remindersSent).toBe(3);
  expect(rows[0].nextReminderAt).toBeUndefined();
});

test("completion persists across clients, removes the invitation and cancels reminders", async () => {
  const s = await setup();
  await s.acknowledge();
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  await s.acknowledge(true);
  await s.acknowledge(false);
  expect(
    await s.t
      .withIdentity({ subject: "teacher" })
      .query(api.surveyNotifications.getState, { surveyId: "test" }),
  ).toEqual({ enabled: true, completed: true });
  expect((await s.list()).page).toHaveLength(0);
  expect(
    await s.teacher.query(api.systemNotifications.getUnreadCount, {}),
  ).toBe(0);
  vi.setSystemTime(Date.now() + week);
  await s.refresh();
  expect((await s.list()).page).toHaveLength(0);
});

test("cannot enroll students, unauthenticated users or another campus", async () => {
  const s = await setup();
  const args = {
    surveyId: "test",
    organizationSlug: "campus",
    completed: false,
  };
  await expect(
    s.t.mutation(api.surveyNotifications.acknowledge, args),
  ).rejects.toThrow();
  await expect(
    s.t
      .withIdentity({ subject: "student" })
      .mutation(api.surveyNotifications.acknowledge, args),
  ).rejects.toThrow("Survey access denied");
  await expect(
    s.teacher.mutation(api.surveyNotifications.acknowledge, {
      ...args,
      organizationSlug: "other",
    }),
  ).rejects.toThrow("Survey access denied");
  expect(
    await s.t
      .withIdentity({ subject: "student" })
      .query(api.surveyNotifications.getState, { surveyId: "test" }),
  ).toEqual({ enabled: true, completed: false });
});

test("stopping a survey hides invitations and suppresses delivery", async () => {
  const s = await setup();
  await s.acknowledge();
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  ended = true;
  vi.setSystemTime(Date.now() + week);
  await s.refresh();
  expect((await s.list()).page).toHaveLength(0);
  expect(
    await s.teacher.query(api.systemNotifications.getUnreadCount, {}),
  ).toBe(0);
});

test.each(["audience", "offline", "role"])(
  "no reminders after %s changes/failure",
  async (mode) => {
    const s = await setup();
    await s.acknowledge();
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    const first = (await s.list()).page[0];
    await s.teacher.mutation(api.systemNotifications.markRead, {
      notificationId: first._id,
    });
    if (mode === "audience") audience = false;
    if (mode === "offline") unavailable = true;
    if (mode === "role")
      await s.t.run((ctx) => ctx.db.delete("roleAssignments", s.assignmentId));
    vi.setSystemTime(Date.now() + week);
    await s.refresh();
    const row = await s.t.run((ctx) =>
      ctx.db.get("systemNotifications", first._id),
    );
    expect(row?.readAt).toBeDefined();
  },
);

test("syncing an earlier local completion never sends an initial invitation", async () => {
  const s = await setup();
  await s.acknowledge(true);
  await s.refresh();
  expect((await s.list()).page).toHaveLength(0);
});

test("destination rules fail closed and respect language paths", () => {
  expect(
    matchesSurveyDestination(
      { id: "test", conditions: { url: "[", urlMatchType: "regex" } },
      "http://localhost:3000/en/campus/catalog",
    ),
  ).toBe(false);
  expect(
    matchesSurveyDestination(
      { id: "test", conditions: { events: {} } },
      "http://localhost:3000/en/campus/catalog",
    ),
  ).toBe(false);
});
