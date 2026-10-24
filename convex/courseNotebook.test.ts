import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import {
  splitWhiteboardPayload,
  joinWhiteboardPayload,
  whiteboardBucketId,
} from "../lib/whiteboard-elements";
import { applyWhiteboardBucketResult } from "../lib/whiteboard-bucket-updates";
import { whiteboardPreviewRevision } from "../lib/whiteboard-preview-revision";
import * as notebookPreview from "./model/notebookPreview";

afterEach(() => vi.useRealTimers());

test("empty pages retire only on an authorized confirmed close and remain recoverable", async () => {
  const s = await setup();
  const pageId = await s.create();
  const args = {
    pageId,
    revision: await whiteboardPreviewRevision([]),
    retireIfEmpty: true,
  };
  for (const client of [s.student, s.outsider, s.t])
    await expect(
      client.mutation(api.courseNotebookFiles.beginPreview, args),
    ).rejects.toThrow();
  expect(
    await s.tutor.mutation(api.courseNotebookFiles.beginPreview, args),
  ).toBeNull();
  const page = await s.t.run((ctx) =>
    ctx.db.get("courseNotebookPages", pageId),
  );
  expect(page?.retiredAt).toBeTypeOf("number");
  expect(
    await s.gradeTeacher.mutation(api.courseNotebookFiles.beginPreview, args),
  ).toBeNull();
  expect(
    await s.t.run((ctx) => ctx.db.get("courseNotebookPages", pageId)),
  ).toEqual(page);
  expect(
    await s.student.query(api.courseNotebook.getManifest, { pageId }),
  ).toMatchObject({ bucketIds: [] });
  for (const search of [undefined, page!.title]) {
    const result = await s.student.query(api.courseNotebook.listPages, {
      classId: s.classId,
      search,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(result.page).toEqual([]);
  }
  // A drawing that was in flight before close restores the same stable draft identity.
  await s.teacher.mutation(api.courseNotebook.applyDelta, s.draw(pageId));
  expect(
    (
      await s.student.query(api.courseNotebook.listPages, {
        classId: s.classId,
        paginationOpts: { numItems: 20, cursor: null },
      })
    ).page.map((page) => page._id),
  ).toEqual([pageId]);
});

test("erase/retire preserves images, tombstones and undo while deleting only obsolete previews", async () => {
  const s = await setup();
  const pageId = await s.create();
  const drawing = s.draw(pageId, 1, { type: "image", fileId: "image-one" });
  await s.teacher.mutation(api.courseNotebook.applyDelta, drawing);
  expect((await s.post(pageId)).status).toBe(200);
  const firstRevision = await whiteboardPreviewRevision(
    JSON.parse(joinWhiteboardPayload(drawing.parts)),
  );
  const version = await s.teacher.mutation(
    api.courseNotebookFiles.beginPreview,
    { pageId, revision: firstRevision },
  );
  expect(
    (
      await s.post(pageId, s.teacher, {
        fileId: "preview",
        previewVersion: String(version),
      })
    ).status,
  ).toBe(200);
  const oldPreview = await s.t.run(async (ctx) => {
    const page = await ctx.db.get("courseNotebookPages", pageId);
    return notebookPreview.readNotebookPreview(ctx, page!);
  });
  const erased = s.draw(pageId, 2, {
    type: "image",
    fileId: "image-one",
    isDeleted: true,
  });
  await s.tutor.mutation(api.courseNotebook.applyDelta, erased);
  const args = {
    pageId,
    revision: await whiteboardPreviewRevision(
      JSON.parse(joinWhiteboardPayload(erased.parts)),
    ),
    retireIfEmpty: true,
  };
  expect(
    await s.teacher.mutation(api.courseNotebookFiles.beginPreview, args),
  ).toBeNull();
  expect(
    await s.t.run((ctx) =>
      ctx.storage.getUrl(oldPreview.state.previewStorageId!),
    ),
  ).toBeNull();
  const files = await s.student.query(api.courseNotebookFiles.getFiles, {
    pageId,
    fileIds: ["image-one"],
  });
  expect(files).toHaveProperty("image-one");
  const bucket = await s.student.query(api.courseNotebook.getBucket, {
    pageId,
    bucketId: drawing.bucketId,
  });
  expect(JSON.parse(joinWhiteboardPayload(bucket!.parts))).toEqual(
    JSON.parse(joinWhiteboardPayload(erased.parts)),
  );
  // Revival is the normal canonical merge, not a second save path or a new page.
  await s.tutor.mutation(
    api.courseNotebook.applyDelta,
    s.draw(pageId, 3, { type: "image", fileId: "image-one" }),
  );
  expect(
    (await s.t.run((ctx) => ctx.db.get("courseNotebookPages", pageId)))
      ?.retiredAt,
  ).toBeUndefined();
  expect(
    await s.student.query(api.courseNotebookFiles.getFiles, {
      pageId,
      fileIds: ["image-one"],
    }),
  ).toEqual(files);
  expect(
    (
      await s.post(pageId, s.teacher, {
        fileId: "preview",
        previewVersion: String(version),
      })
    ).status,
  ).toBe(400);
  await expect(
    s.teacher.mutation(api.courseNotebookFiles.beginPreview, args),
  ).rejects.toThrow("STALE_NOTEBOOK_PREVIEW");
});

test("retirement validates canonical contents and old metadata, and pagination never scans retired pages", async () => {
  const s = await setup();
  const pageId = await s.create();
  const change = s.draw(pageId);
  await s.teacher.mutation(api.courseNotebook.applyDelta, change);
  const revision = await whiteboardPreviewRevision(
    JSON.parse(joinWhiteboardPayload(change.parts)),
  );
  // Even a forged empty flag cannot hide visible canonical content.
  expect(
    await s.teacher.mutation(api.courseNotebookFiles.beginPreview, {
      pageId,
      revision,
      retireIfEmpty: true,
    }),
  ).toBe(1);
  const manifest = await s.teacher.query(api.courseNotebook.getManifest, {
    pageId,
  });
  await s.t.run(async (ctx) => {
    const stamp = await ctx.db
      .query("whiteboardScenePreviewSignatures")
      .withIndex("by_manifestId_and_bucketId", (q) =>
        q.eq("manifestId", manifest.sourceId).eq("bucketId", change.bucketId),
      )
      .unique();
    await ctx.db.patch("whiteboardScenePreviewSignatures", stamp!._id, {
      hasContent: undefined,
    });
    for (let i = 0; i < 50; i++)
      await ctx.db.insert("courseNotebookPages", {
        classId: s.classId,
        createdBy: s.teacherId,
        title: "Hidden page",
        retiredAt: Date.now(),
      });
  });
  expect(
    await s.teacher.mutation(api.courseNotebookFiles.beginPreview, {
      pageId,
      revision,
      retireIfEmpty: true,
    }),
  ).toEqual({ preparing: true });
  expect(
    await s.teacher.mutation(api.courseNotebookFiles.beginPreview, {
      pageId,
      revision,
      retireIfEmpty: true,
    }),
  ).toBe(2);
  const result = await s.student.query(api.courseNotebook.listPages, {
    classId: s.classId,
    paginationOpts: { numItems: 1, cursor: null, maximumRowsRead: 2 },
  });
  expect(result.page.map((page) => page._id)).toEqual([pageId]);
  expect(result.isDone).toBe(true);
  const search = await s.student.query(api.courseNotebook.listPages, {
    classId: s.classId,
    search: "Hidden",
    paginationOpts: { numItems: 1, cursor: null, maximumRowsRead: 2 },
  });
  expect(search.page).toEqual([]);
  expect(search.isDone).toBe(true);
});

test("page search finds unloaded pages, paginates metadata and preserves course access and archive rules", async () => {
  vi.useFakeTimers();
  const s = await setup();
  const oldest = await s.create();
  await s.teacher.mutation(api.courseNotebook.renamePage, {
    pageId: oldest,
    title: "Photosynthesis mitochondria",
  });
  await s.t.run(async (ctx) => {
    for (let i = 0; i < 25; i++) {
      vi.setSystemTime(Date.now() + 1);
      await ctx.db.insert("courseNotebookPages", {
        classId: s.classId,
        createdBy: s.teacherId,
        title: `Biology notes ${i}`,
      });
    }
    await ctx.db.insert("courseNotebookPages", {
      classId: s.otherClassId,
      createdBy: s.teacherId,
      title: "Biology private notes",
    });
  });
  const base = {
    classId: s.classId,
    paginationOpts: { numItems: 20, cursor: null },
  };
  const initial = await s.student.query(api.courseNotebook.listPages, base);
  expect(initial.page).toHaveLength(20);
  expect(initial.page.map((page) => page._id)).not.toContain(oldest);
  const match = await s.student.query(api.courseNotebook.listPages, {
    ...base,
    search: "  MITO  ",
  });
  expect(match.page.map((page) => page._id)).toEqual([oldest]);
  expect(match.page[0]).not.toHaveProperty("elements");
  const args = {
    ...base,
    search: "BIO",
    paginationOpts: { numItems: 3, cursor: null },
  };
  const first = await s.tutor.query(api.courseNotebook.listPages, args);
  expect(first.page).toHaveLength(3);
  expect(first.isDone).toBe(false);
  const next = await s.tutor.query(api.courseNotebook.listPages, {
    ...args,
    paginationOpts: { numItems: 3, cursor: first.continueCursor },
  });
  expect(next.page).toHaveLength(3);
  expect(
    next.page.every(
      (page) => !first.page.some((seen) => seen._id === page._id),
    ),
  ).toBe(true);
  expect(
    [...first.page, ...next.page].every(
      (page) => page.title !== "Biology private notes",
    ),
  ).toBe(true);
  await s.teacher.mutation(api.courseNotebook.renamePage, {
    pageId: oldest,
    title: "Cell structure",
  });
  expect(
    (
      await s.student.query(api.courseNotebook.listPages, {
        ...base,
        search: "mito",
      })
    ).page,
  ).toEqual([]);
  expect(
    (
      await s.student.query(api.courseNotebook.listPages, {
        ...base,
        search: "cell",
      })
    ).page.map((page) => page._id),
  ).toEqual([oldest]);
  expect(
    (
      await s.student.query(api.courseNotebook.listPages, {
        ...base,
        search: "   ",
      })
    ).page,
  ).toEqual(initial.page);
  for (const denied of [s.outsider, s.t]) {
    await expect(
      denied.query(api.courseNotebook.listPages, args),
    ).rejects.toThrow();
  }
  await s.admin.mutation(api.courseNotebook.setArchived, {
    classId: s.classId,
    archived: true,
  });
  expect(
    (await s.student.query(api.courseNotebook.listPages, args)).page,
  ).toEqual([]);
});

test("live presentation references a course page without copying it, retains late saves in their original scope and isolates recording readers", async () => {
  const s = await setup();
  const a = await s.create();
  const b = await s.create();
  const other = await s.create(s.teacher, s.otherClassId);
  await s.teacher.mutation(api.courseNotebook.applyDelta, s.draw(a));
  expect((await s.post(a, s.tutor)).status).toBe(200);
  const scheduleId = await s.t.run((ctx) =>
    ctx.db.insert("classSchedule", {
      classId: s.classId,
      roomName: "notebook-live",
      liveRoomName: "activation-one",
      scheduledStart: Date.now(),
      scheduledEnd: Date.now() + 3600000,
      isLive: true,
      status: "active",
      createdBy: s.teacherId,
      createdAt: Date.now(),
    }),
  );
  const live = {
    roomName: "notebook-live",
    expectedLiveRoomName: "activation-one",
  };
  const roomManifest = await s.teacher.mutation(
    api.whiteboardSessions.ensureScene,
    live,
  );
  const temporary = {
    ...s.draw(a),
    ...live,
    generation: roomManifest.generation,
  };
  const temporaryDelta = {
    ...live,
    bucketId: temporary.bucketId,
    parts: temporary.parts,
    generation: temporary.generation,
  };
  await s.teacher.mutation(
    api.whiteboardSessions.applySceneDelta,
    temporaryDelta,
  );
  const choose = (pageId: typeof a | null, client = s.teacher) =>
    client.mutation(api.whiteboardSessions.selectNotebookPage, {
      ...live,
      pageId,
    });
  await choose(a, s.tutor);
  await s.t.mutation(internal.whiteboardSessions.setRecordingToken, {
    roomName: live.roomName,
    recordingToken: "live-token",
  });
  const reader = { roomName: live.roomName, recordingToken: "live-token" };
  const manifest = await s.t.query(
    api.whiteboardSessions.getSceneManifest,
    reader,
  );
  expect(manifest).toMatchObject({ notebookPageId: a });
  const pageManifest = await s.student.query(api.courseNotebook.getManifest, {
    pageId: a,
  });
  expect(manifest?.format === 2 && manifest.sourceId).toBe(
    pageManifest.sourceId,
  );
  const bucket = {
    ...reader,
    expectedPageId: a,
    bucketId: whiteboardBucketId("drawing"),
  };
  expect(
    await s.t.query(api.whiteboardSessions.getSceneBucket, bucket),
  ).toMatchObject({ sourceId: pageManifest.sourceId });
  const imageArgs = { ...reader, pageId: a, fileIds: ["image-one"] };
  expect(
    await s.t.query(api.whiteboardSessions.getPresentedFiles, imageArgs),
  ).toHaveProperty("image-one");
  await expect(
    s.t.query(api.courseNotebook.getManifest, { pageId: a }),
  ).rejects.toThrow();
  await expect(
    s.t.query(api.whiteboardSessions.getPresentedFiles, {
      ...imageArgs,
      recordingToken: "wrong",
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(choose(other)).rejects.toThrow("PERMISSION_DENIED");
  await expect(choose(a, s.student)).rejects.toThrow("PERMISSION_DENIED");
  const { bucketId, generation, parts } = s.draw(a, 2);
  const delta = { bucketId, generation, parts };
  const pending = { ...delta, pageId: a };
  await choose(b);
  // A delayed save completes in A, never in the newly presented B.
  await s.teacher.mutation(api.courseNotebook.applyDelta, pending);
  await s.teacher.mutation(api.whiteboardSessions.applySceneDelta, {
    ...temporaryDelta,
    parts: pending.parts,
  });
  expect(
    await s.student.query(api.courseNotebook.getManifest, { pageId: b }),
  ).toMatchObject({ bucketIds: [] });
  expect(
    await s.t.query(api.whiteboardSessions.getSceneBucket, bucket),
  ).toBeNull();
  expect(
    await s.t.query(api.whiteboardSessions.getPresentedFiles, imageArgs),
  ).toEqual({});
  await choose(a);
  await s.tutor.mutation(api.courseNotebook.applyDelta, pending);
  const saved = await s.student.query(api.courseNotebook.getBucket, {
    pageId: a,
    bucketId: delta.bucketId,
  });
  expect(JSON.parse(joinWhiteboardPayload(saved!.parts))[0].version).toBe(2);
  await choose(null);
  const restored = await s.t.query(api.whiteboardSessions.getSceneBucket, {
    ...reader,
    bucketId: delta.bucketId,
  });
  expect(JSON.parse(joinWhiteboardPayload(restored!.parts))[0].version).toBe(2);
  await choose(a);
  await s.t.run((ctx) =>
    ctx.db.patch("classSchedule", scheduleId, {
      liveRoomName: "activation-two",
    }),
  );
  await expect(choose(b)).rejects.toThrow("STALE_LIVE_ACTIVATION");
  await s.admin.mutation(api.courseNotebook.setArchived, {
    classId: s.classId,
    archived: true,
  });
  expect(
    await s.t.query(api.whiteboardSessions.getSceneManifest, reader),
  ).not.toHaveProperty("notebookPageId");
  expect(
    await s.t.query(api.whiteboardSessions.getPresentedFiles, imageArgs),
  ).toEqual({});
  // The live lifecycle can delete its manifest, never the referenced notebook or files.
  await s.t.run(async (ctx) => {
    const room = await ctx.db
      .query("whiteboardSceneManifests")
      .withIndex("by_roomName", (q) => q.eq("roomName", live.roomName))
      .unique();
    await ctx.db.delete("whiteboardSceneManifests", room!._id);
  });
  await s.admin.mutation(api.courseNotebook.setArchived, {
    classId: s.classId,
    archived: false,
  });
  expect(
    await s.student.query(api.courseNotebookFiles.getFiles, {
      pageId: a,
      fileIds: ["image-one"],
    }),
  ).toHaveProperty("image-one");
  expect(
    await s.student.query(api.courseNotebook.getManifest, { pageId: a }),
  ).toMatchObject({ sourceId: pageManifest.sourceId });
});

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const data = await t.run(async (ctx) => {
    const ids = await Promise.all(
      ["teacher", "tutor", "student", "outsider", "admin", "gradeTeacher"].map(
        (clerkId) =>
          ctx.db.insert("users", {
            clerkId,
            firstName: clerkId,
            lastName: "Test",
            fullName: clerkId,
            isActive: true,
            createdAt: Date.now(),
          }),
      ),
    );
    const [teacherId, tutorId, studentId, outsiderId, adminId, gradeTeacherId] =
      ids;
    await ctx.db.insert("roleAssignments", {
      userId: adminId,
      orgType: "system",
      role: "superadmin",
      assignedBy: adminId,
      assignedAt: Date.now(),
    });
    const schoolId = await ctx.db.insert("schools", {
      name: "School",
      slug: "school",
      timeZone: "America/Tegucigalpa",
      isActive: true,
      createdBy: adminId,
      createdAt: Date.now(),
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      schoolId,
      title: "Math",
      isActive: true,
      createdBy: adminId,
      createdAt: Date.now(),
    });
    const course = {
      schoolId,
      curriculumId,
      name: "Math",
      teacherId,
      tutorId,
      gradeAssignments: [{ gradeCode: "10", teacherId: gradeTeacherId }],
      students: [studentId],
      isActive: true,
      createdBy: adminId,
      createdAt: Date.now(),
    };
    const classId = await ctx.db.insert("classes", course);
    const otherClassId = await ctx.db.insert("classes", {
      ...course,
      name: "Other",
    });
    return {
      classId,
      otherClassId,
      teacherId,
      tutorId,
      studentId,
      outsiderId,
      adminId,
      schoolId,
    };
  });
  const teacher = t.withIdentity({ subject: "teacher" });
  const tutor = t.withIdentity({ subject: "tutor" });
  const student = t.withIdentity({ subject: "student" });
  const outsider = t.withIdentity({ subject: "outsider" });
  const admin = t.withIdentity({ subject: "admin" });
  const gradeTeacher = t.withIdentity({ subject: "gradeTeacher" });
  const create = (client = teacher, classId = data.classId) =>
    client.mutation(api.courseNotebook.createPage, { classId });
  const draw = (
    pageId: Awaited<ReturnType<typeof create>>,
    version = 1,
    extra = {},
  ) => ({
    pageId,
    generation: 0,
    bucketId: whiteboardBucketId("drawing"),
    parts: splitWhiteboardPayload(
      JSON.stringify([
        {
          id: "drawing",
          version,
          versionNonce: version,
          index: "a0",
          type: "freedraw",
          isDeleted: false,
          ...extra,
        },
      ]),
    ),
  });
  const png = new Blob(
    [
      Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        ),
        (c) => c.charCodeAt(0),
      ),
    ],
    { type: "image/png" },
  );
  const post = (
    pageId: Awaited<ReturnType<typeof create>>,
    client = teacher,
    overrides: Record<string, string> = {},
  ) =>
    client.fetch(
      `/whiteboard-files?${new URLSearchParams({ pageId, fileId: "image-one", created: "1", ...overrides })}`,
      {
        method: "POST",
        body: png,
        headers: { "Content-Type": png.type, "X-File-Size": String(png.size) },
      },
    );
  return {
    t,
    ...data,
    teacher,
    tutor,
    student,
    outsider,
    admin,
    gradeTeacher,
    create,
    draw,
    post,
  };
}

test("assigned teachers, grade teachers and tutors edit; students only read; unrelated users cannot access", async () => {
  const s = await setup();
  for (const editor of [s.teacher, s.tutor, s.gradeTeacher, s.admin]) {
    expect(
      await editor.query(api.courseNotebook.get, { classId: s.classId }),
    ).toMatchObject({
      canEdit: true,
      canArchive: editor === s.admin,
      timeZone: "America/Tegucigalpa",
    });
    const pageId = await s.create(editor);
    await editor.mutation(api.courseNotebook.applyDelta, s.draw(pageId));
    expect(
      await s.student.query(api.courseNotebook.getManifest, { pageId }),
    ).toMatchObject({ bucketIds: [whiteboardBucketId("drawing")] });
  }
  const pageId = await s.create();
  expect(
    await s.student.query(api.courseNotebook.get, { classId: s.classId }),
  ).toMatchObject({ canEdit: false, canArchive: false });
  await expect(s.create(s.student)).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.student.mutation(api.courseNotebook.renamePage, { pageId, title: "No" }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.student.mutation(api.courseNotebook.applyDelta, s.draw(pageId)),
  ).rejects.toThrow("PERMISSION_DENIED");
  for (const denied of [s.outsider, s.t]) {
    await expect(
      denied.query(api.courseNotebook.get, { classId: s.classId }),
    ).rejects.toThrow();
    await expect(
      denied.query(api.courseNotebook.getBucket, { pageId, bucketId: 0 }),
    ).rejects.toThrow();
    expect((await s.post(pageId, denied)).status).toBe(400);
  }
  for (const editor of [s.teacher, s.tutor, s.gradeTeacher, s.student]) {
    for (const archived of [true, false]) {
      await expect(
        editor.mutation(api.courseNotebook.setArchived, {
          classId: s.classId,
          archived,
        }),
      ).rejects.toThrow("PERMISSION_DENIED");
    }
  }
});

test("page default date uses the existing institutional zone; initialization is idempotent", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T02:00:00Z"));
  const s = await setup();
  const pageId = await s.create();
  await s.student.mutation(api.courseNotebook.initialize, {
    classId: s.classId,
  });
  const initialized = await s.t.run((ctx) => ctx.db.get("classes", s.classId));
  vi.advanceTimersByTime(1000);
  await s.teacher.mutation(api.courseNotebook.initialize, {
    classId: s.classId,
  });
  expect(await s.t.run((ctx) => ctx.db.get("classes", s.classId))).toEqual(
    initialized,
  );
  expect(
    await s.t.run((ctx) => ctx.db.get("courseNotebookPages", pageId)),
  ).toMatchObject({ title: "2026-10-23" });
  await s.t.run((ctx) =>
    ctx.db.patch("schools", s.schoolId, { timeZone: undefined }),
  );
  await expect(s.create()).rejects.toThrow("INVALID_TIME_ZONE");
});

test("independent pages reuse incremental merge, cursor recovery, large strokes, tombstones and redo", async () => {
  const s = await setup();
  const pageId = await s.create();
  const otherPage = await s.create(s.teacher, s.otherClassId);
  await s.teacher.mutation(api.courseNotebook.applyDelta, s.draw(pageId));
  const initial = await s.student.query(api.courseNotebook.getBucket, {
    pageId,
    bucketId: whiteboardBucketId("drawing"),
  });
  let cache = applyWhiteboardBucketResult(undefined, initial!);
  const args = {
    pageId,
    bucketId: whiteboardBucketId("drawing"),
    cursor: cache!.anchor!,
  };
  await s.tutor.mutation(
    api.courseNotebook.applyDelta,
    s.draw(pageId, 3, {
      points: Array.from({ length: 9000 }, (_, i) => [i, i]),
    }),
  );
  const rejected = await s.teacher.mutation(
    api.courseNotebook.applyDelta,
    s.draw(pageId, 2),
  );
  expect(
    JSON.parse(joinWhiteboardPayload(rejected.conflictsParts))[0].version,
  ).toBe(3);
  const result = await s.student.query(api.courseNotebook.getBucket, args);
  cache = applyWhiteboardBucketResult(cache, result!);
  expect(cache?.elements[0]).toMatchObject({ version: 3 });
  expect((cache?.elements[0].points as unknown[]).length).toBe(9000);
  expect(
    await s.student.query(api.courseNotebook.getManifest, {
      pageId: otherPage,
    }),
  ).toMatchObject({ bucketIds: [] });
  await s.teacher.mutation(
    api.courseNotebook.applyDelta,
    s.draw(pageId, 4, { isDeleted: true }),
  );
  await s.teacher.mutation(api.courseNotebook.applyDelta, s.draw(pageId, 5));
  cache = applyWhiteboardBucketResult(
    cache,
    (await s.student.query(api.courseNotebook.getBucket, args))!,
  );
  expect(cache?.elements[0]).toMatchObject({ version: 5, isDeleted: false });
  await expect(
    s.teacher.mutation(api.courseNotebook.applyDelta, {
      ...s.draw(pageId),
      generation: 1,
    }),
  ).rejects.toThrow();
});

test("image ownership, retry deduplication, special IDs and preview fencing stay scoped to each page", async () => {
  const s = await setup();
  const pageId = await s.create();
  const otherPage = await s.create();
  const response = await s.post(pageId, s.tutor, { fileId: "constructor" });
  expect(response.status, await response.clone().text()).toBe(200);
  const ref = await response.json();
  expect(
    await (await s.post(pageId, s.teacher, { fileId: "constructor" })).json(),
  ).toEqual(ref);
  expect(
    await s.student.query(api.courseNotebookFiles.getFiles, {
      pageId,
      fileIds: ["constructor"],
    }),
  ).toEqual({ constructor: ref });
  expect(
    await s.student.query(api.courseNotebookFiles.getFiles, {
      pageId: otherPage,
      fileIds: ["constructor"],
    }),
  ).toEqual({});
  expect((await s.post(pageId, s.student)).status).toBe(400);
  expect((await s.post(pageId, s.teacher, { roomName: "forged" })).status).toBe(
    400,
  );
  const version1 = await s.teacher.mutation(
    api.courseNotebookFiles.beginPreview,
    { pageId, revision: await whiteboardPreviewRevision([]) },
  );
  const version2 = await s.tutor.mutation(
    api.courseNotebookFiles.beginPreview,
    { pageId, revision: await whiteboardPreviewRevision([]) },
  );
  expect(
    (
      await s.post(pageId, s.teacher, {
        fileId: "preview",
        previewVersion: String(version1),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await s.post(pageId, s.tutor, {
        fileId: "preview",
        previewVersion: String(version2),
      })
    ).status,
  ).toBe(200);
  expect(
    await s.t.run((ctx) => ctx.db.system.query("_storage").collect()),
  ).toHaveLength(2);
  const page = await s.t.run((ctx) =>
    ctx.db
      .query("courseNotebookPreviews")
      .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
      .unique(),
  );
  expect(page?.previewStorageId).toBeDefined();
  const metadata = await s.student.query(api.courseNotebook.listPages, {
    classId: s.classId,
    paginationOpts: { numItems: 1, cursor: null },
  });
  expect(metadata.page).toHaveLength(1);
  expect(metadata.page[0]).not.toHaveProperty("elements");
  await s.t.run((ctx) => ctx.db.patch("classes", s.classId, { students: [] }));
  await expect(
    s.student.query(api.courseNotebookFiles.getFiles, {
      pageId,
      fileIds: ["constructor"],
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("confirmed preview signatures deduplicate reload and lost responses while fencing stale retries and preserving page content", async () => {
  const s = await setup();
  const pageId = await s.create();
  await s.teacher.mutation(api.courseNotebook.applyDelta, s.draw(pageId));
  expect((await s.post(pageId)).status).toBe(200);
  const signature = (version = 1) =>
    whiteboardPreviewRevision(
      JSON.parse(joinWhiteboardPayload(s.draw(pageId, version).parts)),
    );
  const revision = await signature();
  const nextRevision = await signature(2);
  const begin = async (
    value: string,
    expectedVersion?: number,
    client = s.teacher,
  ) => {
    const result = await client.mutation(api.courseNotebookFiles.beginPreview, {
      pageId,
      revision: value,
      expectedVersion,
    });
    if (result !== null && typeof result !== "number")
      throw new Error("unexpected preparation");
    return result;
  };
  const upload = (version: number | null, client = s.teacher) =>
    s.post(pageId, client, {
      fileId: "preview",
      previewVersion: String(version),
    });
  const version = await begin(revision);
  expect(await begin(revision, version!, s.tutor)).toBe(version);
  expect((await upload(version)).status).toBe(200);
  const completed = await s.t.run((ctx) =>
    ctx.db
      .query("courseNotebookPreviews")
      .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
      .unique(),
  );
  expect(completed?.previewRevision).toBe(revision);
  // Both reopening and retrying after a lost upload response skip the file request.
  expect(await begin(revision, undefined, s.tutor)).toBeNull();
  expect(await begin(revision, version!)).toBeNull();
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("courseNotebookPreviews")
        .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
        .unique(),
    ),
  ).toEqual(completed);
  await s.tutor.mutation(api.courseNotebook.applyDelta, s.draw(pageId, 2));
  const next = await begin(nextRevision, undefined, s.tutor);
  expect(next).toBe(version! + 1);
  expect((await upload(version)).status).toBe(400);
  expect((await upload(next, s.tutor)).status).toBe(200);
  await expect(begin(revision, version!)).rejects.toThrow(
    "STALE_NOTEBOOK_PREVIEW",
  );
  await expect(begin(nextRevision, next! - 0.5)).rejects.toThrow(
    "INVALID_NOTEBOOK_PREVIEW_REVISION",
  );
  await expect(begin("unbounded revision".repeat(100))).rejects.toThrow(
    "INVALID_NOTEBOOK_PREVIEW_REVISION",
  );
  for (const client of [s.student, s.outsider])
    await expect(begin(nextRevision, undefined, client)).rejects.toThrow();
  expect(
    await s.t.run((ctx) => ctx.db.system.query("_storage").collect()),
  ).toHaveLength(2);
  expect(
    (
      await s.teacher.query(api.courseNotebookFiles.getFiles, {
        pageId,
        fileIds: ["image-one"],
      })
    )["image-one"],
  ).toBeDefined();
  const bucket = await s.student.query(api.courseNotebook.getBucket, {
    pageId,
    bucketId: whiteboardBucketId("drawing"),
  });
  expect(
    applyWhiteboardBucketResult(undefined, bucket!)?.elements[0],
  ).toMatchObject({ id: "drawing", version: 2 });
  // Unsigned previews cannot bypass content freshness checks.
  await expect(
    s.teacher.mutation(api.courseNotebookFiles.beginPreview, {
      pageId,
      revision: "",
    }),
  ).rejects.toThrow("INVALID_NOTEBOOK_PREVIEW_REVISION");
  expect(
    (
      await s.t.run((ctx) =>
        ctx.db
          .query("courseNotebookPreviews")
          .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
          .unique(),
      )
    )?.previewRevision,
  ).toBe(nextRevision);
});

test("delayed staff previews cannot replace newer durable drawings before reservation or during upload", async () => {
  const s = await setup();
  const pageId = await s.create();
  const data = (version: number) =>
    JSON.parse(joinWhiteboardPayload(s.draw(pageId, version).parts));
  const begin = async (version: number, client = s.teacher) =>
    client.mutation(api.courseNotebookFiles.beginPreview, {
      pageId,
      revision: await whiteboardPreviewRevision(data(version)),
    });
  await s.teacher.mutation(api.courseNotebook.applyDelta, s.draw(pageId));
  expect((await s.post(pageId)).status).toBe(200);
  const first = await begin(1);
  // A tutor's drawing wins while the teacher's image is still uploading.
  await s.tutor.mutation(api.courseNotebook.applyDelta, s.draw(pageId, 2));
  expect(
    (
      await s.post(pageId, s.teacher, {
        fileId: "preview",
        previewVersion: String(first),
      })
    ).status,
  ).toBe(400);
  const second = await begin(2, s.tutor);
  expect(
    (
      await s.post(pageId, s.tutor, {
        fileId: "preview",
        previewVersion: String(second),
      })
    ).status,
  ).toBe(200);
  const page = await s.t.run((ctx) =>
    ctx.db.get("courseNotebookPages", pageId),
  );
  // The old client starts only AFTER the newer preview finished.
  await expect(begin(1)).rejects.toThrow("STALE_NOTEBOOK_PREVIEW");
  expect(
    await s.t.run((ctx) => ctx.db.get("courseNotebookPages", pageId)),
  ).toEqual(page);
  expect(
    await s.t.run((ctx) => ctx.db.system.query("_storage").collect()),
  ).toHaveLength(2);
  // A fresh local write does not prove that this client saw earlier remote
  // additions. Validate the whole snapshot, not just the last save counter.
  const remote = {
    id: "constructor",
    version: 1,
    versionNonce: 1,
    isDeleted: false,
  };
  await s.tutor.mutation(api.courseNotebook.applyDelta, {
    pageId,
    generation: 0,
    bucketId: whiteboardBucketId(remote.id),
    parts: splitWhiteboardPayload(JSON.stringify([remote])),
  });
  await s.teacher.mutation(api.courseNotebook.applyDelta, s.draw(pageId, 3));
  await expect(begin(3)).rejects.toThrow("STALE_NOTEBOOK_PREVIEW");
  expect(
    await s.teacher.mutation(api.courseNotebookFiles.beginPreview, {
      pageId,
      revision: await whiteboardPreviewRevision([...data(3), remote]),
    }),
  ).toBeTypeOf("number");
  expect(
    await s.student.query(api.courseNotebookFiles.getFiles, {
      pageId,
      fileIds: ["image-one"],
    }),
  ).toHaveProperty("image-one");
});

test("preview reservation and publication do not write page metadata or enter normal/live drawing query dependencies", async () => {
  const s = await setup();
  const pageId = await s.create();
  await s.teacher.mutation(api.courseNotebook.applyDelta, s.draw(pageId));
  await s.t.run((ctx) =>
    ctx.db.insert("classSchedule", {
      classId: s.classId,
      roomName: "preview-isolation",
      liveRoomName: "activation",
      scheduledStart: Date.now(),
      scheduledEnd: Date.now() + 3600000,
      isLive: true,
      status: "active",
      createdBy: s.teacherId,
      createdAt: Date.now(),
    }),
  );
  const live = {
    roomName: "preview-isolation",
    expectedLiveRoomName: "activation",
  };
  await s.teacher.mutation(api.whiteboardSessions.ensureScene, live);
  await s.teacher.mutation(api.whiteboardSessions.selectNotebookPage, {
    ...live,
    pageId,
  });
  const original = await s.t.run((ctx) =>
    ctx.db.get("courseNotebookPages", pageId),
  );
  const args = { pageId, bucketId: whiteboardBucketId("drawing") };
  const bucket = await s.student.query(api.courseNotebook.getBucket, args);
  const revision = await whiteboardPreviewRevision(
    JSON.parse(joinWhiteboardPayload(s.draw(pageId).parts)),
  );
  const version = await s.teacher.mutation(
    api.courseNotebookFiles.beginPreview,
    { pageId, revision },
  );
  expect(
    await s.t.run((ctx) => ctx.db.get("courseNotebookPages", pageId)),
  ).toEqual(original);
  expect(
    (
      await s.post(pageId, s.tutor, {
        fileId: "preview",
        previewVersion: String(version),
      })
    ).status,
  ).toBe(200);
  expect(
    await s.t.run((ctx) => ctx.db.get("courseNotebookPages", pageId)),
  ).toEqual(original);
  const read = vi.spyOn(notebookPreview, "readNotebookPreview");
  try {
    expect(await s.student.query(api.courseNotebook.getBucket, args)).toEqual(
      bucket,
    );
    await s.student.query(api.courseNotebook.getManifest, { pageId });
    await s.student.query(api.whiteboardSessions.getSceneManifest, {
      roomName: live.roomName,
    });
    expect(
      await s.student.query(api.whiteboardSessions.getSceneBucket, {
        roomName: live.roomName,
        expectedPageId: pageId,
        bucketId: args.bucketId,
      }),
    ).toEqual(bucket);
    expect(read).not.toHaveBeenCalled();
    const gallery = await s.student.query(api.courseNotebook.listPages, {
      classId: s.classId,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(gallery.page[0].previewUrl).toBeTypeOf("string");
    expect(read).toHaveBeenCalled();
  } finally {
    read.mockRestore();
  }
});

test.each([false, true])(
  "legacy preview and in-flight reservation survive lazy state separation and scoped cleanup (new reservation: %s)",
  async (reserveAgain) => {
    const s = await setup();
    const pageId = await s.create();
    await s.teacher.mutation(api.courseNotebook.applyDelta, s.draw(pageId, 2));
    expect((await s.post(pageId)).status).toBe(200);
    const revision = await whiteboardPreviewRevision(
      JSON.parse(joinWhiteboardPayload(s.draw(pageId, 2).parts)),
    );
    const oldStorageId = await s.t.run(async (ctx) => {
      const storageId = await ctx.storage.store(
        new Blob(["legacy thumbnail"], { type: "image/png" }),
      );
      await ctx.db.patch("courseNotebookPages", pageId, {
        previewStorageId: storageId,
        previewVersion: 7,
        previewRevision: "a".repeat(64),
        previewRequestedRevision: revision,
      });
      return storageId;
    });
    const before = await s.t.run((ctx) =>
      ctx.db.get("courseNotebookPages", pageId),
    );
    const list = () =>
      s.student.query(api.courseNotebook.listPages, {
        classId: s.classId,
        paginationOpts: { numItems: 20, cursor: null },
      });
    const legacyUrl = (await list()).page[0].previewUrl;
    expect(legacyUrl).toBeTypeOf("string");
    let version = 7;
    if (reserveAgain) {
      const result = await s.tutor.mutation(
        api.courseNotebookFiles.beginPreview,
        { pageId, revision },
      );
      expect(result).toBe(8);
      version = 8;
      expect((await list()).page[0].previewUrl).toBe(legacyUrl);
      expect(
        (
          await s.post(pageId, s.teacher, {
            fileId: "preview",
            previewVersion: "7",
          })
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await s.post(pageId, s.teacher, {
          fileId: "preview",
          previewVersion: String(version),
        })
      ).status,
    ).toBe(200);
    const state = await s.t.run((ctx) =>
      ctx.db
        .query("courseNotebookPreviews")
        .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
        .unique(),
    );
    expect(state).toMatchObject({
      previewVersion: version,
      previewRevision: revision,
      previewRequestedRevision: revision,
    });
    expect(state?.previewStorageId).not.toBe(oldStorageId);
    expect(
      await s.t.run((ctx) => ctx.db.get("courseNotebookPages", pageId)),
    ).toEqual(before);
    expect(
      await s.t.run((ctx) => ctx.db.system.get("_storage", oldStorageId)),
    ).toBeNull();
    expect(
      await s.tutor.mutation(api.courseNotebookFiles.beginPreview, {
        pageId,
        revision,
      }),
    ).toBeNull();
    for (const client of [s.student, s.outsider])
      await expect(
        client.mutation(api.courseNotebookFiles.beginPreview, {
          pageId,
          revision,
        }),
      ).rejects.toThrow();
    vi.useFakeTimers();
    await s.t.run((ctx) => ctx.db.delete("classes", s.classId));
    await s.t.mutation(internal.courseNotebook.removeByClass, {
      classId: s.classId,
    });
    await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(
      await s.t.run((ctx) => ctx.db.query("courseNotebookPreviews").collect()),
    ).toEqual([]);
    expect(
      await s.t.run((ctx) => ctx.db.system.query("_storage").collect()),
    ).toEqual([]);
  },
);

test("new preview rows are authoritative even when optional fields are absent", async () => {
  const s = await setup();
  const pageId = await s.create();
  await s.t.run(async (ctx) => {
    const old = await ctx.storage.store(
      new Blob(["old"], { type: "image/png" }),
    );
    await ctx.db.patch("courseNotebookPages", pageId, {
      previewStorageId: old,
      previewVersion: 7,
      previewRevision: "a".repeat(64),
    });
    await ctx.db.insert("courseNotebookPreviews", {
      pageId,
      previewVersion: 8,
    });
  });
  const gallery = await s.student.query(api.courseNotebook.listPages, {
    classId: s.classId,
    paginationOpts: { numItems: 20, cursor: null },
  });
  expect(gallery.page[0].previewUrl).toBeNull();
  const page = await s.t.run((ctx) =>
    ctx.db.get("courseNotebookPages", pageId),
  );
  const current = await s.t.run((ctx) =>
    notebookPreview.readNotebookPreview(ctx, page!),
  );
  expect(current.state).toEqual({ previewVersion: 8 });
});

test("existing pages initialize preview signatures one bucket at a time without changing drawings, cursors or history", async () => {
  const s = await setup();
  const pageId = await s.create();
  await s.teacher.mutation(api.courseNotebook.applyDelta, s.draw(pageId));
  const manifest = await s.teacher.query(api.courseNotebook.getManifest, {
    pageId,
  });
  const bucketId = whiteboardBucketId("drawing");
  const bucket = await s.student.query(api.courseNotebook.getBucket, {
    pageId,
    bucketId,
  });
  const history = await s.t.run(async (ctx) => {
    const row = await ctx.db
      .query("whiteboardSceneUpdates")
      .withIndex("by_manifestId_and_bucketId", (q) =>
        q.eq("manifestId", manifest.sourceId).eq("bucketId", bucketId),
      )
      .unique();
    const stamp = await ctx.db
      .query("whiteboardScenePreviewSignatures")
      .withIndex("by_manifestId_and_bucketId", (q) =>
        q.eq("manifestId", manifest.sourceId).eq("bucketId", bucketId),
      )
      .unique();
    await ctx.db.delete("whiteboardScenePreviewSignatures", stamp!._id);
    return row!;
  });
  const args = {
    pageId,
    revision: await whiteboardPreviewRevision(
      JSON.parse(joinWhiteboardPayload(bucket!.parts)),
    ),
  };
  expect(
    await s.teacher.mutation(api.courseNotebookFiles.beginPreview, args),
  ).toEqual({ preparing: true });
  expect(
    await s.teacher.mutation(api.courseNotebookFiles.beginPreview, args),
  ).toBe(1);
  expect(
    await s.student.query(api.courseNotebook.getBucket, { pageId, bucketId }),
  ).toEqual(bucket);
  expect(
    await s.t.run((ctx) => ctx.db.get("whiteboardSceneUpdates", history._id)),
  ).toEqual(history);
  // A stamp from a retired generation must not cause endless preparation.
  const stamp = await s.t.run((ctx) =>
    ctx.db
      .query("whiteboardScenePreviewSignatures")
      .withIndex("by_manifestId_and_bucketId", (q) =>
        q.eq("manifestId", manifest.sourceId).eq("bucketId", bucketId),
      )
      .unique(),
  );
  await s.t.run((ctx) =>
    ctx.db.patch("whiteboardScenePreviewSignatures", stamp!._id, {
      generation: manifest.generation - 1,
    }),
  );
  expect(
    await s.tutor.mutation(api.courseNotebookFiles.beginPreview, args),
  ).toEqual({ preparing: true });
  expect(
    await s.tutor.mutation(api.courseNotebookFiles.beginPreview, args),
  ).toBe(2);
  expect(
    await s.t.run((ctx) => ctx.db.get("whiteboardSceneUpdates", history._id)),
  ).toEqual(history);
  expect(
    await s.t.run((ctx) =>
      ctx.db.get("whiteboardScenePreviewSignatures", stamp!._id),
    ),
  ).toMatchObject({ generation: manifest.generation });
  expect(
    await s.student.query(api.courseNotebook.getBucket, { pageId, bucketId }),
  ).toEqual(bucket);
});

test("manual archive actions are independent from chat and retain drawings and images", async () => {
  const s = await setup();
  const pageId = await s.create();
  await s.teacher.mutation(api.courseNotebook.applyDelta, s.draw(pageId));
  expect((await s.post(pageId)).status).toBe(200);
  await s.admin.mutation(api.courseChatMessages.setArchived, {
    classId: s.classId,
    archived: true,
  });
  await s.teacher.mutation(api.courseNotebook.renamePage, {
    pageId,
    title: "  Notes  ",
  });
  await s.admin.mutation(api.courseNotebook.setArchived, {
    classId: s.classId,
    archived: true,
  });
  await s.admin.mutation(api.courseChatMessages.setArchived, {
    classId: s.classId,
    archived: false,
  });
  expect(
    await s.teacher.query(api.courseNotebook.get, { classId: s.classId }),
  ).toMatchObject({ archived: true });
  await expect(
    s.teacher.query(api.courseNotebook.getManifest, { pageId }),
  ).rejects.toThrow("NOTEBOOK_ARCHIVED");
  await expect(s.create()).rejects.toThrow("NOTEBOOK_ARCHIVED");
  await s.admin.mutation(api.courseNotebook.setArchived, {
    classId: s.classId,
    archived: false,
  });
  expect(
    await s.student.query(api.courseNotebook.getManifest, { pageId }),
  ).toMatchObject({ bucketIds: [whiteboardBucketId("drawing")] });
  expect(
    await s.student.query(api.courseNotebookFiles.getFiles, {
      pageId,
      fileIds: ["image-one"],
    }),
  ).toHaveProperty("image-one");
  expect(
    await s.t.run((ctx) => ctx.db.get("courseNotebookPages", pageId)),
  ).toMatchObject({ title: "Notes" });
});

test("automatic archive respects course end and stale scheduled calls without deleting content", async () => {
  vi.useFakeTimers();
  const s = await setup();
  const endDate = Date.now() + 60_000;
  await s.t.run((ctx) => ctx.db.patch("classes", s.classId, { endDate }));
  const pageId = await s.create();
  await s.teacher.mutation(api.courseNotebook.applyDelta, s.draw(pageId));
  vi.advanceTimersByTime(60_001);
  await s.t.finishInProgressScheduledFunctions();
  expect(
    await s.teacher.query(api.courseNotebook.get, { classId: s.classId }),
  ).toMatchObject({ archived: true });
  await s.admin.mutation(api.courseNotebook.setArchived, {
    classId: s.classId,
    archived: false,
  });
  expect(
    await s.teacher.query(api.courseNotebook.getManifest, { pageId }),
  ).toBeDefined();
  await s.t.mutation(internal.courseNotebook.archiveAtCourseEnd, {
    classId: s.classId,
    expectedEndDate: endDate - 1,
  });
  expect(
    await s.teacher.query(api.courseNotebook.get, { classId: s.classId }),
  ).toMatchObject({ archived: false });
});

test("only course deletion triggers bounded notebook cleanup, including previews and buckets", async () => {
  vi.useFakeTimers();
  const s = await setup();
  const pageId = await s.create();
  await s.teacher.mutation(api.courseNotebook.applyDelta, s.draw(pageId));
  await s.post(pageId);
  await s.t.mutation(internal.courseNotebook.removeByClass, {
    classId: s.classId,
  });
  expect(
    await s.t.run((ctx) => ctx.db.get("courseNotebookPages", pageId)),
  ).not.toBeNull();
  await s.t.run((ctx) => ctx.db.delete("classes", s.classId));
  await s.t.mutation(internal.courseNotebook.removeByClass, {
    classId: s.classId,
  });
  await s.t.finishAllScheduledFunctions(() => vi.runAllTimers());
  for (const table of [
    "courseNotebookPages",
    "courseNotebookPreviews",
    "courseNotebookFiles",
    "whiteboardSceneManifests",
    "whiteboardSceneBuckets",
    "whiteboardSceneUpdates",
    "whiteboardScenePreviewSignatures",
  ] as const)
    expect(await s.t.run((ctx) => ctx.db.query(table).collect())).toEqual([]);
  expect(
    await s.t.run((ctx) => ctx.db.system.query("_storage").collect()),
  ).toEqual([]);
});
