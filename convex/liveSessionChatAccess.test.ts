import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

test("institutional guests can only read the active session chat", async () => {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const now = Date.now();
  const data = await t.run(async (ctx) => {
    const teacherId = await ctx.db.insert("users", {
      clerkId: "live-chat-teacher",
      firstName: "Taylor",
      lastName: "Teacher",
      fullName: "Taylor Teacher",
      isActive: true,
      createdAt: now,
    });
    const guestId = await ctx.db.insert("users", {
      clerkId: "live-chat-guest",
      firstName: "Grace",
      lastName: "Guest",
      fullName: "Grace Guest",
      isActive: true,
      createdAt: now,
    });
    const wrongGradeId = await ctx.db.insert("users", {
      clerkId: "live-chat-wrong-grade",
      firstName: "Wendy",
      lastName: "Wrong Grade",
      fullName: "Wendy Wrong Grade",
      isActive: true,
      createdAt: now,
    });
    const schoolId = await ctx.db.insert("schools", {
      name: "School",
      slug: "school",
      timeZone: "America/Bogota",
      isActive: true,
      createdAt: now,
      createdBy: teacherId,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Campus",
      slug: "campus",
      isActive: true,
      createdAt: now,
      createdBy: teacherId,
    });
    for (const [userId, gradeCode] of [
      [guestId, "05"],
      [wrongGradeId, "06"],
    ] as const) {
      await ctx.db.insert("roleAssignments", {
        userId,
        orgId: campusId,
        orgType: "campus",
        role: "student",
        schoolId,
        gradeCode,
        assignedAt: now,
        assignedBy: teacherId,
      });
    }
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Curriculum",
      isActive: true,
      createdAt: now,
      createdBy: teacherId,
      schoolId,
      gradeCodes: ["05"],
    });
    const classId = await ctx.db.insert("classes", {
      name: "Institutional class",
      curriculumId,
      schoolId,
      campusId,
      teacherId,
      classType: "standard",
      gradeCode: "01",
      enrollmentsMigratedAt: now,
      liveAccess: { mode: "school", allowedGradeCodes: ["05"] },
      isActive: true,
      createdAt: now,
      createdBy: teacherId,
    });
    const scheduleId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      sessionType: "live",
      scheduledStart: now - 60_000,
      scheduledEnd: now + 60 * 60_000,
      roomName: "institutional-live-room",
      status: "active",
      isLive: true,
      liveAccess: { mode: "school", allowedGradeCodes: ["05"] },
      createdAt: now,
      createdBy: teacherId,
    });
    const previousScheduleId = await ctx.db.insert("classSchedule", {
      classId,
      schoolId,
      sessionType: "live",
      scheduledStart: now - 2 * 60 * 60_000,
      scheduledEnd: now - 60 * 60_000,
      roomName: "institutional-previous-room",
      status: "completed",
      completedAt: now - 60 * 60_000,
      createdAt: now,
      createdBy: teacherId,
    });
    await ctx.db.insert("courseChatMessages", {
      classId,
      authorId: teacherId,
      body: "Course history",
    });
    await ctx.db.insert("courseChatMessages", {
      classId,
      scheduleId: previousScheduleId,
      authorId: teacherId,
      body: "Previous session",
    });
    const storageId = await ctx.storage.store(
      new Blob(["session resource"], { type: "application/pdf" }),
    );
    const attachmentId = await ctx.db.insert("courseChatAttachments", {
      classId,
      uploadedBy: teacherId,
      name: "private.pdf",
      contentType: "application/pdf",
      size: 16,
      storageId,
    });
    const resourceMessageId = await ctx.db.insert("courseChatMessages", {
      classId,
      scheduleId,
      authorId: teacherId,
      body: "Current resource https://example.com",
      linksEnabled: true,
      attachmentIds: [attachmentId],
    });
    await ctx.db.patch("courseChatAttachments", attachmentId, {
      messageId: resourceMessageId,
    });

    return {
      classId,
      scheduleId,
      campusId,
      resourceMessageId,
      attachmentId,
    };
  });
  const teacher = t.withIdentity({ subject: "live-chat-teacher" });
  const guest = t.withIdentity({ subject: "live-chat-guest" });
  const wrongGrade = t.withIdentity({ subject: "live-chat-wrong-grade" });
  const paginationOpts = { cursor: null, numItems: 20 };

  const liveMessageId = await teacher.mutation(api.courseChatMessages.send, {
    classId: data.classId,
    scheduleId: data.scheduleId,
    body: "Live announcement",
  });
  expect(
    await t.run((ctx) => ctx.db.get("courseChatMessages", liveMessageId)),
  ).toMatchObject({ scheduleId: data.scheduleId });

  const guestPage = await guest.query(api.courseChatMessages.list, {
    classId: data.classId,
    scheduleId: data.scheduleId,
    paginationOpts,
  });
  expect(guestPage.page.map((message) => message.body)).toEqual([
    "Live announcement",
    "Current resource https://example.com",
  ]);
  const resource = guestPage.page.find(
    (message) => message._id === data.resourceMessageId,
  )!;
  expect(resource).not.toHaveProperty("attachmentIds");
  expect(resource.attachments).toEqual([
    {
      id: data.attachmentId,
      name: "private.pdf",
      contentType: "application/pdf",
      size: 16,
    },
  ]);
  expect(resource).not.toHaveProperty("linksEnabled");
  expect(
    await guest.mutation(internal.courseChatAttachments.read, {
      id: data.attachmentId,
    }),
  ).toMatchObject({ name: "private.pdf", contentType: "application/pdf" });
  await expect(
    wrongGrade.mutation(internal.courseChatAttachments.read, {
      id: data.attachmentId,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  expect(
    await guest.query(api.courseChatMessages.getMyStatus, {
      classId: data.classId,
      scheduleId: data.scheduleId,
    }),
  ).toEqual({
    isMuted: true,
    archived: false,
    canAttach: false,
    canPin: false,
    readOnly: true,
  });
  await expect(
    guest.query(api.courseChatMessages.list, {
      classId: data.classId,
      paginationOpts,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    guest.mutation(api.courseChatMessages.send, {
      classId: data.classId,
      scheduleId: data.scheduleId,
      body: "Guests cannot write",
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  expect(
    await wrongGrade.query(api.courseChatMessages.list, {
      classId: data.classId,
      scheduleId: data.scheduleId,
      paginationOpts,
    }),
  ).toMatchObject({ page: [], isDone: true });
  expect(
    await guest.query(api.classes.listChatOptions, {
      campusId: data.campusId,
    }),
  ).toEqual([]);
  expect(
    (
      await guest.query(api.courseChatNotifications.listUnread, {
        paginationOpts,
      })
    ).page,
  ).toEqual([]);

  await t.run((ctx) =>
    ctx.db.patch("classSchedule", data.scheduleId, {
      status: "completed",
      isLive: false,
      completedAt: now,
    }),
  );
  expect(
    await guest.query(api.courseChatMessages.list, {
      classId: data.classId,
      scheduleId: data.scheduleId,
      paginationOpts,
    }),
  ).toMatchObject({ page: [], isDone: true });
  expect(
    await guest.query(api.courseChatMessages.getMyStatus, {
      classId: data.classId,
      scheduleId: data.scheduleId,
    }),
  ).toMatchObject({ archived: true, readOnly: true });
  await expect(
    guest.mutation(internal.courseChatAttachments.read, {
      id: data.attachmentId,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    teacher.mutation(api.courseChatMessages.send, {
      classId: data.classId,
      scheduleId: data.scheduleId,
      body: "Too late",
    }),
  ).rejects.toThrow("CHAT_SESSION_NOT_LIVE");

  const teacherPage = await teacher.query(api.courseChatMessages.list, {
    classId: data.classId,
    scheduleId: data.scheduleId,
    paginationOpts,
  });
  expect(teacherPage.page.map((message) => message.body)).toEqual(
    expect.arrayContaining([
      "Course history",
      "Previous session",
      "Current resource https://example.com",
      "Live announcement",
    ]),
  );
});
