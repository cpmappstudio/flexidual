import { convexTest } from "convex-test";
import presence from "@convex-dev/presence/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  presence.register(t);
  const ids = await t.run(async (ctx) => {
    const [studentId, teacherId, outsiderId] = await Promise.all(
      ["student", "teacher", "outsider"].map((clerkId) =>
        ctx.db.insert("users", {
          clerkId,
          fullName: clerkId,
          firstName: clerkId,
          lastName: "Test",
          isActive: true,
          createdAt: Date.now(),
        }),
      ),
    );
    const schoolId = await ctx.db.insert("schools", {
      name: "School",
      slug: "school",
      isActive: true,
      createdBy: teacherId,
      createdAt: Date.now(),
    });
    const campusId = await ctx.db.insert("campuses", {
      name: "Campus",
      slug: "campus",
      schoolId,
      isActive: true,
      createdBy: teacherId,
      createdAt: Date.now(),
    });
    for (const [userId, role] of [
      [studentId, "student"],
      [teacherId, "teacher"],
    ] as const) {
      await ctx.db.insert("roleAssignments", {
        userId,
        role,
        orgType: "campus",
        orgId: campusId,
        assignedBy: teacherId,
        assignedAt: Date.now(),
      });
    }
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Math",
      schoolId,
      isActive: true,
      createdBy: teacherId,
      createdAt: Date.now(),
    });
    const classId = await ctx.db.insert("classes", {
      name: "Math",
      schoolId,
      campusId,
      curriculumId,
      teacherId,
      students: [studentId],
      isActive: true,
      createdBy: teacherId,
      createdAt: Date.now(),
    });
    return { studentId, teacherId, outsiderId, classId };
  });
  const student = t.withIdentity({ subject: "student" });
  const teacher = t.withIdentity({ subject: "teacher" });
  const outsider = t.withIdentity({ subject: "outsider" });
  const beat = (sessionId: string) =>
    student.mutation(api.presence.heartbeat, {
      roomId: ids.studentId,
      userId: ids.studentId,
      sessionId,
      interval: 30_000,
    });
  const status = () =>
    teacher.query(api.presence.studentProfile, {
      studentId: ids.studentId,
      orgSlug: "campus",
    });
  return { t, ...ids, student, teacher, outsider, beat, status };
}

test("presence is unknown before the first connection and shared across profile and chat", async () => {
  const f = await setup();
  expect(await f.status()).toBeNull();
  const session = await f.beat("tab-1");
  expect(await f.status()).toMatchObject({ online: true });
  expect(
    await f.teacher.query(api.presence.chatParticipants, {
      classId: f.classId,
      userIds: [f.studentId],
    }),
  ).toEqual([{ userId: f.studentId, status: await f.status() }]);
  await f.student.mutation(api.presence.disconnect, {
    sessionToken: session.sessionToken,
  });
  expect(await f.status()).toEqual({
    online: false,
    lastDisconnected: Date.now(),
  });
});

test("closing one tab does not disconnect another and repeated heartbeats do not change visible state", async () => {
  const f = await setup();
  const first = await f.beat("first");
  const second = await f.beat("second");
  const before = await f.status();
  vi.setSystemTime(Date.now() + 30_000);
  await f.beat("second");
  expect(await f.status()).toEqual(before);
  await f.student.mutation(api.presence.disconnect, {
    sessionToken: first.sessionToken,
  });
  expect(await f.status()).toEqual(before);
  await f.student.mutation(api.presence.disconnect, {
    sessionToken: second.sessionToken,
  });
  const offline = await f.status();
  expect(offline).toEqual({ online: false, lastDisconnected: Date.now() });
  await f.student.mutation(api.presence.disconnect, {
    sessionToken: second.sessionToken,
  });
  expect(await f.status()).toEqual(offline);
});

test("the timeout worker marks abandoned connections offline without client polling", async () => {
  const f = await setup();
  await f.beat("abandoned");
  await f.t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(90_000));
  expect(await f.status()).toMatchObject({ online: false });
});

test("identity cannot be forged and presence cannot expose unrelated users", async () => {
  const f = await setup();
  const tokens = await f.beat("private");
  await expect(
    f.outsider.mutation(api.presence.heartbeat, {
      roomId: f.studentId,
      userId: f.studentId,
      sessionId: "forged",
      interval: 30_000,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  expect(
    await f.outsider.query(api.presence.studentProfile, {
      studentId: f.studentId,
      orgSlug: "campus",
    }),
  ).toBeNull();
  expect(
    await f.outsider.query(api.presence.list, { roomToken: tokens.roomToken }),
  ).toEqual([]);
  expect(
    await f.outsider.query(api.presence.chatParticipants, {
      classId: f.classId,
      userIds: [f.studentId],
    }),
  ).toEqual([]);
  expect(
    await f.student.query(api.presence.chatParticipants, {
      classId: f.classId,
      userIds: [f.outsiderId],
    }),
  ).toEqual([]);
  await expect(
    f.t.mutation(api.presence.heartbeat, {
      roomId: f.studentId,
      userId: f.studentId,
      sessionId: "anonymous",
      interval: 30_000,
    }),
  ).rejects.toThrow();
});

test("chat presence remains bounded and access revocation is reflected", async () => {
  const f = await setup();
  await f.beat("revoked");
  await expect(
    f.teacher.query(api.presence.chatParticipants, {
      classId: f.classId,
      userIds: Array(101).fill(f.studentId),
    }),
  ).rejects.toThrow("TOO_MANY_USERS");
  await f.t.run((ctx) => ctx.db.patch("classes", f.classId, { students: [] }));
  expect(
    await f.student.query(api.presence.chatParticipants, {
      classId: f.classId,
      userIds: [f.teacherId],
    }),
  ).toEqual([]);
  expect(
    await f.teacher.query(api.presence.chatParticipants, {
      classId: f.classId,
      userIds: [f.studentId],
    }),
  ).toEqual([]);
});
