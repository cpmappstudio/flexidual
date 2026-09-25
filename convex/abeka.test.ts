import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import workflow from "@convex-dev/workflow/test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import {
  encryptSession,
  encryptCredentials,
  decryptCredentials,
  decryptSession,
} from "../lib/abeka/encryption";
import * as loginProbe from "../lib/abeka/login-probe";
import { ABEKA_MANUAL_SYNC_INTERVAL_MS } from "../lib/abeka/request-policy";
import {
  setAbekaNextSync,
  refreshAbekaSchedule,
  selectAbekaPeriod,
} from "./model/abekaScheduling";
import type { AbekaSchedule } from "../lib/abeka/schedule";

async function finishCurrentSync(t: Awaited<ReturnType<typeof setup>>["t"]) {
  let advanced = 0;
  await t.finishAllScheduledFunctions(() => {
    advanced += 1_000;
    // Pump short workflow timers, never jump forward to the recurring weekly job.
    if (advanced > 3_600_000) throw new Error("Current sync did not settle");
    vi.advanceTimersByTime(1_000);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const dailySchedule: AbekaSchedule = {
  mode: "weekdays",
  time: "08:00",
  weekday: 1,
  stopAtPeriodEnd: true,
};
async function scheduleSetup() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-25T12:00:00Z")); // Friday, 7 AM in Bogota.
  const fixture = await setup();
  await fixture.t.run((ctx) =>
    ctx.db.patch(fixture.schoolId, { timeZone: "America/Bogota" }),
  );
  const periodId = await fixture.adminClient.mutation(
    api.academicSettings.createPeriod,
    {
      schoolId: fixture.schoolId,
      name: "Current year",
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    },
  );
  return { ...fixture, periodId };
}

test("schedule settings replace one job atomically; manual fences stale jobs without touching reports or links", async () => {
  const { t, adminClient, schoolId, connectionId } = await scheduleSetup();
  const before = await t.run(async (ctx) => ({
    students: await ctx.db.query("abekaStudents").collect(),
    progress: await ctx.db.query("abekaProgress").collect(),
  }));
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  await adminClient.mutation(api.abeka.updateSchedule, {
    schoolId,
    schedule: dailySchedule,
  });
  const first = (await t.run((ctx) => ctx.db.get(connectionId)))!;
  expect(first.nextSyncAt).toBe(Date.parse("2026-09-25T13:00Z"));
  await adminClient.mutation(api.abeka.updateSchedule, {
    schoolId,
    schedule: { ...dailySchedule, mode: "manual" },
  });
  expect(
    (await t.run((ctx) => ctx.db.system.get(first.scheduledSyncId!)))?.state
      .kind,
  ).toBe("canceled");
  vi.setSystemTime(first.nextSyncAt!);
  await t.mutation(internal.abekaSync.runScheduled, {
    connectionId,
    generation: first.syncScheduleGeneration!,
  });
  const state = await adminClient.query(api.abeka.status, { schoolId });
  expect(state.connection?.scheduledSyncId).toBeUndefined();
  expect(state.connection?.nextSyncAt).toBeUndefined();
  expect(state.schedule?.mode).toBe("manual");
  expect(request).not.toHaveBeenCalled();
  expect(
    await t.run(async (ctx) => ({
      students: await ctx.db.query("abekaStudents").collect(),
      progress: await ctx.db.query("abekaProgress").collect(),
    })),
  ).toEqual(before);
});

test("schedule changes validate admin, timezone, time and weekday without contacting Abeka", async () => {
  const { t, adminClient, schoolId } = await setup();
  await expect(
    adminClient.mutation(api.abeka.updateSchedule, {
      schoolId,
      schedule: dailySchedule,
    }),
  ).rejects.toThrow("INVALID_TIME_ZONE");
  await adminClient.mutation(api.abeka.updateSchedule, {
    schoolId,
    schedule: { ...dailySchedule, mode: "manual" },
  });
  for (const subject of ["principal", "student", "other-admin"]) {
    await expect(
      t.withIdentity({ subject }).mutation(api.abeka.updateSchedule, {
        schoolId,
        schedule: dailySchedule,
      }),
    ).rejects.toThrow();
  }
  for (const schedule of [
    { ...dailySchedule, time: "24:00" },
    { ...dailySchedule, weekday: 7 },
    { ...dailySchedule, weekday: 1.5 },
  ]) {
    await expect(
      adminClient.mutation(api.abeka.updateSchedule, { schoolId, schedule }),
    ).rejects.toThrow("INVALID_SYNC_SCHEDULE");
  }
});

test("institution timezone changes reschedule the same wall time and cancel the old job", async () => {
  const { t, adminClient, schoolId, connectionId } = await scheduleSetup();
  await adminClient.mutation(api.abeka.updateSchedule, {
    schoolId,
    schedule: dailySchedule,
  });
  const before = (await t.run((ctx) => ctx.db.get(connectionId)))!;
  await adminClient.mutation(api.schools.updateInstitutionSettings, {
    id: schoolId,
    name: "School",
    timeZone: "America/Tegucigalpa",
  });
  const after = (await t.run((ctx) => ctx.db.get(connectionId)))!;
  expect(after.nextSyncAt).toBe(Date.parse("2026-09-25T14:00Z"));
  expect(
    (await t.run((ctx) => ctx.db.system.get(before.scheduledSyncId!)))?.state
      .kind,
  ).toBe("canceled");
});

test("calendar end changes and deletion pause schedules without silently switching academic periods", async () => {
  const { t, adminClient, schoolId, connectionId, periodId } =
    await scheduleSetup();
  await adminClient.mutation(api.abeka.updateSchedule, {
    schoolId,
    schedule: dailySchedule,
  });
  await adminClient.mutation(api.academicSettings.createPeriod, {
    schoolId,
    name: "Next year",
    startDate: "2027-09-01",
    endDate: "2027-12-01",
  });
  await adminClient.mutation(api.academicSettings.updatePeriod, {
    id: periodId,
    name: "Current year",
    startDate: "2026-09-01",
    endDate: "2026-09-24",
  });
  expect(
    (await t.run((ctx) => ctx.db.get(connectionId)))?.nextSyncAt,
  ).toBeUndefined();
  expect(
    (await t.run((ctx) => ctx.db.get(connectionId)))?.syncAcademicPeriodId,
  ).toBe(periodId);
  await adminClient.mutation(api.academicSettings.removePeriod, {
    id: periodId,
  });
  expect(
    (await adminClient.query(api.abeka.status, { schoolId })).schedulePeriod,
  ).toBeNull();
  expect(
    (await t.run((ctx) => ctx.db.get(connectionId)))?.nextSyncAt,
  ).toBeUndefined();
});

test("missing period pauses scheduling; creating the period arms it and opting out removes the bound", async () => {
  const { t, adminClient, schoolId, connectionId, periodId } =
    await scheduleSetup();
  await adminClient.mutation(api.academicSettings.removePeriod, {
    id: periodId,
  });
  await adminClient.mutation(api.abeka.updateSchedule, {
    schoolId,
    schedule: dailySchedule,
  });
  expect(
    (await t.run((ctx) => ctx.db.get(connectionId)))?.nextSyncAt,
  ).toBeUndefined();
  await adminClient.mutation(api.academicSettings.createPeriod, {
    schoolId,
    name: "Upcoming",
    startDate: "2026-10-01",
    endDate: "2026-10-02",
  });
  expect((await t.run((ctx) => ctx.db.get(connectionId)))?.nextSyncAt).toBe(
    Date.parse("2026-10-01T13:00Z"),
  );
  await adminClient.mutation(api.abeka.updateSchedule, {
    schoolId,
    schedule: { ...dailySchedule, stopAtPeriodEnd: false },
  });
  const connection = (await t.run((ctx) => ctx.db.get(connectionId)))!;
  expect(connection.syncAcademicPeriodId).toBeUndefined();
  expect(connection.nextSyncAt).toBe(Date.parse("2026-09-25T13:00Z"));
});

test("late scheduled invocation after the academic end makes no external requests", async () => {
  const { t, adminClient, schoolId, connectionId, runId } =
    await scheduleSetup();
  await adminClient.mutation(api.abeka.updateSchedule, {
    schoolId,
    schedule: dailySchedule,
  });
  const connection = (await t.run((ctx) => ctx.db.get(connectionId)))!;
  vi.setSystemTime(new Date("2026-10-01T12:00Z"));
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await t.mutation(internal.abekaSync.runScheduled, {
    connectionId,
    generation: connection.syncScheduleGeneration!,
  });
  expect((await t.run((ctx) => ctx.db.get(connectionId)))?.latestRunId).toBe(
    runId,
  );
  expect(
    (await t.run((ctx) => ctx.db.get(connectionId)))?.nextSyncAt,
  ).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
});

test.each(["manual", "weekdays"] as const)(
  "full sync completion honors current %s setting, not seven days after the manual update",
  async (mode) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T12:00Z"));
    const { t, adminClient, schoolId, connectionId, runId } =
      await renewalSetup();
    await t.run(async (ctx) => {
      await ctx.db.patch(schoolId, { timeZone: "America/Bogota" });
      await ctx.db.patch(runId, { status: "completed" });
    });
    await adminClient.mutation(api.abeka.updateSchedule, {
      schoolId,
      schedule: { ...dailySchedule, mode, stopAtPeriodEnd: false },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => reportResponse(url)),
    );
    await adminClient.mutation(api.abeka.syncNow, { schoolId });
    await finishCurrentSync(t);
    const state = await adminClient.query(api.abeka.status, { schoolId });
    expect(state.run?.status).toBe("completed");
    expect(state.connection?.nextSyncAt).toBe(
      mode === "manual" ? undefined : Date.parse("2026-09-25T13:00Z"),
    );
    expect(
      (await t.run((ctx) => ctx.db.get(connectionId)))?.syncSchedule?.mode,
    ).toBe(mode);
  },
);

test("bounded schedule initialization preserves the old local weekday/time and is idempotent", async () => {
  const { t, adminClient, schoolId, connectionId, periodId } =
    await scheduleSetup();
  await t.run((ctx) =>
    setAbekaNextSync(ctx, connectionId, Date.parse("2026-09-29T15:29:58Z")),
  );
  const before = await t.run((ctx) => ctx.db.query("abekaStudents").collect());
  const args = { paginationOpts: { numItems: 50, cursor: null } };
  expect(
    (await t.mutation(internal.abekaSync.initializeSchedules, args)).updated,
  ).toBe(1);
  expect(
    (await t.mutation(internal.abekaSync.initializeSchedules, args)).updated,
  ).toBe(0);
  const state = await adminClient.query(api.abeka.status, { schoolId });
  expect(state.schedule).toEqual({
    mode: "weekly",
    weekday: 2,
    time: "10:29",
    stopAtPeriodEnd: true,
  });
  expect(state.connection?.syncAcademicPeriodId).toBe(periodId);
  expect(state.connection?.nextSyncAt).toBe(Date.parse("2026-09-29T15:29Z"));
  expect(await t.run((ctx) => ctx.db.query("abekaStudents").collect())).toEqual(
    before,
  );
});

test("academic lookup supports legacy numeric dates alongside civil dates", async () => {
  const { t, schoolId, periodId } = await scheduleSetup();
  await t.run((ctx) =>
    ctx.db.patch(periodId, {
      startDate: Date.parse("2026-09-01T00:00Z"),
      endDate: Date.parse("2026-09-30T00:00Z"),
    }),
  );
  expect(
    (
      await t.run((ctx) =>
        selectAbekaPeriod(ctx, schoolId, "America/Bogota", Date.now()),
      )
    )?._id,
  ).toBe(periodId);
});

test("finishing a deferred student sync keeps an already due automatic update", async () => {
  const { t, adminClient, schoolId, connectionId } = await scheduleSetup();
  await adminClient.mutation(api.abeka.updateSchedule, {
    schoolId,
    schedule: dailySchedule,
  });
  vi.setSystemTime(new Date("2026-09-25T13:01Z"));
  await t.run((ctx) =>
    refreshAbekaSchedule(ctx, connectionId, undefined, true),
  );
  expect((await t.run((ctx) => ctx.db.get(connectionId)))?.nextSyncAt).toBe(
    Date.parse("2026-09-25T13:00Z"),
  );
});

test("successful login probe returns metadata without modifying the connection or saving secrets", async () => {
  const { t, adminClient, schoolId } = await setup();
  vi.stubEnv("ABEKA_LOGIN_PROBE_ENABLED", "true");
  const before = await t.run((ctx) =>
    ctx.db.query("abekaConnections").collect(),
  );
  vi.spyOn(loginProbe, "probeAbekaLogin").mockResolvedValue({
    externalSchoolId: "123",
    externalSchoolName: "Example",
    students: 2,
  });
  const response = await adminClient.fetch(
    `/abeka-login-probe?schoolId=${schoolId}`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "test",
        password: "private-test-password",
      }),
    },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({
    verified: true,
    externalSchoolId: "123",
    externalSchoolName: "Example",
    students: 2,
  });
  expect(
    await t.run((ctx) => ctx.db.query("abekaConnections").collect()),
  ).toEqual(before);
  expect(await t.run((ctx) => ctx.db.query("abekaSecrets").collect())).toEqual(
    [],
  );
});

const rosterHtml =
  '<select id="ddlSchools"><option selected value="123">Example</option></select><table id="gdvUsers"><tr><td id="lbldisplayName">Provider Student</td><td id="lblUserType">Student</td><td><input id="hidLoginId" value="42"><ul id="bulUserStatus"><li>1</li></ul></td></tr></table>';

function reportResponse(url: string) {
  if (url.endsWith("StreamingDetails.aspx")) return new Response(rosterHtml);
  if (url.includes("?loginId="))
    return new Response(
      '<input id="hidLoginId" value="42"><select id="ddlClasses"><option value="117">Math</option></select>',
    );
  return Response.json({
    d: [
      JSON.stringify({
        SessionName: "Math",
        LessonDisplayName: "Lesson 1",
        PercentDisplay: "100%",
        SegmentId: "1",
        SubscriptionItem: "2",
        SubscriptionNumber: "3",
        LessonLengthDisplay: "20 Mins 0 Secs",
        LessonProgressDisplay: "21 Mins 0 Secs",
        Completed: "Yes",
        LastViewed: "09/24/2026",
      }),
    ],
  });
}

const testKey = "ab".repeat(32);
const testCredentials = {
  username: "test-account",
  password: "private-test-password",
};
const verifiedLogin = {
  cookie: "session=renewed",
  externalSchoolId: "123",
  externalSchoolName: "Example",
  students: 1,
};
const credentialHeaders = {
  Authorization: "Bearer test",
  "Content-Type": "application/json",
};

async function renewalSetup() {
  const fixture = await setup();
  vi.stubEnv("ABEKA_SESSION_ENCRYPTION_KEY", testKey);
  const encrypted = await encryptSession(
    "session=expired",
    testKey,
    fixture.schoolId,
  );
  const credentials = await encryptCredentials(
    testCredentials,
    testKey,
    fixture.schoolId,
  );
  await fixture.t.run(async (ctx) => {
    await ctx.db.insert("abekaSecrets", {
      connectionId: fixture.connectionId,
      encrypted,
      credentials,
    });
    await ctx.db.patch(fixture.runId, { status: "running" });
  });
  return fixture;
}

test("credential connect verifies first and persists only encrypted secrets", async () => {
  vi.useFakeTimers();
  const { t, adminClient, schoolId } = await setup();
  vi.stubEnv("ABEKA_SESSION_ENCRYPTION_KEY", testKey);
  const login = vi
    .spyOn(loginProbe, "signInAbeka")
    .mockResolvedValue(verifiedLogin);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(rosterHtml)),
  );
  const response = await adminClient.fetch(
    `/abeka-credentials?schoolId=${schoolId}`,
    {
      method: "POST",
      headers: credentialHeaders,
      body: JSON.stringify(testCredentials),
    },
  );
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ accepted: true });
  expect(login).toHaveBeenCalledTimes(1);
  const secrets = await t.run((ctx) => ctx.db.query("abekaSecrets").collect());
  expect(secrets).toHaveLength(1);
  expect(JSON.stringify(secrets)).not.toContain(testCredentials.password);
  expect(JSON.stringify(secrets)).not.toContain(testCredentials.username);
  expect(
    await decryptCredentials(secrets[0].credentials!, testKey, schoolId),
  ).toEqual(testCredentials);
  expect(await decryptSession(secrets[0].encrypted!, testKey, schoolId)).toBe(
    verifiedLogin.cookie,
  );
  await finishCurrentSync(t);
  const state = await adminClient.query(api.abeka.status, { schoolId });
  expect(state.hasCredentials).toBe(true);
  expect(JSON.stringify(state)).not.toContain("ciphertext");
  expect(state.run?.status).toBe("completed");
});

test("credential endpoint checks auth, permissions and body bounds before sign-in", async () => {
  const { t, adminClient, schoolId } = await setup();
  vi.stubEnv("ABEKA_SESSION_ENCRYPTION_KEY", testKey);
  const login = vi.spyOn(loginProbe, "signInAbeka");
  const path = `/abeka-credentials?schoolId=${schoolId}`;
  expect(
    (await t.fetch(path, { method: "POST", headers: credentialHeaders }))
      .status,
  ).toBe(401);
  for (const subject of ["principal", "student", "other-admin"]) {
    const response = await t.withIdentity({ subject }).fetch(path, {
      method: "POST",
      headers: credentialHeaders,
      body: JSON.stringify(testCredentials),
    });
    expect(response.status).toBe(400);
    await expect(
      t
        .withIdentity({ subject })
        .mutation(api.abeka.renewSession, { schoolId }),
    ).rejects.toThrow();
  }
  for (const body of [
    "null",
    "bad-json",
    JSON.stringify({ ...testCredentials, password: "x".repeat(9000) }),
  ]) {
    expect(
      (
        await adminClient.fetch(path, {
          method: "POST",
          headers: credentialHeaders,
          body,
        })
      ).status,
    ).toBe(400);
  }
  expect(login).not.toHaveBeenCalled();
});

test("failed or wrong-school credential replacement preserves the current connection", async () => {
  const { t, adminClient, schoolId } = await renewalSetup();
  const before = await t.run(async (ctx) => ({
    connections: await ctx.db.query("abekaConnections").collect(),
    secrets: await ctx.db.query("abekaSecrets").collect(),
  }));
  const login = vi
    .spyOn(loginProbe, "signInAbeka")
    .mockRejectedValue(new Error(testCredentials.password));
  for (const wrongSchool of [false, true]) {
    if (wrongSchool)
      login.mockResolvedValue({ ...verifiedLogin, externalSchoolId: "999" });
    const response = await adminClient.fetch(
      `/abeka-credentials?schoolId=${schoolId}`,
      {
        method: "POST",
        headers: credentialHeaders,
        body: JSON.stringify(testCredentials),
      },
    );
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(testCredentials.password);
    expect(
      await t.run(async (ctx) => ({
        connections: await ctx.db.query("abekaConnections").collect(),
        secrets: await ctx.db.query("abekaSecrets").collect(),
      })),
    ).toEqual(before);
  }
});

test("disconnect during credential verification cannot be undone by the late response", async () => {
  const { t, adminClient, schoolId } = await setup();
  vi.stubEnv("ABEKA_SESSION_ENCRYPTION_KEY", testKey);
  vi.spyOn(loginProbe, "signInAbeka").mockImplementation(async () => {
    await adminClient.mutation(api.abeka.disconnect, { schoolId });
    return verifiedLogin;
  });
  const response = await adminClient.fetch(
    `/abeka-credentials?schoolId=${schoolId}`,
    {
      method: "POST",
      headers: credentialHeaders,
      body: JSON.stringify(testCredentials),
    },
  );
  expect(response.status).toBe(400);
  expect(
    (await adminClient.query(api.abeka.status, { schoolId })).connection
      ?.status,
  ).toBe("disconnected");
  expect(await t.run((ctx) => ctx.db.query("abekaSecrets").collect())).toEqual(
    [],
  );
});

test("expired session is renewed once and the failed report read is retried", async () => {
  const { t, adminClient, schoolId, runId } = await renewalSetup();
  const login = vi
    .spyOn(loginProbe, "signInAbeka")
    .mockResolvedValue(verifiedLogin);
  const request = vi.fn(async (_url: string, init: RequestInit) =>
    new Headers(init.headers).get("Cookie") === "session=renewed"
      ? new Response(rosterHtml)
      : new Response(null, { status: 302 }),
  );
  vi.stubGlobal("fetch", request);
  expect(await t.action(internal.abekaActions.roster, { runId })).toBe(true);
  expect(login).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(2);
  expect(
    (await adminClient.query(api.abeka.status, { schoolId })).connection
      ?.status,
  ).toBe("connected");
  // Expiring again in the same run must not submit the password a second time.
  request.mockImplementation(async () => new Response(null, { status: 302 }));
  expect(await t.action(internal.abekaActions.roster, { runId })).toBe(false);
  expect(login).toHaveBeenCalledTimes(1);
  const state = await adminClient.query(api.abeka.status, { schoolId });
  expect(state.connection?.status).toBe("needs_reconnect");
  expect(state.connection?.nextSyncAt).toBeUndefined();
  expect(state.hasCredentials).toBe(true);
});

test("failed renewal stops weekly work, discards the expired session and keeps encrypted credentials", async () => {
  const { t, adminClient, schoolId, runId } = await renewalSetup();
  const login = vi
    .spyOn(loginProbe, "signInAbeka")
    .mockRejectedValue(new loginProbe.LoginProbeError("SIGN_IN_REJECTED"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 302 })),
  );
  expect(await t.action(internal.abekaActions.roster, { runId })).toBe(false);
  expect(
    (await adminClient.query(api.abeka.status, { schoolId })).connection
      ?.scheduledSyncId,
  ).toBeUndefined();
  expect(login).toHaveBeenCalledTimes(1);
  const state = await adminClient.query(api.abeka.status, { schoolId });
  expect(state.connection?.status).toBe("needs_reconnect");
  expect(state.connection?.nextSyncAt).toBeUndefined();
  const secrets = await t.run((ctx) => ctx.db.query("abekaSecrets").collect());
  expect(secrets[0].encrypted).toBeUndefined();
  expect(secrets[0].credentials).toBeDefined();
  await expect(
    adminClient.mutation(api.abeka.renewSession, { schoolId }),
  ).rejects.toThrow("SYNC_COOLDOWN");
});

test("renewal claims are single-use and late renewal commits are revision-fenced", async () => {
  const { t, runId, connectionId } = await renewalSetup();
  expect(
    await t.mutation(internal.abekaSync.claimRenewal, { runId }),
  ).not.toBeNull();
  expect(
    await t.mutation(internal.abekaSync.claimRenewal, { runId }),
  ).toBeNull();
  await t.run((ctx) => ctx.db.patch(connectionId, { revision: 2 }));
  expect(
    await t.mutation(internal.abekaSync.commitRenewal, {
      runId,
      encrypted: { iv: "00", ciphertext: "00" },
      externalSchoolId: "123",
    }),
  ).toBe(false);
});

test("renewal cannot replace a confirmed institution with another account", async () => {
  const { t, adminClient, schoolId, runId } = await renewalSetup();
  vi.spyOn(loginProbe, "signInAbeka").mockResolvedValue({
    ...verifiedLogin,
    externalSchoolId: "999",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 302 })),
  );
  expect(await t.action(internal.abekaActions.roster, { runId })).toBe(false);
  expect(
    (await adminClient.query(api.abeka.status, { schoolId })).connection
      ?.errorCode,
  ).toBe("SCHOOL_MISMATCH");
  expect(await t.run((ctx) => ctx.db.query("abekaSecrets").collect())).toEqual(
    [],
  );
});

test("manual renewal uses saved credentials and completes the existing sync workflow", async () => {
  vi.useFakeTimers();
  const { t, adminClient, schoolId, runId, connectionId } =
    await renewalSetup();
  await t.run(async (ctx) => {
    await ctx.db.patch(runId, { status: "failed" });
    await ctx.db.patch(connectionId, { status: "needs_reconnect" });
  });
  const login = vi
    .spyOn(loginProbe, "signInAbeka")
    .mockResolvedValue(verifiedLogin);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(rosterHtml)),
  );
  await adminClient.mutation(api.abeka.renewSession, { schoolId });
  await finishCurrentSync(t);
  expect(login).toHaveBeenCalledTimes(1);
  const state = await adminClient.query(api.abeka.status, { schoolId });
  expect(state.run?.status).toBe("completed");
  expect(state.connection?.status).toBe("connected");
  expect(state.connection?.nextSyncAt).toBeGreaterThan(
    state.connection!.lastSyncedAt!,
  );
});

test("student profiles expose only connected, linked course progress and react to replacement snapshots", async () => {
  const {
    t,
    adminClient,
    admin,
    schoolId,
    otherSchool,
    campusId,
    student,
    studentId,
    secondId,
    connectionId,
    runId,
  } = await setup();
  const fixture = await t.run(async (ctx) => {
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Math",
      schoolId,
      isActive: true,
      createdAt: 1,
      createdBy: admin,
    });
    const classId = await ctx.db.insert("classes", {
      name: "Math A",
      campusId,
      curriculumId,
      students: [student],
      isActive: true,
      createdAt: 1,
      createdBy: admin,
    });
    const unlinkedClass = await ctx.db.insert("classes", {
      name: "Math B",
      campusId,
      curriculumId,
      students: [student],
      isActive: true,
      createdAt: 1,
      createdBy: admin,
    });
    const courseId = await ctx.db.insert("abekaCourses", {
      connectionId,
      subjectId: "117",
      name: "Math",
      totalLessons: 170,
      available: true,
    });
    const linkId = await ctx.db.insert("abekaCourseLinks", {
      connectionId,
      courseId,
      classId,
    });
    await ctx.db.patch(studentId, { userId: student });
    const progressId = await ctx.db.insert("abekaProgress", {
      studentId,
      subjectId: "117",
      subjectName: "Math",
      runId,
      syncedAt: 1,
      lessons: [
        { ...lessonSnapshot, completed: true },
        { ...lessonSnapshot, lessonNumber: 2, completed: false, percentage: 0 },
      ],
    });
    // Another student's snapshot must never affect the linked student's percentage.
    await ctx.db.insert("abekaProgress", {
      studentId: secondId,
      subjectId: "117",
      subjectName: "Math",
      runId,
      syncedAt: 1,
      lessons: [{ ...lessonSnapshot, completed: true }],
    });
    return { classId, unlinkedClass, courseId, linkId, progressId };
  });
  const args = { now: Date.now(), studentId: student, orgSlug: "north" };
  const read = () =>
    adminClient.query(api.student.getStudentDashboardStats, args);
  const ring = async () =>
    (await read())?.classes.find((c) => c.classId === fixture.classId)
      ?.abekaProgress;
  const detailArgs = {
    studentId: student,
    orgSlug: "north",
    classId: fixture.classId,
  };
  const detail = () =>
    adminClient.query(api.student.getAbekaCourseReport, detailArgs);
  const expectedReport = {
    subjectName: "Math",
    syncedAt: 1,
    lessons: [
      { ...lessonSnapshot, completed: true },
      { ...lessonSnapshot, lessonNumber: 2, completed: false, percentage: 0 },
    ].map(({ lessonNumber, percentage, completed, lastViewed }) => ({
      lessonNumber,
      percentage,
      completed,
      lastViewed,
    })),
  };
  expect(await detail()).toEqual(expectedReport);
  expect(
    await t
      .withIdentity({ subject: "student" })
      .query(api.student.getAbekaCourseReport, { classId: fixture.classId }),
  ).toEqual(expectedReport);
  expect(
    await t
      .withIdentity({ subject: "principal" })
      .query(api.student.getAbekaCourseReport, detailArgs),
  ).toEqual(expectedReport);
  const teacherRole = await t.run(async (ctx) => {
    const teacher = await ctx.db.insert("users", {
      clerkId: "teacher",
      firstName: "Teacher",
      lastName: "Test",
      fullName: "Teacher Test",
      isActive: true,
      createdAt: 1,
    });
    return ctx.db.insert("roleAssignments", {
      userId: teacher,
      orgId: campusId,
      orgType: "campus",
      role: "teacher",
      assignedAt: 1,
    });
  });
  expect(
    await t
      .withIdentity({ subject: "teacher" })
      .query(api.student.getAbekaCourseReport, detailArgs),
  ).toEqual(expectedReport);
  await t.run((ctx) => ctx.db.delete(teacherRole));
  expect(
    await t
      .withIdentity({ subject: "teacher" })
      .query(api.student.getAbekaCourseReport, detailArgs),
  ).toBeNull();
  for (const subject of ["outsider", "other-admin"]) {
    expect(
      await t
        .withIdentity({ subject })
        .query(api.student.getAbekaCourseReport, detailArgs),
    ).toBeNull();
  }
  expect(
    await t.query(api.student.getAbekaCourseReport, detailArgs),
  ).toBeNull();
  expect(
    await adminClient.query(api.student.getAbekaCourseReport, {
      ...detailArgs,
      classId: fixture.unlinkedClass,
    }),
  ).toBeNull();
  await t.run((ctx) => ctx.db.patch(fixture.classId, { students: [] }));
  expect(await detail()).toBeNull();
  await t.run((ctx) => ctx.db.patch(fixture.classId, { students: [student] }));
  expect(await ring()).toEqual({
    completed: 1,
    total: 2,
    percentage: 50,
    syncedAt: 1,
  });
  expect(
    (await read())?.classes.find((c) => c.classId === fixture.unlinkedClass)
      ?.abekaProgress,
  ).toBeNull();
  expect(
    (
      await t
        .withIdentity({ subject: "student" })
        .query(api.student.getStudentDashboardStats, { now: args.now })
    )?.classes[0].abekaProgress,
  ).toEqual({ completed: 1, total: 2, percentage: 50, syncedAt: 1 });
  expect(await t.query(api.student.getStudentDashboardStats, args)).toBeNull();
  expect(
    await t
      .withIdentity({ subject: "outsider" })
      .query(api.student.getStudentDashboardStats, args),
  ).toBeNull();
  expect(
    await t
      .withIdentity({ subject: "other-admin" })
      .query(api.student.getStudentDashboardStats, args),
  ).toBeNull();

  await t.run((ctx) =>
    ctx.db.patch(fixture.progressId, {
      lessons: [{ ...lessonSnapshot, completed: false, percentage: 0 }],
      syncedAt: 2,
    }),
  );
  expect(await ring()).toEqual({
    completed: 0,
    total: 1,
    percentage: 0,
    syncedAt: 2,
  });
  expect(await detail()).toMatchObject({
    syncedAt: 2,
    lessons: [{ percentage: 0 }],
  });
  await t.run((ctx) =>
    ctx.db.patch(fixture.progressId, {
      lessons: [{ ...lessonSnapshot, completed: true }],
    }),
  );
  expect(await ring()).toEqual({
    completed: 1,
    total: 1,
    percentage: 100,
    syncedAt: 2,
  });
  for (const { percentages, expected } of [
    {
      percentages: Array.from({ length: 170 }, (_, i) => (i === 8 ? 54 : 0)),
      expected: 0.32,
    },
    { percentages: [100, 54, 0], expected: 51.33 },
    { percentages: [12.5, 37.5], expected: 25 },
    { percentages: [0, 0], expected: 0 },
    { percentages: [100, 100], expected: 100 },
  ]) {
    await t.run((ctx) =>
      ctx.db.patch(fixture.progressId, {
        lessons: percentages.map((percentage, i) => ({
          ...lessonSnapshot,
          lessonNumber: i + 1,
          percentage,
          completed: percentage === 100,
        })),
      }),
    );
    expect(await ring()).toEqual({
      completed: percentages.filter((p) => p === 100).length,
      total: percentages.length,
      percentage: expected,
      syncedAt: 2,
    });
  }
  for (const status of [
    "disconnected",
    "needs_reconnect",
    "error",
    "needs_confirmation",
    "connecting",
  ] as const) {
    await t.run((ctx) => ctx.db.patch(connectionId, { status }));
    expect(await ring()).toBeNull();
    expect(await detail()).toBeNull();
  }
  await t.run((ctx) =>
    ctx.db.patch(connectionId, { status: "connected", confirmed: false }),
  );
  expect(await ring()).toBeNull();
  await t.run((ctx) => ctx.db.patch(connectionId, { confirmed: true }));
  expect(await ring()).not.toBeNull();
  await t.run((ctx) => ctx.db.patch(studentId, { userId: undefined }));
  expect(await ring()).toBeNull();
  expect(await detail()).toBeNull();
  await t.run((ctx) => ctx.db.patch(studentId, { userId: student }));
  await t.run((ctx) => ctx.db.patch(fixture.courseId, { available: false }));
  expect(await ring()).toBeNull();
  expect(await detail()).toBeNull();
  await t.run((ctx) =>
    ctx.db.patch(fixture.courseId, { available: true, subjectId: "missing" }),
  );
  expect(await ring()).toBeNull();
  await t.run((ctx) => ctx.db.patch(fixture.courseId, { subjectId: "117" }));
  await t.run((ctx) =>
    ctx.db.patch(fixture.classId, { schoolId: otherSchool }),
  );
  expect(await ring()).toBeNull();
  await t.run((ctx) => ctx.db.patch(fixture.classId, { schoolId: schoolId }));
  await t.run((ctx) => ctx.db.delete(fixture.linkId));
  expect(await ring()).toBeNull();
});

async function setup() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  rateLimiter.register(t);
  const ids = await t.run(async (ctx) => {
    const users = [];
    for (const name of [
      "admin",
      "principal",
      "student",
      "outsider",
      "other-admin",
    ])
      users.push(
        await ctx.db.insert("users", {
          clerkId: name,
          firstName: name,
          lastName: "Test",
          fullName: `${name} Test`,
          isActive: true,
          createdAt: 1,
        }),
      );
    const [admin, principal, student, outsider, otherAdmin] = users;
    const schoolId = await ctx.db.insert("schools", {
      name: "School",
      slug: "school",
      isActive: true,
      createdAt: 1,
      createdBy: admin,
    });
    const otherSchool = await ctx.db.insert("schools", {
      name: "Other",
      slug: "other",
      isActive: true,
      createdAt: 1,
      createdBy: otherAdmin,
    });
    const campusId = await ctx.db.insert("campuses", {
      name: "North",
      slug: "north",
      schoolId,
      isActive: true,
      createdAt: 1,
      createdBy: admin,
    });
    await ctx.db.insert("roleAssignments", {
      userId: admin,
      orgId: schoolId,
      orgType: "school",
      role: "admin",
      assignedAt: 1,
    });
    await ctx.db.insert("roleAssignments", {
      userId: otherAdmin,
      orgId: otherSchool,
      orgType: "school",
      role: "admin",
      assignedAt: 1,
    });
    await ctx.db.insert("roleAssignments", {
      userId: principal,
      orgId: campusId,
      orgType: "campus",
      role: "principal",
      schoolId,
      assignedAt: 1,
    });
    await ctx.db.insert("roleAssignments", {
      userId: student,
      orgId: campusId,
      orgType: "campus",
      role: "student",
      assignedAt: 1,
    }); // Legacy membership: no denormalized school.
    await ctx.db.insert("roleAssignments", {
      userId: outsider,
      orgId: otherSchool,
      orgType: "school",
      role: "student",
      assignedAt: 1,
    });
    const connectionId = await ctx.db.insert("abekaConnections", {
      schoolId,
      status: "connected",
      revision: 1,
      confirmed: true,
      connectedBy: admin,
      externalSchoolId: "123",
    });
    const runId = await ctx.db.insert("abekaSyncRuns", {
      connectionId,
      revision: 1,
      status: "completed",
      startedAt: 1,
      studentsSynced: 0,
    });
    await ctx.db.patch(connectionId, {
      latestRunId: runId,
      rosterRunId: runId,
    });
    const studentId = await ctx.db.insert("abekaStudents", {
      connectionId,
      name: "Provider Student",
      loginId: "42",
      rosterRunId: runId,
    });
    const secondId = await ctx.db.insert("abekaStudents", {
      connectionId,
      name: "Provider Second",
      loginId: "43",
      rosterRunId: runId,
    });
    return {
      schoolId,
      otherSchool,
      campusId,
      connectionId,
      runId,
      studentId,
      secondId,
      student,
      outsider,
      admin,
    };
  });
  return { t, ...ids, adminClient: t.withIdentity({ subject: "admin" }) };
}

test("outbound permits share one bucket across concurrent callers and do not burst", async () => {
  vi.useFakeTimers();
  const { t } = await setup();
  const permits = await Promise.all(
    Array.from({ length: 8 }, () =>
      t.mutation(internal.abekaSync.requestPermit, {}),
    ),
  );
  expect(permits.filter((p) => p.ok)).toHaveLength(1);
  expect(
    permits.filter((p) => !p.ok).every((p) => p.retryAfter === 1_000),
  ).toBe(true);
  vi.advanceTimersByTime(999);
  expect((await t.mutation(internal.abekaSync.requestPermit, {})).ok).toBe(
    false,
  );
  vi.advanceTimersByTime(1);
  expect((await t.mutation(internal.abekaSync.requestPermit, {})).ok).toBe(
    true,
  );
});

test("provider backoff applies to all callers, is never shortened, and preserves reports", async () => {
  vi.useFakeTimers();
  const { t } = await setup();
  const before = await t.run(async (ctx) => ({
    connections: await ctx.db.query("abekaConnections").collect(),
    students: await ctx.db.query("abekaStudents").collect(),
  }));
  await t.mutation(internal.abekaSync.pauseProvider, {
    until: Date.now() + 120_000,
  });
  await t.mutation(internal.abekaSync.pauseProvider, {
    until: Date.now() + 60_000,
  });
  vi.advanceTimersByTime(60_000);
  expect(await t.mutation(internal.abekaSync.requestPermit, {})).toMatchObject({
    ok: false,
    stopped: true,
    retryAfter: 60_000,
  });
  vi.advanceTimersByTime(60_000);
  expect((await t.mutation(internal.abekaSync.requestPermit, {})).ok).toBe(
    true,
  );
  expect(
    await t.run(async (ctx) => ({
      connections: await ctx.db.query("abekaConnections").collect(),
      students: await ctx.db.query("abekaStudents").collect(),
    })),
  ).toEqual(before);
});

const lessonSnapshot = {
  subjectName: "Math",
  lessonNumber: 1,
  percentage: 100,
  completed: true,
  lengthSeconds: 600,
  watchedSeconds: 700,
  lastViewed: "09/24/2026",
  segmentId: "1",
  subscriptionItem: "2",
  subscriptionNumber: "3",
};

async function linkedRunningSetup() {
  const fixture = await renewalSetup();
  await fixture.t.run(async (ctx) => {
    await ctx.db.patch(fixture.studentId, { userId: fixture.student });
  });
  return fixture;
}

test("progress replaces the provider snapshot, including decreases and removed lessons, without duplicates", async () => {
  const { t, adminClient, runId, studentId, connectionId } =
    await linkedRunningSetup();
  const args = { runId, studentId, subjectId: "117" };
  await t.mutation(internal.abekaSync.saveProgress, {
    ...args,
    lessons: [lessonSnapshot, { ...lessonSnapshot, lessonNumber: 2 }],
  });
  const before = await adminClient.query(api.abeka.progress, { studentId });
  const nextRunId = await t.run(async (ctx) => {
    await ctx.db.patch(runId, { status: "completed" });
    const next = await ctx.db.insert("abekaSyncRuns", {
      connectionId,
      revision: 1,
      status: "running",
      startedAt: Date.now(),
      studentsSynced: 0,
    });
    await ctx.db.patch(connectionId, { latestRunId: next, rosterRunId: next });
    await ctx.db.patch(studentId, { rosterRunId: next });
    return next;
  });
  const corrected = {
    ...lessonSnapshot,
    percentage: 9,
    completed: false,
    watchedSeconds: 54,
  };
  await t.mutation(internal.abekaSync.saveProgress, {
    ...args,
    runId: nextRunId,
    lessons: [corrected],
  });
  await t.mutation(internal.abekaSync.saveProgress, {
    ...args,
    runId: nextRunId,
    lessons: [corrected],
  });
  const after = await adminClient.query(api.abeka.progress, { studentId });
  expect(after).toHaveLength(1);
  expect(after[0]._id).toBe(before[0]._id);
  expect(after[0].lessons).toEqual([corrected]);
  expect(after[0].runId).toBe(nextRunId);
});

test("canceled or disconnected runs cannot obtain another outbound permit", async () => {
  const { t, adminClient, schoolId, runId } = await linkedRunningSetup();
  await adminClient.mutation(api.abeka.disconnect, { schoolId });
  expect(await t.mutation(internal.abekaSync.requestPermit, { runId })).toEqual(
    {
      ok: false,
      stopped: true,
      retryAfter: 0,
    },
  );
});

test("429 stops without retry, preserves progress and links, and pauses other institutions' traffic", async () => {
  const { t, adminClient, runId, studentId, schoolId } =
    await linkedRunningSetup();
  await t.mutation(internal.abekaSync.saveProgress, {
    runId,
    studentId,
    subjectId: "117",
    lessons: [lessonSnapshot],
  });
  const before = await adminClient.query(api.abeka.progress, { studentId });
  const studentBefore = await t.run((ctx) => ctx.db.get(studentId));
  const request = vi.fn(
    async () =>
      new Response(null, { status: 429, headers: { "Retry-After": "120" } }),
  );
  vi.stubGlobal("fetch", request);
  expect(
    await t.action(internal.abekaActions.progress, {
      runId,
      studentId,
      subjectId: "117",
    }),
  ).toBe(false);
  expect(request).toHaveBeenCalledTimes(1);
  expect(await adminClient.query(api.abeka.progress, { studentId })).toEqual(
    before,
  );
  expect(await t.run((ctx) => ctx.db.get(studentId))).toEqual(studentBefore);
  expect(
    (await adminClient.query(api.abeka.status, { schoolId })).run?.errorCode,
  ).toBe("PROVIDER_UNAVAILABLE");
  expect(await t.mutation(internal.abekaSync.requestPermit, {})).toMatchObject({
    ok: false,
    stopped: true,
  });
});

test("manual sync waits fifteen minutes and duplicate starts preserve the running workflow", async () => {
  vi.useFakeTimers();
  const { t, adminClient, schoolId, connectionId, runId } = await setup();
  await t.run((ctx) =>
    ctx.db.patch(connectionId, { lastAttemptAt: Date.now() }),
  );
  vi.advanceTimersByTime(ABEKA_MANUAL_SYNC_INTERVAL_MS - 1);
  await expect(
    adminClient.mutation(api.abeka.syncNow, { schoolId }),
  ).rejects.toThrow("SYNC_COOLDOWN");
  expect(
    (await adminClient.query(api.abeka.status, { schoolId })).run?._id,
  ).toBe(runId);
  vi.advanceTimersByTime(1);
  await adminClient.mutation(api.abeka.syncNow, { schoolId });
  const started = await adminClient.query(api.abeka.status, { schoolId });
  expect(started.run?.status).toBe("running");
  vi.advanceTimersByTime(ABEKA_MANUAL_SYNC_INTERVAL_MS);
  await adminClient.mutation(api.abeka.syncNow, { schoolId });
  expect(
    (await adminClient.query(api.abeka.status, { schoolId })).run?._id,
  ).toBe(started.run?._id);
  await finishCurrentSync(t);
});

test("only institution administrators can inspect, link or synchronize Abeka", async () => {
  const { t, schoolId, studentId, student, adminClient } = await setup();
  expect(
    (await adminClient.query(api.abeka.status, { schoolId })).connection
      ?.status,
  ).toBe("connected");
  for (const subject of ["principal", "student", "other-admin"]) {
    const client = t.withIdentity({ subject });
    await expect(
      client.query(api.abeka.status, { schoolId }),
    ).rejects.toThrow();
    await expect(
      client.query(api.abeka.progress, { studentId }),
    ).rejects.toThrow();
    await expect(
      client.mutation(api.abeka.linkStudent, { studentId, userId: student }),
    ).rejects.toThrow();
    await expect(
      client.mutation(api.abeka.syncNow, { schoolId }),
    ).rejects.toThrow();
    await expect(
      client.mutation(internal.abeka.authorizeConnection, { schoolId }),
    ).rejects.toThrow();
  }
  await expect(t.query(api.abeka.status, { schoolId })).rejects.toThrow();
});

test("student mapping rejects cross-school and duplicate links, derives legacy campus correctly", async () => {
  vi.useFakeTimers();
  const {
    t,
    adminClient,
    schoolId,
    campusId,
    studentId,
    secondId,
    student,
    outsider,
  } = await setup();
  await expect(
    adminClient.mutation(api.abeka.linkStudent, {
      studentId,
      userId: outsider,
    }),
  ).rejects.toThrow("INVALID_STUDENT");
  await adminClient.mutation(api.abeka.linkStudent, {
    studentId,
    userId: student,
  });
  await finishCurrentSync(t);
  await expect(
    adminClient.mutation(api.abeka.linkStudent, {
      studentId: secondId,
      userId: student,
    }),
  ).rejects.toThrow("ALREADY_LINKED");
  const result = await adminClient.query(api.abeka.students, {
    schoolId,
    paginationOpts: { numItems: 25, cursor: null },
  });
  expect(result.page[0]).toMatchObject({
    linkedName: "student Test",
    campusName: "North",
    campusId,
  });
  await adminClient.mutation(api.abeka.linkStudent, {
    studentId,
    userId: null,
  });
  expect(
    (
      await adminClient.query(api.abeka.students, {
        schoolId,
        paginationOpts: { numItems: 25, cursor: null },
      })
    ).page[0].linkedName,
  ).toBeNull();
});

test("candidate selector never lists another institution's campus", async () => {
  const { t, adminClient, schoolId, campusId, otherSchool, student } =
    await setup();
  const args = {
    schoolId,
    campusId,
    paginationOpts: { cursor: null, numItems: 50 },
  };
  expect(
    (await adminClient.query(api.abeka.studentCandidates, args)).page[0].id,
  ).toBe(student);
  await expect(
    t
      .withIdentity({ subject: "other-admin" })
      .query(api.abeka.studentCandidates, { ...args, schoolId: otherSchool }),
  ).rejects.toThrow("FORBIDDEN");
});

test("disconnect deletes encrypted session and fences all stale writes", async () => {
  const { t, adminClient, schoolId, connectionId, runId, studentId, student } =
    await setup();
  await t.run(async (ctx) => {
    await ctx.db.insert("abekaSecrets", {
      connectionId,
      encrypted: { iv: "01", ciphertext: "02" },
      credentials: { iv: "03", ciphertext: "04" },
    });
    await ctx.db.patch(runId, { status: "running" });
    await ctx.db.patch(studentId, { userId: student });
  });
  await adminClient.mutation(api.abeka.disconnect, { schoolId });
  expect(
    await t.mutation(internal.abekaSync.commitRenewal, {
      runId,
      encrypted: { iv: "00", ciphertext: "00" },
      externalSchoolId: "123",
    }),
  ).toBe(false);
  expect(await t.query(internal.abekaSync.credentials, { runId })).toBeNull();
  expect(
    await t.mutation(internal.abekaSync.saveRosterBatch, {
      runId,
      students: [{ loginId: "999", name: "Late" }],
    }),
  ).toBe(false);
  expect(await t.mutation(internal.abekaSync.commitRoster, { runId })).toBe(
    false,
  );
  expect(await t.run((ctx) => ctx.db.query("abekaSecrets").collect())).toEqual(
    [],
  );
  expect(
    (await adminClient.query(api.abeka.status, { schoolId })).connection
      ?.status,
  ).toBe("disconnected");
});

test("wrong Abeka institution stops the run and destroys the session", async () => {
  const { t, connectionId, runId, schoolId, adminClient } = await setup();
  await t.run(async (ctx) => {
    await ctx.db.patch(runId, { status: "running" });
    await ctx.db.insert("abekaSecrets", {
      connectionId,
      encrypted: { iv: "00", ciphertext: "00" },
    });
  });
  expect(
    await t.mutation(internal.abekaSync.identifySchool, {
      runId,
      externalSchoolId: "999",
      externalSchoolName: "Wrong School",
      unavailableStudents: 0,
    }),
  ).toBe(false);
  const result = await adminClient.query(api.abeka.status, { schoolId });
  expect(result.connection?.errorCode).toBe("SCHOOL_MISMATCH");
  expect(result.run?.status).toBe("failed");
  expect(await t.run((ctx) => ctx.db.query("abekaSecrets").collect())).toEqual(
    [],
  );
});

test("an unconfirmed institution can be corrected without importing its roster", async () => {
  const { t, connectionId, runId, schoolId, adminClient } = await setup();
  await t.run(async (ctx) => {
    await ctx.db.patch(connectionId, { confirmed: false });
    await ctx.db.patch(runId, { status: "running" });
  });
  expect(
    await t.mutation(internal.abekaSync.identifySchool, {
      runId,
      externalSchoolId: "999",
      externalSchoolName: "Corrected School",
      unavailableStudents: 0,
    }),
  ).toBe(false);
  const result = await adminClient.query(api.abeka.status, { schoolId });
  expect(result.connection?.externalSchoolId).toBe("999");
  expect(result.connection?.status).toBe("needs_confirmation");
  await expect(
    adminClient.mutation(api.abeka.confirm, {
      schoolId,
      externalSchoolId: "999",
    }),
  ).rejects.toThrow("SYNC_RUNNING");
});

test("cloud workflow uses encrypted session, imports linked progress and schedules next week", async () => {
  vi.useFakeTimers();
  const { t, adminClient, schoolId, connectionId, studentId, student } =
    await setup();
  const key = "ab".repeat(32);
  vi.stubEnv("ABEKA_SESSION_ENCRYPTION_KEY", key);
  await adminClient.mutation(api.abeka.linkStudent, {
    studentId,
    userId: student,
  });
  const requests: string[] = [];
  const requestTimes: number[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      requests.push(url);
      requestTimes.push(Date.now());
      expect(init.redirect).toBe("manual");
      expect((init.headers as Record<string, string>).Cookie).toBe(
        "session=test-only",
      );
      return reportResponse(url);
    }),
  );
  await adminClient.mutation(internal.abeka.saveSession, {
    schoolId,
    encrypted: await encryptSession("session=test-only", key, schoolId),
  });
  await finishCurrentSync(t);
  const status = await adminClient.query(api.abeka.status, { schoolId });
  expect(status.run?.status).toBe("completed");
  expect(status.run?.studentsSynced).toBe(1);
  expect(status.connection?.nextSyncAt).toBeGreaterThan(
    status.connection!.lastSyncedAt!,
  );
  expect(JSON.stringify(status)).not.toContain("ciphertext");
  expect(
    (await adminClient.query(api.abeka.progress, { studentId }))[0].lessons[0]
      .completed,
  ).toBe(true);
  expect(requests).toHaveLength(3);
  for (let i = 1; i < requestTimes.length; i++)
    expect(requestTimes[i] - requestTimes[i - 1]).toBeGreaterThanOrEqual(1_000);
  expect(
    await t.run((ctx) =>
      ctx.db
        .query("abekaSecrets")
        .withIndex("by_connection", (q) => q.eq("connectionId", connectionId))
        .unique(),
    ),
  ).not.toBeNull();
});

test.each([false, true])(
  "update data reuses a valid session and renews only an expired one (expired=%s)",
  async (expired) => {
    vi.useFakeTimers();
    const { t, adminClient, schoolId, runId, studentId, student } =
      await renewalSetup();
    await t.run(async (ctx) => {
      await ctx.db.patch(runId, { status: "completed" });
      await ctx.db.patch(studentId, { userId: student });
    });
    const login = vi
      .spyOn(loginProbe, "signInAbeka")
      .mockResolvedValue(verifiedLogin);
    const request = vi.fn(async (url: string, init: RequestInit) =>
      expired && new Headers(init.headers).get("Cookie") !== "session=renewed"
        ? new Response(null, { status: 302 })
        : reportResponse(url),
    );
    vi.stubGlobal("fetch", request);
    await adminClient.mutation(api.abeka.syncNow, { schoolId });
    await finishCurrentSync(t);
    expect(login).toHaveBeenCalledTimes(expired ? 1 : 0);
    expect(request).toHaveBeenCalledTimes(expired ? 4 : 3);
    const state = await adminClient.query(api.abeka.status, { schoolId });
    expect(state.run?.status).toBe("completed");
    expect(state.run?.forceRenewal).toBeFalsy();
    expect(state.run?.studentsSynced).toBe(1);
    expect(
      (await adminClient.query(api.abeka.progress, { studentId }))[0].lessons[0]
        .completed,
    ).toBe(true);
  },
);

test("update data can recover a missing session using stored credentials", async () => {
  vi.useFakeTimers();
  const { t, adminClient, schoolId, connectionId, runId } =
    await renewalSetup();
  await t.run(async (ctx) => {
    await ctx.db.patch(runId, { status: "failed" });
    await ctx.db.patch(connectionId, { status: "needs_reconnect" });
    const secret = await ctx.db.query("abekaSecrets").unique();
    await ctx.db.patch(secret!._id, { encrypted: undefined });
  });
  const login = vi
    .spyOn(loginProbe, "signInAbeka")
    .mockResolvedValue(verifiedLogin);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => reportResponse(url)),
  );
  await adminClient.mutation(api.abeka.syncNow, { schoolId });
  await finishCurrentSync(t);
  expect(login).toHaveBeenCalledTimes(1);
  expect(
    (await adminClient.query(api.abeka.status, { schoolId })).connection
      ?.status,
  ).toBe("connected");
});

test("link downloads only that student's progress, preserves the weekly schedule and reuses data when correcting the account", async () => {
  vi.useFakeTimers();
  const {
    t,
    adminClient,
    schoolId,
    connectionId,
    runId,
    studentId,
    secondId,
    student,
    admin,
  } = await renewalSetup();
  const nextSyncAt = Date.now() + 86_400_000;
  await t.run(async (ctx) => {
    await ctx.db.patch(runId, { status: "completed" });
    await ctx.db.patch(connectionId, { lastSyncedAt: 123, nextSyncAt });
  });
  const requestTimes: number[] = [];
  const request = vi.fn(async (url: string) => {
    requestTimes.push(Date.now());
    return reportResponse(url);
  });
  vi.stubGlobal("fetch", request);
  await adminClient.mutation(api.abeka.linkStudent, {
    studentId,
    userId: student,
  });
  const started = await adminClient.query(api.abeka.status, { schoolId });
  expect(started.run?.studentId).toBe(studentId);
  // Another student cannot be read or written through this targeted run.
  expect(
    await t.query(internal.abekaSync.studentContext, {
      runId: started.run!._id,
      studentId: secondId,
    }),
  ).toBeNull();
  await expect(
    adminClient.mutation(api.abeka.linkStudent, { studentId, userId: student }),
  ).rejects.toThrow("SYNC_RUNNING");
  await finishCurrentSync(t);
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[0][0]).toContain("?loginId=42");
  expect(request.mock.calls[1][0]).toContain("GetVideoLessonDetails");
  expect(requestTimes[1] - requestTimes[0]).toBeGreaterThanOrEqual(1_000);
  const state = await adminClient.query(api.abeka.status, { schoolId });
  expect(state.run?.status).toBe("completed");
  expect(state.run?.studentsSynced).toBe(1);
  expect(state.connection?.rosterRunId).toBe(runId);
  expect(state.connection?.lastSyncedAt).toBe(123);
  expect(state.connection?.nextSyncAt).toBe(nextSyncAt);
  const before = await adminClient.query(api.abeka.progress, { studentId });
  expect(before[0].lessons[0].completed).toBe(true);
  // A corrected Flexidual account does not change the provider identity or its data.
  await t.run((ctx) =>
    ctx.db.insert("roleAssignments", {
      userId: admin,
      orgType: "school",
      orgId: schoolId,
      role: "student",
      assignedAt: 1,
    }),
  );
  await adminClient.mutation(api.abeka.linkStudent, {
    studentId,
    userId: admin,
  });
  await adminClient.mutation(api.abeka.linkStudent, {
    studentId,
    userId: null,
  });
  await adminClient.mutation(api.abeka.linkStudent, {
    studentId,
    userId: student,
  });
  await finishCurrentSync(t);
  expect(request).toHaveBeenCalledTimes(2);
  expect(await adminClient.query(api.abeka.progress, { studentId })).toEqual(
    before,
  );
  expect(
    (await adminClient.query(api.abeka.status, { schoolId })).run?._id,
  ).toBe(started.run?._id);
});

test("failed initial student download preserves the link and weekly date without retrying on repeated saves", async () => {
  vi.useFakeTimers();
  const { t, adminClient, schoolId, connectionId, runId, studentId, student } =
    await renewalSetup();
  const nextSyncAt = Date.now() + 86_400_000;
  await t.run(async (ctx) => {
    await ctx.db.patch(runId, { status: "completed" });
    await ctx.db.patch(connectionId, { lastSyncedAt: 123, nextSyncAt });
  });
  const request = vi.fn(
    async () => new Response("Unavailable", { status: 500 }),
  );
  vi.stubGlobal("fetch", request);
  await adminClient.mutation(api.abeka.linkStudent, {
    studentId,
    userId: student,
  });
  await finishCurrentSync(t);
  const state = await adminClient.query(api.abeka.status, { schoolId });
  expect(state.run?.status).toBe("failed");
  expect(state.connection?.lastSyncedAt).toBe(123);
  expect(state.connection?.nextSyncAt).toBe(nextSyncAt);
  expect((await t.run((ctx) => ctx.db.get(studentId)))?.userId).toBe(student);
  await adminClient.mutation(api.abeka.linkStudent, {
    studentId,
    userId: student,
  });
  await finishCurrentSync(t);
  expect(request).toHaveBeenCalledTimes(1);
  expect(
    (await adminClient.query(api.abeka.status, { schoolId })).run?._id,
  ).toBe(state.run?._id);
});

function catalogResponse(url: string): Response | null {
  if (url.endsWith("ClassPermissions.aspx"))
    return new Response(
      '<select id="ddlSchools"><option value="123" selected>School</option></select><select id="ddlSubscriptions"><option value="4">ProTeach</option></select><a onclick=\'editPermissions("17", "Group");\'>Permissions</a>',
    );
  if (url.endsWith("GetGroupGrades"))
    return new Response('{"d":{"Grades":[{"GradeCode":12}]}}', {
      headers: { "content-type": "application/json" },
    });
  if (url.endsWith("GetGroupSubjects"))
    return new Response(
      '{"d":{"Subjects":[{"SubjectId":5298,"SubjectName":"English 12","TotalLessons":170,"Checked":false}]}}',
      { headers: { "content-type": "application/json" } },
    );
  return null;
}

test("catalog commits are atomic, preserve IDs/links and never change student snapshots; stale runs cannot commit", async () => {
  const { t, adminClient, schoolId, connectionId, runId, campusId, admin } =
    await setup();
  const before = await t.run(async (ctx) => ({
    students: await ctx.db.query("abekaStudents").collect(),
    progress: await ctx.db.query("abekaProgress").collect(),
  }));
  await t.run((ctx) =>
    ctx.db.patch(runId, { status: "running", catalog: true }),
  );
  const subjects = [
    { subjectId: "5298", name: "English 12", totalLessons: 170 },
    { subjectId: "12314", name: "Economics", totalLessons: 85 },
  ];
  expect(
    await t.mutation(internal.abekaCatalog.commit, { runId, subjects }),
  ).toBe(true);
  const courses = (
    await adminClient.query(api.abekaCatalog.courses, {
      schoolId,
      paginationOpts: { numItems: 25, cursor: null },
    })
  ).page;
  const english = courses.find((c) => c.subjectId === "5298")!;
  const classId = await t.run(async (ctx) => {
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "English",
      isActive: true,
      createdBy: admin,
      createdAt: 1,
    });
    return await ctx.db.insert("classes", {
      name: "English A",
      curriculumId,
      campusId,
      schoolId,
      isActive: true,
      createdBy: admin,
      createdAt: 1,
    });
  });
  await adminClient.mutation(api.abekaCatalog.linkCourse, {
    courseId: english._id,
    campusId,
    classId,
  });
  await t.mutation(internal.abekaCatalog.commit, {
    runId,
    subjects: [subjects[1]],
  });
  const missing = (
    await adminClient.query(api.abekaCatalog.courses, {
      schoolId,
      paginationOpts: { numItems: 25, cursor: null },
    })
  ).page.find((c) => c._id === english._id)!;
  expect(missing.available).toBe(false);
  expect(missing.links).toMatchObject([{ classId }]);
  await expect(
    t.mutation(internal.abekaCatalog.commit, {
      runId,
      subjects: [{ ...subjects[0], totalLessons: -1 }],
    }),
  ).rejects.toThrow("INVALID_CATALOG");
  await t.mutation(internal.abekaCatalog.commit, { runId, subjects });
  expect((await t.run((ctx) => ctx.db.get(english._id)))?.available).toBe(true);
  await t.run((ctx) => ctx.db.patch(connectionId, { revision: 2 }));
  expect(
    await t.mutation(internal.abekaCatalog.commit, {
      runId,
      subjects: [subjects[1]],
    }),
  ).toBe(false);
  expect(
    await t.run(async (ctx) => ({
      students: await ctx.db.query("abekaStudents").collect(),
      progress: await ctx.db.query("abekaProgress").collect(),
    })),
  ).toEqual(before);
});

test("course mappings allow multiple classes, reject cross-campus/tenant links, are idempotent, and require institution admin", async () => {
  const {
    t,
    adminClient,
    schoolId,
    otherSchool,
    connectionId,
    campusId,
    admin,
  } = await setup();
  const ids = await t.run(async (ctx) => {
    const courseId = await ctx.db.insert("abekaCourses", {
      connectionId,
      subjectId: "5298",
      name: "English 12",
      totalLessons: 170,
      available: true,
    });
    const otherCourse = await ctx.db.insert("abekaCourses", {
      connectionId,
      subjectId: "98",
      name: "Precalculus",
      totalLessons: 170,
      available: true,
    });
    const secondCampus = await ctx.db.insert("campuses", {
      schoolId,
      name: "South",
      slug: "south",
      isActive: true,
      createdBy: admin,
      createdAt: 1,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "English",
      isActive: true,
      createdBy: admin,
      createdAt: 1,
    });
    const base = {
      name: "English",
      curriculumId,
      isActive: true,
      createdBy: admin,
      createdAt: 1,
    };
    const a = await ctx.db.insert("classes", { ...base, schoolId, campusId });
    const b = await ctx.db.insert("classes", {
      ...base,
      schoolId,
      campusId: secondCampus,
    });
    const foreign = await ctx.db.insert("classes", {
      ...base,
      schoolId: otherSchool,
      campusId,
    });
    return { courseId, otherCourse, secondCampus, a, b, foreign };
  });
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  const args = { courseId: ids.courseId, campusId, classId: ids.a };
  await adminClient.mutation(api.abekaCatalog.linkCourse, args);
  await adminClient.mutation(api.abekaCatalog.linkCourse, args);
  await adminClient.mutation(api.abekaCatalog.linkCourse, {
    ...args,
    campusId: ids.secondCampus,
    classId: ids.b,
  });
  await expect(
    adminClient.mutation(api.abekaCatalog.linkCourse, {
      ...args,
      courseId: ids.otherCourse,
    }),
  ).rejects.toThrow("ALREADY_LINKED");
  await expect(
    adminClient.mutation(api.abekaCatalog.linkCourse, {
      ...args,
      campusId: ids.secondCampus,
    }),
  ).rejects.toThrow("INVALID_COURSE");
  await expect(
    adminClient.mutation(api.abekaCatalog.linkCourse, {
      ...args,
      classId: ids.foreign,
    }),
  ).rejects.toThrow("INVALID_COURSE");
  await expect(
    t
      .withIdentity({ subject: "principal" })
      .mutation(api.abekaCatalog.linkCourse, args),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    t.withIdentity({ subject: "other-admin" }).query(api.abekaCatalog.courses, {
      schoolId,
      paginationOpts: { numItems: 25, cursor: null },
    }),
  ).rejects.toThrow("FORBIDDEN");
  expect(
    (await t.run((ctx) => ctx.db.query("abekaCourseLinks").collect())).length,
  ).toBe(2);
  expect(
    (
      await adminClient.query(api.abekaCatalog.courseCandidates, {
        schoolId,
        campusId,
        paginationOpts: { numItems: 25, cursor: null },
      })
    ).page.map((c) => c.id),
  ).toEqual([ids.a]);
  await adminClient.mutation(api.abekaCatalog.linkCourse, {
    courseId: ids.courseId,
    classId: ids.a,
    remove: true,
  });
  expect(
    (await t.run((ctx) => ctx.db.query("abekaCourseLinks").collect())).length,
  ).toBe(1);
  expect(request).not.toHaveBeenCalled();
});

test("legacy courses without denormalized schoolId remain selectable, linkable and visible through their campus", async () => {
  const { t, adminClient, schoolId, connectionId, campusId, admin } =
    await setup();
  const { classId, courseId } = await t.run(async (ctx) => {
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Biologia",
      schoolId,
      isActive: true,
      createdBy: admin,
      createdAt: 1,
    });
    const classId = await ctx.db.insert("classes", {
      name: "Biologia",
      curriculumId,
      campusId,
      isActive: true,
      createdBy: admin,
      createdAt: 1,
    });
    const courseId = await ctx.db.insert("abekaCourses", {
      connectionId,
      subjectId: "30291",
      name: "Biology",
      totalLessons: 170,
      available: true,
    });
    return { classId, courseId };
  });
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  const before = await t.run((ctx) => ctx.db.get(classId));
  const candidates = await adminClient.query(
    api.abekaCatalog.courseCandidates,
    { schoolId, campusId, paginationOpts: { numItems: 25, cursor: null } },
  );
  expect(candidates.page).toEqual([
    { id: classId, name: "Biologia", period: null },
  ]);
  await adminClient.mutation(api.abekaCatalog.linkCourse, {
    courseId,
    classId,
    campusId,
  });
  const catalog = await adminClient.query(api.abekaCatalog.courses, {
    schoolId,
    paginationOpts: { numItems: 25, cursor: null },
  });
  expect(catalog.page[0].links).toEqual([
    { classId, name: "Biologia", campusName: "North", campusId, active: true },
  ]);
  expect(await t.run((ctx) => ctx.db.get(classId))).toEqual(before);
  expect(request).not.toHaveBeenCalled();
});

test("failed catalog refresh preserves the complete catalog and sync timestamps, obeys cooldown, and disconnect fences it", async () => {
  vi.useFakeTimers();
  const { t, adminClient, schoolId, connectionId } = await setup();
  const key = "ab".repeat(32);
  vi.stubEnv("ABEKA_SESSION_ENCRYPTION_KEY", key);
  await t.run(async (ctx) => {
    await ctx.db.insert("abekaSecrets", {
      connectionId,
      encrypted: await encryptSession("session=test", key, schoolId),
    });
    await ctx.db.patch(connectionId, {
      catalogSyncedAt: 123,
      lastSyncedAt: 456,
      syncSchedule: {
        mode: "manual",
        time: "08:00",
        weekday: 1,
        stopAtPeriodEnd: false,
      },
    });
    await ctx.db.insert("abekaCourses", {
      connectionId,
      subjectId: "5298",
      name: "English 12",
      totalLessons: 170,
      available: true,
    });
  });
  const before = await t.run((ctx) => ctx.db.query("abekaCourses").collect());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith("GetGroupSubjects")
        ? new Response("unavailable", { status: 500 })
        : catalogResponse(String(url))!,
    ),
  );
  await adminClient.mutation(api.abekaCatalog.refresh, { schoolId });
  await expect(
    adminClient.mutation(api.abekaCatalog.refresh, { schoolId }),
  ).rejects.toThrow("SYNC_RUNNING");
  await finishCurrentSync(t);
  const state = await adminClient.query(api.abeka.status, { schoolId });
  expect(state.connection).toMatchObject({
    status: "connected",
    catalogSyncedAt: 123,
    lastSyncedAt: 456,
    catalogError: "PROVIDER_UNAVAILABLE",
  });
  expect(state.connection?.nextSyncAt).toBeUndefined();
  expect(await t.run((ctx) => ctx.db.query("abekaCourses").collect())).toEqual(
    before,
  );
  await expect(
    adminClient.mutation(api.abekaCatalog.refresh, { schoolId }),
  ).rejects.toThrow("SYNC_COOLDOWN");
  vi.advanceTimersByTime(ABEKA_MANUAL_SYNC_INTERVAL_MS);
  await adminClient.mutation(api.abekaCatalog.refresh, { schoolId });
  const runId = (await adminClient.query(api.abeka.status, { schoolId })).run!
    ._id;
  await adminClient.mutation(api.abeka.disconnect, { schoolId });
  expect(
    await t.mutation(internal.abekaCatalog.commit, {
      runId,
      subjects: [{ subjectId: "98", name: "Precalculus", totalLessons: 170 }],
    }),
  ).toBe(false);
  await finishCurrentSync(t);
  expect(await t.run((ctx) => ctx.db.query("abekaCourses").collect())).toEqual(
    before,
  );
});

test("new connection confirms before roster and one initial catalog import; progress updates do not reload courses", async () => {
  vi.useFakeTimers();
  const { t, adminClient, schoolId, connectionId } = await setup();
  const key = "ab".repeat(32);
  vi.stubEnv("ABEKA_SESSION_ENCRYPTION_KEY", key);
  await t.run((ctx) =>
    ctx.db.patch(connectionId, {
      confirmed: false,
      externalSchoolId: undefined,
      rosterRunId: undefined,
    }),
  );
  const fetch = vi.fn(
    async (url: string | URL | Request) =>
      catalogResponse(String(url)) ?? new Response(rosterHtml),
  );
  vi.stubGlobal("fetch", fetch);
  await adminClient.mutation(internal.abeka.saveSession, {
    schoolId,
    encrypted: await encryptSession("session=test", key, schoolId),
  });
  await finishCurrentSync(t);
  const pending = await adminClient.query(api.abeka.status, { schoolId });
  expect(pending.connection?.status).toBe("needs_confirmation");
  expect(pending.connection?.nextSyncAt).toBeUndefined();
  expect(
    (
      await adminClient.query(api.abeka.students, {
        schoolId,
        paginationOpts: { numItems: 25, cursor: null },
      })
    ).page,
  ).toEqual([]);
  await expect(
    adminClient.mutation(api.abeka.confirm, {
      schoolId,
      externalSchoolId: "999",
    }),
  ).rejects.toThrow("INVALID_CONFIRMATION");
  await adminClient.mutation(api.abeka.confirm, {
    schoolId,
    externalSchoolId: "123",
  });
  await finishCurrentSync(t);
  expect(
    (await adminClient.query(api.abeka.status, { schoolId })).connection
      ?.status,
  ).toBe("connected");
  expect(fetch).toHaveBeenCalledTimes(5);
  const catalog = await adminClient.query(api.abekaCatalog.courses, {
    schoolId,
    paginationOpts: { numItems: 25, cursor: null },
  });
  expect(catalog.page).toMatchObject([
    { subjectId: "5298", name: "English 12", available: true, links: [] },
  ]);
  const connection = (await adminClient.query(api.abeka.status, { schoolId }))
    .connection!;
  expect(connection.catalogSyncedAt).toBeDefined();
  vi.advanceTimersByTime(ABEKA_MANUAL_SYNC_INTERVAL_MS);
  fetch.mockClear();
  await adminClient.mutation(api.abeka.syncNow, { schoolId });
  await finishCurrentSync(t);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(String(fetch.mock.calls[0][0])).not.toContain("Permissions");
  expect(
    (await adminClient.query(api.abeka.status, { schoolId })).connection
      ?.catalogSyncedAt,
  ).toBe(connection.catalogSyncedAt);
});

test("repeated weekly triggers start one run; expired sessions stop future work", async () => {
  vi.useFakeTimers();
  const { t, schoolId, connectionId, adminClient } = await setup();
  const key = "ab".repeat(32);
  vi.stubEnv("ABEKA_SESSION_ENCRYPTION_KEY", key);
  const encrypted = await encryptSession("session=test", key, schoolId);
  await t.run(async (ctx) => {
    await ctx.db.insert("abekaSecrets", { connectionId, encrypted });
    await setAbekaNextSync(ctx, connectionId, Date.now());
  });
  const fetch = vi.fn(async () => new Response(null, { status: 302 }));
  vi.stubGlobal("fetch", fetch);
  const scheduled = await t.run((ctx) => ctx.db.get(connectionId));
  const args = { connectionId, generation: scheduled!.syncScheduleGeneration! };
  await t.mutation(internal.abekaSync.runScheduled, args);
  await t.mutation(internal.abekaSync.runScheduled, args);
  await finishCurrentSync(t);
  const result = await adminClient.query(api.abeka.status, { schoolId });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(result.run?.errorCode).toBe("NEEDS_RECONNECT");
  expect(result.connection?.nextSyncAt).toBeUndefined();
  expect(await t.run((ctx) => ctx.db.query("abekaSecrets").collect())).toEqual(
    [],
  );
});

test("manual updates replace the weekly job and disconnect cancels it without losing imported data", async () => {
  vi.useFakeTimers();
  const { t, adminClient, schoolId, connectionId, runId, studentId, student } =
    await renewalSetup();
  await t.run(async (ctx) => {
    await ctx.db.patch(runId, { status: "completed" });
    await ctx.db.patch(studentId, { userId: student });
    await setAbekaNextSync(ctx, connectionId, Date.now() + 86_400_000);
  });
  const original = (await t.run((ctx) => ctx.db.get(connectionId)))!;
  const fetch = vi.fn(async (url: string) => reportResponse(url));
  vi.stubGlobal("fetch", fetch);
  await adminClient.mutation(api.abeka.syncNow, { schoolId });
  expect(
    (await t.run((ctx) => ctx.db.system.get(original.scheduledSyncId!)))?.state
      .kind,
  ).toBe("canceled");
  await finishCurrentSync(t);
  const updated = (await t.run((ctx) => ctx.db.get(connectionId)))!;
  const job = await t.run((ctx) => ctx.db.system.get(updated.scheduledSyncId!));
  expect(job?.state.kind).toBe("pending");
  expect(job?.scheduledTime).toBe(updated.nextSyncAt);
  expect(updated.nextSyncAt! - updated.lastSyncedAt!).toBe(7 * 86_400_000);
  expect(updated.scheduledSyncId).not.toBe(original.scheduledSyncId);
  const progress = await adminClient.query(api.abeka.progress, { studentId });
  expect(progress).toHaveLength(1);
  await t.mutation(internal.abekaSync.runScheduled, {
    connectionId,
    generation: original.syncScheduleGeneration!,
  });
  expect((await t.run((ctx) => ctx.db.get(connectionId)))?.latestRunId).toBe(
    updated.latestRunId,
  );
  await adminClient.mutation(api.abeka.disconnect, { schoolId });
  expect(
    (await t.run((ctx) => ctx.db.system.get(updated.scheduledSyncId!)))?.state
      .kind,
  ).toBe("canceled");
  vi.setSystemTime(updated.nextSyncAt!);
  await t.mutation(internal.abekaSync.runScheduled, {
    connectionId,
    generation: updated.syncScheduleGeneration!,
  });
  await finishCurrentSync(t);
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(await adminClient.query(api.abeka.progress, { studentId })).toEqual(
    progress,
  );
  expect((await t.run((ctx) => ctx.db.get(studentId)))?.userId).toBe(student);
});

test("a weekly deadline during a student download waits for it, then runs one full sync", async () => {
  vi.useFakeTimers();
  const { t, adminClient, schoolId, connectionId, runId, studentId, student } =
    await renewalSetup();
  await t.run(async (ctx) => {
    await ctx.db.patch(runId, { status: "completed" });
    await setAbekaNextSync(ctx, connectionId, Date.now());
  });
  const request = vi.fn(async (url: string) => reportResponse(url));
  vi.stubGlobal("fetch", request);
  await adminClient.mutation(api.abeka.linkStudent, {
    studentId,
    userId: student,
  });
  const during = (await t.run((ctx) => ctx.db.get(connectionId)))!;
  const args = { connectionId, generation: during.syncScheduleGeneration! };
  await t.mutation(internal.abekaSync.runScheduled, args);
  await t.mutation(internal.abekaSync.runScheduled, args);
  const deferred = (await t.run((ctx) => ctx.db.get(connectionId)))!;
  expect(deferred.scheduledSyncId).toBeUndefined();
  expect(deferred.latestRunId).toBe(during.latestRunId);
  expect(deferred.nextSyncAt).toBe(during.nextSyncAt);
  await finishCurrentSync(t);
  expect(request).toHaveBeenCalledTimes(5); // Two for the student, three for the full sync.
  const state = await adminClient.query(api.abeka.status, { schoolId });
  expect(state.run?.studentId).toBeUndefined();
  expect(state.run?.status).toBe("completed");
  expect(state.connection?.scheduledSyncId).toBeDefined();
  expect(state.connection?.nextSyncAt).toBeGreaterThan(Date.now());
  expect(
    await adminClient.query(api.abeka.progress, { studentId }),
  ).toHaveLength(1);
});

test("schedule backfill is bounded, idempotent and preserves existing dates and students", async () => {
  vi.useFakeTimers();
  const { t, connectionId, otherSchool, admin } = await setup();
  const nextSyncAt = Date.now() + 86_400_000;
  await t.run(async (ctx) => {
    await ctx.db.patch(connectionId, { nextSyncAt });
    await ctx.db.insert("abekaConnections", {
      schoolId: otherSchool,
      status: "connected",
      revision: 1,
      confirmed: true,
      connectedBy: admin,
      nextSyncAt: nextSyncAt + 1000,
    });
  });
  const students = await t.run((ctx) =>
    ctx.db.query("abekaStudents").collect(),
  );
  const firstArgs = {
    paginationOpts: { numItems: 1, cursor: null },
    dryRun: true,
  };
  const preview = await t.mutation(
    internal.abekaSync.backfillSchedules,
    firstArgs,
  );
  expect(preview).toMatchObject({
    scheduled: 1,
    pending: 0,
    overdue: 0,
    isDone: false,
  });
  expect(
    (await t.run((ctx) => ctx.db.get(connectionId)))?.scheduledSyncId,
  ).toBeUndefined();
  const first = await t.mutation(internal.abekaSync.backfillSchedules, {
    ...firstArgs,
    dryRun: false,
  });
  const second = await t.mutation(internal.abekaSync.backfillSchedules, {
    paginationOpts: { numItems: 1, cursor: first.continueCursor },
    dryRun: false,
  });
  expect(second.scheduled).toBe(1);
  const before = (await t.run((ctx) => ctx.db.get(connectionId)))!;
  const again = await t.mutation(internal.abekaSync.backfillSchedules, {
    paginationOpts: { numItems: 50, cursor: null },
    dryRun: false,
  });
  expect(again).toMatchObject({
    scheduled: 0,
    pending: 2,
    overdue: 0,
    isDone: true,
  });
  const after = await t.run((ctx) => ctx.db.get(connectionId));
  expect(after).toEqual(before);
  expect(after?.nextSyncAt).toBe(nextSyncAt);
  expect(await t.run((ctx) => ctx.db.query("abekaStudents").collect())).toEqual(
    students,
  );
});

test.each(["inactive", "unconfirmed", "needs_reconnect"])(
  "a scheduled sync cannot run for an %s connection",
  async (condition) => {
    vi.useFakeTimers();
    const { t, connectionId, schoolId, runId } = await setup();
    await t.run(async (ctx) => {
      await setAbekaNextSync(ctx, connectionId, Date.now());
      if (condition === "inactive")
        await ctx.db.patch(schoolId, { isActive: false });
      else if (condition === "unconfirmed")
        await ctx.db.patch(connectionId, { confirmed: false });
      else await ctx.db.patch(connectionId, { status: "needs_reconnect" });
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await finishCurrentSync(t);
    const connection = await t.run((ctx) => ctx.db.get(connectionId));
    expect(connection?.latestRunId).toBe(runId);
    expect(connection?.nextSyncAt).toBeUndefined();
    expect(connection?.scheduledSyncId).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  },
);

test("HTTP session endpoint rejects anonymous, non-admin, malformed and oversized requests without echoing secrets", async () => {
  const { t, adminClient, schoolId } = await setup();
  vi.stubEnv("ABEKA_SESSION_ENCRYPTION_KEY", "ab".repeat(32));
  const path = `/abeka-session?schoolId=${schoolId}`;
  const headers = {
    Authorization: "Bearer test",
    "Content-Type": "text/plain",
  };
  const anonymous = await t.fetch(path, { method: "POST", body: "secret" });
  expect(anonymous.status).toBe(401);
  const principal = await t
    .withIdentity({ subject: "principal" })
    .fetch(path, { method: "POST", headers, body: "session=secret" });
  expect(principal.status).toBe(400);
  expect(await principal.text()).not.toContain("session=secret");
  for (const body of [
    "Cookie: secret",
    "session=" + "x".repeat(16_384),
    "session=secret\r\nX-Injected: yes",
  ]) {
    const response = await adminClient.fetch(path, {
      method: "POST",
      headers,
      body,
    });
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(body);
  }
  expect(await t.run((ctx) => ctx.db.query("abekaSecrets").collect())).toEqual(
    [],
  );
});

test("login probe is opt-in, admin-only, bounded and never stores the submitted password", async () => {
  const { t, adminClient, schoolId } = await setup();
  const originalConnections = await t.run((ctx) =>
    ctx.db.query("abekaConnections").collect(),
  );
  const path = `/abeka-login-probe?schoolId=${schoolId}`;
  const headers = {
    Authorization: "Bearer test",
    "Content-Type": "application/json",
  };
  vi.stubEnv("ABEKA_LOGIN_PROBE_ENABLED", "false");
  expect(
    (await adminClient.fetch(path, { method: "POST", headers })).status,
  ).toBe(404);
  vi.stubEnv("ABEKA_LOGIN_PROBE_ENABLED", "true");
  expect((await t.fetch(path, { method: "POST", headers })).status).toBe(401);
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  const body = JSON.stringify({
    username: "example",
    password: "private-test-password",
  });
  const denied = await t
    .withIdentity({ subject: "principal" })
    .fetch(path, { method: "POST", headers, body });
  expect(denied.status).toBe(400);
  expect(await denied.text()).not.toContain("private-test-password");
  for (const invalid of [
    "null",
    "not json",
    JSON.stringify({ username: "a", password: "x".repeat(9000) }),
  ]) {
    expect(
      (
        await adminClient.fetch(path, {
          method: "POST",
          headers,
          body: invalid,
        })
      ).status,
    ).toBe(400);
  }
  expect(request).not.toHaveBeenCalled();
  expect(await t.run((ctx) => ctx.db.query("abekaSecrets").collect())).toEqual(
    [],
  );
  expect(
    await t.run((ctx) => ctx.db.query("abekaConnections").collect()),
  ).toEqual(originalConnections);
});
