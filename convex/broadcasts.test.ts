import { convexTest } from "convex-test";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import type { Id } from "./_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/test";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const data = await t.run(async (ctx) => {
    const user = async (name: string) =>
      ctx.db.insert("users", {
        clerkId: name,
        fullName: name,
        firstName: name,
        lastName: "Test",
        isActive: true,
        createdAt: Date.now(),
      });
    const ids = {
      admin: await user("admin"),
      teacher: await user("teacher"),
      reader: await user("reader"),
      remoteTeacher: await user("remoteTeacher"),
      student: await user("student"),
      remoteStudent: await user("remoteStudent"),
      wrongGrade: await user("wrongGrade"),
      outsider: await user("outsider"),
      tutor: await user("tutor"),
      principal: await user("principal"),
    };
    const school = async (slug: string) =>
      ctx.db.insert("schools", {
        name: slug,
        slug,
        isActive: true,
        createdAt: Date.now(),
        createdBy: ids.admin,
      });
    const schoolId = await school("school");
    const otherSchoolId = await school("other");
    const campus = async (slug: string, schoolId: Id<"schools">) =>
      ctx.db.insert("campuses", {
        name: slug,
        slug,
        schoolId,
        isActive: true,
        createdAt: Date.now(),
        createdBy: ids.admin,
      });
    const campusId = await campus("campus", schoolId);
    const remoteCampusId = await campus("remote", schoolId);
    const otherCampusId = await campus("other-campus", otherSchoolId);
    const member = async (
      userId: Id<"users">,
      role: "teacher" | "student" | "principal" | "tutor",
      orgId: Id<"campuses">,
      gradeCode?: string,
    ) =>
      ctx.db.insert("roleAssignments", {
        userId,
        role,
        orgId,
        orgType: "campus",
        gradeCode,
        assignedAt: Date.now() - 100,
      });
    await ctx.db.insert("roleAssignments", {
      userId: ids.admin,
      orgId: schoolId,
      orgType: "school",
      role: "admin",
      assignedAt: Date.now() - 100,
    });
    await member(ids.teacher, "teacher", campusId);
    await member(ids.reader, "teacher", campusId);
    await member(ids.remoteTeacher, "teacher", remoteCampusId);
    await member(ids.student, "student", campusId, "01");
    await member(ids.remoteStudent, "student", remoteCampusId, "01");
    await member(ids.wrongGrade, "student", campusId, "02");
    await member(ids.outsider, "teacher", otherCampusId);
    await member(ids.tutor, "tutor", campusId);
    await member(ids.principal, "principal", campusId);
    // An institutional reader with two memberships must receive one notice.
    await member(ids.reader, "teacher", remoteCampusId);
    for (const code of ["01", "02"])
      await ctx.db.insert("institutionGrades", {
        schoolId,
        code,
        name: code,
        order: Number(code),
        createdAt: Date.now(),
        createdBy: ids.admin,
      });
    return { ...ids, schoolId, campusId, remoteCampusId, otherSchoolId };
  });
  const as = (name: keyof typeof data) =>
    t.withIdentity({ subject: String(name) });
  const admin = as("admin");
  const create = (
    mode: "private" | "school" = "private",
    teacherIds = [data.teacher],
  ) =>
    admin.mutation(api.broadcasts.create, {
      schoolId: data.schoolId,
      campusId: data.campusId,
      mode,
      name: "Announcements",
      gradeCodes: ["01"],
      teacherIds,
    });
  const drain = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  return { t, data, as, admin, create, drain };
}

test("scope matches courses: private campus, institutional school; students read but never write", async () => {
  const f = await setup();
  for (const mode of ["private", "school"] as const) {
    const broadcastId = await f.create(mode);
    for (const name of ["teacher", "reader", "student"] as const)
      expect(
        await f.as(name).query(api.broadcasts.context, { broadcastId }),
      ).not.toBeNull();
    for (const name of ["remoteTeacher", "remoteStudent"] as const)
      expect(
        Boolean(
          await f.as(name).query(api.broadcasts.context, { broadcastId }),
        ),
      ).toBe(mode === "school");
    for (const name of ["tutor", "outsider", "wrongGrade"] as const)
      expect(
        await f.as(name).query(api.broadcasts.context, { broadcastId }),
      ).toBeNull();
    for (const name of ["student", "reader"] as const)
      await expect(
        f
          .as(name)
          .mutation(api.courseChatMessages.send, { broadcastId, body: "no" }),
      ).rejects.toThrow("CHAT_MUTED");
    await f
      .as("teacher")
      .mutation(api.courseChatMessages.send, { broadcastId, body: "hello" });
    expect(
      (
        await f.as("student").query(api.courseChatMessages.list, {
          broadcastId,
          paginationOpts: { cursor: null, numItems: 20 },
        })
      ).page,
    ).toHaveLength(1);
    await f.drain();
  }
});

test("administration controls writers, global mute, links and files at upload and send time", async () => {
  const f = await setup();
  const broadcastId = await f.create();
  const setting = (
    setting: "studentsMuted" | "studentAttachmentsEnabled" | "disabled",
    enabled: boolean,
  ) =>
    f.admin.mutation(api.courseChatMessages.setSetting, {
      broadcastId,
      setting,
      enabled,
    });
  await expect(
    f.as("teacher").mutation(api.courseChatMessages.setSetting, {
      broadcastId,
      setting: "disabled",
      enabled: true,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    f.as("student").mutation(api.courseChatMessages.setMuted, {
      broadcastId,
      userId: f.data.reader,
      muted: false,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await setting("studentsMuted", true);
  await expect(
    f
      .as("teacher")
      .mutation(api.courseChatMessages.send, { broadcastId, body: "muted" }),
  ).rejects.toThrow("CHAT_MUTED");
  await f.admin.mutation(api.courseChatMessages.send, {
    broadcastId,
    body: "admin",
  });
  await setting("studentsMuted", false);
  await expect(
    f.as("teacher").mutation(api.courseChatMessages.send, {
      broadcastId,
      body: "https://example.com",
    }),
  ).rejects.toThrow("CHAT_ATTACHMENTS_DISABLED");
  await setting("studentAttachmentsEnabled", true);
  const teacher = f.as("teacher");
  const id = await teacher.mutation(internal.courseChatAttachments.reserve, {
    broadcastId,
    name: "note.png",
    size: 3,
    contentType: "image/png",
  });
  const storageId = await f.t.run((ctx) =>
    ctx.storage.store(new Blob(["123"], { type: "image/png" })),
  );
  await teacher.mutation(internal.courseChatAttachments.complete, {
    id,
    storageId,
  });
  await f.admin.mutation(api.courseChatMessages.setMuted, {
    broadcastId,
    userId: f.data.teacher,
    muted: true,
  });
  await expect(
    teacher.mutation(api.courseChatMessages.send, {
      broadcastId,
      body: "",
      attachmentIds: [id],
    }),
  ).rejects.toThrow("CHAT_MUTED");
  await f.admin.mutation(api.courseChatMessages.setMuted, {
    broadcastId,
    userId: f.data.reader,
    muted: false,
  });
  await f
    .as("reader")
    .mutation(api.courseChatMessages.send, { broadcastId, body: "allowed" });
  await expect(
    f.admin.mutation(api.courseChatMessages.setMuted, {
      broadcastId,
      userId: f.data.student,
      muted: false,
    }),
  ).rejects.toThrow("INVALID_CHAT_PARTICIPANT");
  await f.drain();
});

test("notification batches deduplicate multi-campus users, respect grades and revocations and preserve read-before-delivery", async () => {
  const f = await setup();
  const broadcastId = await f.create("school");
  const send = async (body: string) => {
    vi.advanceTimersByTime(10);
    return f.admin.mutation(api.courseChatMessages.send, { broadcastId, body });
  };
  const first = await send("First");
  await f
    .as("reader")
    .mutation(api.courseChatNotifications.markRead, { messageId: first });
  await f.drain();
  const feed = (name: keyof typeof f.data) =>
    f.as(name).query(api.systemNotifications.list, {
      paginationOpts: { cursor: null, numItems: 50 },
    });
  expect((await feed("reader")).page.filter((row) => !row.readAt)).toHaveLength(
    0,
  );
  expect((await feed("student")).page[0]).toMatchObject({
    broadcastId,
    chatMessageCount: 1,
    kind: "broadcast_chat",
  });
  expect((await feed("remoteStudent")).page).toHaveLength(1);
  expect((await feed("wrongGrade")).page).toHaveLength(0);
  await send("Second");
  await f.drain();
  expect((await feed("reader")).page[0].chatMessageCount).toBe(1);
  expect((await feed("student")).page[0].chatMessageCount).toBe(2);
  await f.t.run(async (ctx) => {
    const membership = await ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", f.data.student))
      .first();
    await ctx.db.patch("roleAssignments", membership!._id, { gradeCode: "02" });
  });
  expect((await feed("student")).page).toHaveLength(0);
  await expect(
    f.as("student").query(api.courseChatMessages.list, {
      broadcastId,
      paginationOpts: { cursor: null, numItems: 20 },
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("delivery counts each message once when the canonical campus membership is revoked mid-fanout", async () => {
  const f = await setup();
  const broadcastId = await f.create("school");
  const memberships = await f.t.run((ctx) =>
    ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", f.data.reader))
      .collect(),
  );
  memberships.sort((a, b) => a._id.localeCompare(b._id));
  const [first, second] = memberships;
  const messageId = await f.admin.mutation(api.courseChatMessages.send, {
    broadcastId,
    body: "Only one notification",
  });
  const deliver = (orgId: string) =>
    f.t.mutation(internal.courseChatNotifications.publishBroadcastMembers, {
      messageId,
      orgId,
      orgType: "campus",
      role: "teacher",
      cursor: null,
    });
  await deliver(first.orgId!);
  await f.t.run((ctx) => ctx.db.delete("roleAssignments", first._id));
  await deliver(second.orgId!);
  await f.drain();
  const notices = await f.as("reader").query(api.systemNotifications.list, {
    paginationOpts: { cursor: null, numItems: 50 },
  });
  expect(notices.page).toHaveLength(1);
  expect(notices.page[0].chatMessageCount).toBe(1);
  await f.t.mutation(
    internal.courseChatNotifications.removeBroadcastDeliveries,
    {
      messageId,
    },
  );
  expect(
    await f.t.run((ctx) =>
      ctx.db
        .query("broadcastMessageDeliveries")
        .withIndex("by_messageId_and_userId", (q) =>
          q.eq("messageId", messageId),
        )
        .collect(),
    ),
  ).not.toHaveLength(0);
  await f.admin.mutation(api.courseChatMessages.clear, { broadcastId });
  await f.drain();
  expect(
    await f.t.run((ctx) =>
      ctx.db.query("broadcastMessageDeliveries").collect(),
    ),
  ).toHaveLength(0);
});

test("out-of-order broadcast deliveries preserve unread counts and read watermarks without affecting another chat", async () => {
  const f = await setup();
  const broadcastId = await f.create();
  const otherId = await f.create();
  const insert = (target: Id<"broadcasts">) =>
    f.t.run((ctx) =>
      ctx.db.insert("courseChatMessages", {
        broadcastId: target,
        authorId: f.data.admin,
        body: "Notice",
      }),
    );
  const first = await insert(broadcastId);
  vi.advanceTimersByTime(10);
  const second = await insert(broadcastId);
  const other = await insert(otherId);
  const deliver = (messageId: Id<"courseChatMessages">) =>
    f.t.mutation(internal.courseChatNotifications.publishBroadcastMembers, {
      messageId,
      orgId: f.data.campusId,
      orgType: "campus",
      role: "student",
      gradeCode: "01",
      cursor: null,
    });
  await deliver(second);
  await deliver(first);
  await deliver(second);
  await deliver(other);
  const unread = () =>
    f.as("student").query(api.courseChatNotifications.listUnread, {
      paginationOpts: { cursor: null, numItems: 50 },
    });
  expect(
    (await unread()).page.find((row) => row.broadcastId === broadcastId)?.count,
  ).toBe(2);
  await f
    .as("student")
    .mutation(api.courseChatNotifications.markRead, { messageId: second });
  await deliver(first);
  expect((await unread()).page.map((row) => row.broadcastId)).toEqual([
    otherId,
  ]);
  await f.admin.mutation(api.courseChatMessages.clear, { broadcastId });
  await f.drain();
  expect(
    await f.t.run((ctx) =>
      ctx.db.query("broadcastMessageDeliveries").collect(),
    ),
  ).toEqual([expect.objectContaining({ messageId: other })]);
});

test("notification navigation waits for actual reading; mark-all-read suppresses delayed older broadcast delivery", async () => {
  const f = await setup();
  const broadcastId = await f.create();
  const insert = () =>
    f.t.run((ctx) =>
      ctx.db.insert("courseChatMessages", {
        broadcastId,
        authorId: f.data.admin,
        body: "Notice",
      }),
    );
  const delayed = await insert();
  vi.advanceTimersByTime(10);
  const latest = await insert();
  const deliver = (messageId: Id<"courseChatMessages">) =>
    f.t.mutation(internal.courseChatNotifications.publishBroadcastMembers, {
      messageId,
      orgId: f.data.campusId,
      orgType: "campus",
      role: "student",
      gradeCode: "01",
      cursor: null,
    });
  const student = f.as("student");
  const feed = () =>
    student.query(api.systemNotifications.list, {
      paginationOpts: { cursor: null, numItems: 50 },
    });
  await deliver(latest);
  const notification = (await feed()).page[0];
  await student.mutation(api.systemNotifications.markRead, {
    notificationId: notification._id,
  });
  expect((await feed()).page[0].readAt).toBeUndefined();
  await student.mutation(api.systemNotifications.markAllRead, {});
  await deliver(delayed);
  expect((await feed()).page[0].readAt).toBeDefined();
  expect(
    (
      await student.query(api.courseChatNotifications.listUnread, {
        paginationOpts: { cursor: null, numItems: 50 },
      })
    ).page,
  ).toHaveLength(0);
});

test("shared pins, clear, archive and private attachments cannot cross chats", async () => {
  const f = await setup();
  const broadcastId = await f.create();
  const other = await f.create();
  await expect(
    f.admin.mutation(api.courseChatMessages.send, {
      broadcastId,
      classId: "invalid" as Id<"classes">,
      body: "mixed",
    }),
  ).rejects.toThrow();
  const id = await f.admin.mutation(internal.courseChatAttachments.reserve, {
    broadcastId,
    name: "note.png",
    size: 3,
    contentType: "image/png",
  });
  const storageId = await f.t.run((ctx) =>
    ctx.storage.store(new Blob(["123"], { type: "image/png" })),
  );
  await f.admin.mutation(internal.courseChatAttachments.complete, {
    id,
    storageId,
  });
  await expect(
    f.admin.mutation(api.courseChatMessages.send, {
      broadcastId: other,
      body: "",
      attachmentIds: [id],
    }),
  ).rejects.toThrow("INVALID_CHAT_ATTACHMENTS");
  const messageId = await f.admin.mutation(api.courseChatMessages.send, {
    broadcastId,
    body: "with file",
    attachmentIds: [id],
  });
  await f.as("student").mutation(internal.courseChatAttachments.read, { id });
  await expect(
    f.as("outsider").mutation(internal.courseChatAttachments.read, { id }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await f.admin.mutation(api.courseChatMessages.setPinned, {
    messageId,
    pinned: true,
  });
  expect(
    await f
      .as("student")
      .query(api.courseChatMessages.hasUnreadPins, { broadcastId }),
  ).toBe(true);
  const pins = await f.as("student").query(api.courseChatMessages.listPinned, {
    broadcastId,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  await f.as("student").mutation(api.courseChatMessages.markPinsSeen, {
    messageId,
    pinnedAt: pins.page[0].pinnedAt!,
  });
  expect(
    await f
      .as("student")
      .query(api.courseChatMessages.hasUnreadPins, { broadcastId }),
  ).toBe(false);
  await f.admin.mutation(api.courseChatMessages.setArchived, {
    broadcastId,
    archived: true,
  });
  await expect(
    f.admin.mutation(api.courseChatMessages.send, { broadcastId, body: "no" }),
  ).rejects.toThrow("CHAT_ARCHIVED");
  await f.admin.mutation(api.courseChatMessages.setArchived, {
    broadcastId,
    archived: false,
  });
  await f.admin.mutation(api.courseChatMessages.clear, { broadcastId });
  await f.drain();
  expect(await f.t.run((ctx) => ctx.storage.get(storageId))).toBeNull();
});

test("institutional participation can combine campuses, remove writers without removing reading, and revoke pending uploads", async () => {
  const f = await setup();
  const broadcastId = await f.create("school");
  const update = (add: Id<"users">[], remove: Id<"users">[] = []) =>
    f.admin.mutation(api.broadcasts.updateParticipants, {
      broadcastId,
      add,
      remove,
    });
  await update([f.data.remoteTeacher]);
  await f.admin.mutation(api.courseChatMessages.setSetting, {
    broadcastId,
    setting: "studentAttachmentsEnabled",
    enabled: true,
  });
  const teacher = f.as("remoteTeacher");
  const fileId = await teacher.mutation(
    internal.courseChatAttachments.reserve,
    {
      broadcastId,
      name: "note.png",
      size: 3,
      contentType: "image/png",
    },
  );
  const storageId = await f.t.run((ctx) =>
    ctx.storage.store(new Blob(["123"], { type: "image/png" })),
  );
  await teacher.mutation(internal.courseChatAttachments.complete, {
    id: fileId,
    storageId,
  });
  const messageId = await teacher.mutation(api.courseChatMessages.send, {
    broadcastId,
    body: "Published",
    attachmentIds: [fileId],
  });
  const pending = await teacher.mutation(
    internal.courseChatAttachments.reserve,
    {
      broadcastId,
      name: "later.png",
      size: 3,
      contentType: "image/png",
    },
  );
  await update([], [f.data.remoteTeacher]);
  expect(
    await teacher.query(api.broadcasts.context, { broadcastId }),
  ).not.toBeNull();
  await expect(
    teacher.mutation(api.courseChatMessages.send, {
      broadcastId,
      body: "Blocked",
    }),
  ).rejects.toThrow("CHAT_MUTED");
  await expect(
    teacher.mutation(internal.courseChatAttachments.complete, {
      id: pending,
      storageId,
    }),
  ).rejects.toThrow("CHAT_MUTED");
  expect(
    await teacher.query(api.courseChatMessages.get, { messageId }),
  ).toMatchObject({ body: "Published" });
  await f
    .as("student")
    .mutation(internal.courseChatAttachments.read, { id: fileId });
  await f.drain();
  expect(
    await f.t.run(async (ctx) => (await ctx.storage.get(storageId)) !== null),
  ).toBe(true);
  expect(
    (
      await f.as("student").query(api.courseChatNotifications.listUnread, {
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).page[0],
  ).toMatchObject({ broadcastId, count: 1 });
  const participants = await f.admin.query(api.broadcasts.participants, {
    broadcastId,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(participants.page.map((p) => p._id)).toEqual([f.data.teacher]);
});

test("participant changes validate scope atomically and preserve concurrent additions and moderation", async () => {
  const f = await setup();
  const broadcastId = await f.create("school");
  const args = {
    broadcastId,
    add: [f.data.reader],
    remove: [] as Id<"users">[],
  };
  for (const name of ["student", "teacher", "outsider", "principal"] as const)
    await expect(
      f.as(name).mutation(api.broadcasts.updateParticipants, args),
    ).rejects.toThrow("PERMISSION_DENIED");
  await f.admin.mutation(api.broadcasts.updateParticipants, args);
  await f.admin.mutation(api.courseChatMessages.setMuted, {
    broadcastId,
    userId: f.data.reader,
    muted: true,
  });
  await f.admin.mutation(api.broadcasts.updateParticipants, {
    ...args,
    add: [f.data.remoteTeacher],
  });
  // A retry of the first editor's addition must not re-enable an existing writer.
  await f.admin.mutation(api.broadcasts.updateParticipants, args);
  await f.admin.mutation(api.broadcasts.updateParticipants, {
    broadcastId,
    add: [],
    remove: [f.data.teacher],
  });
  const participants = () =>
    f.admin.query(api.broadcasts.participants, {
      broadcastId,
      paginationOpts: { cursor: null, numItems: 40 },
    });
  const before = (await participants()).page;
  expect(before).toHaveLength(2);
  expect(before.find((p) => p._id === f.data.reader)?.isMuted).toBe(true);
  await expect(
    f.admin.mutation(api.broadcasts.updateParticipants, {
      broadcastId,
      add: [f.data.teacher, f.data.outsider],
      remove: [f.data.remoteTeacher],
    }),
  ).rejects.toThrow("INVALID_CHAT_PARTICIPANT");
  expect((await participants()).page).toEqual(before);
  await expect(
    f.admin.mutation(api.broadcasts.updateParticipants, {
      ...args,
      remove: args.add,
    }),
  ).rejects.toThrow("INVALID_CHAT_PARTICIPANT");
  const privateId = await f.create();
  await expect(
    f.admin.mutation(api.broadcasts.updateParticipants, {
      broadcastId: privateId,
      add: [f.data.remoteTeacher],
      remove: [],
    }),
  ).rejects.toThrow("INVALID_CHAT_PARTICIPANT");
  await f.admin.mutation(api.courseChatMessages.setArchived, {
    broadcastId,
    archived: true,
  });
  await expect(
    f.admin.mutation(api.broadcasts.updateParticipants, args),
  ).rejects.toThrow("CHAT_ARCHIVED");
});

test("creation validates scope and teachers; principals cannot create institutional broadcasts", async () => {
  const f = await setup();
  await expect(f.create("private", [f.data.remoteTeacher])).rejects.toThrow(
    "INVALID_CHAT_PARTICIPANT",
  );
  await expect(f.create("school", [f.data.outsider])).rejects.toThrow(
    "INVALID_CHAT_PARTICIPANT",
  );
  const args = {
    schoolId: f.data.schoolId,
    campusId: f.data.campusId,
    name: "Test",
    mode: "school" as const,
    gradeCodes: ["01"],
    teacherIds: [],
  };
  await expect(
    f.as("principal").mutation(api.broadcasts.create, args),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    f.admin.mutation(api.broadcasts.create, {
      ...args,
      gradeCodes: ["invalid"],
    }),
  ).rejects.toThrow("INVALID_GRADE");
  await f
    .as("principal")
    .mutation(api.broadcasts.create, { ...args, mode: "private" });
});

test("search finds broadcasts beyond the first page; selected professors retain a disabled participation row", async () => {
  const f = await setup();
  const broadcastId = await f.admin.mutation(api.broadcasts.create, {
    schoolId: f.data.schoolId,
    campusId: f.data.campusId,
    mode: "private",
    name: "Unique announcement",
    gradeCodes: ["01"],
    teacherIds: [f.data.teacher],
  });
  for (let i = 0; i < 35; i++) await f.create();
  const page = await f.as("student").query(api.broadcasts.list, {
    schoolId: f.data.schoolId,
    campusId: f.data.campusId,
    search: "Unique",
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(page.page.map((row) => row._id)).toEqual([broadcastId]);
  for (const search of ["a".repeat(121), "word ".repeat(17)]) {
    const invalid = await f.as("student").query(api.broadcasts.list, {
      schoolId: f.data.schoolId,
      search,
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(invalid.page).toHaveLength(0);
  }
  await f.admin.mutation(api.courseChatMessages.setMuted, {
    broadcastId,
    userId: f.data.teacher,
    muted: true,
  });
  const members = await f.as("student").query(api.broadcasts.participants, {
    broadcastId,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(members.page).toHaveLength(1);
  expect(members.page[0]).toMatchObject({ _id: f.data.teacher, isMuted: true });
  await f.admin.mutation(api.courseChatMessages.setMuted, {
    broadcastId,
    userId: f.data.teacher,
    muted: false,
  });
});

test("inactive campus memberships cannot read or suppress notifications to an active membership; linked broadcasts protect campus deletion", async () => {
  const f = await setup();
  const broadcastId = await f.create("school");
  await f.t.run((ctx) =>
    ctx.db.patch("campuses", f.data.campusId, { isActive: false }),
  );
  expect(
    await f.as("teacher").query(api.broadcasts.context, { broadcastId }),
  ).toBeNull();
  await f.admin.mutation(api.courseChatMessages.send, {
    broadcastId,
    body: "Only active",
  });
  await f.drain();
  const notifications = await f
    .as("reader")
    .query(api.courseChatNotifications.listUnread, {
      paginationOpts: { cursor: null, numItems: 20 },
    });
  expect(notifications.page[0]).toMatchObject({ broadcastId, count: 1 });
  await f.t.run((ctx) =>
    ctx.db.patch("campuses", f.data.campusId, { isActive: true }),
  );
  await f.create("private");
  await f.t.run(async (ctx) => {
    for (const row of await ctx.db
      .query("roleAssignments")
      .withIndex("by_org", (q) =>
        q.eq("orgId", f.data.campusId).eq("orgType", "campus"),
      )
      .collect())
      await ctx.db.delete("roleAssignments", row._id);
  });
  expect(
    await f.admin.mutation(api.campuses.remove, { id: f.data.campusId }),
  ).toEqual({ deleted: false, reason: "CAMPUS_IN_USE" });
});

test("more than 1,000 recipients are delivered in bounded batches and paginated messages retain all content", async () => {
  const f = await setup();
  for (let offset = 0; offset < 1001; offset += 100)
    await f.t.run(async (ctx) => {
      for (let index = offset; index < Math.min(offset + 100, 1001); index++) {
        const userId = await ctx.db.insert("users", {
          clerkId: `bulk-${index}`,
          fullName: `Reader ${index}`,
          firstName: "Reader",
          lastName: String(index),
          isActive: true,
          createdAt: Date.now(),
        });
        await ctx.db.insert("roleAssignments", {
          userId,
          orgType: "campus",
          orgId: f.data.campusId,
          role: "student",
          gradeCode: "01",
          assignedAt: Date.now() - 100,
        });
      }
    });
  const broadcastId = await f.create();
  const messageId = await f.admin.mutation(api.courseChatMessages.send, {
    broadcastId,
    body: "All readers",
  });
  // The test helper caps one drain at 100 rounds; this fixture needs 101+ batches.
  for (let round = 0; round < 20; round++) {
    vi.runAllTimers();
    await f.t.finishInProgressScheduledFunctions();
  }
  await f.drain();
  const last = f.t.withIdentity({ subject: "bulk-1000" });
  expect(
    await f.t.run((ctx) =>
      ctx.db.query("broadcastMessageDeliveries").collect(),
    ),
  ).toHaveLength(1005);
  expect(
    (
      await last.query(api.courseChatNotifications.listUnread, {
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).page[0],
  ).toMatchObject({ broadcastId, count: 1 });
  await last.mutation(api.courseChatNotifications.markRead, { messageId });
  expect(
    (
      await last.query(api.courseChatNotifications.listUnread, {
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).page,
  ).toHaveLength(0);
  for (let index = 0; index < 45; index++) {
    vi.advanceTimersByTime(1);
    await f.admin.mutation(api.courseChatMessages.send, {
      broadcastId,
      body: `Message ${index}`,
    });
  }
  const bodies: string[] = [];
  let cursor: string | null = null;
  do {
    const page: FunctionReturnType<typeof api.courseChatMessages.list> =
      await last.query(api.courseChatMessages.list, {
        broadcastId,
        paginationOpts: { cursor, numItems: 20 },
      });
    expect(page.page.length).toBeLessThanOrEqual(20);
    bodies.push(...page.page.map((row) => row.body));
    cursor = page.isDone ? null : page.continueCursor;
  } while (cursor);
  expect(bodies).toHaveLength(46);
  expect(new Set(bodies).size).toBe(46);
  // Clear pending fan-out before draining: no stale notices may be revived.
  await f.admin.mutation(api.courseChatMessages.clear, { broadcastId });
  await f.drain();
  expect(
    await f.t.run((ctx) =>
      ctx.db.query("broadcastMessageDeliveries").collect(),
    ),
  ).toHaveLength(0);
  expect(
    (
      await last.query(api.systemNotifications.list, {
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).page,
  ).toHaveLength(0);
}, 30_000);
