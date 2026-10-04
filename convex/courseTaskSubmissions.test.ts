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
