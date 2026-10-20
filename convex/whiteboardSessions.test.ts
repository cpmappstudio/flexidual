import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import {
  setupRecordingContext,
  storeWhiteboardImage,
} from "../tests/fixtures/whiteboard";

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

test("identical scenes and recording tokens do not write, but edits and clears do", async () => {
  const { t } = await setupRecordingContext();
  const writer = t.withIdentity({ subject: "recording-leader-one" });
  await writer.mutation(api.whiteboardSessions.upsertScene, {
    roomName: "recording-room",
    elements: [{ id: "shape", x: 10, version: 1 }],
  });
  await writer.run(async (ctx) => {
    await ctx.runMutation(api.whiteboardSessions.upsertScene, {
      roomName: "recording-room",
      elements: [{ version: 1, x: 10, id: "shape" }],
    });
    await ctx.runMutation(internal.whiteboardSessions.setRecordingToken, {
      roomName: "recording-room",
      recordingToken: "valid-recording-token",
    });
    expect((await ctx.meta.getTransactionMetrics()).documentsWritten.used).toBe(
      0,
    );
  });
  await writer.mutation(api.whiteboardSessions.upsertScene, {
    roomName: "recording-room",
    elements: [{ id: "shape", x: 20, version: 1 }],
  });
  const getScene = () =>
    t.query(api.whiteboardSessions.getScene, {
      roomName: "recording-room",
      recordingToken: "valid-recording-token",
    });
  expect((await getScene())?.elements[0].x).toBe(20);
  await writer.mutation(api.whiteboardSessions.upsertScene, {
    roomName: "recording-room",
    elements: [],
  });
  expect((await getScene())?.elements).toEqual([]);
  await expect(
    t
      .withIdentity({ subject: "recording-leader-two" })
      .mutation(api.whiteboardSessions.upsertScene, {
        roomName: "recording-room",
        elements: [],
      }),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("the authorized writer recovers drawings and image refs without replacing stored images", async () => {
  const { t } = await setupRecordingContext();
  const writer = t.withIdentity({ subject: "recording-leader-one" });
  const ref = await storeWhiteboardImage(
    t,
    "recording-room",
    "image-file",
    "saved-image",
  );
  const elements = [
    { id: "drawing", version: 1 },
    { id: "image", fileId: "image-file", version: 1 },
  ];
  await writer.mutation(api.whiteboardSessions.upsertScene, {
    roomName: "recording-room",
    elements,
  });
  const restored = await writer.query(api.whiteboardSessions.getScene, {
    roomName: "recording-room",
  });
  expect(restored?.elements).toEqual(elements);
  expect(restored?.fileRefs).toEqual({ "image-file": ref });
  await writer.mutation(api.whiteboardSessions.upsertScene, {
    roomName: "recording-room",
    elements: [...restored!.elements, { id: "next-stroke", version: 1 }],
  });
  expect(
    (
      await writer.query(api.whiteboardSessions.getScene, {
        roomName: "recording-room",
      })
    )?.fileRefs,
  ).toEqual(restored?.fileRefs);
  expect(
    await t.run(async (ctx) => (await ctx.storage.get(ref.storageId))?.text()),
  ).toBe("saved-image");
});

test("recovery is scoped to the caller's course; outsiders and anonymous callers cannot read or overwrite it", async () => {
  const { t, classId, secondLeaderId } = await setupRecordingContext();
  const writer = t.withIdentity({ subject: "recording-leader-one" });
  const other = t.withIdentity({ subject: "recording-leader-two" });
  await t.run(async (ctx) => {
    const originalClass = await ctx.db.get(classId);
    const otherClass = await ctx.db.insert("classes", {
      name: "Other course",
      curriculumId: originalClass!.curriculumId,
      teacherId: secondLeaderId,
      isActive: true,
      createdAt: 1,
      createdBy: secondLeaderId,
    });
    await ctx.db.insert("classSchedule", {
      classId: otherClass,
      roomName: "other-room",
      isLive: true,
      status: "active",
      scheduledStart: 1,
      scheduledEnd: 2,
      createdAt: 1,
      createdBy: secondLeaderId,
    });
    await ctx.db.insert("whiteboardSessions", {
      roomName: "other-room",
      elements: [{ id: "private-other-drawing" }],
      updatedAt: 1,
    });
  });
  await writer.mutation(api.whiteboardSessions.upsertScene, {
    roomName: "recording-room",
    elements: [{ id: "saved-drawing" }],
  });
  expect(
    (
      await other.query(api.whiteboardSessions.getScene, {
        roomName: "other-room",
      })
    )?.elements,
  ).toEqual([{ id: "private-other-drawing" }]);
  await expect(
    writer.query(api.whiteboardSessions.getScene, { roomName: "other-room" }),
  ).rejects.toThrow("PERMISSION_DENIED");
  for (const [caller, error] of [
    [other, "PERMISSION_DENIED"],
    [t, "User not authenticated"],
  ] as const) {
    await expect(
      caller.query(api.whiteboardSessions.getScene, {
        roomName: "recording-room",
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      caller.mutation(api.whiteboardSessions.upsertScene, {
        roomName: "recording-room",
        elements: [],
      }),
    ).rejects.toThrow(error);
    await expect(
      caller.mutation(api.whiteboardFiles.generateUploadUrl, {
        roomName: "recording-room",
      }),
    ).rejects.toThrow(error);
  }
  expect(
    (
      await writer.query(api.whiteboardSessions.getScene, {
        roomName: "recording-room",
      })
    )?.elements,
  ).toEqual([{ id: "saved-drawing" }]);
});
