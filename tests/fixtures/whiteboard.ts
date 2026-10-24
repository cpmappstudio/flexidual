import { convexTest, type TestConvex } from "convex-test";
import schema from "../../convex/schema";
import { modules } from "../../convex/test.setup";

export async function setupRecordingContext() {
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
    const schoolId = await ctx.db.insert("schools", {
      name: "Recording school",
      slug: "recording-school",
      timeZone: "America/Tegucigalpa",
      isActive: true,
      createdBy: firstLeaderId,
      createdAt: now,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      schoolId,
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

export async function storeWhiteboardImage(
  t: TestConvex<typeof schema>,
  roomName: string,
  fileId: string,
  contents: string,
) {
  // Response supplies the complete Blob API in both jsdom and edge-runtime.
  const blob = await new Response(contents, {
    headers: { "Content-Type": "image/png" },
  }).blob();
  const storageId = await t.run((ctx) => ctx.storage.store(blob));
  // convex-test 0.0.54 omits upload contentType; seed an already validated image.
  return t.run(async (ctx) => {
    const ref = {
      storageId,
      url: (await ctx.storage.getUrl(storageId))!,
      mimeType: "image/png",
      created: 1,
    };
    const scene = await ctx.db
      .query("whiteboardSessions")
      .withIndex("by_roomName", (q) => q.eq("roomName", roomName))
      .unique();
    await ctx.db.patch(scene!._id, {
      fileRefs: { ...scene!.fileRefs, [fileId]: ref },
    });
    return ref;
  });
}
