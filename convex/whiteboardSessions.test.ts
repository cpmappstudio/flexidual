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
    return { scheduleId, secondLeaderId };
  });

  return { t, ...data };
}

test("returns the persisted session leader to an authorized recording", async () => {
  const { t } = await setupRecordingContext();

  await expect(
    t.query(api.whiteboardSessions.getRecordingContext, {
      roomName: "recording-room",
      recordingToken: "valid-recording-token",
    }),
  ).resolves.toEqual({
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
  const { t, scheduleId, secondLeaderId } = await setupRecordingContext();
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
    leaderParticipantIdentity: "recording-leader-two",
  });
});
