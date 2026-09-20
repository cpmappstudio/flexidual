import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const NOW = Date.UTC(2026, 8, 17, 15);
afterEach(() => vi.useRealTimers());

async function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const user = (clerkId: string, fullName: string, username?: string) =>
      ctx.db.insert("users", {
        clerkId,
        fullName,
        username,
        firstName: fullName,
        lastName: "Demo",
        isActive: true,
        createdAt: NOW,
      });
    const adminId = await user("laura-admin", "Laura Betancourt");
    const studentId = await user("lau-student", "Student Lau", "student_lauu");
    const teacherId = await user("betancourt-teacher", "Profesora Betancourt");
    const schoolId = await ctx.db.insert("schools", {
      name: "Demo school",
      slug: "demo-school",
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Demo campus",
      slug: "demo-campus",
      timeZone: "America/Bogota",
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const adminRoleId = await ctx.db.insert("roleAssignments", {
      userId: adminId,
      role: "superadmin",
      orgType: "system",
      assignedAt: NOW,
      assignedBy: adminId,
    });
    await ctx.db.insert("roleAssignments", {
      userId: studentId,
      role: "student",
      orgType: "campus",
      orgId: campusId,
      schoolId,
      assignedAt: NOW,
      assignedBy: adminId,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Demo curriculum",
      isActive: true,
      schoolId,
      createdAt: NOW,
      createdBy: adminId,
    });
    const classId = await ctx.db.insert("classes", {
      name: "Clock classroom",
      curriculumId,
      teacherId,
      campusId,
      schoolId,
      classType: "standard",
      isActive: true,
      enrollmentsMigratedAt: NOW,
      createdAt: NOW,
      createdBy: adminId,
    });
    await ctx.db.insert("classEnrollments", {
      classId,
      studentId,
      enrolledAt: NOW,
      enrolledBy: adminId,
    });
    return { adminId, studentId, classId, adminRoleId };
  });
  return { t, ...ids };
}

test("creates short sessions accessible to the exact student and administrator without changing courses or old sessions", async () => {
  const { t, classId, adminId } = await setup();
  const first = await t.mutation(
    internal.seed.createLauraClassroomLayoutDemo,
    {},
  );
  expect(first.teacher).toBe("Profesora Betancourt");
  expect(first.admin).toBe("Laura Betancourt");
  expect(first.schedules).toHaveLength(3);
  expect(Date.parse(first.schedules[0].end)).toBe(NOW + 4 * 60_000);
  expect(Date.parse(first.schedules[1].start)).toBe(NOW + 16 * 60_000);
  const roomName = first.schedules[0].roomName;
  const student = t.withIdentity({ subject: "lau-student" });
  const admin = t.withIdentity({ subject: "laura-admin" });
  expect(
    await student.query(api.schedule.getSessionStatus, {
      sessionId: roomName,
      now: NOW,
    }),
  ).toMatchObject({ end: NOW + 4 * 60_000, roomAdmin: false, isLive: false });
  expect(
    await admin.query(api.schedule.getSessionStatus, {
      sessionId: roomName,
      now: NOW,
    }),
  ).toMatchObject({
    roomAdmin: true,
    leadershipRole: "superadmin",
    isLive: false,
  });
  vi.setSystemTime(NOW + 60_000);
  const second = await t.mutation(
    internal.seed.createLauraClassroomLayoutDemo,
    {},
  );
  expect(second.schedules[0].roomName).not.toBe(roomName);
  const rows = await t.run(async (ctx) => ({
    schedules: await ctx.db.query("classSchedule").collect(),
    classes: await ctx.db.query("classes").collect(),
    roles: await ctx.db.query("roleAssignments").collect(),
  }));
  expect(rows.classes).toHaveLength(1);
  expect(rows.roles).toHaveLength(2);
  expect(rows.schedules).toHaveLength(6);
  expect(
    rows.schedules.every(
      (row) =>
        row.classId === classId &&
        row.createdBy === adminId &&
        !row.isLive &&
        row.status === "scheduled",
    ),
  ).toBe(true);
  expect(
    rows.schedules.find((row) => row.roomName === roomName)?.scheduledEnd,
  ).toBe(NOW + 4 * 60_000);
});

test("requires the specified student and valid administrator permissions before writing", async () => {
  const { t, studentId, adminRoleId } = await setup();
  await t.run(async (ctx) => {
    await ctx.db.patch(studentId, { username: "student_lau" });
  });
  await expect(
    t.mutation(internal.seed.createLauraClassroomLayoutDemo, {}),
  ).rejects.toThrow("student_lauu");
  await t.run(async (ctx) => {
    await ctx.db.patch(studentId, { username: "student_lauu" });
    await ctx.db.delete(adminRoleId);
  });
  await expect(
    t.mutation(internal.seed.createLauraClassroomLayoutDemo, {}),
  ).rejects.toThrow("not authorized");
  expect(
    await t.run((ctx) => ctx.db.query("classSchedule").collect()),
  ).toHaveLength(0);
});

test("accepts a short custom deadline and rejects invalid durations", async () => {
  const { t } = await setup();
  for (const minutesUntilEnd of [0, -1, 31]) {
    await expect(
      t.mutation(internal.seed.createLauraClassroomLayoutDemo, {
        minutesUntilEnd,
      }),
    ).rejects.toThrow("between 2 and 30");
  }
  const result = await t.mutation(
    internal.seed.createLauraClassroomLayoutDemo,
    { minutesUntilEnd: 2 },
  );
  expect(Date.parse(result.schedules[0].end)).toBe(NOW + 120_000);
});
