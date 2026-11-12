// Real Chrome + the development backend. Never run against production.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import {
  clerk,
  clerkSetup,
  setupClerkTestingToken,
} from "@clerk/testing/playwright";
import dotenv from "dotenv";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

dotenv.config({ path: ".env.local", quiet: true });
assert.equal(process.cwd(), "/Users/ulvenforst/Codex/Projects/CPM/flexidual");
const deployment = "dynamic-meerkat-158";
assert.equal(process.env.CONVEX_DEPLOYMENT, `dev:${deployment}`);
assert.ok(!process.env.CONVEX_DEPLOY_KEY && !process.env.CONVEX_SELF_HOSTED_URL);
assert.equal(
  process.env.NEXT_PUBLIC_CONVEX_URL,
  `https://${deployment}.convex.cloud`,
);
assert.ok(process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"));
assert.ok(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_"),
);
const baseUrl = `http://localhost:${Number(process.env.PORT ?? 3000)}`;
const output = "scripts/data/grading-browser";
const bulkOnly = process.argv.includes("--bulk-only");
const report = `${output}/${bulkOnly ? "bulk-report" : "report"}.json`;
const admin = { subject: "user_3ASRfyw3DxiIGQAVzF81jMqdne4" };
const campusId = "ks77y1xf6m8tyy53r7jykqhc1x834pv8";
const schoolId = "m177jx57ynvpwkevnh3wx7889n835ebf";

function cli(args) {
  const result = spawnSync("pnpm", ["exec", "convex", ...args], {
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0)
    throw new Error(`Development Convex command failed: ${result.stderr}`);
  return result.stdout.trim();
}
function run(name, args = {}, identity = admin) {
  return JSON.parse(
    cli([
      "run",
      "--deployment",
      deployment,
      name,
      JSON.stringify(args),
      "--identity",
      JSON.stringify(identity),
      "--typecheck",
      "disable",
      "--codegen",
      "disable",
    ]),
  );
}
function query(source) {
  return JSON.parse(
    cli([
      "run",
      "--deployment",
      deployment,
      "--inline-query",
      source,
      "--typecheck",
      "disable",
      "--codegen",
      "disable",
    ]),
  );
}
// The users action also creates Clerk users. Check its server-side key before using it.
assert.ok(
  cli(["env", "get", "CLERK_SECRET_KEY", "--deployment", deployment]) ===
    process.env.CLERK_SECRET_KEY,
  "Development Clerk credentials do not match; refusing account creation",
);
await mkdir(output, { recursive: true });
let fixture;
try {
  fixture = JSON.parse(await readFile(`${output}/fixture.json`, "utf8"));
} catch {
  /* First run. */
}
if (!fixture) {
  assert.ok(!bulkOnly, "Create the development browser fixture first");
  const runId = Date.now().toString(36);
  const identities = ["teacher", "student"].map((role) => ({
    firstName: "Grading Audit",
    lastName: role,
    email: `grading.audit.${role}.${runId}+clerk_test@example.com`,
    password: randomBytes(24).toString("base64url"),
    role,
    ...(role === "student" ? { grade: "01" } : {}),
  }));
  const created = run("users:createUsersWithClerk", {
    users: identities,
    orgType: "campus",
    orgId: campusId,
  });
  assert.ok(
    created.every((entry) => entry.status === "success"),
    JSON.stringify(created),
  );
  const users = query(
    `return await Promise.all(${JSON.stringify(identities.map((i) => i.email))}.map(async email => { const user=await ctx.db.query("users").withIndex("by_email",q=>q.eq("email",email)).unique(); return {_id:user._id,clerkId:user.clerkId,email:user.email}; }));`,
  );
  const curriculumId = run("curriculums:create", {
    title: `Grading browser audit ${runId}`,
    schoolId,
    gradeCodes: ["01"],
  });
  const { classId } = run("classes:createWithSchedule", {
    name: `GRADING CHROME AUDIT ${runId}`,
    curriculumId,
    campusId,
    teacherId: users[0]._id,
    academicPeriodId: "mh7b9cqkpyderjw0c5xw5fsk558garjx",
    gradeCode: "01",
    studentIds: [users[1]._id],
    liveAccess: { mode: "private", allowedGradeCodes: ["01"] },
    weeklySlots: [
      {
        dayOfWeek: 2,
        startMinutes: 600,
        durationMinutes: 30,
        sessionType: "live",
      },
    ],
  });
  const teacher = { subject: users[0].clerkId };
  const taskId = run(
    "courseTasks:create",
    { classId, title: "Grading lifecycle audit", grading: { maxPoints: 20 } },
    teacher,
  );
  const scaleTaskId = run(
    "courseTasks:create",
    {
      classId,
      title: "Grading scale concurrency audit",
      grading: { maxPoints: 20 },
    },
    teacher,
  );
  fixture = { runId, users, curriculumId, classId, taskId, scaleTaskId };
  await writeFile(`${output}/fixture.json`, JSON.stringify(fixture, null, 2));
}
console.log(`Development-only fixture: ${fixture.runId}`);
// A rerun creates new test activities; never reset or overwrite published results.
const teacherIdentity = { subject: fixture.users[0].clerkId };
const task = (title) =>
  run(
    "courseTasks:create",
    { classId: fixture.classId, title, grading: { maxPoints: 20 } },
    teacherIdentity,
  );
if (bulkOnly) {
  assert.match(
    query(`return (await ctx.db.get("classes", ${JSON.stringify(fixture.classId)})).name;`),
    /^GRADING CHROME AUDIT /,
  );
  fixture.taskId = task(`Grading bulk audit ${Date.now()}`);
} else {
  fixture.taskId = task(`Grading lifecycle ${Date.now()}`);
  fixture.scaleTaskId = task(`Grading scale ${Date.now()}`);
  await writeFile(`${output}/fixture.json`, JSON.stringify(fixture, null, 2));
}
await clerkSetup();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
const checks = [];
const productionRequests = [];
async function check(name, test) {
  await test();
  checks.push(name);
  console.log(`PASS ${name}`);
}
async function clientFor(page) {
  const token = await page.evaluate(() =>
    window.Clerk.session.getToken({ template: "convex" }),
  );
  assert.ok(token);
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
  client.setAuth(token);
  return client;
}
const courseUrl = (taskId) =>
  `${baseUrl}/en/cpca-main/classes/${fixture.classId}?task=${taskId}`;
async function review(page, taskId) {
  await page.goto(courseUrl(taskId));
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByLabel(/Grade \(out of/)).toBeVisible();
}
async function open(user) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  // Fail before a browser request can reach production, even after a wrong redirect.
  await context.route(/blessed-wombat-104|www\.flexidual\.com/, (route) => {
    productionRequests.push(route.request().url());
    return route.abort();
  });
  await context.routeWebSocket(
    /blessed-wombat-104|www\.flexidual\.com/,
    (route) => {
      productionRequests.push(route.url());
      return route.close();
    },
  );
  const page = await context.newPage();
  page.on("dialog", (dialog) => dialog.accept());
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await setupClerkTestingToken({ page });
  await page.goto(`${baseUrl}/en/sign-in`);
  await clerk.signIn({ page, emailAddress: user.email });
  await page.goto(courseUrl(fixture.taskId));
  return { context, page };
}
async function openAssignment(user) {
  const session = await open(user);
  await session.page.getByRole("tab", { name: /Assignments/ }).click({ timeout: 30000 });
  return { ...session, client: await clientFor(session.page) };
}
async function upload(page, name, replacement = false) {
  const edit = page.getByRole("button", { name: "Edit submission", exact: true });
  if (replacement) await edit.click();
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% grading audit fixture\n%%EOF"),
  });
  await page.getByRole("button", {
    name: replacement ? "Replace submission" : "Submit assignment",
    exact: true,
  }).click();
  await expect(edit).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

async function auditBulkPublication() {
  async function append(table, rows) {
    const path = `${output}/bulk-${table}.json`;
    await writeFile(path, JSON.stringify(rows));
    cli(["import", "--append", "--table", table, "--deployment", deployment, path]);
  }
  const { taskId, classId, users: [teacherUser, studentUser] } = fixture;
  const now = Date.now();
  const roster = Array.from({ length: 53 }, (_, index) => ({
    clerkId: `grading-bulk-${taskId}-${index}`,
    firstName: "Grading Bulk",
    lastName: String(index),
    fullName: `Grading Bulk ${index}`,
    isActive: true,
    createdAt: now,
  }));
  await append("users", roster);
  const studentIds = query(
    `return await Promise.all(${JSON.stringify(roster.map(({ clerkId }) => clerkId))}.map(async id => (await ctx.db.query("users").withIndex("by_clerk_id", q => q.eq("clerkId", id)).unique())._id));`,
  );
  await append("courseTaskRecipients", studentIds.map((studentId) => ({
    taskId, classId, studentId, submissionRevision: 0, assignedAt: now,
  })));
  const recipientIds = query(
    `return await Promise.all(${JSON.stringify(studentIds)}.map(async id => (await ctx.db.query("courseTaskRecipients").withIndex("by_taskId_and_studentId", q => q.eq("taskId", ${JSON.stringify(taskId)}).eq("studentId", id)).unique())._id));`,
  );
  const teacher = await openAssignment(teacherUser);
  const student = await openAssignment(studentUser);
  const target = { taskId, studentId: studentUser._id };
  const grading = (await teacher.client.query(api.courseTaskGrades.get, target)).grading;
  await append("courseTaskGrades", studentIds.map((studentId, index) => ({
    taskId, classId, studentId, recipientId: recipientIds[index], version: 1,
    draft: {
      points: index === 0 ? grading.scaleMax + 1 : grading.scaleMax / 2,
      institutionalScale: true, submissionRevision: 0,
      updatedAt: now + index, authorId: teacherUser._id,
    },
    lastOperationId: `seed-${index}`,
    lastOperationKind: "draft",
    lastOperationBy: teacherUser._id,
  })));
  const grades = async () => {
    const rows = [];
    let cursor = null;
    for (;;) {
      const result = await teacher.client.query(api.courseTaskSubmissions.listForTask, {
        taskId, paginationOpts: { cursor, numItems: 20 },
      });
      rows.push(...result.page);
      if (result.isDone) return rows;
      cursor = result.continueCursor;
    }
  };
  await check("an actual replacement leaves the earlier grade draft stale", async () => {
    await upload(student.page, "bulk-first.pdf");
    const row = (await grades()).find(({ studentId }) => studentId === studentUser._id);
    await teacher.client.mutation(api.courseTaskGrades.saveDraft, {
      ...target, institutionalPoints: grading.scaleMax / 2,
      expectedVersion: 0, expectedSubmissionRevision: row.submissionRevision,
      expectedGrading: grading, operationId: "chrome-bulk-stale",
    });
    await upload(student.page, "bulk-replacement.pdf", true);
    const after = (await grades()).find(({ studentId }) => studentId === studentUser._id);
    assert.ok(after.submissionRevision > row.submissionRevision);
    assert.ok(after.grade.draft);
  });
  const publish = teacher.page.getByRole("button", { name: "Publish all grades", exact: true });
  await expect(publish).toBeEnabled();
  const table = teacher.page.getByRole("table");
  const rows = table.getByRole("row");
  await expect(rows).toHaveCount(21);
  await expect(teacher.page.getByRole("button", { name: "Load more", exact: true })).toBeVisible();
  const input = rows.filter({ hasText: /Grading Bulk [1-9]/ }).first().getByRole("spinbutton");
  await check("invalid input is marked and blocks publication of its previous value", async () => {
    const original = await input.inputValue();
    await input.fill(String(grading.scaleMax + 1));
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await publish.click();
    await expect(teacher.page.getByText("Correct invalid grades and wait for drafts to save before publishing.")).toBeVisible();
    assert.equal((await grades()).filter((row) => row.grade.published).length, 0);
    await input.fill(original);
    await input.blur();
    await expect(input).not.toHaveAttribute("aria-invalid", "true");
  });
  await check("bulk publication covers three table pages and skips both invalid and replaced submissions", async () => {
    await publish.click();
    await expect(teacher.page.getByText("52 grades published.", { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(teacher.page.getByText("Invalid grades and grades for changed submissions were left unpublished.")).toBeVisible();
    await expect(rows).toHaveCount(21);
    const after = await grades();
    assert.equal(after.length, 54);
    assert.equal(after.filter((row) => row.grade.published).length, 52);
    for (const id of [studentIds[0], studentUser._id]) {
      const row = after.find(({ studentId }) => studentId === id);
      assert.equal(row.grade.published, null);
      assert.ok(row.grade.draft);
    }
    const own = await student.client.query(api.courseTaskGrades.get, { taskId });
    assert.equal(own.draft, null);
    assert.equal(own.published, null);
    await expect(publish).toBeDisabled();
  });
}

async function auditLifecycle() {
  const teacher = await open(fixture.users[0]);
  const student = await open(fixture.users[1]);
  await expect(
    teacher.page.getByRole("tab", { name: /Assignments/ }),
  ).toBeVisible({ timeout: 30000 });
  await teacher.page.getByRole("tab", { name: /Assignments/ }).click();
  await student.page.getByRole("tab", { name: /Assignments/ }).click();
  const teacherClient = await clientFor(teacher.page);
  const studentClient = await clientFor(student.page);
  const target = { taskId: fixture.taskId, studentId: fixture.users[1]._id };
  const own = () =>
    studentClient.query(api.courseTaskGrades.get, { taskId: fixture.taskId });
  const current = () => teacherClient.query(api.courseTaskGrades.get, target);
  const points = teacher.page.getByLabel(/Grade \(out of/);
  const comment = teacher.page.getByLabel("Evaluation comment", {
    exact: true,
  });
  const publish = teacher.page.getByRole("button", {
    name: "Publish grade",
    exact: true,
  });
  const keep = teacher.page.getByRole("button", {
    name: "Keep my draft",
    exact: true,
  });
  const studentGrade = student.page.getByRole("region", {
    name: "Grade",
    exact: true,
  });
  await teacher.page
    .getByRole("button", { name: "Review", exact: true })
    .click();
  await check(
    "local draft survives closing, reopening and browser reload without publishing",
    async () => {
      await points.fill("90");
      await comment.fill("First evaluation");
      await teacher.page
        .getByRole("dialog")
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await teacher.page
        .getByRole("button", { name: "Review", exact: true })
        .click();
      await expect(points).toHaveValue("90");
      await teacher.page.reload();
      await expect(points).toHaveValue("90");
      assert.equal((await own()).published, null);
    },
  );
  await check(
    "saved draft stays private in both the student UI and authenticated API",
    async () => {
      await points.blur();
      await expect(publish).toBeEnabled();
      assert.equal((await current()).draft.institutionalPoints, 90);
      assert.equal((await own()).draft, null);
      await expect(studentGrade).toContainText(
        "No grade has been published yet.",
      );
      await expect(studentGrade).not.toContainText("First evaluation");
    },
  );
  await check(
    "student cannot publish or edit a grade through a direct authenticated request",
    async () => {
      const grade = await current();
      const args = {
        ...target,
        expectedVersion: grade.version,
        expectedSubmissionRevision: 0,
        expectedGrading: grade.grading,
        operationId: "student-forbidden",
      };
      await assert.rejects(
        studentClient.mutation(api.courseTaskGrades.saveDraft, {
          ...args,
          points: 20,
        }),
        /PERMISSION_DENIED/,
      );
      await assert.rejects(
        studentClient.mutation(api.courseTaskGrades.publish, args),
        /PERMISSION_DENIED/,
      );
      assert.equal((await current()).version, grade.version);
    },
  );
  await check(
    "explicit publication appears live to the student and survives reload",
    async () => {
      await publish.click();
      await expect(
        studentGrade.getByText("90 / 100", { exact: true }),
      ).toBeVisible();
      await expect(studentGrade).toContainText("First evaluation");
      await student.page.reload();
      await expect(
        studentGrade.getByText("90 / 100", { exact: true }),
      ).toBeVisible();
      await expect(
        student.page.getByRole("button", {
          name: "Publish grade",
          exact: true,
        }),
      ).toHaveCount(0);
    },
  );
  await check(
    "a real PDF submission preserves the published grade and marks it for review",
    async () => {
      await upload(student.page, "audit-submission-1.pdf");
      await expect(studentGrade).toContainText("earlier submission");
      assert.equal((await own()).published.institutionalPoints, 90);
      await comment.fill("Private second evaluation");
      await points.fill("80");
      await points.blur();
      await expect(publish).toBeEnabled();
      await expect(studentGrade).not.toContainText("Private second evaluation");
    },
  );
  await check(
    "resubmission blocks the earlier draft; revised publication preserves both history entries",
    async () => {
      await comment.fill("Unconfirmed evaluation");
      await upload(student.page, "audit-submission-2.pdf", true);
      await expect(publish).toBeDisabled();
      await expect(points).toHaveAttribute("readonly", "");
      await expect(teacher.page.getByRole("alert")).toContainText("submission");
      await expect(keep).toHaveCount(0);
      assert.equal((await own()).published.institutionalPoints, 90);
      await teacher.page
        .getByRole("button", { name: "Load current version", exact: true })
        .click();
      await points.fill("85");
      await comment.fill("Reviewed replacement");
      await points.blur();
      await expect(publish).toBeEnabled();
      await publish.click();
      await expect(
        studentGrade.getByText("85 / 100", { exact: true }),
      ).toBeVisible();
      await expect(studentGrade).not.toContainText("earlier submission");
      await teacher.page
        .getByRole("button", { name: "Publication history", exact: true })
        .click();
      const history = await teacherClient.query(api.courseTaskGrades.history, {
        ...target,
        paginationOpts: { cursor: null, numItems: 10 },
      });
      assert.deepEqual(
        history.page.map((entry) => entry.institutionalPoints),
        [85, 90],
      );
      const submission = await studentClient.query(
        api.courseTaskSubmissions.get,
        { taskId: fixture.taskId },
      );
      assert.equal(submission.submissionRevision, 2);
      assert.deepEqual(
        submission.files.map((file) => file.name),
        ["audit-submission-2.pdf"],
      );
      await teacher.page.screenshot({
        path: `${output}/teacher-publication.png`,
        fullPage: true,
      });
      await student.page.screenshot({
        path: `${output}/student-publication.png`,
        fullPage: true,
      });
    },
  );
  await check(
    "existing evaluations lock their scale without changing published results",
    async () => {
      await assert.rejects(
        teacherClient.mutation(api.courseTasks.update, {
          taskId: fixture.taskId,
          grading: { maxPoints: 100 },
        }),
        /TASK_GRADING_LOCKED/,
      );
      assert.equal((await own()).published.institutionalPoints, 85);
      assert.equal((await own()).grading.maxPoints, 20);
    },
  );
  await check(
    "a second tab changing the scale cannot reinterpret an open local draft or a late request",
    async () => {
      await review(teacher.page, fixture.scaleTaskId);
      await points.fill("10");
      const previous = await teacherClient.query(api.courseTaskGrades.get, {
        ...target,
        taskId: fixture.scaleTaskId,
      });
      const other = await teacher.context.newPage();
      await other.goto(courseUrl(fixture.scaleTaskId));
      await other
        .getByRole("button", { name: "Edit assignment", exact: true })
        .click();
      await other.getByLabel("Maximum points", { exact: true }).fill("100");
      await other
        .getByRole("dialog")
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(teacher.page.getByRole("alert")).toContainText(
        "grading scale",
      );
      await expect(points).toHaveValue("10");
      await expect(points).toHaveAttribute("max", "100");
      await expect(points).toHaveAttribute("readonly", "");
      await expect(keep).toHaveCount(0);
      await assert.rejects(
        teacherClient.mutation(api.courseTaskGrades.saveDraft, {
          ...target,
          taskId: fixture.scaleTaskId,
          points: 10,
          expectedGrading: previous.grading,
          expectedVersion: 0,
          expectedSubmissionRevision: 0,
          operationId: "delayed-old-scale",
        }),
        /TASK_GRADING_CHANGED/,
      );
      await teacher.page.reload();
      await expect(points).toHaveAttribute("readonly", "");
      await expect(points).toHaveValue("10");
      await teacher.page
        .getByRole("button", { name: "Load current version", exact: true })
        .click();
      await expect(points).toHaveAttribute("max", "100");
      await points.fill("30");
      await points.blur();
      await expect(publish).toBeEnabled();
      await publish.click();
      await expect(teacher.page.getByText("Grade published.", { exact: true })).toBeVisible();
      await expect(points).toHaveValue("30");
      await expect(teacher.page.getByText("30 / 100", { exact: true })).toHaveCount(0);
      await other.close();
    },
  );
  await check(
    "full native browser storage does not block a cloud draft and reload restores the saved value",
    async () => {
      const full = await teacher.page.evaluate(() => {
        let index = 0;
        // Exhaust the remaining small space too, not just the last 100 KiB.
        for (let size = 100000; size >= 1; size = Math.floor(size / 10)) {
          try {
            for (let i = 0; i < 1000; i++)
              sessionStorage.setItem(
                `grading-audit-filler:${index++}`,
                "x".repeat(size),
              );
          } catch (error) {
            if (error.name !== "QuotaExceededError") throw error;
          }
        }
        try {
          sessionStorage.setItem("grading-audit-quota-probe", "x");
        } catch (error) {
          return error.name === "QuotaExceededError";
        }
        return false;
      });
      assert.equal(full, true);
      await points.fill("31");
      await comment.fill("Saved despite full browser storage");
      const draftKey = `flexidual:task-grade:${fixture.users[0].clerkId}:${fixture.scaleTaskId}:${fixture.users[1]._id}`;
      assert.equal(
        await teacher.page.evaluate(
          (key) => sessionStorage.getItem(key),
          draftKey,
        ),
        null,
      );
      await points.blur();
      await expect(publish).toBeEnabled();
      await teacher.page.reload();
      await expect(points).toHaveValue("31");
      assert.equal(
        (
          await teacherClient.query(api.courseTaskGrades.get, {
            ...target,
            taskId: fixture.scaleTaskId,
          })
        ).published.institutionalPoints,
        30,
      );
      await teacher.page.evaluate(() => {
        for (const key of Object.keys(sessionStorage))
          if (key.startsWith("grading-audit-filler:"))
            sessionStorage.removeItem(key);
      });
    },
  );
  await check(
    "a late save preserves a newer draft that can be kept and saved privately",
    async () => {
      const taskId = task(`Grading late save ${Date.now()}`);
      const { page } = teacher;
      let releaseSave;
      await page.routeWebSocket(
        `wss://${deployment}.convex.cloud/**`,
        (socket) => {
          const server = socket.connectToServer();
          socket.onMessage((message) => {
            const request = JSON.parse(message.toString());
            if (
              request.type === "Mutation" &&
              request.udfPath === "courseTaskGrades:saveDraft" &&
              !releaseSave
            ) {
              releaseSave = () => server.send(message);
              return;
            }
            server.send(message);
          });
        },
      );
      const reviewButton = page.getByRole("button", {
        name: "Review",
        exact: true,
      });
      await review(page, taskId);
      await points.fill("14");
      await points.blur();
      await expect.poll(() => Boolean(releaseSave)).toBe(true);
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await reviewButton.click();
      await expect(points).toHaveValue("14");
      await points.fill("16");
      await comment.fill("New private comment");
      releaseSave();
      await expect(
        page.getByRole("alert").filter({ hasText: "Your local draft is preserved" }),
      ).toBeVisible();
      await page.reload();
      await expect(points).toHaveValue("16");
      const gradeClient = await clientFor(page);
      const readGrade = () => gradeClient.query(api.courseTaskGrades.get, {
        ...target, taskId,
      });
      await expect(points).toHaveAttribute("readonly", "");
      const before = await readGrade();
      assert.equal(before.draft.institutionalPoints, 14);
      assert.equal(before.published, null);
      await keep.click();
      await expect(publish).toBeEnabled();
      await page.reload();
      await expect(points).toHaveValue("16");
      await expect(comment).toHaveValue("New private comment");
      await points.blur();
      await expect(publish).toBeEnabled();
      const after = await readGrade();
      assert.equal(after.draft.institutionalPoints, 16);
      assert.equal(after.draft.comment, "New private comment");
      assert.equal(after.published, null);
    },
  );
}

try {
  console.log(`Chrome: ${browser.version()}`);
  await (bulkOnly ? auditBulkPublication() : auditLifecycle());
  assert.deepEqual(productionRequests, []);
  assert.deepEqual(errors, []);
  console.log(
    `PASS ${checks.length} Chrome flows; no production requests or page errors`,
  );
  await writeFile(
    report,
    JSON.stringify(
      {
        deployment,
        chrome: browser.version(),
        fixture,
        checks,
        errors,
        productionRequests,
      },
      null,
      2,
    ),
  );
} catch (error) {
  for (const [i, context] of browser.contexts().entries())
    for (const [j, page] of context.pages().entries()) {
      await page
        .screenshot({ path: `${output}/failure-${i}-${j}.png`, fullPage: true })
        .catch(() => {});
      await writeFile(
        `${output}/failure-${i}-${j}.txt`,
        await page
          .locator("body")
          .innerText()
          .catch(() => ""),
      );
    }
  await writeFile(
    report,
    JSON.stringify(
      {
        deployment,
        fixture,
        checks,
        errors,
        productionRequests,
        failure: String(error),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
