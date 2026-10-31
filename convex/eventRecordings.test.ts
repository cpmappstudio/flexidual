import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { EgressClient, EgressInfo, EgressStatus } from "livekit-server-sdk";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const storage = vi.hoisted(() => ({
  keys: [] as string[],
  deleted: [] as string[],
}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    async send(command: { input: { Prefix?: string; Key?: string } }) {
      if (command.input.Prefix)
        return {
          Contents: storage.keys
            .filter((key) => key.startsWith(command.input.Prefix!))
            .map((Key) => ({ Key })),
        };
      if (command.input.Key) {
        storage.deleted.push(command.input.Key);
        storage.keys = storage.keys.filter((key) => key !== command.input.Key);
      }
      return {};
    }
  },
  ListObjectsV2Command: class {
    constructor(public input: { Prefix: string }) {}
  },
  DeleteObjectCommand: class {
    constructor(public input: { Key: string }) {}
  },
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  storage.keys = [];
  storage.deleted = [];
});

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (name: string) =>
      ctx.db.insert("users", {
        clerkId: name,
        firstName: name,
        lastName: "Test",
        fullName: `${name} Test`,
        isActive: true,
        createdAt: 1,
      });
    const admin = await user("recording-event-admin");
    const teacher = await user("recording-event-teacher");
    const student = await user("recording-event-student");
    const newStudent = await user("recording-event-new-student");
    const outsider = await user("recording-event-outsider");
    const tutor = await user("recording-event-tutor");
    const schoolId = await ctx.db.insert("schools", {
      name: "Event school",
      slug: "event-school",
      timeZone: "America/Bogota",
      isActive: true,
      createdAt: 1,
      createdBy: admin,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Event campus",
      slug: "event-campus",
      isActive: true,
      createdAt: 1,
      createdBy: admin,
    });
    const assign = (
      userId: typeof admin,
      role: "admin" | "teacher" | "student" | "tutor",
      orgType: "school" | "campus",
      orgId: typeof schoolId | typeof campusId,
      gradeCode?: string,
    ) =>
      ctx.db.insert("roleAssignments", {
        userId,
        role,
        orgType,
        orgId,
        schoolId,
        gradeCode,
        assignedAt: 1,
      });
    await assign(admin, "admin", "school", schoolId);
    await assign(teacher, "teacher", "campus", campusId);
    const studentAssignment = await assign(
      student,
      "student",
      "campus",
      campusId,
      "05",
    );
    const newStudentAssignment = await assign(
      newStudent,
      "student",
      "campus",
      campusId,
      "06",
    );
    await assign(outsider, "student", "campus", campusId, "06");
    await assign(tutor, "tutor", "campus", campusId);
    const eventId = await ctx.db.insert("events", {
      schoolId,
      campusId,
      gradeCodes: ["05"],
      title: "Flag ceremony",
      responsibleId: teacher,
      teacherIds: [],
      timeZone: "America/Bogota",
      createdAt: 1,
      createdBy: admin,
    });
    const occurrenceId = await ctx.db.insert("eventOccurrences", {
      eventId,
      schoolId,
      campusId,
      scheduledStart: 100,
      scheduledEnd: 200,
      status: "active",
      roomName: "event-recording-room",
      isLive: true,
      liveActivationId: "event-recording-activation",
      liveRoomName: "event-recording-live-room",
      sessionLeaderId: teacher,
      createdAt: 1,
      createdBy: admin,
    });
    await ctx.db.insert("liveRoomActivations", {
      eventOccurrenceId: occurrenceId,
      activationId: "event-recording-activation",
      roomName: "event-recording-room",
      liveRoomName: "event-recording-live-room",
      status: "active",
      cleanupAttempts: 0,
      nextCleanupAt: 0,
      recordingToken: "event-recording-token",
    });
    await ctx.db.insert("whiteboardSessions", {
      roomName: "event-recording-room",
      elements: [],
      updatedAt: 1,
      recordingToken: "event-recording-token",
    });
    return {
      admin,
      teacher,
      student,
      newStudent,
      outsider,
      studentAssignment,
      newStudentAssignment,
      eventId,
      occurrenceId,
    };
  });
  return { t, ...ids };
}

test("an aborted event recording stays visible as a failed attempt", async () => {
  const f = await setup();
  await f.t.run((ctx) =>
    ctx.db.patch(f.occurrenceId, { status: "completed", isLive: false }),
  );
  const recordingId = await f.t.mutation(internal.recordings.createRecording, {
    eventOccurrenceId: f.occurrenceId,
    roomName: "event-recording-room",
    egressId: "aborted-event-egress",
    startedAt: 123,
  });
  await f.t.mutation(internal.recordings.updateFromWebhook, {
    egressId: "aborted-event-egress",
    status: "aborted",
    error: "Start signal not received",
  });

  const history = await f.t
    .withIdentity({ subject: "recording-event-teacher" })
    .query(api.events.listOccurrences, {
      eventId: f.eventId,
      category: "past",
      now: 300,
      paginationOpts: { cursor: null, numItems: 10 },
    });
  expect(history.page[0]).toMatchObject({
    _id: f.occurrenceId,
    hasRecording: false,
    recordingFailed: true,
  });
  expect(
    await f.t
      .withIdentity({ subject: "recording-event-teacher" })
      .query(api.recordings.getEventRecordingTarget, {
        eventId: f.eventId,
        recordingId,
      }),
  ).toBeNull();
});

test("event recordings belong to one occurrence and follow current grade membership", async () => {
  const f = await setup();
  await expect(
    f.t.mutation(internal.recordings.createRecording, {
      roomName: "event-recording-room",
      egressId: "missing-target",
      startedAt: 1,
    }),
  ).rejects.toThrow("INVALID_RECORDING_TARGET");
  const classScheduleId = await f.t.run(async (ctx) => {
    const curriculumId = await ctx.db.insert("curriculums", {
      schoolId: (await ctx.db.get(f.eventId))!.schoolId,
      title: "Class",
      isActive: true,
      createdAt: 1,
      createdBy: f.admin,
    });
    const classId = await ctx.db.insert("classes", {
      name: "Class",
      curriculumId,
      teacherId: f.teacher,
      isActive: true,
      createdAt: 1,
      createdBy: f.admin,
    });
    return ctx.db.insert("classSchedule", {
      classId,
      roomName: "class-recording-room",
      scheduledStart: 100,
      scheduledEnd: 200,
      status: "completed",
      createdAt: 1,
      createdBy: f.admin,
    });
  });
  await expect(
    f.t.mutation(internal.recordings.createRecording, {
      scheduleId: classScheduleId,
      eventOccurrenceId: f.occurrenceId,
      roomName: "invalid-shared-room",
      egressId: "two-targets",
      startedAt: 1,
    }),
  ).rejects.toThrow("INVALID_RECORDING_TARGET");
  const recordingId = await f.t.mutation(internal.recordings.createRecording, {
    eventOccurrenceId: f.occurrenceId,
    roomName: "event-recording-room",
    activationId: "event-recording-activation",
    recordingToken: "event-recording-token",
    egressId: "event-egress",
    startedAt: 123,
  });
  expect(
    (await f.t.run((ctx) => ctx.db.get("recordings", recordingId)))
      ?.eventOccurrenceId,
  ).toBe(f.occurrenceId);
  await f.t.mutation(internal.recordings.updateFromWebhook, {
    egressId: "event-egress",
    status: "complete",
    url: "https://recordings.example/event.mp4",
  });
  const list = (subject: string) =>
    f.t.withIdentity({ subject }).query(api.recordings.getByEventOccurrence, {
      occurrenceId: f.occurrenceId,
    });
  expect(await list("recording-event-student")).toMatchObject([
    { _id: recordingId, url: "https://recordings.example/event.mp4" },
  ]);
  const target = (subject: string) =>
    f.t
      .withIdentity({ subject })
      .query(api.recordings.getEventRecordingTarget, {
        eventId: f.eventId,
        recordingId,
      });
  expect(await target("recording-event-student")).toMatchObject({
    _id: f.occurrenceId,
    start: 100,
    end: 200,
    recording: {
      _id: recordingId,
      url: "https://recordings.example/event.mp4",
    },
  });
  expect(await list("recording-event-tutor")).toEqual([]);
  expect(await list("recording-event-outsider")).toEqual([]);
  expect(await target("recording-event-outsider")).toBeNull();
  await f.t.run(async (ctx) => {
    await ctx.db.patch(f.studentAssignment, { gradeCode: "06" });
    await ctx.db.patch(f.newStudentAssignment, { gradeCode: "05" });
  });
  expect(await list("recording-event-student")).toEqual([]);
  expect(await list("recording-event-new-student")).toHaveLength(1);
  expect(await target("recording-event-student")).toBeNull();
});

test("event recording context uses the shared reader token and current leader", async () => {
  const f = await setup();
  const context = (recordingToken: string) =>
    f.t.query(api.whiteboardSessions.getRecordingContext, {
      roomName: "event-recording-room",
      recordingToken,
    });
  await expect(context("incorrect")).rejects.toThrow("PERMISSION_DENIED");
  expect(await context("event-recording-token")).toEqual({
    eventId: f.eventId,
    eventTitle: "Flag ceremony",
    leaderParticipantIdentity: "recording-event-teacher",
  });
  await f.t.run((ctx) =>
    ctx.db.patch(f.occurrenceId, { sessionLeaderId: f.student }),
  );
  expect(await context("event-recording-token")).toMatchObject({
    leaderParticipantIdentity: "recording-event-student",
  });
});

test("playable event recordings notify the current audience once and hide revoked access", async () => {
  vi.useFakeTimers();
  const f = await setup();
  const extraStudents = await f.t.run(async (ctx) => {
    const event = (await ctx.db.get(f.eventId))!;
    const ids = [];
    for (let index = 0; index < 25; index++) {
      const userId = await ctx.db.insert("users", {
        clerkId: `recording-extra-${index}`,
        firstName: "Extra",
        lastName: String(index),
        fullName: `Extra ${index}`,
        isActive: true,
        createdAt: 1,
      });
      await ctx.db.insert("roleAssignments", {
        userId,
        role: "student",
        orgType: "campus",
        orgId: event.campusId!,
        schoolId: event.schoolId,
        gradeCode: "05",
        assignedAt: 1,
      });
      ids.push(userId);
    }
    return ids;
  });
  const recordingId = await f.t.mutation(internal.recordings.createRecording, {
    eventOccurrenceId: f.occurrenceId,
    roomName: "event-recording-room",
    egressId: "event-notification-egress",
    startedAt: 123,
  });
  await f.t.mutation(internal.recordings.updateFromWebhook, {
    egressId: "event-notification-egress",
    status: "complete",
  });
  expect(
    await f.t.run((ctx) => ctx.db.query("systemNotifications").collect()),
  ).toEqual([]);
  await f.t.mutation(internal.recordings.updateFromWebhook, {
    egressId: "event-notification-egress",
    status: "complete",
    url: "https://recordings.example/event.mp4",
  });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  const notifications = await f.t.run((ctx) =>
    ctx.db.query("systemNotifications").collect(),
  );
  expect(notifications).toHaveLength(28);
  expect(new Set(notifications.map((item) => item.recipientId))).toEqual(
    new Set([f.admin, f.teacher, f.student, ...extraStudents]),
  );
  expect(notifications.every((item) => item.recordingId === recordingId)).toBe(
    true,
  );
  await f.t.mutation(internal.recordings.updateFromWebhook, {
    egressId: "event-notification-egress",
    status: "complete",
    url: "https://recordings.example/event.mp4",
  });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    await f.t.run((ctx) => ctx.db.query("systemNotifications").collect()),
  ).toHaveLength(28);
  await f.t.run((ctx) =>
    ctx.db.patch(f.studentAssignment, { gradeCode: "06" }),
  );
  const visible = await f.t
    .withIdentity({ subject: "recording-event-student" })
    .query(api.systemNotifications.list, {
      paginationOpts: { cursor: null, numItems: 10 },
    });
  expect(visible.page).toEqual([]);
});

test("deleting an event removes its recording records and notices after room cleanup", async () => {
  vi.useFakeTimers();
  for (const key of [
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ENDPOINT",
  ])
    vi.stubEnv(key, "test");
  const f = await setup();
  storage.keys = [
    `recordings/${f.occurrenceId}/first.mp4`,
    `recordings/${f.occurrenceId}/second.mp4`,
    "recordings/other-occurrence/untouched.mp4",
  ];
  const recordingId = await f.t.mutation(internal.recordings.createRecording, {
    eventOccurrenceId: f.occurrenceId,
    roomName: "event-recording-room",
    egressId: "event-delete-egress",
    startedAt: 123,
  });
  await f.t.mutation(internal.recordings.updateFromWebhook, {
    egressId: "event-delete-egress",
    status: "complete",
    url: "https://recordings.example/deleted.mp4",
  });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  await f.t.run(async (ctx) => {
    for (let index = 0; index < 53; index++) {
      await ctx.db.insert("systemNotifications", {
        recipientId: f.student,
        kind: "recording_available",
        eventId: f.eventId,
        recordingId,
        dedupeKey: `deleted-event-extra-${index}`,
        createdAt: index,
      });
    }
    await ctx.db.patch(f.occurrenceId, { isLive: false, status: "completed" });
    const activation = await ctx.db
      .query("liveRoomActivations")
      .withIndex("by_activation_id", (q) =>
        q.eq("activationId", "event-recording-activation"),
      )
      .unique();
    await ctx.db.patch(activation!._id, { status: "closed" });
    await ctx.db.delete(f.eventId);
  });
  await f.t.mutation(internal.events.removeOccurrencesByEvent, {
    eventId: f.eventId,
  });
  await f.t.mutation(internal.recordings.removeEventNotifications, {
    eventId: f.eventId,
  });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    await f.t.run((ctx) => ctx.db.get("recordings", recordingId)),
  ).toBeNull();
  expect(
    await f.t.run((ctx) => ctx.db.get("eventOccurrences", f.occurrenceId)),
  ).toBeNull();
  expect(
    await f.t.run((ctx) => ctx.db.query("systemNotifications").collect()),
  ).toEqual([]);
  expect(storage.deleted.sort()).toEqual([
    `recordings/${f.occurrenceId}/first.mp4`,
    `recordings/${f.occurrenceId}/second.mp4`,
  ]);
  expect(storage.keys).toEqual(["recordings/other-occurrence/untouched.mp4"]);
});

test("event deletion waits for a recording export before removing its file", async () => {
  vi.useFakeTimers();
  for (const key of [
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "S3_REGION",
    "S3_BUCKET",
    "S3_ENDPOINT",
  ])
    vi.stubEnv(key, "test");
  const f = await setup();
  storage.keys = [`recordings/${f.occurrenceId}/late.mp4`];
  await f.t.mutation(internal.recordings.createRecording, {
    eventOccurrenceId: f.occurrenceId,
    roomName: "event-recording-room",
    egressId: "late-egress",
    startedAt: 123,
  });
  await f.t.run(async (ctx) => {
    await ctx.db.patch(f.occurrenceId, { isLive: false, status: "completed" });
    const activation = await ctx.db
      .query("liveRoomActivations")
      .withIndex("by_activation_id", (q) =>
        q.eq("activationId", "event-recording-activation"),
      )
      .unique();
    await ctx.db.patch(activation!._id, { status: "closed" });
    await ctx.db.delete(f.eventId);
  });
  await f.t.mutation(internal.events.removeOccurrencesByEvent, {
    eventId: f.eventId,
  });
  expect(await f.t.run((ctx) => ctx.db.get(f.occurrenceId))).not.toBeNull();
  expect(storage.deleted).toEqual([]);
  await f.t.mutation(internal.recordings.updateFromWebhook, {
    egressId: "late-egress",
    status: "complete",
    url: "https://recordings.example/late.mp4",
  });
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await f.t.run((ctx) => ctx.db.get(f.occurrenceId))).toBeNull();
  expect(storage.deleted).toEqual([`recordings/${f.occurrenceId}/late.mp4`]);
});

test("event room recording uses the class egress path without a class schedule", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(150);
  for (const [key, value] of Object.entries({
    LIVEKIT_URL: "https://livekit.invalid",
    LIVEKIT_API_KEY: "recording-key",
    LIVEKIT_API_SECRET: "recording-secret-at-least-thirty-two-characters",
    S3_ACCESS_KEY: "storage-key",
    S3_SECRET_KEY: "storage-secret",
    S3_REGION: "auto",
    S3_BUCKET: "recordings",
    S3_ENDPOINT: "https://storage.invalid",
    R2_PUBLIC_URL: "https://files.invalid",
    NEXT_PUBLIC_APP_URL: "https://app.invalid",
    CONVEX_SITE_URL: "https://convex.invalid",
  }))
    vi.stubEnv(key, value);
  const listEgress = vi
    .spyOn(EgressClient.prototype, "listEgress")
    .mockResolvedValue([]);
  const stopEgress = vi
    .spyOn(EgressClient.prototype, "stopEgress")
    .mockResolvedValue(new EgressInfo());
  const startEgress = vi
    .spyOn(EgressClient.prototype, "startRoomCompositeEgress")
    .mockResolvedValue(new EgressInfo({ egressId: "event-live-egress" }));
  const f = await setup();
  const teacher = f.t.withIdentity({ subject: "recording-event-teacher" });
  await expect(
    f.t
      .withIdentity({ subject: "recording-event-student" })
      .action(api.livekit.toggleRecording, {
        roomName: "event-recording-room",
        expectedActivationId: "event-recording-activation",
        start: true,
      }),
  ).rejects.toThrow("Only a room administrator");
  expect(
    await teacher.action(api.livekit.toggleRecording, {
      roomName: "event-recording-room",
      expectedActivationId: "event-recording-activation",
      start: true,
    }),
  ).toMatchObject({ success: true });
  await vi.advanceTimersByTimeAsync(0);
  await f.t.finishInProgressScheduledFunctions();
  expect(startEgress).toHaveBeenCalledOnce();
  const recording = await f.t.run((ctx) =>
    ctx.db
      .query("recordings")
      .withIndex("by_egress_id", (q) => q.eq("egressId", "event-live-egress"))
      .unique(),
  );
  expect(recording).toMatchObject({
    eventOccurrenceId: f.occurrenceId,
    activationId: "event-recording-activation",
    status: "starting",
  });
  expect(recording?.scheduleId).toBeUndefined();
  expect(
    await teacher.query(api.whiteboardSessions.getRealtimeAudience, {
      roomName: "event-recording-room",
      expectedLiveRoomName: "event-recording-live-room",
      participants: [
        {
          identity: "recording-event-student",
          userId: f.student,
        },
        {
          identity: "recording-event-outsider",
          userId: f.outsider,
        },
      ],
    }),
  ).toEqual(["event-live-egress", "recording-event-student"]);
  listEgress.mockResolvedValue([
    new EgressInfo({
      egressId: "event-live-egress",
      status: EgressStatus.EGRESS_ACTIVE,
    }),
  ]);
  expect(
    await teacher.action(api.livekit.toggleRecording, {
      roomName: "event-recording-room",
      expectedActivationId: "event-recording-activation",
      start: false,
    }),
  ).toMatchObject({ success: true });
  expect(stopEgress).toHaveBeenCalledWith("event-live-egress");
  await expect(
    f.t.query(api.whiteboardSessions.getRecordingContext, {
      roomName: "event-recording-room",
      recordingToken: recording!.recordingToken!,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
});
