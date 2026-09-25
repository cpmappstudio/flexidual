import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

async function setupRecordingContext() {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const data = await t.run(async (ctx) => {
    const firstLeaderId = await ctx.db.insert("users", {
      clerkId: "recording-leader-one",
      firstName: "First",
      lastName: "Leader",
      fullName: "First Leader",
      isActive: true,
      createdAt: now,
    });
    const secondLeaderId = await ctx.db.insert("users", {
      clerkId: "recording-leader-two",
      firstName: "Second",
      lastName: "Leader",
      fullName: "Second Leader",
      isActive: true,
      createdAt: now,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Recording curriculum",
      isActive: true,
      createdAt: now,
      createdBy: firstLeaderId,
    });
    const classId = await ctx.db.insert("classes", {
      name: "Recording class",
      curriculumId,
      teacherId: firstLeaderId,
      isActive: true,
      createdAt: now,
      createdBy: firstLeaderId,
    });
    const scheduleId = await ctx.db.insert("classSchedule", {
      classId,
      scheduledStart: now,
      scheduledEnd: now + 60_000,
      roomName: "recording-room",
      isLive: true,
      status: "active",
      sessionLeaderId: firstLeaderId,
      sessionLeaderRole: "teacher",
      sessionLeaderSince: now,
      createdAt: now,
      createdBy: firstLeaderId,
    });
    await ctx.db.insert("whiteboardSessions", {
      roomName: "recording-room",
      elements: [],
      recordingToken: "valid-recording-token",
      updatedAt: now,
    });
    return { classId, scheduleId, secondLeaderId };
  });

  return { t, ...data };
}

test("returns the persisted session leader to an authorized recording", async () => {
  const { t, classId } = await setupRecordingContext();

  await expect(
    t.query(api.whiteboardSessions.getRecordingContext, {
      roomName: "recording-room",
      recordingToken: "valid-recording-token",
    }),
  ).resolves.toEqual({
    className: "Recording class",
    courseId: classId,
    curriculumIconKey: "books",
    leaderParticipantIdentity: "recording-leader-one",
  });
});

test("rejects a recording with the wrong token", async () => {
  const { t } = await setupRecordingContext();

  await expect(
    t.query(api.whiteboardSessions.getRecordingContext, {
      roomName: "recording-room",
      recordingToken: "wrong-recording-token",
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("reflects a leadership transfer in the recording context", async () => {
  const { t, classId, scheduleId, secondLeaderId } =
    await setupRecordingContext();
  await t.run((ctx) =>
    ctx.db.patch(scheduleId, {
      sessionLeaderId: secondLeaderId,
      sessionLeaderRole: "admin",
      sessionLeaderSince: Date.now(),
    }),
  );

  await expect(
    t.query(api.whiteboardSessions.getRecordingContext, {
      roomName: "recording-room",
      recordingToken: "valid-recording-token",
    }),
  ).resolves.toEqual({
    className: "Recording class",
    courseId: classId,
    curriculumIconKey: "books",
    leaderParticipantIdentity: "recording-leader-two",
  });
});

test("interactive whiteboard access is limited to an active live session", async () => {
  const { t, scheduleId } = await setupRecordingContext();
  const teacher = t.withIdentity({ subject: "recording-leader-one" });

  await expect(
    teacher.query(api.whiteboardSessions.getScene, {
      roomName: "recording-room",
    }),
  ).resolves.toMatchObject({ roomName: "recording-room" });

  await t.run((ctx) =>
    ctx.db.patch(scheduleId, { status: "completed", isLive: false }),
  );
  await expect(
    teacher.query(api.whiteboardSessions.getScene, {
      roomName: "recording-room",
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    teacher.mutation(api.whiteboardSessions.upsertScene, {
      roomName: "recording-room",
      elements: [],
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
});
