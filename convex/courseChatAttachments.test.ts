import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import type { Id } from "./_generated/dataModel";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const data = await t.run(async (ctx) => {
    const users = await Promise.all(
      ["teacher", "student", "outsider", "admin"].map((clerkId) =>
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
    const [teacherId, studentId, outsiderId, adminId] = users;
    await ctx.db.insert("roleAssignments", {
      userId: adminId,
      orgType: "system",
      role: "superadmin",
      assignedAt: Date.now(),
      assignedBy: adminId,
    });
    const schoolId = await ctx.db.insert("schools", {
      name: "School",
      slug: "school",
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
    const classId = await ctx.db.insert("classes", {
      schoolId,
      curriculumId,
      name: "Math",
      teacherId,
      students: [studentId],
      isActive: true,
      createdBy: adminId,
      createdAt: Date.now(),
    });
    const otherClassId = await ctx.db.insert("classes", {
      schoolId,
      curriculumId,
      name: "Other",
      teacherId,
      students: [studentId],
      isActive: true,
      createdBy: adminId,
      createdAt: Date.now(),
    });
    return { classId, otherClassId, teacherId, studentId, outsiderId, adminId };
  });
  const teacher = t.withIdentity({ subject: "teacher" });
  const student = t.withIdentity({ subject: "student" });
  const admin = t.withIdentity({ subject: "admin" });
  const outsider = t.withIdentity({ subject: "outsider" });
  const pdf = new Blob(
    ["%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"],
    { type: "application/pdf" },
  );
  const post = (body: Blob = pdf, client = teacher, declaredSize = body.size) =>
    client.fetch(`/course-chat-files?classId=${data.classId}`, {
      method: "POST",
      body,
      headers: {
        "Content-Type": body.type,
        "X-File-Name": body.type === "image/png" ? "image.png" : "lesson.pdf",
        "X-File-Size": String(declaredSize),
      },
    });
  const upload = async () => {
    const response = await post();
    expect(response.status, await response.clone().text()).toBe(200);
    return (await response.json()).id as Id<"courseChatAttachments">;
  };
  return { t, ...data, teacher, student, admin, outsider, post, upload };
}

test("assigned teachers and administrators upload by default; student setting also gates links", async () => {
  const s = await setup();
  expect(
    (
      await s.student.query(api.courseChatMessages.getMyStatus, {
        classId: s.classId,
      })
    ).canAttach,
  ).toBe(false);
  expect((await s.post(undefined, s.student)).status).toBe(400);
  expect((await s.post(undefined, s.admin)).status).toBe(200);
  expect((await s.post(undefined, s.outsider)).status).toBe(400);
  await expect(
    s.student.mutation(api.courseChatMessages.send, {
      classId: s.classId,
      body: "See https://example.com",
    }),
  ).rejects.toThrow("CHAT_ATTACHMENTS_DISABLED");
  await expect(
    s.student.mutation(api.courseChatMessages.setSetting, {
      classId: s.classId,
      setting: "studentAttachmentsEnabled",
      enabled: true,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await s.teacher.mutation(api.courseChatMessages.setSetting, {
    classId: s.classId,
    setting: "studentAttachmentsEnabled",
    enabled: true,
  });
  expect((await s.post(undefined, s.student)).status).toBe(200);
  await s.student.mutation(api.courseChatMessages.send, {
    classId: s.classId,
    body: "https://example.com",
  });
  await s.teacher.mutation(api.courseChatMessages.setMuted, {
    classId: s.classId,
    userId: s.studentId,
    muted: true,
  });
  expect((await s.post(undefined, s.student)).status).toBe(400);
});

test("principals and institutional administrators can attach only within their scope", async () => {
  const s = await setup();
  const messageId = await s.teacher.mutation(api.courseChatMessages.send, {
    classId: s.classId,
    body: "Scoped pin",
  });
  const { schoolId, campusId, assignmentId } = await s.t.run(async (ctx) => {
    const course = (await ctx.db.get("classes", s.classId))!;
    const schoolId = course.schoolId!;
    const campus = {
      schoolId,
      isActive: true,
      createdAt: Date.now(),
      createdBy: s.adminId,
    };
    const campusId = await ctx.db.insert("campuses", {
      ...campus,
      name: "Main",
      slug: "main",
    });
    const otherCampusId = await ctx.db.insert("campuses", {
      ...campus,
      name: "Other",
      slug: "other",
    });
    await ctx.db.patch("classes", s.classId, { campusId });
    const assignmentId = await ctx.db.insert("roleAssignments", {
      userId: s.outsiderId,
      role: "principal",
      orgType: "campus",
      orgId: otherCampusId,
      assignedAt: Date.now(),
      assignedBy: s.adminId,
    });
    return { schoolId, campusId, assignmentId };
  });
  expect((await s.post(undefined, s.outsider)).status).toBe(400);
  await expect(
    s.outsider.mutation(api.courseChatMessages.setPinned, {
      messageId,
      pinned: true,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await s.t.run((ctx) =>
    ctx.db.patch("roleAssignments", assignmentId, { orgId: campusId }),
  );
  await s.outsider.mutation(api.courseChatMessages.setPinned, {
    messageId,
    pinned: true,
  });
  expect(
    (
      await s.outsider.query(api.courseChatMessages.getMyStatus, {
        classId: s.classId,
      })
    ).canAttach,
  ).toBe(true);
  expect((await s.post(undefined, s.outsider)).status).toBe(200);
  await s.outsider.mutation(api.courseChatMessages.send, {
    classId: s.classId,
    body: "https://example.com",
  });
  await s.t.run((ctx) =>
    ctx.db.patch("roleAssignments", assignmentId, {
      role: "admin",
      orgType: "school",
      orgId: schoolId,
    }),
  );
  await s.outsider.mutation(api.courseChatMessages.setPinned, {
    messageId,
    pinned: false,
  });
  expect((await s.post(undefined, s.outsider)).status).toBe(200);
  await s.t.run((ctx) =>
    ctx.db.patch("roleAssignments", assignmentId, { orgId: "another-school" }),
  );
  await expect(
    s.outsider.mutation(api.courseChatMessages.setPinned, {
      messageId,
      pinned: true,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  expect((await s.post(undefined, s.outsider)).status).toBe(400);
});

test("pin read markers are per-user, monotonic and do not swallow a concurrent new pin", async () => {
  const s = await setup();
  const queryArgs = { classId: s.classId };
  const firstId = await s.teacher.mutation(api.courseChatMessages.send, {
    classId: s.classId,
    body: "First",
  });
  const secondId = await s.teacher.mutation(api.courseChatMessages.send, {
    classId: s.classId,
    body: "Second",
  });
  expect(
    await s.student.query(api.courseChatMessages.hasUnreadPins, queryArgs),
  ).toBe(false);
  await s.teacher.mutation(api.courseChatMessages.setPinned, {
    messageId: firstId,
    pinned: true,
  });
  const first = await s.t.run((ctx) =>
    ctx.db.get("courseChatMessages", firstId),
  );
  expect(
    await s.student.query(api.courseChatMessages.hasUnreadPins, queryArgs),
  ).toBe(true);
  await s.student.mutation(api.courseChatMessages.markPinsSeen, {
    messageId: firstId,
    pinnedAt: first!.pinnedAt!,
  });
  expect(
    await s.student.query(api.courseChatMessages.hasUnreadPins, queryArgs),
  ).toBe(false);
  expect(
    await s.admin.query(api.courseChatMessages.hasUnreadPins, queryArgs),
  ).toBe(true);
  await s.teacher.mutation(api.courseChatMessages.setPinned, {
    messageId: secondId,
    pinned: true,
  });
  const second = await s.t.run((ctx) =>
    ctx.db.get("courseChatMessages", secondId),
  );
  expect(second!.pinnedAt!).toBeGreaterThan(first!.pinnedAt!);
  await s.student.mutation(api.courseChatMessages.markPinsSeen, {
    messageId: firstId,
    pinnedAt: first!.pinnedAt!,
  });
  expect(
    await s.student.query(api.courseChatMessages.hasUnreadPins, queryArgs),
  ).toBe(true);
  await expect(
    s.outsider.mutation(api.courseChatMessages.markPinsSeen, {
      messageId: secondId,
      pinnedAt: second!.pinnedAt!,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await s.student.mutation(api.courseChatMessages.markPinsSeen, {
    messageId: secondId,
    pinnedAt: second!.pinnedAt!,
  });
  expect(
    await s.student.query(api.courseChatMessages.hasUnreadPins, queryArgs),
  ).toBe(false);
  await s.teacher.mutation(api.courseChatMessages.setPinned, {
    messageId: secondId,
    pinned: false,
  });
  await s.teacher.mutation(api.courseChatMessages.setPinned, {
    messageId: secondId,
    pinned: true,
  });
  await s.student.mutation(api.courseChatMessages.markPinsSeen, {
    messageId: secondId,
    pinnedAt: second!.pinnedAt!,
  });
  expect(
    await s.student.query(api.courseChatMessages.hasUnreadPins, queryArgs),
  ).toBe(true);
  await s.admin.mutation(api.courseChatMessages.clear, queryArgs);
  expect(
    await s.student.query(api.courseChatMessages.hasUnreadPins, queryArgs),
  ).toBe(false);
  await s.t.mutation(internal.courseChatMessages.removeByClass, queryArgs);
  expect(
    await s.t.run((ctx) => ctx.db.query("courseChatPinReads").first()),
  ).toBeNull();
});

test("files-only messages are private, paginated, idempotent and count once", async () => {
  const s = await setup();
  const id = await s.upload();
  const storageId = await s.t.run(
    async (ctx) => (await ctx.db.get("courseChatAttachments", id))!.storageId!,
  );
  await s.teacher.mutation(internal.courseChatAttachments.complete, {
    id,
    storageId,
  });
  expect((await s.teacher.fetch(`/course-chat-files?id=${id}`)).status).toBe(
    403,
  );
  const args = { classId: s.classId, body: "", attachmentIds: [id] };
  const messageId = await s.teacher.mutation(api.courseChatMessages.send, args);
  expect(await s.teacher.mutation(api.courseChatMessages.send, args)).toBe(
    messageId,
  );
  const response = await s.student.fetch(`/course-chat-files?id=${id}`);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.text()).toContain("%PDF");
  expect((await s.outsider.fetch(`/course-chat-files?id=${id}`)).status).toBe(
    403,
  );
  const page = await s.student.query(api.courseChatMessages.list, {
    classId: s.classId,
    paginationOpts: { cursor: null, numItems: 40 },
  });
  expect(page.page[0].attachments).toMatchObject([
    { id, contentType: "application/pdf" },
  ]);
  expect(JSON.stringify(page)).not.toContain("convex.cloud/api/storage");
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const notifications = await s.student.query(api.systemNotifications.list, {
    paginationOpts: { cursor: null, numItems: 50 },
  });
  expect(notifications.page[0].chatMessageCount).toBe(1);
  expect((await s.student.fetch(`/course-chat-files?id=${id}`)).status).toBe(
    200,
  );
  await s.t.run((ctx) => ctx.db.patch("classes", s.classId, { students: [] }));
  expect((await s.student.fetch(`/course-chat-files?id=${id}`)).status).toBe(
    403,
  );
});

test("pins reference original messages and attachments, enforce roles, and disappear on clear", async () => {
  const s = await setup();
  const attachmentId = await s.upload();
  const messageId = await s.teacher.mutation(api.courseChatMessages.send, {
    classId: s.classId,
    body: "Lesson",
    attachmentIds: [attachmentId],
  });
  const args = {
    classId: s.classId,
    paginationOpts: { cursor: null, numItems: 20 },
  };
  expect(
    (await s.student.query(api.courseChatMessages.listPinned, args)).page,
  ).toHaveLength(0);
  for (const client of [s.student, s.outsider])
    await expect(
      client.mutation(api.courseChatMessages.setPinned, {
        messageId,
        pinned: true,
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
  await s.teacher.mutation(api.courseChatMessages.setPinned, {
    messageId,
    pinned: true,
  });
  const first = await s.student.query(api.courseChatMessages.listPinned, args);
  expect(first.page).toHaveLength(1);
  expect(first.page[0]).toMatchObject({
    _id: messageId,
    body: "Lesson",
    attachments: [{ id: attachmentId }],
  });
  vi.setSystemTime(Date.now() + 1000);
  await s.admin.mutation(api.courseChatMessages.setPinned, {
    messageId,
    pinned: true,
  });
  expect(
    (await s.student.query(api.courseChatMessages.listPinned, args)).page[0]
      .pinnedAt,
  ).toBe(first.page[0].pinnedAt);
  await expect(
    s.outsider.query(api.courseChatMessages.listPinned, args),
  ).rejects.toThrow("PERMISSION_DENIED");
  await s.admin.mutation(api.courseChatMessages.setPinned, {
    messageId,
    pinned: false,
  });
  expect(
    (await s.student.query(api.courseChatMessages.listPinned, args)).page,
  ).toHaveLength(0);
  await s.teacher.mutation(api.courseChatMessages.setPinned, {
    messageId,
    pinned: true,
  });
  await s.admin.mutation(api.courseChatMessages.clear, { classId: s.classId });
  expect(
    (await s.student.query(api.courseChatMessages.listPinned, args)).page,
  ).toHaveLength(0);
  expect(
    await s.t.run((ctx) => ctx.db.get("courseChatAttachments", attachmentId)),
  ).toBeNull();
});

test("pinned feed is paginated newest-pin first and hides archived or cleared messages", async () => {
  const s = await setup();
  const older = await s.teacher.mutation(api.courseChatMessages.send, {
    classId: s.classId,
    body: "Older",
  });
  const newer = await s.teacher.mutation(api.courseChatMessages.send, {
    classId: s.classId,
    body: "Newer",
  });
  await s.teacher.mutation(api.courseChatMessages.setPinned, {
    messageId: newer,
    pinned: true,
  });
  vi.setSystemTime(Date.now() + 1000);
  await s.teacher.mutation(api.courseChatMessages.setPinned, {
    messageId: older,
    pinned: true,
  });
  const first = await s.student.query(api.courseChatMessages.listPinned, {
    classId: s.classId,
    paginationOpts: { cursor: null, numItems: 1 },
  });
  expect(first.page.map((m) => m._id)).toEqual([older]);
  const second = await s.student.query(api.courseChatMessages.listPinned, {
    classId: s.classId,
    paginationOpts: { cursor: first.continueCursor, numItems: 1 },
  });
  expect(second.page.map((m) => m._id)).toEqual([newer]);
  await s.admin.mutation(api.courseChatMessages.setArchived, {
    classId: s.classId,
    archived: true,
  });
  expect(
    (
      await s.student.query(api.courseChatMessages.listPinned, {
        classId: s.classId,
        paginationOpts: { cursor: null, numItems: 20 },
      })
    ).page,
  ).toHaveLength(0);
  await expect(
    s.teacher.mutation(api.courseChatMessages.setPinned, {
      messageId: older,
      pinned: false,
    }),
  ).rejects.toThrow("CHAT_ARCHIVED");
});

test("cannot reuse another user's file, cross courses, or bypass send-time revocation", async () => {
  const s = await setup();
  const id = await s.upload();
  await expect(
    s.teacher.mutation(api.courseChatMessages.send, {
      classId: s.otherClassId,
      body: "",
      attachmentIds: [id],
    }),
  ).rejects.toThrow("INVALID_CHAT_ATTACHMENTS");
  await s.teacher.mutation(api.courseChatMessages.setSetting, {
    classId: s.classId,
    setting: "studentAttachmentsEnabled",
    enabled: true,
  });
  await expect(
    s.student.mutation(api.courseChatMessages.send, {
      classId: s.classId,
      body: "",
      attachmentIds: [id],
    }),
  ).rejects.toThrow("INVALID_CHAT_ATTACHMENTS");
  const studentId = (await (await s.post(undefined, s.student)).json()).id;
  await s.teacher.mutation(api.courseChatMessages.setSetting, {
    classId: s.classId,
    setting: "studentAttachmentsEnabled",
    enabled: false,
  });
  await expect(
    s.student.mutation(api.courseChatMessages.send, {
      classId: s.classId,
      body: "",
      attachmentIds: [studentId],
    }),
  ).rejects.toThrow("CHAT_ATTACHMENTS_DISABLED");
  await s.admin.mutation(api.courseChatMessages.setArchived, {
    classId: s.classId,
    archived: true,
  });
  await expect(
    s.teacher.mutation(api.courseChatMessages.send, {
      classId: s.classId,
      body: "",
      attachmentIds: [id],
    }),
  ).rejects.toThrow("CHAT_ARCHIVED");
});

test("rejects spoofed content, actual size mismatch, excess attachments and throttles uploads", async () => {
  const s = await setup();
  expect(
    (
      await s.post(
        new Blob(["<script>alert(1)</script>"], { type: "image/png" }),
      )
    ).status,
  ).toBe(400);
  expect((await s.post(undefined, undefined, 1)).status).toBe(400);
  const id = await s.upload();
  await expect(
    s.teacher.mutation(api.courseChatMessages.send, {
      classId: s.classId,
      body: "",
      attachmentIds: [id, id],
    }),
  ).rejects.toThrow("INVALID_CHAT_ATTACHMENTS");
  await expect(
    s.teacher.mutation(api.courseChatMessages.send, {
      classId: s.classId,
      body: "",
      attachmentIds: [id, id, id, id],
    }),
  ).rejects.toThrow("INVALID_CHAT_ATTACHMENTS");
  await s.upload();
  await s.upload();
  await s.upload();
  expect((await s.post()).status).toBe(400);
});

test("clearing deletes stored files, expiration cleans abandoned uploads, archive retains them", async () => {
  const s = await setup();
  const id = await s.upload();
  const pending = await s.upload();
  await s.teacher.mutation(api.courseChatMessages.send, {
    classId: s.classId,
    body: "",
    attachmentIds: [id],
  });
  const storage = await s.t.run(
    async (ctx) => (await ctx.db.get("courseChatAttachments", id))!.storageId!,
  );
  await s.admin.mutation(api.courseChatMessages.setArchived, {
    classId: s.classId,
    archived: true,
  });
  expect((await s.teacher.fetch(`/course-chat-files?id=${id}`)).status).toBe(
    403,
  );
  expect(
    await s.t.run(async (ctx) => (await ctx.storage.get(storage)) !== null),
  ).toBe(true);
  await s.admin.mutation(api.courseChatMessages.setArchived, {
    classId: s.classId,
    archived: false,
  });
  await s.admin.mutation(api.courseChatMessages.clear, { classId: s.classId });
  expect(await s.t.run((ctx) => ctx.storage.get(storage))).toBeNull();
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    await s.t.run((ctx) => ctx.db.get("courseChatAttachments", pending)),
  ).toBeNull();
  const other = await s.upload();
  await s.t.mutation(internal.courseChatMessages.removeByClass, {
    classId: s.classId,
  });
  expect(
    await s.t.run((ctx) => ctx.db.get("courseChatAttachments", other)),
  ).toBeNull();
});
