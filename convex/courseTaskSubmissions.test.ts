import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { zipSync } from "fflate";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

const NOW = Date.UTC(2026, 8, 28, 12);
const HOUR = 3_600_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  const data = await t.run(async (ctx) => {
    const users = {} as Record<
      "teacher" | "student" | "classmate" | "outsider",
      Id<"users">
    >;
    for (const role of [
      "teacher",
      "student",
      "classmate",
      "outsider",
    ] as const) {
      users[role] = await ctx.db.insert("users", {
        clerkId: role,
        firstName: role,
        lastName: "Test",
        fullName: `${role} Test`,
        isActive: true,
        createdAt: NOW,
      });
    }
    const schoolId = await ctx.db.insert("schools", {
      name: "School",
      slug: "school",
      isActive: true,
      createdAt: NOW,
      createdBy: users.teacher,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      schoolId,
      title: "Math",
      isActive: true,
      createdAt: NOW,
      createdBy: users.teacher,
    });
    const classId = await ctx.db.insert("classes", {
      schoolId,
      curriculumId,
      teacherId: users.teacher,
      name: "Math 5",
      endDate: NOW + 7 * 24 * HOUR,
      timeZone: "UTC",
      enrollmentsMigratedAt: NOW,
      isActive: true,
      createdAt: NOW,
      createdBy: users.teacher,
    });
    for (const studentId of [users.student, users.classmate]) {
      await ctx.db.insert("classEnrollments", {
        classId,
        studentId,
        enrolledAt: NOW,
        enrolledBy: users.teacher,
      });
    }
    return { users, classId };
  });
  const teacher = t.withIdentity({ subject: "teacher" });
  const student = t.withIdentity({ subject: "student" });
  const classmate = t.withIdentity({ subject: "classmate" });
  const outsider = t.withIdentity({ subject: "outsider" });
  const taskId = await teacher.mutation(api.courseTasks.create, {
    classId: data.classId,
    title: "Fractions",
    dueAt: NOW + 2 * HOUR,
    allowLateSubmissions: true,
  });
  const pdf = (name: string) =>
    new Blob(
      [
        `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Name (${name}) >>\nendobj\n%%EOF`,
      ],
      {
        type: "application/pdf",
      },
    );
  const post = (
    body: Blob,
    client = student,
    task = taskId,
    name = "work.pdf",
    size = body.size,
  ) =>
    client.fetch(`/course-task-files?taskId=${task}`, {
      method: "POST",
      body,
      headers: {
        "Content-Type": body.type,
        "X-File-Name": name,
        "X-File-Size": String(size),
      },
    });
  const upload = async (name = "work.pdf", client = student) => {
    const response = await post(pdf(name), client, taskId, name);
    expect(response.status, await response.clone().text()).toBe(200);
    return (await response.json()).id as Id<"courseTaskFiles">;
  };
  return {
    t,
    ...data,
    taskId,
    teacher,
    student,
    classmate,
    outsider,
    post,
    upload,
    pdf,
  };
}

test("student sends files, teacher sees the current submission and can comment", async () => {
  const s = await setup();
  const first = await s.upload("one.pdf");
  const second = await s.upload("two.pdf");
  await s.student.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: [first, second],
  });
  const own = await s.student.query(api.courseTaskSubmissions.get, {
    taskId: s.taskId,
  });
  expect(own).toMatchObject({
    studentId: s.users.student,
    studentName: "student Test",
    submittedAt: NOW,
    submittedLate: false,
    submissionRevision: 1,
    files: [{ id: first }, { id: second }],
  });
  const page = await s.teacher.query(api.courseTaskSubmissions.listForTask, {
    taskId: s.taskId,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(page.page).toHaveLength(2);
  expect(
    page.page.find((row) => row.studentId === s.users.student)?.submittedAt,
  ).toBe(NOW);
  await s.teacher.mutation(api.courseTaskSubmissions.setFeedback, {
    taskId: s.taskId,
    studentId: s.users.student,
    text: "  Good work  ",
    expectedRevision: 1,
  });
  expect(
    (await s.student.query(api.courseTaskSubmissions.get, { taskId: s.taskId }))
      .feedback,
  ).toMatchObject({ text: "Good work", forRevision: 1 });
  const download = await s.teacher.fetch(`/course-task-files?id=${first}`);
  expect(download.status).toBe(200);
  expect(download.headers.get("Cache-Control")).toBe("no-store");
  expect(await download.text()).toContain("%PDF-1.4");
});

test("resubmitting replaces and deletes all old files, clears feedback, and freezes late status", async () => {
  const s = await setup();
  const first = await s.upload("first.pdf");
  await s.student.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: [first],
  });
  await s.teacher.mutation(api.courseTaskSubmissions.setFeedback, {
    taskId: s.taskId,
    studentId: s.users.student,
    text: "Needs changes",
    expectedRevision: 1,
  });
  vi.setSystemTime(NOW + 3 * HOUR);
  const replacement = await s.upload("replacement.pdf");
  await s.student.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: [replacement],
  });
  const result = await s.teacher.query(api.courseTaskSubmissions.get, {
    taskId: s.taskId,
    studentId: s.users.student,
  });
  expect(result).toMatchObject({
    submittedAt: NOW + 3 * HOUR,
    submittedLate: true,
    submissionRevision: 2,
    files: [{ id: replacement }],
  });
  expect(result.feedback).toBeUndefined();
  expect(
    await s.teacher.fetch(`/course-task-files?id=${first}`),
  ).toHaveProperty("status", 403);
  const old = await s.t.run((ctx) => ctx.db.get("courseTaskFiles", first));
  expect(old).toBeNull();
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    dueAt: NOW + 5 * HOUR,
  });
  expect(
    (await s.student.query(api.courseTaskSubmissions.get, { taskId: s.taskId }))
      .submittedLate,
  ).toBe(true);
});

test("moving a deadline before an existing submission keeps its original status", async () => {
  const s = await setup();
  vi.setSystemTime(NOW + HOUR);
  const first = await s.upload("first.pdf");
  expect(
    await s.teacher.query(api.courseTasks.previewDeadlineChange, {
      taskId: s.taskId,
    }),
  ).toEqual({ hasSubmissions: false });
  await s.student.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: [first],
  });
  vi.setSystemTime(NOW + HOUR + HOUR / 2);
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    dueAt: NOW + HOUR / 2,
  });
  expect(
    await s.teacher.query(api.courseTasks.previewDeadlineChange, {
      taskId: s.taskId,
    }),
  ).toEqual({ hasSubmissions: true });
  expect(
    (
      await s.student.query(api.courseTaskSubmissions.get, {
        taskId: s.taskId,
      })
    ).submittedLate,
  ).toBe(false);

  const classmateFile = await s.upload("classmate.pdf", s.classmate);
  await s.classmate.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: [classmateFile],
  });
  expect(
    (
      await s.classmate.query(api.courseTaskSubmissions.get, {
        taskId: s.taskId,
      })
    ).submittedLate,
  ).toBe(true);
});

test("staged files are private, expired files are deleted, and invalid uploads fail", async () => {
  const s = await setup();
  expect((await s.post(s.pdf("teacher"), s.teacher)).status).toBe(400);
  expect((await s.post(s.pdf("outsider"), s.outsider)).status).toBe(400);
  expect(
    (await s.post(s.pdf("bad"), s.student, s.taskId, "bad.exe")).status,
  ).toBe(400);
  expect(
    (await s.post(new Blob(["not a pdf"], { type: "application/pdf" }))).status,
  ).toBe(400);
  expect(
    (await s.post(s.pdf("size"), s.student, s.taskId, "size.pdf", 100)).status,
  ).toBe(400);
  const staged = await s.upload();
  expect(
    (await s.student.fetch(`/course-task-files?id=${staged}`)).status,
  ).toBe(403);
  vi.setSystemTime(NOW + 61 * 60_000);
  await s.t.mutation(internal.courseTaskFiles.expire, { id: staged });
  expect(
    await s.t.run((ctx) => ctx.db.get("courseTaskFiles", staged)),
  ).toBeNull();
  await expect(
    s.student.mutation(api.courseTaskSubmissions.submit, {
      taskId: s.taskId,
      fileIds: [staged],
    }),
  ).rejects.toThrow("INVALID_TASK_FILES");
});

test("student cannot inspect a classmate's submission or files; closed deadline blocks writes", async () => {
  const s = await setup();
  const file = await s.upload("peer.pdf", s.classmate);
  await s.classmate.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: [file],
  });
  await expect(
    s.student.query(api.courseTaskSubmissions.get, {
      taskId: s.taskId,
      studentId: s.users.classmate,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  expect((await s.student.fetch(`/course-task-files?id=${file}`)).status).toBe(
    403,
  );
  await expect(
    s.student.query(api.courseTaskSubmissions.listForTask, {
      taskId: s.taskId,
      paginationOpts: { cursor: null, numItems: 10 },
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await s.teacher.mutation(api.courseTasks.setClosed, {
    taskId: s.taskId,
    closed: true,
  });
  expect((await s.post(s.pdf("closed"))).status).toBe(400);
  await expect(
    s.student.mutation(api.courseTaskSubmissions.submit, {
      taskId: s.taskId,
      fileIds: [file],
    }),
  ).rejects.toThrow("TASK_SUBMISSION_CLOSED");
});

test("file selection is bounded and a failed resend keeps the previous delivery", async () => {
  const s = await setup();
  const first = await s.upload("first.pdf");
  await s.student.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: [first],
  });
  const second = await s.upload("second.pdf");
  await expect(
    s.student.mutation(api.courseTaskSubmissions.submit, {
      taskId: s.taskId,
      fileIds: [second, second],
    }),
  ).rejects.toThrow("INVALID_TASK_FILES");
  await expect(
    s.student.mutation(api.courseTaskSubmissions.submit, {
      taskId: s.taskId,
      fileIds: [second, first],
    }),
  ).rejects.toThrow("INVALID_TASK_FILES");
  expect(
    (await s.student.query(api.courseTaskSubmissions.get, { taskId: s.taskId }))
      .files,
  ).toMatchObject([{ id: first }]);
  const additional = [];
  for (let index = 0; index < 20; index++) {
    additional.push(await s.upload(`extra-${index}.pdf`));
  }
  await expect(
    s.student.mutation(api.courseTaskSubmissions.submit, {
      taskId: s.taskId,
      fileIds: [second, ...additional],
    }),
  ).rejects.toThrow("INVALID_TASK_FILES");
});

test("staged files cannot be submitted by a classmate or attached to another task", async () => {
  const s = await setup();
  const studentFile = await s.upload("student.pdf");
  const classmateFile = await s.upload("classmate.pdf", s.classmate);
  const otherTaskId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "Another assignment",
  });

  await expect(
    s.student.mutation(api.courseTaskSubmissions.submit, {
      taskId: s.taskId,
      fileIds: [classmateFile],
    }),
  ).rejects.toThrow("INVALID_TASK_FILES");
  await expect(
    s.student.mutation(api.courseTaskSubmissions.submit, {
      taskId: otherTaskId,
      fileIds: [studentFile],
    }),
  ).rejects.toThrow("INVALID_TASK_FILES");
  await expect(
    s.teacher.mutation(api.courseTasks.update, {
      taskId: otherTaskId,
      materialFileIds: [studentFile],
    }),
  ).rejects.toThrow("INVALID_TASK_FILES");

  expect(
    (await s.student.query(api.courseTaskSubmissions.get, { taskId: s.taskId }))
      .submittedAt,
  ).toBeUndefined();
  await s.student.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: [studentFile],
  });
  expect(
    (await s.student.query(api.courseTaskSubmissions.get, { taskId: s.taskId }))
      .files,
  ).toMatchObject([{ id: studentFile }]);
});

test("losing enrollment revokes task and file access without deleting the delivery", async () => {
  const s = await setup();
  const fileId = await s.upload("answer.pdf");
  await s.student.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: [fileId],
  });
  await s.t.run(async (ctx) => {
    const enrollment = await ctx.db
      .query("classEnrollments")
      .withIndex("by_class", (q) =>
        q.eq("classId", s.classId).eq("studentId", s.users.student),
      )
      .unique();
    await ctx.db.delete("classEnrollments", enrollment!._id);
  });

  await expect(
    s.student.query(api.courseTasks.get, { taskId: s.taskId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    s.student.query(api.courseTaskSubmissions.get, { taskId: s.taskId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  expect(
    (await s.student.fetch(`/course-task-files?id=${fileId}`)).status,
  ).toBe(403);
  expect(
    (
      await s.teacher.query(api.courseTaskSubmissions.get, {
        taskId: s.taskId,
        studentId: s.users.student,
      })
    ).files,
  ).toMatchObject([{ id: fileId }]);

  await s.t.run((ctx) =>
    ctx.db.insert("classEnrollments", {
      classId: s.classId,
      studentId: s.users.student,
      enrolledAt: Date.now(),
      enrolledBy: s.users.teacher,
    }),
  );
  expect(
    (await s.student.query(api.courseTaskSubmissions.get, { taskId: s.taskId }))
      .files,
  ).toMatchObject([{ id: fileId }]);
});

test("a strict deadline rejects a resend after its exact instant and keeps the old files", async () => {
  const s = await setup();
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    allowLateSubmissions: false,
  });
  const first = await s.upload("first.pdf");
  await s.student.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: [first],
  });
  vi.setSystemTime(NOW + 2 * HOUR);
  const replacement = await s.upload("replacement.pdf");
  vi.setSystemTime(NOW + 2 * HOUR + 1);
  await expect(
    s.student.mutation(api.courseTaskSubmissions.submit, {
      taskId: s.taskId,
      fileIds: [replacement],
    }),
  ).rejects.toThrow("TASK_SUBMISSION_CLOSED");
  const result = await s.student.query(api.courseTaskSubmissions.get, {
    taskId: s.taskId,
  });
  expect(result).toMatchObject({
    submittedAt: NOW,
    submittedLate: false,
    submissionRevision: 1,
    files: [{ id: first }],
  });
});

test("a submission suppresses the next-day reminder and a strict deadline blocks late resends", async () => {
  const s = await setup();
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: s.taskId,
    dueAt: NOW + 2 * 24 * HOUR,
    allowLateSubmissions: false,
  });
  const file = await s.upload();
  await s.student.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: [file],
  });
  await s.t.finishAllScheduledFunctions(vi.runAllTimers);
  const reminders = await s.t.run((ctx) =>
    ctx.db
      .query("systemNotifications")
      .withIndex("by_class_and_kind", (q) =>
        q.eq("classId", s.classId).eq("kind", "course_task_reminder"),
      )
      .collect(),
  );
  expect(reminders.map((item) => item.recipientId)).toEqual([
    s.users.classmate,
  ]);
  vi.setSystemTime(NOW + 2 * 24 * HOUR + 1);
  expect((await s.post(s.pdf("late"))).status).toBe(400);
  await expect(
    s.student.mutation(api.courseTaskSubmissions.submit, {
      taskId: s.taskId,
      fileIds: [file],
    }),
  ).rejects.toThrow("TASK_SUBMISSION_CLOSED");
});

test("teacher materials are private until publication and can be replaced without old storage", async () => {
  const s = await setup();
  const draftId = await s.teacher.mutation(api.courseTasks.create, {
    classId: s.classId,
    title: "With materials",
    draft: true,
  });
  const uploadMaterial = async (name: string) => {
    const body = s.pdf(name);
    const response = await s.teacher.fetch(
      `/course-task-files?taskId=${draftId}&kind=material`,
      {
        method: "POST",
        body,
        headers: {
          "Content-Type": body.type,
          "X-File-Name": name,
          "X-File-Size": String(body.size),
        },
      },
    );
    expect(response.status, await response.clone().text()).toBe(200);
    return (await response.json()).id as Id<"courseTaskFiles">;
  };
  const first = await uploadMaterial("guide.pdf");
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("systemNotifications")
        .collect()
        .then((items) => items.filter((item) => item.taskId === draftId)),
    ),
  ).toHaveLength(0);
  expect((await s.student.fetch(`/course-task-files?id=${first}`)).status).toBe(
    403,
  );
  expect(
    (
      await s.student.fetch(
        `/course-task-files?taskId=${draftId}&kind=material`,
        {
          method: "POST",
          body: s.pdf("spoof"),
          headers: {
            "Content-Type": "application/pdf",
            "X-File-Name": "spoof.pdf",
            "X-File-Size": String(s.pdf("spoof").size),
          },
        },
      )
    ).status,
  ).toBe(400);
  await expect(
    s.student.query(api.courseTaskFiles.listMaterials, { taskId: draftId }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await s.teacher.mutation(api.courseTasks.publish, {
    taskId: draftId,
    materialFileIds: [first],
  });
  await vi.advanceTimersByTimeAsync(0);
  await s.t.finishInProgressScheduledFunctions();
  expect(
    await s.t.run((ctx) =>
      ctx.db
        .query("systemNotifications")
        .collect()
        .then((items) => items.filter((item) => item.taskId === draftId)),
    ),
  ).toHaveLength(2);
  expect(
    await s.student.query(api.courseTaskFiles.listMaterials, {
      taskId: draftId,
    }),
  ).toMatchObject([{ id: first, name: "guide.pdf" }]);
  expect((await s.student.fetch(`/course-task-files?id=${first}`)).status).toBe(
    200,
  );
  expect(
    (await s.outsider.fetch(`/course-task-files?id=${first}`)).status,
  ).toBe(403);
  await expect(
    s.teacher.mutation(api.courseTasks.update, {
      taskId: draftId,
      title: "Should not be saved",
      materialFileIds: [first, first],
    }),
  ).rejects.toThrow("INVALID_TASK_FILES");
  expect(
    (await s.teacher.query(api.courseTasks.get, { taskId: draftId }))?.title,
  ).toBe("With materials");
  expect(
    await s.student.query(api.courseTaskFiles.listMaterials, {
      taskId: draftId,
    }),
  ).toMatchObject([{ id: first }]);
  const second = await uploadMaterial("new-guide.pdf");
  await s.teacher.mutation(api.courseTasks.update, {
    taskId: draftId,
    materialFileIds: [second],
  });
  expect(
    await s.t.run((ctx) => ctx.db.get("courseTaskFiles", first)),
  ).toBeNull();
  expect((await s.student.fetch(`/course-task-files?id=${first}`)).status).toBe(
    403,
  );
  expect(
    await s.classmate.query(api.courseTaskFiles.listMaterials, {
      taskId: draftId,
    }),
  ).toMatchObject([{ id: second }]);
});

test("OOXML Word and PowerPoint uploads are accepted by signature, but macro-enabled content is rejected", async () => {
  const s = await setup();
  const wordType =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const slidesType =
    "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  function officePackage(
    mime: string,
    mainPath: string,
    options: { macro?: boolean; declaredMime?: string } = {},
  ) {
    const xml = new TextEncoder().encode(
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/${mainPath}" ContentType="${options.declaredMime ?? mime}.main+xml"/></Types>`,
    );
    return new Blob(
      [
        zipSync({
          [mainPath]: new TextEncoder().encode("<document/>"),
          ...(options.macro
            ? { "word/vbaProject.bin": new Uint8Array([1]) }
            : {}),
          "[Content_Types].xml": xml,
        }),
      ],
      { type: mime },
    );
  }
  expect(
    (
      await s.post(
        officePackage(wordType, "word/document.xml"),
        s.student,
        s.taskId,
        "essay.docx",
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await s.post(
        officePackage(slidesType, "ppt/presentation.xml"),
        s.student,
        s.taskId,
        "slides.pptx",
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await s.post(
        officePackage(wordType, "word/document.xml", { macro: true }),
        s.student,
        s.taskId,
        "macro.docx",
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await s.post(
        officePackage(wordType, "word/document.xml", {
          declaredMime: "application/vnd.ms-word.document.macroEnabled",
        }),
        s.student,
        s.taskId,
        "disguised.docx",
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await s.post(
        new Blob([zipSync({ "[Content_Types].xml": new Uint8Array([1]) })], {
          type: wordType,
        }),
        s.student,
        s.taskId,
        "not-office.docx",
      )
    ).status,
  ).toBe(400);
  const slides = officePackage(slidesType, "ppt/presentation.xml");
  expect(
    (
      await s.post(
        new Blob([slides], { type: wordType }),
        s.student,
        s.taskId,
        "wrong-type.docx",
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await s.post(
        slides.slice(0, -22, slidesType),
        s.student,
        s.taskId,
        "truncated.pptx",
      )
    ).status,
  ).toBe(400);
});

async function correctionSetup() {
  const s = await setup();
  const id = await s.upload();
  await s.student.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: [id],
  });
  const document = (await s.teacher.query(api.courseTaskCorrections.get, {
    id,
  }))!;
  const correct = (
    saveId: string,
    client = s.teacher,
    version = document.version,
    body = s.pdf(saveId),
  ) =>
    client.fetch(
      `/course-task-files?id=${id}&version=${version}&revision=${document.revision}&saveId=${saveId}`,
      {
        method: "PUT",
        body,
        headers: {
          "Content-Type": "application/pdf",
          "X-File-Size": String(body.size),
        },
      },
    );
  return { ...s, id, document, correct };
}

test("PDF correction replaces only the binary, preserving student ownership and submission status", async () => {
  const s = await correctionSetup();
  expect(s.document).toMatchObject({
    studentId: s.users.student,
    studentName: "student Test",
    taskTitle: "Fractions",
    courseName: "Math 5",
  });
  vi.setSystemTime(NOW + 3 * HOUR);
  await s.t.run((ctx) =>
    ctx.db.patch("courseTasks", s.taskId, {
      manuallyClosedAt: NOW + 3 * HOUR,
      allowLateSubmissions: false,
    }),
  );
  const response = await s.correct("first-save");
  expect(response.status, await response.clone().text()).toBe(200);
  const { version } = await response.json();
  const submission = await s.student.query(api.courseTaskSubmissions.get, {
    taskId: s.taskId,
  });
  expect(submission).toMatchObject({
    submittedAt: NOW,
    submittedLate: false,
    submissionRevision: 1,
    files: [
      {
        id: s.id,
        name: "work.pdf",
        version,
        correctedAt: NOW + 3 * HOUR,
      },
    ],
  });
  const stored = await s.t.run((ctx) => ctx.db.get("courseTaskFiles", s.id));
  expect(stored?.uploadedBy).toBe(s.users.student);
  expect(
    await s.t.run((ctx) => ctx.storage.get(s.document.version)),
  ).toBeNull();
  expect(
    await (await s.student.fetch(`/course-task-files?id=${s.id}`)).text(),
  ).toContain("first-save");
  expect(
    (await s.teacher.query(api.courseTaskCorrections.get, { id: s.id }))
      ?.version,
  ).toBe(version);
});

test("a save retry is idempotent and stale editors cannot overwrite the winning correction", async () => {
  const s = await correctionSetup();
  const first = await s.correct("save-once");
  const version = (await first.json()).version;
  const before = await s.t.run((ctx) => ctx.db.get("courseTaskFiles", s.id));
  vi.setSystemTime(NOW + HOUR);
  expect((await s.correct("save-once")).status).toBe(200);
  expect(await s.t.run((ctx) => ctx.db.get("courseTaskFiles", s.id))).toEqual(
    before,
  );
  const stale = await s.correct("another-tab");
  expect(stale.status).toBe(409);
  expect(await stale.json()).toEqual({ error: "TASK_CORRECTION_CONFLICT" });
  expect((await s.correct("second-save", s.teacher, version)).status).toBe(200);
});

test("student resubmission invalidates open corrections and text feedback", async () => {
  const s = await correctionSetup();
  const staged = await s.teacher.mutation(
    internal.courseTaskCorrections.reserve,
    {
      id: s.id,
      version: s.document.version,
      revision: 1,
      size: s.pdf("old").size,
      saveId: "in-flight",
    },
  );
  if (!staged.id) throw new Error("Expected staged correction");
  const storageId = await s.t.run((ctx) => ctx.storage.store(s.pdf("old")));
  await s.teacher.mutation(internal.courseTaskCorrections.attach, {
    id: staged.id,
    storageId,
  });
  const replacement = await s.upload("new.pdf");
  await s.student.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: [replacement],
  });
  await expect(
    s.teacher.mutation(internal.courseTaskCorrections.complete, {
      id: staged.id,
      storageId,
    }),
  ).rejects.toThrow("TASK_CORRECTION_UNAVAILABLE");
  await s.t.mutation(internal.courseTaskCorrections.discard, {
    id: staged.id,
    fileId: s.id,
    storageId,
  });
  expect(await s.t.run((ctx) => ctx.storage.get(storageId))).toBeNull();
  await expect(
    s.teacher.mutation(api.courseTaskSubmissions.setFeedback, {
      taskId: s.taskId,
      studentId: s.users.student,
      text: "Old draft",
      expectedRevision: 1,
    }),
  ).rejects.toThrow("TASK_SUBMISSION_CHANGED");
  const current = await s.student.query(api.courseTaskSubmissions.get, {
    taskId: s.taskId,
  });
  expect(current).toMatchObject({
    submissionRevision: 2,
    files: [{ id: replacement }],
  });
  expect(current.files[0].correctedAt).toBeUndefined();
  expect(current.feedback).toBeUndefined();
});

test("corrections require manager permission when opening and again when committing", async () => {
  const s = await correctionSetup();
  for (const client of [s.student, s.classmate, s.outsider]) {
    expect(
      await client.query(api.courseTaskCorrections.get, { id: s.id }),
    ).toBeNull();
    expect((await s.correct("forbidden", client)).status).toBe(400);
  }
  const blob = s.pdf("pending");
  const staged = await s.teacher.mutation(
    internal.courseTaskCorrections.reserve,
    {
      id: s.id,
      version: s.document.version,
      revision: 1,
      size: blob.size,
      saveId: "revoked",
    },
  );
  if (!staged.id) throw new Error("Expected staged correction");
  const storageId = await s.t.run((ctx) => ctx.storage.store(blob));
  await s.teacher.mutation(internal.courseTaskCorrections.attach, {
    id: staged.id,
    storageId,
  });
  await s.t.run((ctx) =>
    ctx.db.patch("classes", s.classId, { teacherId: s.users.outsider }),
  );
  await expect(
    s.teacher.mutation(internal.courseTaskCorrections.complete, {
      id: staged.id,
      storageId,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await s.t.mutation(internal.courseTaskCorrections.discard, {
    id: staged.id,
    fileId: s.id,
    storageId,
  });
  expect(
    await s.t.run(async (ctx) =>
      Boolean(await ctx.storage.get(s.document.version)),
    ),
  ).toBe(true);
});

test("invalid PDF uploads never replace the current file and discard temporary records", async () => {
  const s = await correctionSetup();
  const response = await s.correct(
    "bad-pdf",
    s.teacher,
    s.document.version,
    new Blob(["not a pdf"], { type: "application/pdf" }),
  );
  expect(response.status).toBe(400);
  expect(
    (await s.teacher.query(api.courseTaskCorrections.get, { id: s.id }))
      ?.version,
  ).toBe(s.document.version);
  const files = await s.t.run((ctx) =>
    ctx.db.query("courseTaskFiles").collect(),
  );
  expect(files).toHaveLength(1);
});

test("different PDFs save independently and are archived together on resubmission", async () => {
  const s = await setup();
  const ids = [await s.upload("one.pdf"), await s.upload("two.pdf")];
  await s.student.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: ids,
  });
  const documents = await Promise.all(
    ids.map((id) => s.teacher.query(api.courseTaskCorrections.get, { id })),
  );
  for (const [index, id] of ids.entries()) {
    const document = documents[index]!;
    const blob = s.pdf(`correction-${index}`);
    const response = await s.teacher.fetch(
      `/course-task-files?id=${id}&version=${document.version}&revision=1&saveId=file-${index}`,
      {
        method: "PUT",
        body: blob,
        headers: {
          "Content-Type": "application/pdf",
          "X-File-Size": String(blob.size),
        },
      },
    );
    expect(response.status).toBe(200);
  }
  const current = await s.student.query(api.courseTaskSubmissions.get, {
    taskId: s.taskId,
  });
  expect(current.files.every((file) => file.correctedAt === NOW)).toBe(true);
  expect(current.submissionRevision).toBe(1);
  const next = await s.upload("new.pdf");
  await s.student.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: [next],
  });
  const resubmitted = await s.student.query(api.courseTaskSubmissions.get, {
    taskId: s.taskId,
  });
  expect(resubmitted.previousCorrection?.files.map((file) => file.id)).toEqual(
    ids,
  );
  expect(resubmitted.files.map((file) => file.id)).toEqual([next]);
});

test("abandoned correction uploads expire, while cleanup never deletes a committed correction", async () => {
  const s = await correctionSetup();
  const blob = s.pdf("abandoned");
  const staged = await s.teacher.mutation(
    internal.courseTaskCorrections.reserve,
    {
      id: s.id,
      version: s.document.version,
      revision: 1,
      size: blob.size,
      saveId: "abandoned",
    },
  );
  if (!staged.id) throw new Error("Expected staged correction");
  const storageId = await s.t.run((ctx) => ctx.storage.store(blob));
  await s.teacher.mutation(internal.courseTaskCorrections.attach, {
    id: staged.id,
    storageId,
  });
  vi.setSystemTime(NOW + HOUR + 1);
  await s.t.mutation(internal.courseTaskFiles.expire, { id: staged.id });
  expect(await s.t.run((ctx) => ctx.storage.get(storageId))).toBeNull();
  expect(
    await s.t.run(async (ctx) =>
      Boolean(await ctx.storage.get(s.document.version)),
    ),
  ).toBe(true);
  const committed = await s.correct("success");
  const { version } = await committed.json();
  await s.t.mutation(internal.courseTaskCorrections.discard, {
    id: staged.id,
    fileId: s.id,
    storageId: version,
  });
  expect(
    await s.t.run(async (ctx) => Boolean(await ctx.storage.get(version))),
  ).toBe(true);
});

test("deactivating a reviewer makes the editor unavailable without a query error", async () => {
  const s = await correctionSetup();
  await s.t.run((ctx) =>
    ctx.db.patch("users", s.users.teacher, { isActive: false }),
  );
  expect(
    await s.teacher.query(api.courseTaskCorrections.get, { id: s.id }),
  ).toBeNull();
  expect((await s.correct("inactive-user")).status).toBe(400);
});

test("concurrent retries of one save keep one binary and do not repeat a correction", async () => {
  const s = await correctionSetup();
  const blob = s.pdf("concurrent");
  const stages = await Promise.all(
    [0, 1].map(() =>
      s.teacher.mutation(internal.courseTaskCorrections.reserve, {
        id: s.id,
        version: s.document.version,
        revision: 1,
        size: blob.size,
        saveId: "same-operation",
      }),
    ),
  );
  const versions: string[] = [];
  for (const staged of stages) {
    if (!staged.id) throw new Error("Expected staged correction");
    const storageId = await s.t.run((ctx) => ctx.storage.store(blob));
    await s.teacher.mutation(internal.courseTaskCorrections.attach, {
      id: staged.id,
      storageId,
    });
    versions.push(
      await s.teacher.mutation(internal.courseTaskCorrections.complete, {
        id: staged.id,
        storageId,
      }),
    );
  }
  expect(versions[0]).toBe(versions[1]);
  expect(
    await s.t.run((ctx) => ctx.db.query("courseTaskFiles").collect()),
  ).toHaveLength(1);
});

test("resubmission retains only corrected PDFs without copying their binary, through unreviewed resubmissions", async () => {
  const s = await correctionSetup();
  expect((await s.correct("review-one")).status).toBe(200);
  const corrected = await s.t.run((ctx) => ctx.db.get("courseTaskFiles", s.id));
  const replacement = await s.upload("second.pdf");
  vi.setSystemTime(NOW + 1_000);
  await s.student.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: [replacement],
  });
  for (const client of [s.student, s.teacher]) {
    const submission = await client.query(api.courseTaskSubmissions.get, {
      taskId: s.taskId,
      studentId: s.users.student,
    });
    expect(submission).toMatchObject({
      submissionRevision: 2,
      files: [{ id: replacement }],
      previousCorrection: {
        revision: 1,
        submittedAt: NOW,
        files: [{ id: s.id, version: corrected!.storageId, correctedAt: NOW }],
      },
    });
    const response = await client.fetch(`/course-task-files?id=${s.id}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("review-one");
  }
  expect(
    await s.t.run((ctx) => ctx.db.system.query("_storage").collect()),
  ).toHaveLength(2);
  const third = await s.upload("third.pdf");
  await s.student.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: [third],
  });
  const current = await s.student.query(api.courseTaskSubmissions.get, {
    taskId: s.taskId,
  });
  expect(current.previousCorrection).toMatchObject({
    revision: 1,
    submittedAt: NOW,
    files: [{ id: s.id }],
  });
  expect(
    await s.t.run((ctx) => ctx.db.get("courseTaskFiles", replacement)),
  ).toBeNull();
  expect(
    await s.t.run((ctx) => ctx.db.system.query("_storage").collect()),
  ).toHaveLength(2);
  expect(
    await s.teacher.query(api.courseTaskCorrections.get, { id: s.id }),
  ).toBeNull();
  expect((await s.correct("stale-review")).status).toBe(400);
  expect((await s.student.fetch(`/course-task-files?id=${s.id}`)).status).toBe(
    200,
  );
  for (const client of [s.classmate, s.outsider]) {
    expect((await client.fetch(`/course-task-files?id=${s.id}`)).status).toBe(
      403,
    );
    await expect(
      client.query(api.courseTaskSubmissions.get, {
        taskId: s.taskId,
        studentId: s.users.student,
      }),
    ).rejects.toThrow("PERMISSION_DENIED");
  }
});

test("the next corrected resubmission replaces the archived set and deletes uncorrected files", async () => {
  const s = await correctionSetup();
  expect((await s.correct("old-review")).status).toBe(200);
  const old = await s.t.run((ctx) => ctx.db.get("courseTaskFiles", s.id));
  const next = await s.upload("next.pdf");
  const uncorrected = await s.upload("uncorrected.pdf");
  await s.student.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: [next, uncorrected],
  });
  const document = (await s.teacher.query(api.courseTaskCorrections.get, {
    id: next,
  }))!;
  const body = s.pdf("new-review");
  vi.setSystemTime(NOW + 1_000);
  const response = await s.teacher.fetch(
    `/course-task-files?id=${next}&version=${document.version}&revision=2&saveId=new-review`,
    {
      method: "PUT",
      body,
      headers: {
        "Content-Type": "application/pdf",
        "X-File-Size": String(body.size),
      },
    },
  );
  expect(response.status).toBe(200);
  expect(
    (await s.student.query(api.courseTaskSubmissions.get, { taskId: s.taskId }))
      .previousCorrection?.revision,
  ).toBe(1);
  const uncorrectedFile = await s.t.run((ctx) =>
    ctx.db.get("courseTaskFiles", uncorrected),
  );
  const latest = await s.upload("latest.pdf");
  await s.student.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: [latest],
  });
  expect(
    await s.student.query(api.courseTaskSubmissions.get, { taskId: s.taskId }),
  ).toMatchObject({
    submissionRevision: 3,
    files: [{ id: latest }],
    previousCorrection: {
      revision: 2,
      submittedAt: NOW,
      files: [{ id: next, correctedAt: NOW + 1_000 }],
    },
  });
  for (const file of [old!, uncorrectedFile!]) {
    expect(
      await s.t.run((ctx) => ctx.db.get("courseTaskFiles", file._id)),
    ).toBeNull();
    expect(await s.t.run((ctx) => ctx.storage.get(file.storageId!))).toBeNull();
  }
  expect(
    await s.t.run((ctx) => ctx.db.system.query("_storage").collect()),
  ).toHaveLength(2);
  await s.teacher.mutation(api.courseTasks.remove, { taskId: s.taskId });
  await s.t.mutation(internal.courseTasks.removeDeletedTask, {
    taskId: s.taskId,
  });
  expect(
    await s.t.run((ctx) => ctx.db.query("courseTaskFiles").collect()),
  ).toHaveLength(0);
  expect(
    await s.t.run((ctx) => ctx.db.system.query("_storage").collect()),
  ).toHaveLength(0);
});

test("an in-flight save cannot change an archived correction, and archived files cannot be resubmitted directly", async () => {
  const s = await correctionSetup();
  expect((await s.correct("saved-review")).status).toBe(200);
  const saved = await s.t.run((ctx) => ctx.db.get("courseTaskFiles", s.id));
  const blob = s.pdf("unsaved-review");
  const staged = await s.teacher.mutation(
    internal.courseTaskCorrections.reserve,
    {
      id: s.id,
      version: saved!.storageId!,
      revision: 1,
      size: blob.size,
      saveId: "in-flight-archived",
    },
  );
  if (!staged.id) throw new Error("Expected staged correction");
  const storageId = await s.t.run((ctx) => ctx.storage.store(blob));
  await s.teacher.mutation(internal.courseTaskCorrections.attach, {
    id: staged.id,
    storageId,
  });
  const next = await s.upload("next.pdf");
  await s.student.mutation(api.courseTaskSubmissions.submit, {
    taskId: s.taskId,
    fileIds: [next],
  });
  await expect(
    s.teacher.mutation(internal.courseTaskCorrections.complete, {
      id: staged.id,
      storageId,
    }),
  ).rejects.toThrow("TASK_CORRECTION_UNAVAILABLE");
  await s.t.mutation(internal.courseTaskCorrections.discard, {
    id: staged.id,
    fileId: s.id,
    storageId,
  });
  expect(await s.t.run((ctx) => ctx.storage.get(storageId))).toBeNull();
  await expect(
    s.student.mutation(api.courseTaskSubmissions.submit, {
      taskId: s.taskId,
      fileIds: [s.id],
    }),
  ).rejects.toThrow("INVALID_TASK_FILES");
  expect(
    (await s.student.query(api.courseTaskSubmissions.get, { taskId: s.taskId }))
      .previousCorrection?.files[0].version,
  ).toBe(saved!.storageId);
  expect(
    await (await s.student.fetch(`/course-task-files?id=${s.id}`)).text(),
  ).toContain("saved-review");
});
