import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  setupRecordingContext,
  storeWhiteboardImage,
} from "../tests/fixtures/whiteboard";

const ROOM = "recording-room";
const TOKEN = "valid-recording-token";

async function setup() {
  const fixture = await setupRecordingContext();
  const { t, classId, secondLeaderId } = fixture;
  const teacherId = await t.run(async (ctx) => {
    const course = await ctx.db.get("classes", classId);
    await ctx.db.patch("classes", classId, { students: [secondLeaderId] });
    return course!.teacherId!;
  });
  const reader = t.withIdentity({ subject: "recording-leader-two" });
  const teacher = t.withIdentity({ subject: "recording-leader-one" });
  const args = {
    roomName: ROOM,
    expectedLiveRoomName: ROOM,
    writerId: teacherId,
  };
  return { ...fixture, teacherId, reader, teacher, args };
}

test("an enrolled reader may verify assigned teachers, tutors and administrators, not students", async () => {
  const { t, reader, classId, secondLeaderId, args } = await setup();
  await expect(
    reader.query(api.whiteboardSessions.getRealtimeWriter, args),
  ).resolves.toBe(true);
  await expect(
    reader.query(api.whiteboardSessions.getRealtimeWriter, {
      ...args,
      writerId: secondLeaderId,
    }),
  ).resolves.toBe(false);

  await t.run((ctx) =>
    ctx.db.patch("classes", classId, { tutorId: secondLeaderId }),
  );
  await expect(
    reader.query(api.whiteboardSessions.getRealtimeWriter, {
      ...args,
      writerId: secondLeaderId,
    }),
  ).resolves.toBe(true);

  await t.run(async (ctx) => {
    await ctx.db.patch("classes", classId, { tutorId: undefined });
    await ctx.db.insert("roleAssignments", {
      userId: secondLeaderId,
      orgType: "system",
      role: "superadmin",
      assignedAt: Date.now(),
    });
  });
  await expect(
    reader.query(api.whiteboardSessions.getRealtimeWriter, {
      ...args,
      writerId: secondLeaderId,
    }),
  ).resolves.toBe(true);
});

test("writer deactivation and assignment revocation take effect without changing the reader", async () => {
  const { t, reader, teacherId, classId, args } = await setup();
  await expect(
    reader.query(api.whiteboardSessions.getRealtimeWriter, args),
  ).resolves.toBe(true);
  await t.run((ctx) => ctx.db.patch("users", teacherId, { isActive: false }));
  await expect(
    reader.query(api.whiteboardSessions.getRealtimeWriter, args),
  ).resolves.toBe(false);
  await t.run(async (ctx) => {
    await ctx.db.patch("users", teacherId, { isActive: true });
    await ctx.db.patch("classes", classId, { teacherId: undefined });
  });
  await expect(
    reader.query(api.whiteboardSessions.getRealtimeWriter, args),
  ).resolves.toBe(false);
});

test("stale activations are rejected and the same writer is accepted after checking the new activation", async () => {
  const { t, reader, scheduleId, args } = await setup();
  await t.run((ctx) =>
    ctx.db.patch("classSchedule", scheduleId, {
      liveRoomName: "new-activation",
    }),
  );
  await expect(
    reader.query(api.whiteboardSessions.getRealtimeWriter, args),
  ).resolves.toBe(false);
  await expect(
    reader.query(api.whiteboardSessions.getRealtimeWriter, {
      ...args,
      expectedLiveRoomName: "new-activation",
    }),
  ).resolves.toBe(true);
});

test("an ended session never authorizes a realtime writer, even for an otherwise valid recording token", async () => {
  const { t, scheduleId, args } = await setup();
  await t.run((ctx) =>
    ctx.db.patch("classSchedule", scheduleId, {
      status: "completed",
      isLive: false,
    }),
  );
  await expect(
    t.query(api.whiteboardSessions.getRealtimeWriter, {
      ...args,
      recordingToken: TOKEN,
    }),
  ).resolves.toBe(false);
});

test("outsider readers cannot inspect a writer, even with a valid recording token", async () => {
  const { t, classId, secondLeaderId, reader, args } = await setup();
  await t.run((ctx) => ctx.db.patch("classes", classId, { students: [] }));
  await expect(
    reader.query(api.whiteboardSessions.getRealtimeWriter, {
      ...args,
      recordingToken: TOKEN,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    reader.query(api.whiteboardSessions.getRealtimeWriter, {
      ...args,
      writerId: secondLeaderId,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("anonymous readers need the current recording token, including after manifest upgrade and revocation", async () => {
  const { t, teacher, args } = await setup();
  await expect(
    t.query(api.whiteboardSessions.getRealtimeWriter, args),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    t.query(api.whiteboardSessions.getRealtimeWriter, {
      ...args,
      recordingToken: "wrong",
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    t.query(api.whiteboardSessions.getRealtimeWriter, {
      ...args,
      recordingToken: TOKEN,
    }),
  ).resolves.toBe(true);

  await teacher.mutation(api.whiteboardSessions.ensureScene, {
    roomName: ROOM,
    expectedLiveRoomName: ROOM,
  });
  await expect(
    t.query(api.whiteboardSessions.getRealtimeWriter, {
      ...args,
      recordingToken: TOKEN,
    }),
  ).resolves.toBe(true);
  await t.run(async (ctx) => {
    const manifest = await ctx.db
      .query("whiteboardSceneManifests")
      .withIndex("by_roomName", (q) => q.eq("roomName", ROOM))
      .unique();
    // A revoked current token must not fall back to the older legacy token.
    await ctx.db.patch("whiteboardSceneManifests", manifest!._id, {
      recordingToken: undefined,
    });
  });
  await expect(
    t.query(api.whiteboardSessions.getRealtimeWriter, {
      ...args,
      recordingToken: TOKEN,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("school administration permissions stay scoped and revocable", async () => {
  const { t, reader, classId, secondLeaderId, teacherId, args } = await setup();
  const assignmentId = await t.run(async (ctx) => {
    const course = await ctx.db.get("classes", classId);
    const schoolId = await ctx.db.insert("schools", {
      name: "Whiteboard school",
      slug: "whiteboard-school",
      isActive: true,
      createdAt: Date.now(),
      createdBy: teacherId,
    });
    await ctx.db.patch("curriculums", course!.curriculumId, { schoolId });
    return ctx.db.insert("roleAssignments", {
      userId: secondLeaderId,
      orgType: "school",
      orgId: schoolId,
      role: "admin",
      assignedAt: Date.now(),
    });
  });
  const adminArgs = { ...args, writerId: secondLeaderId };
  await expect(
    reader.query(api.whiteboardSessions.getRealtimeWriter, adminArgs),
  ).resolves.toBe(true);
  await t.run((ctx) =>
    ctx.db.patch("roleAssignments", assignmentId, { orgId: "other-school" }),
  );
  await expect(
    reader.query(api.whiteboardSessions.getRealtimeWriter, adminArgs),
  ).resolves.toBe(false);
  await t.run((ctx) => ctx.db.delete("roleAssignments", assignmentId));
  await expect(
    reader.query(api.whiteboardSessions.getRealtimeWriter, adminArgs),
  ).resolves.toBe(false);
});

test("writer validation does not write or alter persisted drawings and images", async () => {
  const { t, teacher, reader, args } = await setup();
  const imageRef = await storeWhiteboardImage(
    t,
    ROOM,
    "image-file",
    "saved-image",
  );
  const elements = [
    { id: "drawing", version: 1 },
    { id: "image", fileId: "image-file", version: 1 },
  ];
  await teacher.mutation(api.whiteboardSessions.upsertScene, {
    roomName: ROOM,
    elements,
  });
  await reader.run(async (ctx) => {
    expect(
      await ctx.runQuery(api.whiteboardSessions.getRealtimeWriter, args),
    ).toBe(true);
    expect((await ctx.meta.getTransactionMetrics()).documentsWritten.used).toBe(
      0,
    );
  });
  await teacher.run(async (ctx) => {
    expect(
      await ctx.runQuery(api.whiteboardSessions.getRealtimeAudience, {
        roomName: ROOM,
        expectedLiveRoomName: ROOM,
        participants: [
          { userId: args.writerId, identity: "recording-leader-one" },
        ],
      }),
    ).toEqual(["recording-leader-one"]);
    expect((await ctx.meta.getTransactionMetrics()).documentsWritten.used).toBe(
      0,
    );
  });
  const snapshot = await t.run((ctx) =>
    ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", ROOM))
      .unique(),
  );
  expect(snapshot?.elements).toEqual(elements);
  expect(snapshot?.fileRefs).toEqual({ "image-file": imageRef });
  expect(snapshot?.recordingToken).toBe(TOKEN);
});

test("realtime audience binds each active recipient to the exact signed identity and companion permission", async () => {
  const { teacher, teacherId, secondLeaderId, args } = await setup();
  const participants = [
    { userId: teacherId, identity: "recording-leader-one" },
    { userId: teacherId, identity: "recording-leader-one-companion" },
    { userId: secondLeaderId, identity: "recording-leader-two" },
    { userId: secondLeaderId, identity: "recording-leader-two-companion" },
    { userId: secondLeaderId, identity: "recording-leader-one" },
    { userId: teacherId, identity: "forged-participant" },
    { userId: teacherId, identity: "recording-leader-one" },
  ];
  await expect(
    teacher.query(api.whiteboardSessions.getRealtimeAudience, {
      roomName: ROOM,
      expectedLiveRoomName: args.expectedLiveRoomName,
      participants,
    }),
  ).resolves.toEqual([
    "recording-leader-one",
    "recording-leader-one-companion",
    "recording-leader-two",
  ]);
  await expect(
    teacher.query(api.whiteboardSessions.getRealtimeAudience, {
      roomName: ROOM,
      expectedLiveRoomName: ROOM,
      participants: [
        { userId: secondLeaderId, identity: "recording-leader-one" },
        { userId: teacherId, identity: "recording-leader-two" },
      ],
    }),
  ).resolves.toEqual([]);
});

test("only a current manager may inspect the realtime audience", async () => {
  const { t, reader, teacher, scheduleId } = await setup();
  const args = { roomName: ROOM, expectedLiveRoomName: ROOM, participants: [] };
  await expect(
    reader.query(api.whiteboardSessions.getRealtimeAudience, args),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    t.query(api.whiteboardSessions.getRealtimeAudience, args),
  ).rejects.toThrow("User not authenticated");
  await t.run((ctx) =>
    ctx.db.patch("classSchedule", scheduleId, { isLive: false }),
  );
  await expect(
    teacher.query(api.whiteboardSessions.getRealtimeAudience, args),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("private-course enrollment removal and user deactivation remove live recipients without a reconnect", async () => {
  const { t, teacher, teacherId, secondLeaderId, classId, scheduleId } =
    await setup();
  await t.run(async (ctx) => {
    await ctx.db.patch("classSchedule", scheduleId, {
      liveAccess: { mode: "private", allowedGradeCodes: [] },
    });
    await ctx.db.insert("roleAssignments", {
      userId: teacherId,
      orgType: "system",
      role: "superadmin",
      assignedAt: Date.now(),
    });
  });
  const args = {
    roomName: ROOM,
    expectedLiveRoomName: ROOM,
    participants: [
      { identity: "recording-leader-two", userId: secondLeaderId },
    ],
  };
  await expect(
    teacher.query(api.whiteboardSessions.getRealtimeAudience, args),
  ).resolves.toEqual(["recording-leader-two"]);
  await teacher.mutation(api.classes.removeStudent, {
    classId,
    studentId: secondLeaderId,
  });
  await expect(
    teacher.query(api.whiteboardSessions.getRealtimeAudience, args),
  ).resolves.toEqual([]);
  await t.run((ctx) =>
    ctx.db.insert("classEnrollments", {
      classId,
      studentId: secondLeaderId,
      enrolledAt: Date.now(),
      enrolledBy: teacherId,
    }),
  );
  await expect(
    teacher.query(api.whiteboardSessions.getRealtimeAudience, args),
  ).resolves.toEqual(["recording-leader-two"]);
  await t.run((ctx) =>
    ctx.db.patch("users", secondLeaderId, { isActive: false }),
  );
  await expect(
    teacher.query(api.whiteboardSessions.getRealtimeAudience, args),
  ).resolves.toEqual([]);
});

test("companion audience permission follows the same revocable tutor rule", async () => {
  const { t, teacher, classId, secondLeaderId } = await setup();
  const args = {
    roomName: ROOM,
    expectedLiveRoomName: ROOM,
    participants: [
      { userId: secondLeaderId, identity: "recording-leader-two-companion" },
    ],
  };
  await expect(
    teacher.query(api.whiteboardSessions.getRealtimeAudience, args),
  ).resolves.toEqual([]);
  await t.run((ctx) =>
    ctx.db.patch("classes", classId, { tutorId: secondLeaderId }),
  );
  await expect(
    teacher.query(api.whiteboardSessions.getRealtimeAudience, args),
  ).resolves.toEqual(["recording-leader-two-companion"]);
  await t.run((ctx) =>
    ctx.db.patch("classes", classId, { tutorId: undefined }),
  );
  await expect(
    teacher.query(api.whiteboardSessions.getRealtimeAudience, args),
  ).resolves.toEqual([]);
});

test("audience rejects stale physical activations and bounds candidate count and identity size", async () => {
  const { t, teacher, teacherId, scheduleId } = await setup();
  const participant = { identity: "recording-leader-one", userId: teacherId };
  const args = { roomName: ROOM, expectedLiveRoomName: ROOM };
  await expect(
    teacher.query(api.whiteboardSessions.getRealtimeAudience, {
      ...args,
      participants: Array.from({ length: 257 }, () => participant),
    }),
  ).rejects.toThrow("INVALID_WHITEBOARD_AUDIENCE");
  await expect(
    teacher.query(api.whiteboardSessions.getRealtimeAudience, {
      ...args,
      participants: [{ ...participant, identity: "x".repeat(513) }],
    }),
  ).rejects.toThrow("INVALID_WHITEBOARD_AUDIENCE");
  await t.run((ctx) =>
    ctx.db.patch("classSchedule", scheduleId, { liveRoomName: "new-room" }),
  );
  await expect(
    teacher.query(api.whiteboardSessions.getRealtimeAudience, {
      ...args,
      participants: [participant],
    }),
  ).resolves.toEqual([]);
});

test("hidden egress audience requires current activation, active status and the authoritative recording token", async () => {
  const { t, teacher, scheduleId } = await setup();
  await t.run((ctx) =>
    ctx.db.patch("classSchedule", scheduleId, {
      liveActivationId: "activation-a",
    }),
  );
  await t.run(async (ctx) => {
    for (const [egressId, status, activationId, recordingToken, roomName] of [
      ["EG_starting", "starting", "activation-a", TOKEN, ROOM],
      ["EG_active", "active", "activation-a", TOKEN, ROOM],
      ["EG_complete", "complete", "activation-a", TOKEN, ROOM],
      ["EG_failed", "failed", "activation-a", TOKEN, ROOM],
      ["EG_previous", "active", "activation-before", TOKEN, ROOM],
      ["EG_wrong_token", "active", "activation-a", "old-token", ROOM],
      ["EG_wrong_room", "active", "activation-a", TOKEN, "other-room"],
    ] as const)
      await ctx.db.insert("recordings", {
        scheduleId,
        roomName,
        egressId,
        status,
        activationId,
        recordingToken,
        startedAt: Date.now(),
      });
  });
  const args = { roomName: ROOM, expectedLiveRoomName: ROOM, participants: [] };
  // Hidden egress participants are absent from the normal LiveKit roster.
  await expect(
    teacher.query(api.whiteboardSessions.getRealtimeAudience, args),
  ).resolves.toEqual(["EG_active", "EG_starting"]);
  await teacher.mutation(api.whiteboardSessions.ensureScene, {
    roomName: ROOM,
    expectedLiveRoomName: ROOM,
  });
  await expect(
    teacher.query(api.whiteboardSessions.getRealtimeAudience, args),
  ).resolves.toEqual(["EG_active", "EG_starting"]);
  await t.run(async (ctx) => {
    const manifest = await ctx.db
      .query("whiteboardSceneManifests")
      .withIndex("by_roomName", (q) => q.eq("roomName", ROOM))
      .unique();
    await ctx.db.patch("whiteboardSceneManifests", manifest!._id, {
      recordingToken: undefined,
    });
  });
  // No fallback to the still-present token in the legacy row after revocation.
  await expect(
    teacher.query(api.whiteboardSessions.getRealtimeAudience, args),
  ).resolves.toEqual([]);
});
