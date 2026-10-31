// A multi-dot filename keeps this test-only fixture out of Convex deployment entrypoints.
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { expect } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { modules } from "../test.setup";

export const NOW = Date.UTC(2026, 9, 24, 18);
export const HOUR = 3_600_000;

export async function setupClassSessionVideoTest() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const data = await t.run(async (ctx) => {
    const identities = [
      "teacher",
      "multigrade",
      "admin",
      "student",
      "tutor",
      "unassigned",
      "outsideAdmin",
    ] as const;
    const users = {} as Record<(typeof identities)[number], Id<"users">>;
    for (const identity of identities)
      users[identity] = await ctx.db.insert("users", {
        clerkId: identity,
        firstName: identity,
        lastName: "Test",
        fullName: `${identity} Test`,
        isActive: true,
        createdAt: NOW,
      });
    const schoolId = await ctx.db.insert("schools", {
      name: "Video school",
      slug: "video-school",
      isActive: true,
      createdAt: NOW,
      createdBy: users.admin,
    });
    const outsideSchoolId = await ctx.db.insert("schools", {
      name: "Outside school",
      slug: "outside-school",
      isActive: true,
      createdAt: NOW,
      createdBy: users.outsideAdmin,
    });
    for (const [userId, orgId] of [
      [users.admin, schoolId],
      [users.outsideAdmin, outsideSchoolId],
    ] as const)
      await ctx.db.insert("roleAssignments", {
        userId,
        orgId,
        orgType: "school",
        role: "admin",
        assignedAt: NOW,
      });
    await ctx.db.insert("roleAssignments", {
      userId: users.unassigned,
      orgId: schoolId,
      orgType: "school",
      role: "teacher",
      assignedAt: NOW,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      schoolId,
      title: "Math",
      isActive: true,
      createdAt: NOW,
      createdBy: users.admin,
    });
    const classId = await ctx.db.insert("classes", {
      schoolId,
      curriculumId,
      teacherId: users.teacher,
      tutorId: users.tutor,
      gradeAssignments: [{ gradeCode: "05", teacherId: users.multigrade }],
      name: "Math",
      isActive: true,
      enrollmentsMigratedAt: NOW,
      endDate: NOW + 30 * 24 * HOUR,
      timeZone: "America/Tegucigalpa",
      createdAt: NOW,
      createdBy: users.admin,
    });
    await ctx.db.insert("classEnrollments", {
      classId,
      studentId: users.student,
      enrolledAt: NOW,
      enrolledBy: users.admin,
    });
    const scheduleId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      roomName: "prerecorded-occurrence",
      sessionType: "live",
      status: "scheduled",
      scheduledStart: NOW + HOUR,
      scheduledEnd: NOW + 2 * HOUR,
      createdAt: NOW,
      createdBy: users.admin,
    });
    return { users, schoolId, classId, scheduleId };
  });
  const clients = {
    teacher: t.withIdentity({ subject: "teacher" }),
    multigrade: t.withIdentity({ subject: "multigrade" }),
    admin: t.withIdentity({ subject: "admin" }),
    student: t.withIdentity({ subject: "student" }),
    tutor: t.withIdentity({ subject: "tutor" }),
    unassigned: t.withIdentity({ subject: "unassigned" }),
    outsideAdmin: t.withIdentity({ subject: "outsideAdmin" }),
  };
  const reserve = async (
    client = clients.teacher,
    scheduleId = data.scheduleId,
    name = "lesson.mp4",
  ) => {
    const id = await client.mutation(internal.classSessionVideos.reserve, {
      scheduleId,
      bucket: "private-prerecorded",
      name,
      contentType: "video/mp4",
      size: 100,
      durationMs: 60_000,
    });
    expect(
      await t.mutation(internal.classSessionVideos.attachUpload, {
        id,
        uploadId: `upload-${id}`,
      }),
    ).toBe(true);
    return id;
  };
  const ready = async () => {
    const id = await reserve();
    await clients.teacher.mutation(internal.classSessionVideos.commit, { id });
    return id;
  };
  return { t, ...data, ...clients, reserve, ready };
}
