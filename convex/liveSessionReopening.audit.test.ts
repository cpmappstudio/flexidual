import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  EgressClient,
  EgressInfo,
  EgressStatus,
  ParticipantInfo,
  Room,
  RoomServiceClient,
  WebhookEvent,
  WebhookReceiver,
} from "livekit-server-sdk";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { getLiveSessionHardEnd } from "../lib/live-session-policy";
import { localDateTimeToUtc } from "../lib/time-zone";

const START = Date.UTC(2026, 8, 24, 13);
const END = START + 60 * 60_000;
const ROOM = "reopening-audit";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  for (const [key, value] of Object.entries({
    LIVEKIT_URL: "https://livekit.invalid",
    LIVEKIT_API_KEY: "audit-key",
    LIVEKIT_API_SECRET: "audit-secret-at-least-thirty-two-characters",
    S3_ACCESS_KEY: "audit-key",
    S3_SECRET_KEY: "audit-secret",
    S3_REGION: "auto",
    S3_BUCKET: "audit",
    S3_ENDPOINT: "https://storage.invalid",
    R2_PUBLIC_URL: "https://files.invalid",
    NEXT_PUBLIC_APP_URL: "https://app.invalid",
    CONVEX_SITE_URL: "https://convex.invalid",
  }))
    vi.stubEnv(key, value);
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Unexpected network call"),
  );
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function setup() {
  const sdk = {
    listRooms: vi
      .spyOn(RoomServiceClient.prototype, "listRooms")
      .mockResolvedValue([new Room({ name: ROOM })]),
    listParticipants: vi
      .spyOn(RoomServiceClient.prototype, "listParticipants")
      .mockResolvedValue([]),
    deleteRoom: vi
      .spyOn(RoomServiceClient.prototype, "deleteRoom")
      .mockResolvedValue(undefined),
    listEgress: vi
      .spyOn(EgressClient.prototype, "listEgress")
      .mockResolvedValue([]),
    stopEgress: vi
      .spyOn(EgressClient.prototype, "stopEgress")
      .mockResolvedValue(new EgressInfo()),
    startEgress: vi
      .spyOn(EgressClient.prototype, "startRoomCompositeEgress")
      .mockResolvedValue(new EgressInfo({ egressId: "new-recording" })),
  };
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const data = await t.run(async (ctx) => {
    const createUser = (name: string) =>
      ctx.db.insert("users", {
        clerkId: name,
        firstName: name,
        lastName: "Audit",
        fullName: `${name} Audit`,
        isActive: true,
        createdAt: START,
      });
    const teacherId = await createUser("teacher");
    const adminId = await createUser("admin");
    const studentId = await createUser("student");
    const guestId = await createUser("guest");
    const outsiderId = await createUser("outsider");
    const schoolId = await ctx.db.insert("schools", {
      name: "Audit",
      slug: "audit",
      timeZone: "America/Bogota",
      isActive: true,
      createdAt: START,
      createdBy: teacherId,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Audit",
      slug: "audit-campus",
      timeZone: "America/Bogota",
      isActive: true,
      createdAt: START,
      createdBy: teacherId,
    });
    await ctx.db.insert("roleAssignments", {
      userId: adminId,
      orgId: schoolId,
      orgType: "school",
      schoolId,
      role: "admin",
      assignedAt: START,
    });
    for (const userId of [studentId, guestId]) {
      await ctx.db.insert("roleAssignments", {
        userId,
        orgId: campusId,
        orgType: "campus",
        schoolId,
        role: "student",
        gradeCode: "05",
        assignedAt: START,
      });
    }
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Audit",
      schoolId,
      isActive: true,
      createdAt: START,
      createdBy: teacherId,
    });
    const classId = await ctx.db.insert("classes", {
      name: "Audit",
      curriculumId,
      schoolId,
      campusId,
      teacherId,
      students: [studentId],
      liveAccess: { mode: "school", allowedGradeCodes: ["05"] },
      isActive: true,
      createdAt: START,
      createdBy: teacherId,
    });
    const scheduleId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      scheduledStart: START,
      scheduledEnd: END,
      sessionType: "live",
      roomName: ROOM,
      status: "scheduled",
      isLive: false,
      createdAt: START,
      createdBy: teacherId,
    });
    return {
      teacherId,
      adminId,
      studentId,
      guestId,
      outsiderId,
      schoolId,
      campusId,
      classId,
      scheduleId,
    };
  });
  const teacher = t.withIdentity({ subject: "teacher" });
  const student = t.withIdentity({ subject: "student" });
  const guest = t.withIdentity({ subject: "guest" });
  const admin = t.withIdentity({ subject: "admin" });
  const start = () =>
    teacher.mutation(api.schedule.markLive, { roomName: ROOM, isLive: true });
  const reopen = () =>
    teacher.mutation(api.schedule.reopenLiveSession, { roomName: ROOM });
  const schedule = () => t.run((ctx) => ctx.db.get(data.scheduleId));
  const lifecycle = () =>
    t.query(internal.schedule.getLiveLifecycleState, { roomName: ROOM });
  const saveReport = () =>
    teacher.mutation(api.schedule.submitSessionClosure, {
      roomName: ROOM,
      lessonIds: [],
      notes: "audit report",
      attendance: [{ studentId: data.studentId, status: "present" }],
    });
  const end = async () =>
    teacher.action(api.livekit.endSession, {
      roomName: ROOM,
      expectedActivationId: (await lifecycle())!.activationId,
    });
  const flush = async () => {
    await vi.advanceTimersByTimeAsync(0);
    await t.finishInProgressScheduledFunctions();
  };
  const close = async () => {
    await saveReport();
    await end();
    await flush();
  };
  const participants = () => [
    new ParticipantInfo({
      metadata: JSON.stringify({
        userId: "teacher",
        convexUserId: data.teacherId,
        role: "teacher",
      }),
    }),
    new ParticipantInfo({
      metadata: JSON.stringify({
        userId: "student",
        convexUserId: data.studentId,
        role: "student",
      }),
    }),
  ];
  return {
    t,
    data,
    sdk,
    teacher,
    student,
    guest,
    admin,
    start,
    reopen,
    close,
    end,
    flush,
    saveReport,
    schedule,
    lifecycle,
    participants,
  };
}

describe("reopening audit: supported flows", () => {
  test.each([
    [START - 60 * 60_000 - 1, false],
    [START - 60 * 60_000, true],
    [START - 1, true],
    [END - 1, true],
    [END, false],
  ])("initial start boundary at %i", async (now, allowed) => {
    const f = await setup();
    vi.setSystemTime(now);
    if (allowed) await expect(f.start()).resolves.toBeNull();
    else await expect(f.start()).rejects.toThrow("SESSION_START_NOT_AVAILABLE");
  });

  test.each([
    [START - 60 * 60_000, true],
    [START - 1, true],
    [START, true],
    [END, true],
    [END + 10 * 60_000 - 1, true],
    [END + 10 * 60_000, false],
  ])(
    "reopen boundary at %i, including early accidental closure",
    async (now, allowed) => {
      const f = await setup();
      vi.setSystemTime(START - 60 * 60_000);
      await f.start();
      await f.close();
      vi.setSystemTime(now);
      if (allowed) await expect(f.reopen()).resolves.toBeNull();
      else
        await expect(f.reopen()).rejects.toThrow(
          "SESSION_REOPEN_NOT_AVAILABLE",
        );
    },
  );

  test.each(["America/Bogota", "America/New_York", "Asia/Tokyo"])(
    "opening/reopening limits use the scheduled instant in %s",
    async (zone) => {
      const f = await setup();
      const localStart = localDateTimeToUtc("2026-11-01T08:00", zone);
      await f.t.run((ctx) =>
        ctx.db.patch(f.data.scheduleId, {
          scheduledStart: localStart,
          scheduledEnd: localStart + 60 * 60_000,
        }),
      );
      await f.t.run((ctx) => ctx.db.patch(f.data.campusId, { timeZone: zone }));
      vi.setSystemTime(localStart - 60 * 60_000);
      await f.start();
      await f.close();
      await f.reopen();
      expect(
        await f.teacher.query(api.schedule.getSessionStatus, {
          sessionId: ROOM,
          now: Date.now(),
        }),
      ).toMatchObject({ timeZone: zone, start: localStart, status: "active" });
    },
  );

  test.each(["student", "guest", "outsider", "anonymous", "inactive"])(
    "%s cannot reopen",
    async (subject) => {
      const f = await setup();
      await f.start();
      await f.close();
      if (subject === "inactive") {
        await f.t.run((ctx) =>
          ctx.db.patch(f.data.teacherId, { isActive: false }),
        );
      }
      const actor =
        subject === "anonymous"
          ? f.t
          : f.t.withIdentity({
              subject: subject === "inactive" ? "teacher" : subject,
            });
      await expect(
        actor.mutation(api.schedule.reopenLiveSession, { roomName: ROOM }),
      ).rejects.toThrow();
      expect((await f.schedule())?.status).toBe("completed");
    },
  );

  test("another authorized administrator can reopen and becomes leader", async () => {
    const f = await setup();
    await f.start();
    await f.close();
    await f.admin.mutation(api.schedule.reopenLiveSession, { roomName: ROOM });
    expect(await f.schedule()).toMatchObject({
      sessionLeaderId: f.data.adminId,
      sessionReopenedBy: f.data.adminId,
    });
    await expect(f.end()).rejects.toThrow("Only the session leader");
  });

  test.each(["scheduled", "active", "cancelled"] as const)(
    "cannot reopen a %s occurrence",
    async (status) => {
      const f = await setup();
      await f.start();
      await f.close();
      await f.t.run((ctx) =>
        ctx.db.patch(f.data.scheduleId, {
          status,
          isLive: status === "active",
        }),
      );
      await expect(f.reopen()).rejects.toThrow("SESSION_REOPEN_NOT_AVAILABLE");
    },
  );

  test("parallel reopens create one activation and one leadership event", async () => {
    const f = await setup();
    await f.start();
    await f.close();
    const results = await Promise.allSettled([
      f.reopen(),
      f.admin.mutation(api.schedule.reopenLiveSession, { roomName: ROOM }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const events = await f.t.run((ctx) =>
      ctx.db.query("classSessionLeadershipEvents").collect(),
    );
    expect(
      events.filter((event) => event.eventType === "reopened"),
    ).toHaveLength(1);
  });

  test("parallel manual closes perform external cleanup once and block reopen until finished", async () => {
    const f = await setup();
    await f.start();
    await f.saveReport();
    f.sdk.listEgress.mockImplementationOnce(async () => {
      await expect(f.reopen()).rejects.toThrow("SESSION_REOPEN_NOT_AVAILABLE");
      await f.end();
      expect((await f.schedule())?.liveEndClaimId).toBeDefined();
      return [];
    });
    await f.end();
    await f.flush();
    expect(f.sdk.listEgress).toHaveBeenCalledTimes(1);
    expect(f.sdk.deleteRoom).toHaveBeenCalledTimes(1);
    expect((await f.schedule())?.liveEndClaimId).toBeUndefined();
    await f.reopen();
  });

  test("stale scheduled jobs do not even query LiveKit after reopen", async () => {
    const f = await setup();
    await f.start();
    const oldId = (await f.lifecycle())!.activationId;
    await f.close();
    await f.reopen();
    f.sdk.listRooms.mockClear();
    f.sdk.deleteRoom.mockClear();
    await f.t.action(internal.livekit.reconcileLiveSession, {
      roomName: ROOM,
      expectedActivationId: oldId,
    });
    expect(f.sdk.listRooms).not.toHaveBeenCalled();
    expect(f.sdk.deleteRoom).not.toHaveBeenCalled();
    expect((await f.schedule())?.isLive).toBe(true);
  });

  test("a reconciler paused during its LiveKit read cannot delete the reopened room", async () => {
    const f = await setup();
    await f.start();
    f.sdk.listParticipants.mockImplementationOnce(async () => {
      await f.close();
      await f.reopen();
      return [];
    });
    await f.t.action(internal.livekit.reconcileLiveSession, { roomName: ROOM });
    expect(f.sdk.deleteRoom).toHaveBeenCalledTimes(1);
    expect((await f.schedule())?.isLive).toBe(true);
  });

  test("multiple cycles preserve one report, attendance segments and the recovery deadline", async () => {
    const f = await setup();
    await f.start();
    const activations = new Set<string>();
    for (let cycle = 0; cycle < 4; cycle++) {
      activations.add((await f.lifecycle())!.activationId);
      await f.student.mutation(api.schedule.logStudentPresence, {
        scheduleId: f.data.scheduleId,
        activationId: (await f.lifecycle())!.activationId,
        connectionId: "audit-connection",
        action: "join",
      });
      vi.setSystemTime(START + (cycle * 2 + 1) * 60_000);
      await f.close();
      expect((await f.schedule())?.sessionReopenUntil).toBe(END + 10 * 60_000);
      if (cycle < 3) {
        vi.setSystemTime(START + (cycle * 2 + 2) * 60_000);
        await f.reopen();
        await expect(f.end()).rejects.toThrow("Complete the lesson");
      }
    }
    const state = await f.t.run(async (ctx) => ({
      reports: await ctx.db.query("classSessionReports").collect(),
      records: await ctx.db.query("studentAttendanceRecords").collect(),
      segments: await ctx.db.query("class_sessions").collect(),
    }));
    expect(activations.size).toBe(4);
    expect(state.reports).toHaveLength(1);
    expect(state.records).toHaveLength(1);
    expect(state.segments.map((segment) => segment.durationSeconds)).toEqual([
      60, 60, 60, 60,
    ]);
  });

  test("legacy live rows without activation IDs can close and obtain an ID on reopen", async () => {
    const f = await setup();
    await f.start();
    await f.t.run((ctx) =>
      ctx.db.patch(f.data.scheduleId, { liveActivationId: undefined }),
    );
    expect((await f.lifecycle())?.activationId).toMatch(/^legacy:/);
    await f.close();
    await f.reopen();
    expect((await f.schedule())?.liveActivationId).toBeDefined();
  });

  test("whiteboard and images survive reopen, cannot be read while closed and expire after final closure", async () => {
    const f = await setup();
    await f.start();
    await f.teacher.mutation(api.whiteboardSessions.upsertScene, {
      roomName: ROOM,
      elements: [{ id: "shape" }],
    });
    const storageId = await f.t.run((ctx) =>
      ctx.storage.store(new Blob(["image"], { type: "image/png" })),
    );
    // convex-test 0.0.54 omits contentType in stored file metadata.
    // Seed an already uploaded image to exercise preservation/deletion, not upload validation.
    await f.t.run(async (ctx) => {
      const whiteboard = await ctx.db.query("whiteboardSessions").first();
      await ctx.db.patch(whiteboard!._id, {
        fileRefs: {
          image: {
            storageId,
            url: (await ctx.storage.getUrl(storageId))!,
            mimeType: "image/png",
            created: START,
          },
        },
      });
    });
    await f.t.mutation(internal.whiteboardSessions.setRecordingToken, {
      roomName: ROOM,
      recordingToken: "old-token",
    });
    await f.close();
    await expect(
      f.student.query(api.whiteboardSessions.getScene, { roomName: ROOM }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      f.t.query(api.whiteboardSessions.getScene, {
        roomName: ROOM,
        recordingToken: "old-token",
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await f.reopen();
    vi.setSystemTime(END + 10 * 60_000);
    await f.t.mutation(internal.schedule.cleanupExpiredWhiteboardSession, {
      roomName: ROOM,
      expectedReopenUntil: END + 10 * 60_000,
    });
    const scene = await f.student.query(api.whiteboardSessions.getScene, {
      roomName: ROOM,
    });
    expect(scene?.elements).toEqual([{ id: "shape" }]);
    expect(scene?.fileRefs?.image.storageId).toBe(storageId);
    await f.close();
    await f.t.mutation(internal.schedule.cleanupExpiredWhiteboardSession, {
      roomName: ROOM,
      expectedReopenUntil: END + 10 * 60_000,
    });
    expect(
      await f.t.run((ctx) => ctx.db.query("whiteboardSessions").collect()),
    ).toEqual([]);
    expect(await f.t.run((ctx) => ctx.storage.get(storageId))).toBeNull();
  });

  test("institutional guests regain read-only chat after reopen without enrollment or attendance", async () => {
    const f = await setup();
    await f.start();
    const args = { classId: f.data.classId, scheduleId: f.data.scheduleId };
    expect(
      await f.guest.query(api.courseChatMessages.getMyStatus, args),
    ).toMatchObject({ readOnly: true, archived: false });
    await f.close();
    expect(
      await f.guest.query(api.courseChatMessages.getMyStatus, args),
    ).toMatchObject({ readOnly: true, archived: true });
    await f.reopen();
    expect(
      await f.guest.query(api.courseChatMessages.getMyStatus, args),
    ).toMatchObject({ readOnly: true, archived: false, canAttach: false });
    await f.guest.mutation(api.schedule.logStudentPresence, {
      scheduleId: f.data.scheduleId,
      activationId: (await f.lifecycle())!.activationId,
      connectionId: "audit-connection",
      action: "join",
    });
    expect(
      await f.t.run((ctx) => ctx.db.query("class_sessions").collect()),
    ).toEqual([]);
    expect(
      (await f.t.run((ctx) => ctx.db.get(f.data.classId)))?.students,
    ).toEqual([f.data.studentId]);
  });

  test("tokens are denied while closed and issued for the reopened live class", async () => {
    const f = await setup();
    await expect(
      f.student.action(api.livekit.getToken, { roomName: ROOM }),
    ).rejects.toThrow();
    await f.start();
    const first = await f.student.action(api.livekit.getToken, {
      roomName: ROOM,
    });
    await f.close();
    await expect(
      f.student.action(api.livekit.getToken, { roomName: ROOM }),
    ).rejects.toThrow("expired");
    vi.setSystemTime(START + 1_000);
    await f.reopen();
    const second = await f.student.action(api.livekit.getToken, {
      roomName: ROOM,
      expectedActivationId: (await f.lifecycle())!.activationId,
    });
    expect(second).not.toBe(first);
    const payload = JSON.parse(
      Buffer.from(second.split(".")[1], "base64url").toString(),
    );
    expect(payload.video).toMatchObject({
      room: (await f.schedule())!.liveRoomName,
      roomJoin: true,
    });
    expect(payload.video.room).not.toBe(ROOM);
    expect(payload.exp - Math.floor(Date.now() / 1_000)).toBe(600);
  });

  test("guest messages and attachment downloads follow the reopened occurrence, never the whole course", async () => {
    const f = await setup();
    await f.start();
    const fileId = await f.t.run(async (ctx) => {
      await ctx.db.insert("courseChatMessages", {
        classId: f.data.classId,
        authorId: f.data.teacherId,
        body: "course-only",
      });
      const storageId = await ctx.storage.store(new Blob(["pdf"]));
      const messageId = await ctx.db.insert("courseChatMessages", {
        classId: f.data.classId,
        scheduleId: f.data.scheduleId,
        authorId: f.data.teacherId,
        body: "session-message",
      });
      const fileId = await ctx.db.insert("courseChatAttachments", {
        classId: f.data.classId,
        uploadedBy: f.data.teacherId,
        name: "session.pdf",
        contentType: "application/pdf",
        size: 3,
        storageId,
        messageId,
      });
      await ctx.db.patch(messageId, { attachmentIds: [fileId] });
      return fileId;
    });
    const messages = () =>
      f.guest.query(api.courseChatMessages.list, {
        classId: f.data.classId,
        scheduleId: f.data.scheduleId,
        paginationOpts: { numItems: 20, cursor: null },
      });
    expect((await messages()).page.map((message) => message.body)).toEqual([
      "session-message",
    ]);
    await expect(
      f.guest.mutation(internal.courseChatAttachments.read, { id: fileId }),
    ).resolves.toMatchObject({ name: "session.pdf" });
    await f.close();
    expect((await messages()).page).toEqual([]);
    await expect(
      f.guest.mutation(internal.courseChatAttachments.read, { id: fileId }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await f.reopen();
    expect((await messages()).page.map((message) => message.body)).toEqual([
      "session-message",
    ]);
    await expect(
      f.guest.mutation(internal.courseChatAttachments.read, { id: fileId }),
    ).resolves.toMatchObject({ name: "session.pdf" });
    await expect(
      f.guest.mutation(api.courseChatMessages.send, {
        classId: f.data.classId,
        scheduleId: f.data.scheduleId,
        body: "not allowed",
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
  });

  test("an old recording webhook updates its own egress without altering the reopened session", async () => {
    const f = await setup();
    await f.start();
    const recordingA = await f.t.mutation(internal.recordings.createRecording, {
      scheduleId: f.data.scheduleId,
      roomName: ROOM,
      egressId: "a",
      startedAt: START,
    });
    await f.close();
    await f.reopen();
    const recordingB = await f.t.mutation(internal.recordings.createRecording, {
      scheduleId: f.data.scheduleId,
      roomName: ROOM,
      egressId: "b",
      startedAt: START + 1_000,
    });
    await f.t.mutation(internal.recordings.updateFromWebhook, {
      egressId: "a",
      status: "complete",
      completedAt: START + 2_000,
    });
    expect((await f.t.run((ctx) => ctx.db.get(recordingA)))?.status).toBe(
      "complete",
    );
    expect((await f.t.run((ctx) => ctx.db.get(recordingB)))?.status).toBe(
      "starting",
    );
    expect((await f.schedule())?.isLive).toBe(true);
  });

  test("egress errors close attendance but only release the claim after cleanup succeeds", async () => {
    const f = await setup();
    await f.start();
    await f.student.mutation(api.schedule.logStudentPresence, {
      scheduleId: f.data.scheduleId,
      activationId: (await f.lifecycle())!.activationId,
      connectionId: "audit-connection",
      action: "join",
    });
    f.sdk.listEgress.mockRejectedValueOnce(new Error("egress unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await f.close();
    expect(log).toHaveBeenCalled();
    expect((await f.schedule())?.liveEndClaimId).toBeDefined();
    expect((await f.schedule())?.sessionReopenUntil).toBeUndefined();
    await vi.advanceTimersByTimeAsync(10_000);
    await f.t.finishInProgressScheduledFunctions();
    expect(await f.schedule()).toMatchObject({
      status: "completed",
      sessionReopenUntil: END + 10 * 60_000,
    });
    expect((await f.schedule())?.liveEndClaimId).toBeUndefined();
    expect(
      (await f.t.run((ctx) => ctx.db.query("class_sessions").first()))?.leftAt,
    ).toBe(START);
    expect(f.sdk.deleteRoom).toHaveBeenCalledTimes(1);
  });

  test("recovery after the scheduled end does not extend the deadline on every reopen", async () => {
    const f = await setup();
    await f.start();
    await f.close();
    vi.setSystemTime(END + 60_000);
    await f.reopen();
    expect((await f.lifecycle())?.liveExtensionEndsAt).toBe(END + 10 * 60_000);
    await f.close();
    vi.setSystemTime(END + 2 * 60_000);
    await f.reopen();
    expect((await f.lifecycle())?.liveExtensionEndsAt).toBe(END + 10 * 60_000);
    expect((await f.schedule())?.liveExtensionEndsAt).toBeUndefined();
  });

  test("hard limit closes even with participants and blocks another reopen", async () => {
    const f = await setup();
    await f.start();
    f.sdk.listParticipants.mockResolvedValue(f.participants());
    vi.setSystemTime(getLiveSessionHardEnd(END));
    await f.t.action(internal.livekit.reconcileLiveSession, { roomName: ROOM });
    expect((await f.schedule())?.status).toBe("completed");
    await expect(f.reopen()).rejects.toThrow("SESSION_REOPEN_NOT_AVAILABLE");
  });

  test("repeated stable reconciliation does not multiply scheduled checks", async () => {
    const f = await setup();
    await f.start();
    f.sdk.listParticipants.mockResolvedValue(f.participants());
    const jobs = () =>
      f.t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    const initial = await jobs();
    for (let i = 0; i < 12; i++) {
      vi.setSystemTime(START + i * 1_000);
      await f.t.action(internal.livekit.reconcileLiveSession, {
        roomName: ROOM,
      });
    }
    expect(await jobs()).toHaveLength(initial.length);
    expect(f.sdk.deleteRoom).not.toHaveBeenCalled();
  });

  test("scheduled checks of the new activation enforce its end and hard limit", async () => {
    const f = await setup();
    await f.start();
    await f.close();
    await f.reopen();
    const activationId = (await f.lifecycle())!.activationId;
    const jobs = await f.t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    expect(
      jobs
        .filter(
          (job) =>
            job.name === "livekit:reconcileLiveSession" &&
            job.args[0].expectedActivationId === activationId,
        )
        .map((job) => job.scheduledTime),
    ).toEqual([END, getLiveSessionHardEnd(END)]);
    f.sdk.listParticipants.mockResolvedValue(f.participants());
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await f.schedule())?.status).toBe("completed");
    expect(f.sdk.deleteRoom).toHaveBeenCalledTimes(2);
  });

  test("manual and automatic closers share one claim", async () => {
    const f = await setup();
    await f.start();
    await f.saveReport();
    f.sdk.listParticipants.mockImplementationOnce(async () => {
      await f.end();
      return [];
    });
    await f.t.action(internal.livekit.reconcileLiveSession, { roomName: ROOM });
    await f.flush();
    expect(f.sdk.deleteRoom).toHaveBeenCalledTimes(1);
    expect((await f.schedule())?.sessionEndedBy).toBe(f.data.teacherId);
  });

  test("another claim or activation cannot complete the pending close", async () => {
    const f = await setup();
    await f.start();
    const activationId = (await f.lifecycle())!.activationId;
    await f.t.mutation(internal.schedule.claimLiveSessionEnd, {
      roomName: ROOM,
      expectedActivationId: activationId,
      claimId: "owner",
      endedAt: START,
    });
    for (const [expectedActivationId, claimId] of [
      [activationId, "intruder"],
      ["old", "owner"],
    ]) {
      expect(
        await f.t.mutation(internal.schedule.completeLiveSessionEnd, {
          roomName: ROOM,
          expectedActivationId,
          claimId,
        }),
      ).toBe(false);
    }
    expect((await f.schedule())?.sessionReopenUntil).toBeUndefined();
    expect(
      await f.t.mutation(internal.schedule.completeLiveSessionEnd, {
        roomName: ROOM,
        expectedActivationId: activationId,
        claimId: "owner",
      }),
    ).toBe(true);
    expect(
      await f.t.mutation(internal.schedule.completeLiveSessionEnd, {
        roomName: ROOM,
        expectedActivationId: activationId,
        claimId: "owner",
      }),
    ).toBe(false);
  });

  test("closure stops only active or starting egresses", async () => {
    const f = await setup();
    await f.start();
    f.sdk.listEgress.mockResolvedValue([
      new EgressInfo({
        egressId: "starting",
        status: EgressStatus.EGRESS_STARTING,
      }),
      new EgressInfo({
        egressId: "active",
        status: EgressStatus.EGRESS_ACTIVE,
      }),
      new EgressInfo({
        egressId: "ending",
        status: EgressStatus.EGRESS_ENDING,
      }),
      new EgressInfo({
        egressId: "complete",
        status: EgressStatus.EGRESS_COMPLETE,
      }),
    ]);
    await f.close();
    expect(f.sdk.stopEgress.mock.calls.map(([id]) => id)).toEqual([
      "starting",
      "active",
    ]);
  });
});

// These are ordinary regression tests: failures are audit findings, not accepted behavior.
describe("reopening audit: safety regressions", () => {
  test("whiteboard expiry does not wait for an unavailable LiveKit service", async () => {
    const f = await setup();
    await f.start();
    await f.teacher.mutation(api.whiteboardSessions.upsertScene, {
      roomName: ROOM,
      elements: [{ id: "expires" }],
    });
    f.sdk.deleteRoom.mockRejectedValue(new Error("provider unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await f.close();
    await vi.advanceTimersByTimeAsync(70 * 60_000);
    await f.t.finishInProgressScheduledFunctions();
    expect((await f.schedule())?.liveEndClaimId).toBeDefined();
    expect(
      await f.t.run((ctx) => ctx.db.query("whiteboardSessions").first()),
    ).toBeNull();
  });
  test("late whiteboard writes cannot overwrite the reopened scene", async () => {
    const f = await setup();
    await f.start();
    const oldRoom = (await f.lifecycle())!.liveRoomName;
    await f.close();
    await f.reopen();
    await f.teacher.mutation(api.whiteboardSessions.upsertScene, {
      roomName: ROOM,
      expectedLiveRoomName: (await f.lifecycle())!.liveRoomName,
      elements: [{ id: "new-scene" }],
    });
    await f.teacher.mutation(api.whiteboardSessions.upsertScene, {
      roomName: ROOM,
      expectedLiveRoomName: oldRoom,
      elements: [{ id: "old-scene" }],
    });
    expect(
      (
        await f.student.query(api.whiteboardSessions.getScene, {
          roomName: ROOM,
        })
      )?.elements,
    ).toEqual([{ id: "new-scene" }]);
  });

  test("recovery never duplicates an executing cleanup, even after its retry deadline", async () => {
    const f = await setup();
    await f.start();
    f.sdk.deleteRoom.mockImplementationOnce(async () => {
      vi.setSystemTime(START + 15 * 60_000);
      await f.t.mutation(internal.liveRoomLifecycle.recoverClosures, {});
      await f.t.mutation(internal.liveRoomLifecycle.recoverClosures, {});
      const jobs = await f.t.run((ctx) =>
        ctx.db.query("liveRoomActivations").collect(),
      );
      expect(jobs).toHaveLength(1);
      expect((await f.schedule())?.liveEndClaimId).toBeDefined();
    });
    await f.close();
    expect(f.sdk.deleteRoom).toHaveBeenCalledTimes(1);
    expect((await f.schedule())?.liveEndClaimId).toBeUndefined();
  });

  test("repeated external failure has bounded immediate retries and remains recoverable", async () => {
    const f = await setup();
    await f.start();
    f.sdk.deleteRoom.mockRejectedValue(new Error("provider unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await f.close();
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    await f.t.finishInProgressScheduledFunctions();
    expect(f.sdk.deleteRoom).toHaveBeenCalledTimes(6);
    expect((await f.schedule())?.liveCleanupRetrying).toBe(true);
    f.sdk.deleteRoom.mockResolvedValue(undefined);
    await f.t.mutation(internal.liveRoomLifecycle.recoverClosures, {});
    await f.flush();
    expect((await f.schedule())?.liveCleanupRetrying).toBeUndefined();
    expect((await f.schedule())?.completedAt).toBe(START);
    expect((await f.schedule())?.sessionEndedBy).toBe(f.data.teacherId);
    await f.reopen();
  });

  test("stopping a queued recording prevents the external start", async () => {
    const f = await setup();
    await f.start();
    await f.teacher.action(api.livekit.toggleRecording, {
      roomName: ROOM,
      start: true,
    });
    await f.teacher.action(api.livekit.toggleRecording, {
      roomName: ROOM,
      start: false,
    });
    await f.flush();
    expect(f.sdk.startEgress).not.toHaveBeenCalled();
    expect(
      await f.teacher.query(api.liveRoomLifecycle.getRecordingOperation, {
        roomName: ROOM,
        activationId: (await f.lifecycle())!.activationId,
      }),
    ).toEqual({ pending: false, failed: false });
  });

  test("an asynchronous recording error is observable and its token is revoked", async () => {
    const f = await setup();
    await f.start();
    const activationId = (await f.lifecycle())!.activationId;
    f.sdk.startEgress.mockRejectedValueOnce(
      new Error("recording provider unavailable"),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await f.teacher.action(api.livekit.toggleRecording, {
      roomName: ROOM,
      start: true,
    });
    await f.flush();
    expect(
      await f.teacher.query(api.liveRoomLifecycle.getRecordingOperation, {
        roomName: ROOM,
        activationId,
      }),
    ).toEqual({ pending: false, failed: true });
    expect(
      (await f.t.run((ctx) => ctx.db.query("whiteboardSessions").first()))
        ?.recordingToken,
    ).toBeUndefined();
    await f.close();
    await f.reopen();
  });

  test("one thousand reopenings still belong to exactly one academic occurrence", async () => {
    const f = await setup();
    await f.start();
    await f.teacher.mutation(api.whiteboardSessions.upsertScene, {
      roomName: ROOM,
      elements: [{ id: "preserved" }],
    });
    const rooms = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      rooms.add((await f.lifecycle())!.liveRoomName);
      await f.close();
      await f.reopen();
    }
    const state = await f.t.run(async (ctx) => ({
      schedules: await ctx.db.query("classSchedule").collect(),
      reports: await ctx.db.query("classSessionReports").collect(),
      attendance: await ctx.db.query("studentAttendanceRecords").collect(),
      boards: await ctx.db.query("whiteboardSessions").collect(),
    }));
    expect(rooms.size).toBe(1000);
    expect(state.schedules).toHaveLength(1);
    expect(state.schedules[0]).toMatchObject({
      _id: f.data.scheduleId,
      classId: f.data.classId,
      roomName: ROOM,
    });
    expect(state.reports).toHaveLength(1);
    expect(state.attendance).toHaveLength(1);
    expect(state.boards).toHaveLength(1);
    expect(state.boards[0].elements).toEqual([{ id: "preserved" }]);
  }, 30_000);

  test("an old connection cannot close a replacement connection in the same activation", async () => {
    const f = await setup();
    await f.start();
    const activationId = (await f.lifecycle())!.activationId;
    const args = { scheduleId: f.data.scheduleId, activationId };
    await f.student.mutation(api.schedule.logStudentPresence, {
      ...args,
      action: "join",
      connectionId: "first",
    });
    await f.student.mutation(api.schedule.logStudentPresence, {
      ...args,
      action: "join",
      connectionId: "replacement",
    });
    await f.student.mutation(api.schedule.logStudentPresence, {
      ...args,
      action: "leave",
      connectionId: "first",
    });
    expect(
      (await f.t.run((ctx) => ctx.db.query("class_sessions").first()))?.leftAt,
    ).toBeUndefined();
    await f.student.mutation(api.schedule.logStudentPresence, {
      ...args,
      action: "leave",
      connectionId: "replacement",
    });
    expect(
      (await f.t.run((ctx) => ctx.db.query("class_sessions").first()))?.leftAt,
    ).toBe(START);
  });

  test("the complete old recording webhook cannot revoke the reopened whiteboard token", async () => {
    const f = await setup();
    await f.start();
    const old = (await f.lifecycle())!;
    await f.t.mutation(internal.recordings.createRecording, {
      scheduleId: f.data.scheduleId,
      roomName: ROOM,
      egressId: "recording-a",
      startedAt: START,
      activationId: old.activationId,
      recordingToken: "token-a",
    });
    await f.close();
    await f.reopen();
    await f.t.mutation(internal.whiteboardSessions.setRecordingToken, {
      roomName: ROOM,
      recordingToken: "token-b",
    });
    vi.spyOn(WebhookReceiver.prototype, "receive").mockResolvedValue(
      new WebhookEvent({
        event: "egress_ended",
        egressInfo: new EgressInfo({
          egressId: "recording-a",
          roomName: old.liveRoomName,
          status: EgressStatus.EGRESS_COMPLETE,
        }),
      }),
    );
    await f.t.action(internal.livekit.processEgressWebhook, {
      body: "{}",
      authorization: "verified-by-fixture",
    });
    expect(
      (await f.t.run((ctx) => ctx.db.query("whiteboardSessions").first()))
        ?.recordingToken,
    ).toBe("token-b");
    expect(
      (await f.t.run((ctx) => ctx.db.query("recordings").first()))?.status,
    ).toBe("complete");
  });

  test("participant callbacks from an old physical room do not reconcile the reopening", async () => {
    const f = await setup();
    await f.start();
    const old = (await f.lifecycle())!;
    await f.close();
    await f.reopen();
    f.sdk.listRooms.mockClear();
    vi.spyOn(WebhookReceiver.prototype, "receive").mockResolvedValue(
      new WebhookEvent({
        event: "participant_left",
        room: new Room({ name: old.liveRoomName }),
      }),
    );
    await f.t.action(internal.livekit.processEgressWebhook, {
      body: "{}",
      authorization: "verified-by-fixture",
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await f.t.finishInProgressScheduledFunctions();
    expect(f.sdk.listRooms).not.toHaveBeenCalled();
    expect((await f.schedule())?.isLive).toBe(true);
  });

  test("legacy interrupted claims acquire a durable cleanup without duplicating the occurrence", async () => {
    const f = await setup();
    await f.start();
    await f.t.run((ctx) =>
      ctx.db.patch(f.data.scheduleId, {
        liveRoomName: undefined,
        liveActivationId: undefined,
        isLive: false,
        status: "completed",
        liveEndClaimId: "legacy-interrupted",
        completedAt: START,
      }),
    );
    await f.t.mutation(internal.liveRoomLifecycle.recoverClosures, {});
    await f.flush();
    expect((await f.schedule())?.liveEndClaimId).toBeUndefined();
    expect(f.sdk.deleteRoom).toHaveBeenCalledWith(ROOM);
    await f.reopen();
    expect((await f.schedule())?._id).toBe(f.data.scheduleId);
    expect((await f.lifecycle())?.liveRoomName).not.toBe(ROOM);
  });

  test("a cleanup executor interrupted after claim is recovered from scheduler state", async () => {
    const f = await setup();
    await f.start();
    await f.saveReport();
    await f.end();
    const activationId = (await f.lifecycle())!.activationId;
    const activation = (await f.t.query(
      internal.liveRoomLifecycle.getActivation,
      { activationId },
    ))!;
    await f.t.run((ctx) => ctx.scheduler.cancel(activation.cleanupJobId!));
    vi.setSystemTime(START + 2 * 60_000);
    await f.t.mutation(internal.liveRoomLifecycle.recoverClosures, {});
    await f.flush();
    expect((await f.schedule())?.liveEndClaimId).toBeUndefined();
    await f.reopen();
  });

  test("an in-flight recording start is compensated before the class is available to reopen", async () => {
    const f = await setup();
    await f.start();
    const activationId = (await f.lifecycle())!.activationId;
    f.sdk.startEgress.mockImplementationOnce(async () => {
      await f.saveReport();
      await f.end();
      await expect(f.reopen()).rejects.toThrow("SESSION_REOPEN_NOT_AVAILABLE");
      expect(
        await f.t.mutation(internal.liveRoomLifecycle.prepareCleanup, {
          activationId,
        }),
      ).toBeNull();
      return new EgressInfo({ egressId: "late-start" });
    });
    await f.teacher.action(api.livekit.toggleRecording, {
      roomName: ROOM,
      start: true,
      expectedActivationId: activationId,
    });
    await f.flush();
    await vi.advanceTimersByTimeAsync(10_000);
    await f.t.finishInProgressScheduledFunctions();
    expect(f.sdk.stopEgress).toHaveBeenCalledWith("late-start");
    await f.reopen();
    expect((await f.schedule())?._id).toBe(f.data.scheduleId);
  });

  test("simultaneous recording starts only schedule one external start", async () => {
    const f = await setup();
    await f.start();
    const results = await Promise.all([
      f.teacher.action(api.livekit.toggleRecording, {
        roomName: ROOM,
        start: true,
      }),
      f.teacher.action(api.livekit.toggleRecording, {
        roomName: ROOM,
        start: true,
      }),
    ]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    await f.flush();
    expect(f.sdk.startEgress).toHaveBeenCalledTimes(1);
    expect(
      (await f.t.run((ctx) => ctx.db.query("recordings").first()))?.scheduleId,
    ).toBe(f.data.scheduleId);
  });

  test("a stale or unscoped browser command cannot close or get a token for the reopening", async () => {
    const f = await setup();
    await f.start();
    const old = (await f.lifecycle())!.activationId;
    await f.close();
    await f.reopen();
    for (const expectedActivationId of [undefined, old]) {
      await expect(
        f.teacher.action(api.livekit.endSession, {
          roomName: ROOM,
          expectedActivationId,
        }),
      ).rejects.toThrow("STALE_LIVE_ACTIVATION");
      await expect(
        f.student.action(api.livekit.getToken, {
          roomName: ROOM,
          expectedActivationId,
        }),
      ).rejects.toThrow("STALE_LIVE_ACTIVATION");
    }
    expect((await f.schedule())?.isLive).toBe(true);
  });

  test("a failed stale-state update must not schedule an unscoped retry against the new activation", async () => {
    const f = await setup();
    await f.start();
    f.sdk.listParticipants.mockImplementationOnce(async () => {
      await f.close();
      await f.reopen();
      return f.participants();
    });
    await f.t.action(internal.livekit.reconcileLiveSession, { roomName: ROOM });
    expect((await f.schedule())?.isLive).toBe(true);
    await vi.advanceTimersByTimeAsync(1_000);
    await f.t.finishInProgressScheduledFunctions();
    expect((await f.schedule())?.isLive).toBe(true);
    expect(f.sdk.deleteRoom).toHaveBeenCalledTimes(1);
  });

  test("an interrupted close can recover via retry or the lifecycle backstop", async () => {
    const f = await setup();
    await f.start();
    await f.saveReport();
    const activationId = (await f.lifecycle())!.activationId;
    expect(
      await f.t.mutation(internal.schedule.claimLiveSessionEnd, {
        roomName: ROOM,
        expectedActivationId: activationId,
        claimId: "interrupted",
        endedAt: START,
      }),
    ).toBe(true);
    // State left by a terminated action, or by a failed completion mutation.
    vi.setSystemTime(START + 15 * 60_000);
    await f.end();
    await f.t.action(internal.livekit.reconcileActiveSessions, {});
    await f.flush();
    expect((await f.schedule())?.liveEndClaimId).toBeUndefined();
    await expect(f.reopen()).resolves.toBeNull();
  });

  test("a confirmed extension is not overwritten by an older closing decision", async () => {
    const f = await setup();
    await f.start();
    vi.setSystemTime(END + 60_000);
    await f.t.run((ctx) =>
      ctx.db.patch(f.data.scheduleId, { liveDecisionEndsAt: END + 5 * 60_000 }),
    );
    f.sdk.listParticipants.mockImplementationOnce(async () => {
      await f.teacher.mutation(api.schedule.confirmLiveExtension, {
        roomName: ROOM,
      });
      // Snapshot from before confirmation: only the teacher was recognized.
      return [f.participants()[0]];
    });
    await f.t.action(internal.livekit.reconcileLiveSession, { roomName: ROOM });
    expect(await f.schedule()).toMatchObject({
      status: "active",
      liveExtensionEndsAt: END + 10 * 60_000,
    });
    expect(f.sdk.deleteRoom).not.toHaveBeenCalled();
  });

  test("a delayed leave from the previous activation cannot end new attendance", async () => {
    const f = await setup();
    await f.start();
    const oldActivationId = (await f.lifecycle())!.activationId;
    await f.student.mutation(api.schedule.logStudentPresence, {
      scheduleId: f.data.scheduleId,
      activationId: (await f.lifecycle())!.activationId,
      connectionId: "audit-connection",
      action: "join",
    });
    vi.setSystemTime(START + 60_000);
    await f.close();
    vi.setSystemTime(START + 2 * 60_000);
    await f.reopen();
    await f.student.mutation(api.schedule.logStudentPresence, {
      scheduleId: f.data.scheduleId,
      activationId: (await f.lifecycle())!.activationId,
      connectionId: "audit-connection",
      action: "join",
    });
    vi.setSystemTime(START + 3 * 60_000);
    await f.student.mutation(api.schedule.logStudentPresence, {
      scheduleId: f.data.scheduleId,
      activationId: oldActivationId,
      connectionId: "audit-connection",
      action: "leave",
    });
    const open = await f.t.run((ctx) =>
      ctx.db
        .query("class_sessions")
        .withIndex("by_schedule", (q) =>
          q.eq("scheduleId", f.data.scheduleId).eq("leftAt", undefined),
        )
        .collect(),
    );
    expect(open).toHaveLength(1);
  });

  test("failed LiveKit deletion is retried before reopening the same physical room", async () => {
    const f = await setup();
    await f.start();
    f.sdk.deleteRoom.mockRejectedValueOnce(new Error("LiveKit unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await f.close();
    await f.t.action(internal.livekit.reconcileActiveSessions, {});
    const status = await f.teacher.query(api.schedule.getSessionStatus, {
      sessionId: ROOM,
      now: START,
    });
    // Either a successful cleanup retry, or the room must remain unavailable.
    expect(
      f.sdk.deleteRoom.mock.calls.length > 1 || status?.canReopen === false,
    ).toBe(true);
  });

  test("a stale stop-recording action does not stop the new activation recording", async () => {
    const f = await setup();
    await f.start();
    f.sdk.listEgress.mockImplementationOnce(async () => {
      await f.close();
      await f.reopen();
      await f.t.mutation(internal.whiteboardSessions.setRecordingToken, {
        roomName: ROOM,
        recordingToken: "activation-b",
      });
      return [
        new EgressInfo({
          egressId: "recording-b",
          status: EgressStatus.EGRESS_ACTIVE,
        }),
      ];
    });
    await f.teacher.action(api.livekit.toggleRecording, {
      roomName: ROOM,
      start: false,
    });
    expect(f.sdk.stopEgress).not.toHaveBeenCalledWith("recording-b");
    expect(
      (await f.t.run((ctx) => ctx.db.query("whiteboardSessions").first()))
        ?.recordingToken,
    ).toBe("activation-b");
  });

  test("a recording request cannot start after its activation has closed", async () => {
    const f = await setup();
    await f.start();
    f.sdk.listEgress.mockImplementationOnce(async () => {
      await f.saveReport();
      await f.end();
      return [];
    });
    await f.teacher
      .action(api.livekit.toggleRecording, { roomName: ROOM, start: true })
      .catch(() => null);
    await f.flush();
    expect(f.sdk.startEgress).not.toHaveBeenCalled();
    expect(
      (await f.t.run((ctx) => ctx.db.query("whiteboardSessions").first()))
        ?.recordingToken,
    ).toBeUndefined();
  });

  test("the legacy direct end mutation cannot close a newer activation", async () => {
    const f = await setup();
    await f.start();
    await f.close();
    vi.setSystemTime(START + 60_000);
    await f.reopen();
    const exports = await import("./schedule");
    expect("endLiveSession" in exports).toBe(false);
    expect((await f.schedule())?.status).toBe("active");
  });
});
