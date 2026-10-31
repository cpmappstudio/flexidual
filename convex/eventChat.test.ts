import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { removeGradeFromEvents } from "./model/eventDeletion";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2030, 0, 1));
});
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const data = await t.run(async (ctx) => {
    const addUser = (name: string) =>
      ctx.db.insert("users", {
        clerkId: name,
        firstName: name,
        lastName: "Test",
        fullName: `${name} Test`,
        isActive: true,
        createdAt: 1,
      });
    const [admin, teacher, student, otherStudent, outsider, tutor] =
      await Promise.all(
        [
          "admin",
          "teacher",
          "student",
          "otherStudent",
          "outsider",
          "tutor",
        ].map(addUser),
      );
    const schoolId = await ctx.db.insert("schools", {
      name: "School",
      slug: "school",
      isActive: true,
      createdBy: admin,
      createdAt: 1,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Campus",
      slug: "campus",
      isActive: true,
      createdBy: admin,
      createdAt: 1,
    });
    const assign = (
      userId: typeof admin,
      role: "admin" | "teacher" | "student" | "tutor",
      gradeCode?: string,
    ) =>
      ctx.db.insert("roleAssignments", {
        userId,
        orgType: role === "admin" ? ("school" as const) : ("campus" as const),
        orgId: role === "admin" ? schoolId : campusId,
        schoolId,
        role,
        gradeCode,
        assignedAt: 1,
      });
    await Promise.all([
      assign(admin, "admin"),
      assign(teacher, "teacher"),
      assign(student, "student", "05"),
      assign(otherStudent, "student", "06"),
      assign(tutor, "tutor"),
    ]);
    const eventId = await ctx.db.insert("events", {
      schoolId,
      campusId,
      gradeCodes: ["05"],
      title: "Devotional",
      responsibleId: teacher,
      teacherIds: [],
      timeZone: "America/Bogota",
      createdAt: 1,
      createdBy: admin,
    });
    for (const day of [1, 8])
      await ctx.db.insert("eventOccurrences", {
        eventId,
        schoolId,
        campusId,
        scheduledStart: Date.UTC(2030, 0, day, 14),
        scheduledEnd: Date.UTC(2030, 0, day, 15),
        status: "scheduled",
        roomName: `event-${day}`,
        createdAt: 1,
        createdBy: admin,
      });
    return {
      admin,
      teacher,
      student,
      otherStudent,
      outsider,
      tutor,
      schoolId,
      campusId,
      eventId,
    };
  });
  return {
    t,
    ...data,
    adminClient: t.withIdentity({ subject: "admin" }),
    teacherClient: t.withIdentity({ subject: "teacher" }),
    studentClient: t.withIdentity({ subject: "student" }),
    otherStudentClient: t.withIdentity({ subject: "otherStudent" }),
    outsiderClient: t.withIdentity({ subject: "outsider" }),
    tutorClient: t.withIdentity({ subject: "tutor" }),
  };
}

const paginationOpts = { cursor: null, numItems: 30 };

test("one event thread continues across occurrences and follows current grade", async () => {
  const s = await setup();
  const first = await s.teacherClient.mutation(api.eventChatMessages.send, {
    eventId: s.eventId,
    body: "Monday",
  });
  vi.advanceTimersByTime(100);
  const second = await s.studentClient.mutation(api.eventChatMessages.send, {
    eventId: s.eventId,
    body: "Next Monday",
  });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const read = () =>
    s.studentClient.query(api.eventChatMessages.list, {
      eventId: s.eventId,
      paginationOpts,
    });
  expect((await read()).page.map((message) => message._id)).toEqual([
    second,
    first,
  ]);
  expect(
    (
      await s.studentClient.query(api.eventChatContext.listOptions, {
        schoolId: s.schoolId,
        paginationOpts,
      })
    ).page.map((item) => item.eventId),
  ).toEqual([s.eventId]);
  await s.t.run(async (ctx) => {
    const assignment = await ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", s.student))
      .unique();
    await ctx.db.patch(assignment!._id, { gradeCode: "06" });
  });
  await expect(read()).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.studentClient.mutation(api.eventChatMessages.send, {
      eventId: s.eventId,
      body: "Denied",
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await s.t.run(async (ctx) => {
    const assignment = await ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", s.otherStudent))
      .unique();
    await ctx.db.patch(assignment!._id, { gradeCode: "05" });
  });
  expect(
    (
      await s.otherStudentClient.query(api.eventChatMessages.list, {
        eventId: s.eventId,
        paginationOpts,
      })
    ).page,
  ).toHaveLength(2);
  await expect(
    s.tutorClient.query(api.eventChatMessages.list, {
      eventId: s.eventId,
      paginationOpts,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.outsiderClient.query(api.eventChatMessages.list, {
      eventId: s.eventId,
      paginationOpts,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("event moderation mirrors course capabilities without changing course data", async () => {
  const s = await setup();
  await s.teacherClient.mutation(api.eventChatMessages.setSetting, {
    eventId: s.eventId,
    setting: "studentsMuted",
    enabled: true,
  });
  await expect(
    s.studentClient.mutation(api.eventChatMessages.send, {
      eventId: s.eventId,
      body: "Hello",
    }),
  ).rejects.toThrow("CHAT_MUTED");
  await expect(
    s.teacherClient.mutation(api.eventChatMessages.setSetting, {
      eventId: s.eventId,
      setting: "disabled",
      enabled: true,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await s.adminClient.mutation(api.eventChatMessages.setSetting, {
    eventId: s.eventId,
    setting: "studentsMuted",
    enabled: false,
  });
  const messageId = await s.studentClient.mutation(api.eventChatMessages.send, {
    eventId: s.eventId,
    body: "Hello",
  });
  await s.teacherClient.mutation(api.eventChatMessages.setPinned, {
    messageId,
    pinned: true,
  });
  expect(
    await s.studentClient.query(api.eventChatMessages.hasUnreadPins, {
      eventId: s.eventId,
    }),
  ).toBe(true);
  const pinned = (
    await s.studentClient.query(api.eventChatMessages.listPinned, {
      eventId: s.eventId,
      paginationOpts,
    })
  ).page[0];
  await s.studentClient.mutation(api.eventChatMessages.markPinsSeen, {
    messageId,
    pinnedAt: pinned.pinnedAt!,
  });
  expect(
    await s.studentClient.query(api.eventChatMessages.hasUnreadPins, {
      eventId: s.eventId,
    }),
  ).toBe(false);
  await s.teacherClient.mutation(api.eventChatMessages.setMuted, {
    eventId: s.eventId,
    userId: s.student,
    muted: true,
  });
  expect(
    (
      await s.studentClient.query(api.eventChatMessages.getMyStatus, {
        eventId: s.eventId,
      })
    ).isMuted,
  ).toBe(true);
  await s.adminClient.mutation(api.eventChatMessages.setArchived, {
    eventId: s.eventId,
    archived: true,
  });
  expect(
    (
      await s.studentClient.query(api.eventChatMessages.list, {
        eventId: s.eventId,
        paginationOpts,
      })
    ).page,
  ).toEqual([]);
  await s.adminClient.mutation(api.eventChatMessages.setArchived, {
    eventId: s.eventId,
    archived: false,
  });
  expect(
    (
      await s.studentClient.query(api.eventChatMessages.list, {
        eventId: s.eventId,
        paginationOpts,
      })
    ).page,
  ).toHaveLength(1);
  expect(
    (
      await s.studentClient.query(api.eventChatMessages.listPinned, {
        eventId: s.eventId,
        paginationOpts,
      })
    ).page,
  ).toEqual([]);
  await expect(
    s.teacherClient.mutation(api.eventChatMessages.setPinned, {
      messageId,
      pinned: false,
    }),
  ).rejects.toThrow("MESSAGE_NOT_FOUND");
  vi.advanceTimersByTime(100);
  const newMessageId = await s.teacherClient.mutation(
    api.eventChatMessages.send,
    { eventId: s.eventId, body: "New notice" },
  );
  await s.teacherClient.mutation(api.eventChatMessages.setPinned, {
    messageId: newMessageId,
    pinned: true,
  });
  expect(
    (
      await s.studentClient.query(api.eventChatMessages.listPinned, {
        eventId: s.eventId,
        paginationOpts,
      })
    ).page.map((item) => item._id),
  ).toEqual([newMessageId]);
  expect(
    await s.studentClient.query(api.eventChatMessages.hasUnreadPins, {
      eventId: s.eventId,
    }),
  ).toBe(true);
});

test("clearing a long event chat hides every old message before batch deletion finishes", async () => {
  const s = await setup();
  await s.t.run(async (ctx) => {
    for (let i = 0; i < 105; i++)
      await ctx.db.insert("eventChatMessages", {
        eventId: s.eventId,
        authorId: s.teacher,
        body: `Message ${i}`,
      });
  });
  await s.adminClient.mutation(api.eventChatMessages.clear, {
    eventId: s.eventId,
  });
  expect(
    (
      await s.studentClient.query(api.eventChatMessages.list, {
        eventId: s.eventId,
        paginationOpts,
      })
    ).page,
  ).toEqual([]);
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("eventChatMessages")
        .withIndex("by_eventId", (q) => q.eq("eventId", s.eventId))
        .collect(),
    ),
  ).toHaveLength(5);
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("eventChatMessages")
        .withIndex("by_eventId", (q) => q.eq("eventId", s.eventId))
        .collect(),
    ),
  ).toEqual([]);
});

test("notifications are batched, deduplicated and acknowledged by visible message", async () => {
  const s = await setup();
  await s.t.run(async (ctx) => {
    await ctx.db.insert("roleAssignments", {
      userId: s.student,
      orgType: "campus",
      orgId: s.campusId,
      schoolId: s.schoolId,
      role: "student",
      gradeCode: "05",
      assignedAt: 1,
    });
    for (let i = 0; i < 35; i++) {
      const userId = await ctx.db.insert("users", {
        clerkId: `extra-${i}`,
        firstName: "Extra",
        lastName: String(i),
        fullName: `Extra ${i}`,
        isActive: true,
        createdAt: 1,
      });
      await ctx.db.insert("roleAssignments", {
        userId,
        orgType: "campus",
        orgId: s.campusId,
        schoolId: s.schoolId,
        role: "student",
        gradeCode: "05",
        assignedAt: 1,
      });
    }
  });
  await s.teacherClient.mutation(api.eventChatMessages.send, {
    eventId: s.eventId,
    body: "Notice",
  });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const unread = () =>
    s.studentClient.query(api.eventChatNotifications.listUnread, {
      paginationOpts,
    });
  expect((await unread()).page).toEqual([
    expect.objectContaining({ eventId: s.eventId, count: 1 }),
  ]);
  expect(
    (
      await s.studentClient.query(api.systemNotifications.list, {
        paginationOpts,
      })
    ).page.some((item) => item.kind === "event_chat"),
  ).toBe(true);
  const second = await s.teacherClient.mutation(api.eventChatMessages.send, {
    eventId: s.eventId,
    body: "Same timestamp",
  });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await unread()).page[0].count).toBe(2);
  await s.studentClient.mutation(api.eventChatNotifications.markRead, {
    messageId: second,
  });
  expect((await unread()).page).toEqual([]);
  vi.advanceTimersByTime(100);
  await s.teacherClient.mutation(api.eventChatMessages.send, {
    eventId: s.eventId,
    body: "Next notice",
  });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await unread()).page[0].count).toBe(1);
  const delivered = await s.t.run((ctx) =>
    ctx.db
      .query("systemNotifications")
      .withIndex("by_dedupe_key", (q) =>
        q.eq("dedupeKey", `event_chat:${s.eventId}:${s.student}`),
      )
      .unique(),
  );
  expect(delivered?.chatMessageCount).toBe(1);
});

test("late notification batches keep the unread count with school and campus roles", async () => {
  const s = await setup();
  await s.t.run((ctx) =>
    ctx.db.insert("roleAssignments", {
      userId: s.admin,
      orgType: "campus",
      orgId: s.campusId,
      schoolId: s.schoolId,
      role: "principal",
      assignedAt: 1,
    }),
  );
  const addMessage = (body: string) =>
    s.t.run((ctx) =>
      ctx.db.insert("eventChatMessages", {
        eventId: s.eventId,
        authorId: s.teacher,
        body,
      }),
    );
  const older = await addMessage("First");
  vi.advanceTimersByTime(100);
  const newer = await addMessage("Second");
  for (const messageId of [newer, older]) {
    for (const sourceIndex of [0, 1])
      await s.t.mutation(internal.eventChatNotifications.publish, {
        messageId,
        sourceIndex,
        cursor: null,
      });
  }
  for (const client of [s.adminClient, s.studentClient]) {
    expect(
      (
        await client.query(api.eventChatNotifications.listUnread, {
          paginationOpts,
        })
      ).page,
    ).toEqual([expect.objectContaining({ eventId: s.eventId, count: 2 })]);
  }
});

test("attachments are private and event deletion removes chat children", async () => {
  const s = await setup();
  const file = new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" });
  const upload = (client: typeof s.teacherClient) =>
    client.fetch(`/event-chat-files?eventId=${s.eventId}`, {
      method: "POST",
      body: file,
      headers: {
        "Content-Type": "application/pdf",
        "X-File-Name": "notes.pdf",
        "X-File-Size": String(file.size),
      },
    });
  expect((await upload(s.outsiderClient)).status).toBe(400);
  const response = await upload(s.teacherClient);
  expect(response.status, await response.clone().text()).toBe(200);
  const attachmentId = (await response.json()).id;
  const messageId = await s.teacherClient.mutation(api.eventChatMessages.send, {
    eventId: s.eventId,
    body: "Notes",
    attachmentIds: [attachmentId],
  });
  expect(
    (await s.studentClient.fetch(`/event-chat-files?id=${attachmentId}`))
      .status,
  ).toBe(200);
  expect(
    (await s.outsiderClient.fetch(`/event-chat-files?id=${attachmentId}`))
      .status,
  ).toBe(403);
  await s.t.run(async (ctx) => {
    const assignment = await ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", s.student))
      .unique();
    await ctx.db.patch(assignment!._id, { gradeCode: "06" });
  });
  expect(
    (await s.studentClient.fetch(`/event-chat-files?id=${attachmentId}`))
      .status,
  ).toBe(403);
  await s.t.run(async (ctx) => ctx.db.delete(s.eventId));
  await s.t.mutation(internal.eventChatMessages.removeByEvent, {
    eventId: s.eventId,
  });
  await s.t.mutation(internal.eventChatNotifications.removeByEvent, {
    eventId: s.eventId,
  });
  expect(
    await s.t.run((ctx) => ctx.db.get("eventChatMessages", messageId)),
  ).toBeNull();
  expect(
    await s.t.run((ctx) => ctx.db.get("eventChatAttachments", attachmentId)),
  ).toBeNull();
});

test("removing the last invited grade cascades through event chat", async () => {
  const s = await setup();
  const messageId = await s.teacherClient.mutation(api.eventChatMessages.send, {
    eventId: s.eventId,
    body: "To be removed",
  });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  await s.t.run((ctx) => removeGradeFromEvents(ctx, s.schoolId, "05"));
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await s.t.run((ctx) => ctx.db.get("events", s.eventId))).toBeNull();
  expect(
    await s.t.run((ctx) => ctx.db.get("eventChatMessages", messageId)),
  ).toBeNull();
  expect(
    await s.t.run((ctx) => ctx.db.query("eventChatThreads").collect()),
  ).toEqual([]);
  expect(
    await s.t.run((ctx) => ctx.db.query("systemNotifications").collect()),
  ).toEqual([]);
});

test("notification fanout covers 500 invited students without duplicate deliveries", async () => {
  const s = await setup();
  await s.t.run(async (ctx) => {
    for (let i = 0; i < 500; i++) {
      const userId = await ctx.db.insert("users", {
        clerkId: `fanout-${i}`,
        firstName: "Fanout",
        lastName: String(i),
        fullName: `Fanout ${i}`,
        isActive: true,
        createdAt: 1,
      });
      await ctx.db.insert("roleAssignments", {
        userId,
        orgType: "campus",
        orgId: s.campusId,
        schoolId: s.schoolId,
        role: "student",
        gradeCode: "05",
        assignedAt: 1,
      });
    }
  });
  const messageId = await s.teacherClient.mutation(api.eventChatMessages.send, {
    eventId: s.eventId,
    body: "For everyone",
  });
  await s.t.mutation(internal.eventChatNotifications.publish, {
    messageId,
    sourceIndex: 0,
    cursor: null,
  });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const notifications = await s.t.run((ctx) =>
    ctx.db.query("systemNotifications").collect(),
  );
  const eventNotifications = notifications.filter(
    (item) => item.kind === "event_chat" && item.chatMessageCount,
  );
  expect(eventNotifications.length).toBeGreaterThanOrEqual(500);
  expect(new Set(eventNotifications.map((item) => item.recipientId)).size).toBe(
    eventNotifications.length,
  );
  expect(eventNotifications.every((item) => item.chatMessageCount === 1)).toBe(
    true,
  );
}, 30_000);

test("institutional event chat notifies selected grades across campuses once", async () => {
  const s = await setup();
  const { eventId, recipients } = await s.t.run(async (ctx) => {
    const otherCampusId = await ctx.db.insert("campuses", {
      schoolId: s.schoolId,
      name: "Other campus",
      slug: "other-campus",
      isActive: true,
      createdBy: s.admin,
      createdAt: 1,
    });
    const eventId = await ctx.db.insert("events", {
      schoolId: s.schoolId,
      gradeCodes: ["05"],
      title: "Institutional gathering",
      responsibleId: s.teacher,
      teacherIds: [],
      timeZone: "America/Bogota",
      createdAt: 1,
      createdBy: s.admin,
    });
    const recipients = [s.admin, s.student];
    for (const [campusId, label] of [
      [s.campusId, "first"],
      [otherCampusId, "second"],
    ] as const) {
      for (let i = 0; i < 12; i++) {
        const userId = await ctx.db.insert("users", {
          clerkId: `${label}-campus-${i}`,
          firstName: label,
          lastName: String(i),
          fullName: `${label} ${i}`,
          isActive: true,
          createdAt: 1,
        });
        recipients.push(userId);
        await ctx.db.insert("roleAssignments", {
          userId,
          orgType: "campus",
          orgId: campusId,
          schoolId: s.schoolId,
          role: "student",
          gradeCode: "05",
          assignedAt: 1,
        });
      }
    }
    await ctx.db.insert("roleAssignments", {
      userId: s.admin,
      orgType: "campus",
      orgId: otherCampusId,
      schoolId: s.schoolId,
      role: "principal",
      assignedAt: 1,
    });
    return { eventId, recipients };
  });
  await s.teacherClient.mutation(api.eventChatMessages.send, {
    eventId,
    body: "For both campuses",
  });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const notifications = await s.t.run((ctx) =>
    ctx.db.query("systemNotifications").collect(),
  );
  const delivered = notifications.filter(
    (item) => item.kind === "event_chat" && item.eventId === eventId,
  );
  expect(delivered.map((item) => item.recipientId).sort()).toEqual(
    recipients.sort(),
  );
  expect(delivered.every((item) => item.chatMessageCount === 1)).toBe(true);
});
