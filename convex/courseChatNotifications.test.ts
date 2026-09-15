import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { modules } from "./test.setup";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function setup(studentCount = 1, legacy = false) {
  const t = convexTest(schema, modules);
  const data = await t.run(async (ctx) => {
    const user = (name: string) =>
      ctx.db.insert("users", {
        clerkId: name,
        firstName: name,
        lastName: "Test",
        fullName: name,
        isActive: true,
        createdAt: Date.now(),
      });
    const teacherId = await user("teacher");
    const adminId = await user("admin");
    const outsiderId = await user("outsider");
    const tutorId = await user("tutor");
    await ctx.db.insert("roleAssignments", {
      userId: adminId,
      orgType: "system",
      role: "superadmin",
      assignedAt: Date.now(),
      assignedBy: adminId,
    });
    const students = [];
    for (let i = 0; i < studentCount; i++)
      students.push(await user(`student-${i}`));
    const schoolId = await ctx.db.insert("schools", {
      name: "School",
      slug: "school",
      isActive: true,
      createdAt: Date.now(),
      createdBy: adminId,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Campus",
      slug: "campus",
      isActive: true,
      createdAt: Date.now(),
      createdBy: adminId,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      schoolId,
      title: "Math",
      isActive: true,
      createdAt: Date.now(),
      createdBy: adminId,
    });
    const classId = await ctx.db.insert("classes", {
      name: "Math 8",
      schoolId,
      campusId,
      curriculumId,
      teacherId,
      tutorId,
      isActive: true,
      createdAt: Date.now(),
      createdBy: adminId,
      enrollmentsMigratedAt: legacy ? undefined : Date.now(),
      students: legacy ? students : undefined,
    });
    if (!legacy)
      for (const studentId of students)
        await ctx.db.insert("classEnrollments", {
          classId,
          studentId,
          enrolledAt: Date.now() - 1000,
          enrolledBy: adminId,
        });
    return { teacherId, adminId, outsiderId, tutorId, students, classId };
  });
  const student = t.withIdentity({ subject: "student-0" });
  const teacher = t.withIdentity({ subject: "teacher" });
  const admin = t.withIdentity({ subject: "admin" });
  const send = async (body: string) => {
    vi.advanceTimersByTime(10);
    return teacher.mutation(api.courseChatMessages.send, {
      classId: data.classId,
      body,
    });
  };
  const deliver = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  const feed = () =>
    student.query(api.systemNotifications.list, {
      paginationOpts: { cursor: null, numItems: 50 },
    });
  const unread = () =>
    student.query(api.courseChatNotifications.listUnread, {
      paginationOpts: { cursor: null, numItems: 50 },
    });
  return { t, ...data, student, teacher, admin, send, deliver, feed, unread };
}

test.each([false, true])(
  "chat order follows messages for every role (legacy enrollment: %s)",
  async (legacy) => {
    const s = await setup(1, legacy);
    const { recentId, emptyId } = await s.t.run(async (ctx) => {
      const course = (await ctx.db.get("classes", s.classId))!;
      const makeCourse = (name: string) =>
        ctx.db.insert("classes", {
          name,
          schoolId: course.schoolId,
          campusId: course.campusId,
          curriculumId: course.curriculumId,
          teacherId: s.teacherId,
          students: s.students,
          isActive: true,
          createdAt: Date.now(),
          createdBy: s.adminId,
        });
      await ctx.db.insert("roleAssignments", {
        userId: s.tutorId,
        orgType: "campus",
        orgId: course.campusId!,
        role: "principal",
        assignedBy: s.adminId,
        assignedAt: Date.now(),
      });
      return {
        recentId: await makeCourse("Zebra"),
        emptyId: await makeCourse("Aardvark"),
      };
    });
    const first = await s.send("Older message");
    vi.advanceTimersByTime(10);
    await s.teacher.mutation(api.courseChatMessages.send, {
      classId: recentId,
      body: "Newest message",
    });
    const clients = [
      s.student,
      s.teacher,
      s.admin,
      s.t.withIdentity({ subject: "tutor" }),
    ];
    const list = (client = s.student) =>
      client.query(api.classes.listChatOptions, {});
    for (const client of clients) {
      expect((await list(client)).map((chat) => chat._id)).toEqual([
        recentId,
        s.classId,
        emptyId,
      ]);
    }
    expect(
      await s.t
        .withIdentity({ subject: "outsider" })
        .query(api.classes.listChatOptions, {}),
    ).toEqual([]);

    // Reading and pinning do not change message activity.
    await s.student.mutation(api.courseChatNotifications.markRead, {
      messageId: first,
    });
    await s.teacher.mutation(api.courseChatMessages.setPinned, {
      messageId: first,
      pinned: true,
    });
    expect((await list()).map((chat) => chat._id)).toEqual([
      recentId,
      s.classId,
      emptyId,
    ]);
    await s.send("A reply moves this chat first, even for its sender");
    for (const client of clients)
      expect((await list(client))[0]._id).toBe(s.classId);

    // Cleared history must stop affecting order even while deletion is pending.
    await s.t.run(async (ctx) => {
      const latest = await ctx.db
        .query("courseChatMessages")
        .withIndex("by_class", (q) => q.eq("classId", s.classId))
        .order("desc")
        .first();
      await ctx.db.patch("classes", s.classId, {
        chatNotificationsClearedThrough: latest!._creationTime,
      });
    });
    expect((await list()).map((chat) => chat._id)).toEqual([
      recentId,
      emptyId,
      s.classId,
    ]);
    await s.send("New message after clearing");
    expect((await list())[0]._id).toBe(s.classId);
    await s.admin.mutation(api.courseChatMessages.setArchived, {
      classId: s.classId,
      archived: true,
    });
    expect(
      (await list()).find((chat) => chat._id === s.classId)?.archived,
    ).toBe(true);
  },
);

test("groups per course, moves the same notification first and shares read state", async () => {
  const s = await setup();
  const first = await s.send("one");
  await s.deliver();
  const initial = (await s.feed()).page[0];
  expect(initial).toMatchObject({ kind: "course_chat", chatMessageCount: 1 });
  expect(initial.readAt).toBeUndefined();
  vi.advanceTimersByTime(10);
  await s.t.mutation(internal.systemNotifications.publish, {
    recipientId: s.students[0],
    kind: "announcement",
    dedupeKey: "test-announcement",
  });
  const second = await s.send("two");
  await s.deliver();
  expect((await s.feed()).page[0]).toMatchObject({
    _id: initial._id,
    chatMessageCount: 2,
  });
  expect((await s.unread()).page).toEqual([
    expect.objectContaining({ classId: s.classId, count: 2 }),
  ]);
  expect(
    await s.student.query(api.systemNotifications.getUnreadCount, {}),
  ).toBe(2);
  await s.student.mutation(api.courseChatNotifications.markRead, {
    messageId: first,
  });
  expect((await s.unread()).page[0].count).toBe(2); // stale client must not clear the newer message
  await s.student.mutation(api.courseChatNotifications.markRead, {
    messageId: second,
  });
  expect((await s.unread()).page).toEqual([]);
  await s.student.mutation(api.courseChatNotifications.markRead, {
    messageId: second,
  });
  await s.send("three");
  await s.deliver();
  expect((await s.feed()).page[0]).toMatchObject({
    _id: initial._id,
    chatMessageCount: 1,
  });
  expect((await s.feed()).page[0].readAt).toBeUndefined();
  await s.student.mutation(api.systemNotifications.markAllRead, {});
  await s.deliver();
  expect((await s.unread()).page).toEqual([]);
  expect(
    await s.student.query(api.systemNotifications.getUnreadCount, {}),
  ).toBe(0);
  const recipients = await s.t.run((ctx) =>
    ctx.db
      .query("systemNotifications")
      .withIndex("by_class_and_kind", (q) =>
        q.eq("classId", s.classId).eq("kind", "course_chat"),
      )
      .collect(),
  );
  expect(new Set(recipients.map((row) => row.recipientId))).toEqual(
    new Set([s.students[0], s.tutorId]),
  );
});

test("read-before-delivery, revoked access, clear and archive cannot revive pending messages", async () => {
  const s = await setup();
  const messageId = await s.send("read before the worker");
  await s.student.mutation(api.courseChatNotifications.markRead, { messageId });
  await s.deliver();
  expect((await s.unread()).page).toEqual([]);
  expect((await s.feed()).page).toEqual([]);
  await expect(
    s.t
      .withIdentity({ subject: "outsider" })
      .mutation(api.courseChatNotifications.markRead, { messageId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await s.send("unread");
  await s.deliver();
  await s.admin.mutation(api.courseChatMessages.setArchived, {
    classId: s.classId,
    archived: true,
  });
  expect((await s.unread()).page).toEqual([]);
  expect((await s.feed()).page).toEqual([]);
  await s.admin.mutation(api.courseChatMessages.setArchived, {
    classId: s.classId,
    archived: false,
  });
  expect((await s.unread()).page).toEqual([]);
  await s.send("after restore");
  await s.deliver();
  expect((await s.unread()).page[0].count).toBe(1);
  await s.send("clear before delivery");
  vi.advanceTimersByTime(10);
  await s.admin.mutation(api.courseChatMessages.clear, { classId: s.classId });
  await s.deliver();
  expect((await s.unread()).page).toEqual([]);
  await s.send("after clearing");
  await s.deliver();
  expect((await s.unread()).page[0].count).toBe(1);
  await s.t.run(async (ctx) => {
    const enrollment = await ctx.db
      .query("classEnrollments")
      .withIndex("by_class", (q) =>
        q.eq("classId", s.classId).eq("studentId", s.students[0]),
      )
      .unique();
    await ctx.db.delete("classEnrollments", enrollment!._id);
  });
  expect((await s.unread()).page).toEqual([]);
  expect((await s.feed()).page).toEqual([]);
  expect(
    await s.student.query(api.systemNotifications.getUnreadCount, {}),
  ).toBe(0);
});

test("keeps separate courses independent and counts out-of-order deliveries", async () => {
  const s = await setup();
  const otherCourse = await s.t.run(async (ctx) => {
    const course = await ctx.db.get("classes", s.classId);
    const { _id, _creationTime, ...fields } = course!;
    const classId = await ctx.db.insert("classes", {
      ...fields,
      name: "Other course",
    });
    await ctx.db.insert("classEnrollments", {
      classId,
      studentId: s.students[0],
      enrolledAt: Date.now() - 1000,
      enrolledBy: s.adminId,
    });
    return classId;
  });
  const first = await s.send("first course");
  await s.teacher.mutation(api.courseChatMessages.send, {
    classId: otherCourse,
    body: "other course",
  });
  await s.deliver();
  expect((await s.unread()).page).toHaveLength(2);
  await s.student.mutation(api.courseChatNotifications.markRead, {
    messageId: first,
  });
  expect((await s.unread()).page).toEqual([
    expect.objectContaining({ classId: otherCourse, count: 1 }),
  ]);
  const messages: Id<"courseChatMessages">[] = [];
  for (const body of ["older delivery", "newer delivery"]) {
    vi.advanceTimersByTime(10);
    messages.push(
      await s.t.run((ctx) =>
        ctx.db.insert("courseChatMessages", {
          classId: s.classId,
          authorId: s.teacherId,
          body,
        }),
      ),
    );
  }
  for (const messageId of [...messages].reverse()) {
    await s.t.mutation(internal.courseChatNotifications.publish, {
      messageId,
      cursor: null,
      legacyOffset: 0,
    });
  }
  const latest = await s.t.run((ctx) =>
    ctx.db.get("courseChatMessages", messages[1]),
  );
  expect((await s.feed()).page[0]).toMatchObject({
    classId: s.classId,
    chatMessageCount: 2,
    createdAt: latest!._creationTime,
  });
});

test("bounds notification pages without losing unread chats behind hidden rows", async () => {
  const s = await setup();
  const visibleId = await s.t.run(async (ctx) => {
    const course = await ctx.db.get("classes", s.classId);
    const { _id, _creationTime, ...fields } = course!;
    const visibleId = await ctx.db.insert("systemNotifications", {
      recipientId: s.students[0],
      kind: "course_chat",
      classId: s.classId,
      chatMessageCount: 1,
      createdAt: 1,
      dedupeKey: "visible-oldest",
    });
    for (let i = 0; i < 205; i++) {
      const classId = await ctx.db.insert("classes", {
        ...fields,
        // These courses have no enrollment for the recipient. Cover archive,
        // clear and permission revocation without deleting notification rows.
        chatArchivedAt: i % 3 === 0 ? 1 : undefined,
        chatNotificationsClearedThrough: i % 3 === 1 ? 1000 : undefined,
      });
      await ctx.db.insert("systemNotifications", {
        recipientId: s.students[0],
        kind: "course_chat",
        classId,
        chatMessageCount: 1,
        createdAt: i + 2,
        dedupeKey: `hidden-${i}`,
      });
    }
    return visibleId;
  });
  const first = await s.student.query(api.systemNotifications.listUnread, {
    paginationOpts: { cursor: null, numItems: 10_000 },
  });
  expect(first.page).toEqual([]);
  expect(first.isDone).toBe(false);
  expect(first.pageStatus).toBe("SplitRequired");
  const ids = [...first.page];
  let cursor = first.continueCursor;
  let pages = 1;
  while (true) {
    const result = await s.student.query(api.systemNotifications.listUnread, {
      paginationOpts: { cursor, numItems: 10_000 },
    });
    pages++;
    ids.push(...result.page);
    if (result.isDone) break;
    cursor = result.continueCursor;
    expect(pages).toBeLessThan(5);
  }
  expect(pages).toBe(3);
  expect(ids).toEqual([visibleId]);
  const feed = await s.student.query(api.systemNotifications.list, {
    paginationOpts: { cursor: null, numItems: 10_000 },
  });
  expect(feed.page).toEqual([]);
  expect(feed.pageStatus).toBe("SplitRequired");
  const chats = await s.student.query(api.courseChatNotifications.listUnread, {
    paginationOpts: { cursor: null, numItems: 10_000 },
  });
  expect(chats.pageStatus).toBe("SplitRequired");
  expect(chats.page).toEqual([
    expect.objectContaining({ classId: s.classId, count: 1 }),
  ]);
  const stranger = await s.t
    .withIdentity({ subject: "outsider" })
    .query(api.systemNotifications.listUnread, {
      paginationOpts: { cursor: null, numItems: 50 },
    });
  expect(stranger.page).toEqual([]);
  await s.student.mutation(api.systemNotifications.markAllRead, {});
  await s.deliver();
  expect(
    (
      await s.student.query(api.systemNotifications.listUnread, {
        paginationOpts: { cursor: null, numItems: 50 },
      })
    ).page,
  ).toEqual([]);
});

test.each([false, true])(
  "delivers once across multiple recipient batches (legacy: %s)",
  async (legacy) => {
    const s = await setup(105, legacy);
    await s.send("large course");
    await s.deliver();
    const rows = await s.t.run((ctx) =>
      ctx.db.query("systemNotifications").collect(),
    );
    expect(rows).toHaveLength(106);
    expect(rows.every((row) => row.chatMessageCount === 1)).toBe(true);
    expect(new Set(rows.map((row) => row.recipientId)).size).toBe(106);
    expect(
      rows.some((row) =>
        [s.teacherId, s.adminId, s.outsiderId].includes(row.recipientId),
      ),
    ).toBe(false);
  },
);
