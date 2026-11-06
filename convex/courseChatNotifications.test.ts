import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
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

async function prepareBadgeScope(s: Awaited<ReturnType<typeof setup>>) {
  return s.t.run(async (ctx) => {
    const course = (await ctx.db.get("classes", s.classId))!;
    const assignmentId = await ctx.db.insert("roleAssignments", {
      userId: s.students[0],
      orgType: "campus",
      orgId: course.campusId!,
      schoolId: course.schoolId,
      role: "student",
      gradeCode: "08",
      assignedBy: s.adminId,
      assignedAt: Date.now(),
    });
    return { course, assignmentId };
  });
}

async function readBadgeLanes(
  s: Awaited<ReturnType<typeof setup>>,
  orgSlug = "campus",
) {
  const items = [];
  let documentsRead = 0;
  let bytesRead = 0;
  let pages = 0;
  for (const legacy of [false, true]) {
    let cursor: string | null = null;
    while (true) {
      const read = await s.student.query(async (ctx) => {
        const result = await ctx.runQuery(
          api.courseChatNotifications.listUnreadForBadges,
          {
            orgSlug,
            legacy,
            paginationOpts: { cursor, numItems: 50 },
          },
        );
        return { result, metrics: await ctx.meta.getTransactionMetrics() };
      });
      documentsRead += read.metrics.documentsRead.used;
      bytesRead += read.metrics.bytesRead.used;
      items.push(...read.result.page);
      pages++;
      if (read.result.isDone) break;
      cursor = read.result.continueCursor;
      expect(pages).toBeLessThan(100);
    }
  }
  return { items, documentsRead, bytesRead, pages };
}

async function backfillBadgeRows(s: Awaited<ReturnType<typeof setup>>) {
  let cursor: string | null = null;
  let updated = 0;
  while (true) {
    const page: FunctionReturnType<
      typeof internal.courseChatNotifications.backfillChatBadgeRelevance
    > = await s.t.mutation(
      internal.courseChatNotifications.backfillChatBadgeRelevance,
      {
        paginationOpts: { cursor, numItems: 100, maximumRowsRead: 100 },
      },
    );
    expect(page.updated).toBeLessThanOrEqual(100);
    updated += page.updated;
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  return updated;
}

test("indexed badge lanes preserve legacy counts and avoid 1000 unrelated notice bodies after bounded backfill", async () => {
  const s = await setup();
  const { course } = await prepareBadgeScope(s);
  await s.send("Human chat");
  await s.deliver();
  const ids = await s.t.run(async (ctx) => {
    const ids = [];
    for (let i = 0; i < 1000; i++) {
      ids.push(
        await ctx.db.insert("systemNotifications", {
          recipientId: s.students[0],
          kind: "announcement",
          classId: course._id,
          campusId: course.campusId,
          schoolId: course.schoolId,
          announcementBody: "x".repeat(1000),
          createdAt: Date.now(),
          dedupeKey: `legacy-unrelated-${i}`,
        }),
      );
    }
    const legacyChat = await ctx.db.insert("systemNotifications", {
      recipientId: s.students[0],
      kind: "course_chat",
      classId: course._id,
      campusId: course.campusId,
      schoolId: course.schoolId,
      chatMessageCount: 3,
      createdAt: Date.now(),
      dedupeKey: "legacy-chat",
    });
    return { ids, legacyChat };
  });
  const before = await readBadgeLanes(s);
  expect(before.items.map((item) => item.count).sort()).toEqual([1, 3]);
  expect(before.documentsRead).toBeGreaterThan(1000);
  const original = await s.t.run((ctx) =>
    ctx.db.get("systemNotifications", ids.legacyChat),
  );
  expect(await backfillBadgeRows(s)).toBe(1001);
  expect(await backfillBadgeRows(s)).toBe(0);
  const migrated = await s.t.run((ctx) =>
    ctx.db.get("systemNotifications", ids.legacyChat),
  );
  expect(migrated).toEqual({ ...original, chatBadgeRelevant: true });
  const after = await readBadgeLanes(s);
  expect(after.items).toEqual(before.items);
  expect(after.pages).toBe(2);
  expect(after.documentsRead).toBeLessThan(35);
  expect(after.bytesRead).toBeLessThan(15_000);
  // Old clients retain their original endpoint and still see both notices.
  const oldItems = [];
  let cursor: string | null = null;
  while (true) {
    const page: FunctionReturnType<
      typeof api.courseChatNotifications.listUnread
    > = await s.student.query(api.courseChatNotifications.listUnread, {
      paginationOpts: { cursor, numItems: 50 },
    });
    oldItems.push(...page.page);
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  expect(oldItems.map((item) => item.count).sort()).toEqual([1, 3]);
});

test("new unrelated notifications are indexed away without requiring a backfill", async () => {
  const s = await setup();
  await prepareBadgeScope(s);
  await s.send("Human chat");
  await s.deliver();
  for (let i = 0; i < 10; i++) {
    await s.t.run(async (ctx) => {
      for (let j = 0; j < 100; j++) {
        await ctx.runMutation(internal.systemNotifications.publish, {
          recipientId: s.students[0],
          kind: "announcement",
          announcementBody: "x".repeat(1000),
          dedupeKey: `new-unrelated-${i}-${j}`,
        });
      }
    });
  }
  const read = await readBadgeLanes(s);
  expect(read.items.map((item) => item.count)).toEqual([1]);
  expect(read.pages).toBe(2);
  expect(read.documentsRead).toBeLessThan(30);
  expect(read.bytesRead).toBeLessThan(15_000);
});

test("backfill preserves read-before-delivery watermarks and does not acknowledge later messages", async () => {
  const s = await setup();
  await prepareBadgeScope(s);
  const older = await s.send("Delayed delivery");
  await s.student.mutation(api.courseChatNotifications.markRead, {
    messageId: older,
  });
  await backfillBadgeRows(s);
  await s.deliver();
  expect((await readBadgeLanes(s)).items).toEqual([]);
  await s.send("New unread message");
  await s.deliver();
  await backfillBadgeRows(s);
  expect((await readBadgeLanes(s)).items.map((item) => item.count)).toEqual([
    1,
  ]);
  // A retried acknowledgement of the older message cannot erase the new badge.
  await s.student.mutation(api.courseChatNotifications.markRead, {
    messageId: older,
  });
  expect((await readBadgeLanes(s)).items.map((item) => item.count)).toEqual([
    1,
  ]);
});

test("scoped badge lanes include institutional broadcasts and exclude other campuses and revoked access", async () => {
  const s = await setup();
  const { course, assignmentId } = await prepareBadgeScope(s);
  const { institutional, otherCampus } = await s.t.run(async (ctx) => {
    const campusId = await ctx.db.insert("campuses", {
      schoolId: course.schoolId!,
      name: "Other",
      slug: "other",
      isActive: true,
      createdAt: Date.now(),
      createdBy: s.adminId,
    });
    const makeBroadcast = async (
      mode: "private" | "school",
      campus?: Id<"campuses">,
    ) => {
      const broadcastId = await ctx.db.insert("broadcasts", {
        name: `${mode} broadcast`,
        schoolId: course.schoolId!,
        campusId: campus,
        mode,
        gradeCodes: ["08"],
        createdAt: Date.now(),
        createdBy: s.adminId,
        professorsMuted: false,
        professorAttachmentsEnabled: false,
      });
      await ctx.db.insert("systemNotifications", {
        recipientId: s.students[0],
        kind: "broadcast_chat",
        broadcastId,
        schoolId: course.schoolId,
        campusId: campus,
        createdAt: Date.now(),
        chatMessageCount: 2,
        dedupeKey: broadcastId,
        chatBadgeRelevant: true,
      });
      return broadcastId;
    };
    const institutional = await makeBroadcast("school");
    const otherCampus = await makeBroadcast("private", campusId);
    // User may read both campuses, but campus-specific badges must not leak across them.
    await ctx.db.insert("roleAssignments", {
      userId: s.students[0],
      orgType: "campus",
      orgId: campusId,
      schoolId: course.schoolId,
      role: "student",
      gradeCode: "08",
      assignedAt: Date.now(),
      assignedBy: s.adminId,
    });
    return { institutional, otherCampus };
  });
  const current = await readBadgeLanes(s);
  expect(current.items.map((item) => item.broadcastId)).toEqual([
    institutional,
  ]);
  const other = await readBadgeLanes(s, "other");
  expect(new Set(other.items.map((item) => item.broadcastId))).toEqual(
    new Set([institutional, otherCampus]),
  );
  await s.t.run((ctx) => ctx.db.delete("roleAssignments", assignmentId));
  await expect(readBadgeLanes(s)).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.t
      .withIdentity({ subject: "outsider" })
      .query(api.courseChatNotifications.listUnreadForBadges, {
        orgSlug: "school",
        legacy: false,
        paginationOpts: { cursor: null, numItems: 50 },
      }),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("badge lanes paginate every relevant row and recheck enrollment after a cursor was issued", async () => {
  const s = await setup();
  const { course } = await prepareBadgeScope(s);
  await s.t.run(async (ctx) => {
    for (let i = 0; i < 125; i++) {
      await ctx.db.insert("systemNotifications", {
        recipientId: s.students[0],
        kind: "course_chat",
        classId: s.classId,
        schoolId: course.schoolId,
        campusId: course.campusId,
        chatMessageCount: 1,
        createdAt: Date.now(),
        dedupeKey: `page-${i}`,
        chatBadgeRelevant: true,
      });
    }
  });
  expect((await readBadgeLanes(s)).items).toHaveLength(125);
  const first = await s.student.query(
    api.courseChatNotifications.listUnreadForBadges,
    {
      orgSlug: "campus",
      legacy: false,
      paginationOpts: { cursor: null, numItems: 50 },
    },
  );
  expect(first.page).toHaveLength(50);
  expect(first.isDone).toBe(false);
  await s.t.run(async (ctx) => {
    const enrollment = await ctx.db
      .query("classEnrollments")
      .withIndex("by_class", (q) => q.eq("classId", s.classId))
      .unique();
    await ctx.db.delete("classEnrollments", enrollment!._id);
  });
  const next = await s.student.query(
    api.courseChatNotifications.listUnreadForBadges,
    {
      orgSlug: "campus",
      legacy: false,
      paginationOpts: { cursor: first.continueCursor, numItems: 50 },
    },
  );
  expect(next.page).toEqual([]);
  expect((await readBadgeLanes(s)).items).toEqual([]);
});

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- New fixtures must omit Convex system fields.
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- New fixtures must omit Convex system fields.
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

test.each([false, true])(
  "delivery bounds its transaction and preserves reads before later batches (legacy: %s)",
  async (legacy) => {
    const s = await setup(25, legacy);
    // Insert directly to drive exactly one batch, without a second scheduled delivery.
    const messageId = await s.t.run((ctx) =>
      ctx.db.insert("courseChatMessages", {
        classId: s.classId,
        authorId: s.teacherId,
        body: "bounded delivery",
      }),
    );
    await s.t.run(async (ctx) => {
      await ctx.runMutation(internal.courseChatNotifications.publish, {
        messageId,
        cursor: null,
        legacyOffset: 0,
      });
      expect(
        (await ctx.meta.getTransactionMetrics()).documentsWritten.used,
      ).toBeLessThanOrEqual(12);
    });
    const firstBatch = await s.t.run((ctx) =>
      ctx.db.query("systemNotifications").collect(),
    );
    expect(firstBatch).toHaveLength(11); // Ten students plus the tutor; not the author.
    await s.t
      .withIdentity({ subject: "student-24" })
      .mutation(api.courseChatNotifications.markRead, { messageId });
    await s.deliver();
    const rows = await s.t.run((ctx) =>
      ctx.db.query("systemNotifications").collect(),
    );
    expect(rows).toHaveLength(26);
    expect(rows.filter((row) => row.chatMessageCount === 1)).toHaveLength(25);
    expect(
      rows.find((row) => row.recipientId === s.students[24]),
    ).toMatchObject({ chatMessageCount: 0 });
  },
);
