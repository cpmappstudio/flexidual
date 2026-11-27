// Development only: real Clerk test sessions, Chrome, and the quiz backend.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, expect as baseExpect } from "@playwright/test";
import {
  clerk,
  clerkSetup,
  setupClerkTestingToken,
} from "@clerk/testing/playwright";
import { ConvexHttpClient } from "convex/browser";
import dotenv from "dotenv";
import { api } from "../convex/_generated/api.js";
import { utcToLocalDateTime } from "../lib/time-zone.ts";

dotenv.config({ path: ".env.local", quiet: true });
const expect = baseExpect.configure({ timeout: 15_000 });
const deployment = "bright-bat-393";
assert.equal(process.env.CONVEX_DEPLOYMENT, `dev:${deployment}`);
assert.equal(
  process.env.NEXT_PUBLIC_CONVEX_URL,
  `https://${deployment}.convex.cloud`,
);
assert.ok(
  !process.env.CONVEX_DEPLOY_KEY && !process.env.CONVEX_SELF_HOSTED_URL,
);
assert.ok(process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"));
assert.ok(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_"),
);
const baseUrl = `http://localhost:${Number(process.env.QUIZ_AUDIT_PORT ?? 3100)}`;
const studentMode = process.argv.includes("--student");
const reviewMode = process.argv.includes("--review");
const allMode = process.argv.includes("--all");
const filesMode = process.argv.includes("--files");
const multipleMode = process.argv.includes("--multiple");
const shuffleMode = process.argv.includes("--shuffle");
const editorMode = process.argv.includes("--editor");
const presentationMode = process.argv.includes("--presentation");
const definitionEditMode = process.argv.includes("--definition-edit");
const studentUiMode = process.argv.includes("--student-ui");
const editUiMode = process.argv.includes("--edit-ui");
const output = studentUiMode
  ? "scripts/data/quiz-student-ui-validation"
  : editUiMode
    ? "scripts/data/quiz-edit-ui-validation"
    : definitionEditMode
      ? "scripts/data/quiz-definition-edit-validation"
      : editorMode
        ? "scripts/data/quiz-editor-validation"
        : presentationMode
          ? "scripts/data/activity-presentation-validation"
          : shuffleMode
            ? "scripts/data/shuffle-validation"
            : multipleMode
              ? "scripts/data/multiple-choice-validation"
              : `scripts/data/phase${allMode || filesMode ? 7 : reviewMode ? 6 : studentMode ? 5 : 4}-validation`;
const fixtureFile = "scripts/data/phase4-validation/browser-fixture.json";
const admin = { subject: "user_3AlBmA6A02VVAlepVF7VZEyGaWo" };
const campusId = "jx76efgw0fvqkj3jthqpgggkt183598q";
const schoolId = "k57804bezwqkjnnc0yjf0seqfn8349f7";
const periodId = "m573rmhtvg0ncs6vdmw1zvhcbx8bjvsn";
function cli(args) {
  const result = spawnSync("pnpm", ["exec", "convex", ...args], {
    encoding: "utf8",
    env: process.env,
  });
  assert.equal(
    result.status,
    0,
    `Development command failed: ${result.stderr}`,
  );
  return result.stdout.trim();
}
function run(name, args, identity = admin) {
  const result = cli([
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
  ]);
  return result ? JSON.parse(result) : null;
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
assert.ok(
  cli(["env", "get", "CLERK_SECRET_KEY", "--deployment", deployment]) ===
    process.env.CLERK_SECRET_KEY,
  "Development Clerk instances differ",
);
await mkdir(output, { recursive: true });
await mkdir("scripts/data/phase4-validation", { recursive: true });
let fixture;
try {
  fixture = JSON.parse(await readFile(fixtureFile, "utf8"));
} catch {
  /* First run. */
}
if (!fixture) {
  const runId = Date.now().toString(36);
  const identities = ["teacher", "student"].map((role) => ({
    firstName: "Quiz Audit",
    lastName: role,
    email: `quiz.audit.${role}.${runId}+clerk_test@example.com`,
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
    created.every((user) => user.status === "success"),
    JSON.stringify(created),
  );
  const users = query(
    `return await Promise.all(${JSON.stringify(identities.map((user) => user.email))}.map(async email => { const user=await ctx.db.query("users").withIndex("by_email",q=>q.eq("email",email)).unique(); return {id:user._id,clerkId:user.clerkId,email:user.email}; }));`,
  );
  const curriculumId = run("curriculums:create", {
    schoolId,
    title: `Quiz browser audit ${runId}`,
    gradeCodes: ["01"],
  });
  const { classId } = run("classes:createWithSchedule", {
    name: `QUIZ BROWSER AUDIT ${runId}`,
    curriculumId,
    campusId,
    teacherId: users[0].id,
    academicPeriodId: periodId,
    gradeCode: "01",
    studentIds: [users[1].id],
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
  fixture = { runId, users, curriculumId, classId };
  await writeFile(fixtureFile, JSON.stringify(fixture, null, 2));
}
assert.match(
  query(
    `return (await ctx.db.get("classes",${JSON.stringify(fixture.classId)})).name;`,
  ),
  /^QUIZ BROWSER AUDIT /,
);
function hasGrades(taskId) {
  return query(
    `return (await ctx.db.query("courseTaskGrades").withIndex("by_taskId_and_studentId",q=>q.eq("taskId",${JSON.stringify(taskId)})).first()) !== null;`,
  );
}
// Grade protection applies to audit activities too; retain published results.
if (
  !presentationMode &&
  !editorMode &&
  !definitionEditMode &&
  !editUiMode &&
  !studentUiMode
)
  for (const taskId of query(
    `const tasks = await ctx.db.query("courseTasks").withIndex("by_classId_and_releasedAt",q=>q.eq("classId",${JSON.stringify(fixture.classId)})).take(100); const rows = await Promise.all(tasks.map(async task => ({ id: task._id, graded: (await ctx.db.query("courseTaskGrades").withIndex("by_taskId_and_studentId",q=>q.eq("taskId",task._id)).first()) !== null }))); return rows.filter(row=>!row.graded).map(row=>row.id);`,
  )) {
    run("courseTasks:remove", { taskId });
  }
await clerkSetup();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const checks = [];
const errors = [];
const productionRequests = [];
const tasks = [];
const courseUrl = `${baseUrl}/cpca-main/classes/${fixture.classId}`;
const timeZone = query(
  `return (await ctx.db.get("campuses",${JSON.stringify(campusId)})).timeZone;`,
);
const deadline = utcToLocalDateTime(Date.now() + 86_400_000, timeZone);
async function check(name, action) {
  await action();
  checks.push(name);
  console.log(`PASS ${name}`);
}
async function session(user) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "es-CO",
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
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
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await setupClerkTestingToken({ page });
  await page.goto(`${baseUrl}/sign-in`);
  await clerk.signIn({ page, emailAddress: user.email });
  await page.goto(courseUrl);
  try {
    await page.getByRole("tab", { name: /^Tareas/ }).click({ timeout: 60_000 });
  } catch (error) {
    await page.screenshot({ path: `${output}/session-error.png` });
    throw error;
  }
  const token = await page.evaluate(() =>
    window.Clerk.session.getToken({ template: "convex" }),
  );
  assert.ok(token);
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
  client.setAuth(token);
  return { page, context, client };
}
async function chooseActivity(page, label) {
  await page
    .getByRole("button", { name: "Nueva actividad", exact: true })
    .click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
}
async function chooseQuestion(page, type) {
  await page
    .getByRole("button", { name: "Añadir pregunta", exact: true })
    .click();
  await page.getByRole("menuitem", { name: type, exact: true }).click();
}
async function fillQuiz(page, title) {
  await chooseActivity(page, "Nuevo quiz");
  const dialog = page.getByRole("dialog", { name: "Nuevo quiz" });
  await dialog.getByLabel("Título", { exact: false }).fill(title);
  await dialog.getByLabel("Fecha y hora de cierre").fill(deadline);
  await chooseQuestion(page, "Selección única");
  await dialog
    .getByLabel("Enunciado", { exact: false })
    .fill("¿Cuánto es 1 + 1?");
  await dialog
    .getByLabel("Opción 1 de pregunta 1", { exact: true })
    .fill("Uno");
  await dialog
    .getByLabel("Opción 2 de pregunta 1", { exact: true })
    .fill("Dos");
  await dialog
    .getByRole("radio", {
      name: "Marcar opción 2 como correcta en pregunta 1",
      exact: true,
    })
    .check();
  await chooseQuestion(page, "Respuesta abierta");
  await dialog
    .getByLabel("Enunciado", { exact: false })
    .nth(1)
    .fill("Explica cómo llegaste a tu respuesta.");
  return dialog;
}
async function captureEditor(page, name) {
  const dialog = page.getByRole("dialog", { name: "Nuevo quiz" });
  const body = dialog.locator('[data-slot="quiz-editor-body"]');
  await page.addStyleTag({
    content:
      "nextjs-portal{display:none!important}*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}",
  });
  await page.evaluate(() =>
    document.getAnimations().forEach((animation) => animation.finish()),
  );
  await body.evaluate((element) => element.scrollTo(0, 0));
  await page.screenshot({ path: `${output}/editor-${name}.png` });
  await body
    .locator("fieldset")
    .first()
    .evaluate((element) => element.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: `${output}/questions-${name}.png` });
  assert.equal(await dialog.evaluate((element) => element.scrollTop), 0);
  const header = await dialog
    .locator('[data-slot="dialog-header"]')
    .boundingBox();
  const actions = await dialog
    .locator('[data-slot="dialog-footer"]')
    .boundingBox();
  const bounds = await dialog.boundingBox();
  assert.ok(
    header.y >= bounds.y &&
      actions.y + actions.height <= bounds.y + bounds.height,
  );
  assert.ok(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
}
async function preparedGradeFor(teacher, student, taskId) {
  const hidden = await student.client.query(api.courseTaskGrades.get, {
    taskId,
  });
  assert.equal(hidden.published, null);
  assert.equal(hidden.draft, null);
  assert.equal(hidden.version, 0);
  return teacher.client.query(api.courseTaskGrades.get, {
    taskId,
    studentId: fixture.users[1].id,
  });
}

async function showQuizQuestion(page, number) {
  await page
    .getByRole("button", { name: "Ir a una pregunta", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Ir a una pregunta", exact: true })
    .getByRole("button", { name: new RegExp(`^Pregunta ${number}:`) })
    .click();
}

async function auditStudentUi() {
  const teacher = await session(fixture.users[0]);
  const student = await session(fixture.users[1]);
  const { page } = student;
  const authored = Array.from({ length: 50 }, (_, index) =>
    index === 0
      ? {
          kind: "multiple_choice",
          prompt: "¿Cuáles son animales domésticos?",
          maxPoints: 1,
          options: [
            { id: "cat", label: "Gato" },
            { id: "dog", label: "Perro" },
            { id: "lion", label: "León" },
          ],
          correctOptionIds: ["cat", "dog"],
        }
      : index === 1
        ? {
            kind: "single_choice",
            prompt: "¿Cuánto es 2 + 2?",
            maxPoints: 1,
            options: [
              { id: "a", label: "Cuatro" },
              { id: "b", label: "Cinco" },
            ],
            correctOptionId: "a",
          }
        : {
            kind: "text",
            prompt:
              `Explica el ejercicio ${index + 1}.` +
              (index === 24
                ? " Describe los pasos y comprueba tu procedimiento. ".repeat(
                    60,
                  )
                : ""),
            maxPoints: 1,
          },
  );
  const taskId = await teacher.client.mutation(api.courseQuizzes.create, {
    classId: fixture.classId,
    title: `Vista del estudiante ${Date.now()}`,
    description: "Lee con calma y revisa tus respuestas antes de entregar.",
    dueAt: Date.now() + 3_600_000,
    durationMinutes: 30,
    shuffleQuestions: true,
    questions: authored,
  });
  tasks.push(taskId);
  const region = page.getByRole("region", {
    name: "Responder quiz",
    exact: true,
  });
  await page.goto(`${courseUrl}?task=${taskId}`);
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await check(
    "student starts in focused answering with one question and the course carousel hidden",
    async () => {
      await page
        .getByRole("button", { name: "Iniciar quiz", exact: true })
        .click();
      await expect(region.getByRole("timer")).not.toHaveText("—");
      await expect(region.locator("fieldset")).toHaveCount(1);
      await expect(
        page.locator('[data-course-overview] [role="tablist"]'),
      ).toBeHidden();
      await expect(page.locator('[data-slot="carousel-content"]')).toBeHidden();
      await expect(page.locator("[data-course-overview]").first()).toBeHidden();
      await expect(region.locator("fieldset")).toBeFocused();
      const timer = await region.getByRole("timer").boundingBox();
      assert.ok(timer.y >= 64 && timer.y + timer.height < 1000);
      await page.screenshot({
        path: `${output}/first-question-desktop.png`,
        animations: "disabled",
      });
    },
  );
  const initial = await student.client.query(api.courseQuizzes.getAttempt, {
    taskId,
    now: Date.now(),
  });
  const questions = await student.client.query(api.courseQuizzes.getQuestions, {
    taskId,
  });
  const position = (kind) => questions.findIndex((q) => q.kind === kind) + 1;
  for (const question of questions) {
    assert.equal(question.correctOptionId, undefined);
    assert.equal(question.correctOptionIds, undefined);
  }
  await check(
    "free navigation keeps all three answer kinds by ID and preserves the server shuffled order",
    async () => {
      await showQuizQuestion(page, position("multiple_choice"));
      await region.getByRole("checkbox", { name: "Gato", exact: true }).check();
      await region
        .getByRole("checkbox", { name: "Perro", exact: true })
        .check();
      await showQuizQuestion(page, position("single_choice"));
      const radio = region.getByRole("radio", { name: "Cuatro", exact: true });
      await radio.focus();
      await radio.press("ArrowRight", { delay: 100 });
      await expect(
        region.getByRole("radio", { name: "Cinco", exact: true }),
      ).toBeChecked();
      await radio.check();
      await showQuizQuestion(page, position("text"));
      await region
        .getByRole("textbox")
        .fill("Mi respuesta conservada entre preguntas.");
      await region.getByRole("textbox").press("ArrowLeft");
      assert.equal(
        await region
          .getByRole("textbox")
          .evaluate((element) => element.selectionStart),
        "Mi respuesta conservada entre preguntas.".length - 1,
      );
      await showQuizQuestion(page, position("multiple_choice"));
      await expect(
        region.getByRole("checkbox", { name: "Gato", exact: true }),
      ).toBeChecked();
      await expect(
        region.getByRole("checkbox", { name: "Perro", exact: true }),
      ).toBeChecked();
      await expect(
        region.getByText("Todas las respuestas están guardadas.", {
          exact: true,
        }),
      ).toBeVisible();
      const remote = await student.client.query(api.courseQuizzes.getAttempt, {
        taskId,
        now: Date.now(),
      });
      assert.equal(remote.answers.length, 3);
      assert.equal(remote.attempt.startedAt, initial.attempt.startedAt);
      assert.deepEqual(
        (
          await student.client.query(api.courseQuizzes.getQuestions, { taskId })
        ).map((q) => q._id),
        questions.map((q) => q._id),
      );
    },
  );
  const longPosition = questions.findIndex((q) => q.prompt.length > 1000) + 1;
  const layouts = [];
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await showQuizQuestion(page, longPosition);
    await check(
      `timer and submit action stay visible while scrolling a long question on ${name}`,
      async () => {
        await region.getByRole("textbox").scrollIntoViewIfNeeded();
        const metrics = await region.evaluate((element) => {
          const rect = (node) => {
            const r = node.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, height: r.height };
          };
          const timer = element.querySelector('[role="timer"]');
          return {
            timer: rect(timer),
            sticky: rect(timer.closest(".sticky")),
            viewport: innerHeight,
            overflow: document.documentElement.scrollWidth > innerWidth,
            header: document
              .querySelector('[data-slot="site-header"]')
              ?.getBoundingClientRect().height,
          };
        });
        assert.ok(metrics.timer.top >= 63 && metrics.timer.bottom < height);
        assert.equal(metrics.overflow, false);
        await expect(
          region.getByRole("button", { name: "Entregar quiz", exact: true }),
        ).toBeInViewport();
        layouts.push({ name, ...metrics });
        await page.screenshot({
          animations: "disabled",
          path: `${output}/active-${name}.png`,
        });
      },
    );
  }
  await check(
    "reloading on mobile restores the current question, attempt limit and saved work",
    async () => {
      await page.reload();
      await expect(region.getByRole("timer")).not.toHaveText("—");
      await expect(
        region.getByText(`Pregunta ${longPosition} de 50`, { exact: true }),
      ).toBeVisible();
      const remote = await student.client.query(api.courseQuizzes.getAttempt, {
        taskId,
        now: Date.now(),
      });
      assert.equal(remote.attempt.startedAt, initial.attempt.startedAt);
      assert.equal(remote.attempt.timeLimitAt, initial.attempt.timeLimitAt);
      await showQuizQuestion(page, position("text"));
      await expect(region.getByRole("textbox")).toHaveValue(
        "Mi respuesta conservada entre preguntas.",
      );
      await page.screenshot({
        path: `${output}/short-question-mobile.png`,
        animations: "disabled",
      });
    },
  );
  await check(
    "active answering has no course-exit action and preserves local work while navigating",
    async () => {
      await expect(
        region.getByRole("button", { name: /Volver al curso|Continuar quiz/ }),
      ).toHaveCount(0);
      await region
        .getByRole("textbox")
        .fill("Respuesta al cambiar de pregunta.");
      await showQuizQuestion(page, position("single_choice"));
      await showQuizQuestion(page, position("text"));
      await expect(region.getByRole("textbox")).toHaveValue(
        "Respuesta al cambiar de pregunta.",
      );
      await expect(
        page.locator('[data-course-overview] [role="tablist"]'),
      ).toBeHidden();
      await expect(page.locator('[data-slot="carousel-content"]')).toBeHidden();
    },
  );
  await check(
    "confirmation exposes pending questions and returns focus to the chosen answer",
    async () => {
      await region
        .getByRole("button", { name: "Entregar quiz", exact: true })
        .click();
      const dialog = page.getByRole("alertdialog");
      const pending = dialog.getByRole("navigation", {
        name: "Preguntas sin responder",
        exact: true,
      });
      await expect(pending.getByRole("button")).toHaveCount(47);
      await page.screenshot({
        animations: "disabled",
        path: `${output}/confirmation-mobile.png`,
      });
      await pending.getByRole("button").first().click();
      await expect(dialog).toHaveCount(0);
      await expect(region.locator("fieldset")).toBeFocused();
    },
  );
  await check(
    "submission focuses the receipt and retains the existing pending manual grade and locked answer keys",
    async () => {
      await region
        .getByRole("button", { name: "Entregar quiz", exact: true })
        .click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Confirmar entrega", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Quiz entregado", exact: true }),
      ).toBeFocused();
      const grade = await student.client.query(api.courseTaskGrades.get, {
        taskId,
      });
      assert.equal(grade.published, null);
      await assert.rejects(
        student.client.query(api.courseQuizzes.getReview, { taskId }),
        /QUIZ_REVIEW_LOCKED/,
      );
      await expect(
        page.locator('[data-course-overview] [role="tablist"]'),
      ).toBeVisible();
      await page.screenshot({
        animations: "disabled",
        path: `${output}/submitted-mobile.png`,
      });
      await teacher.page.goto(
        `${courseUrl}?task=${taskId}&student=${fixture.users[1].id}`,
      );
      await expect(teacher.page.getByRole("dialog")).toBeVisible();
    },
  );
  await writeFile(`${output}/layouts.json`, JSON.stringify(layouts, null, 2));
}

async function auditStudent() {
  const teacher = await session(fixture.users[0]);
  const student = await session(fixture.users[1]);
  const region = (page) =>
    page.getByRole("region", { name: "Responder quiz", exact: true });
  const saved = (page) =>
    page.getByText("Todas las respuestas están guardadas.", { exact: true });
  const choice = {
    kind: "single_choice",
    prompt: "¿Cuánto es 1 + 1?",
    maxPoints: 2,
    options: [
      { id: "a", label: "Uno" },
      { id: "b", label: "Dos" },
    ],
    correctOptionId: "b",
  };
  async function create(title, questions, dueAt = Date.now() + 1_200_000) {
    const taskId = await teacher.client.mutation(api.courseQuizzes.create, {
      classId: fixture.classId,
      title: `${title} ${Date.now()}`,
      durationMinutes: 10,
      dueAt,
      questions,
    });
    tasks.push(taskId);
    return taskId;
  }
  async function open(page, taskId) {
    await page.goto(`${courseUrl}?task=${taskId}`);
    await expect(region(page)).toBeVisible({ timeout: 30_000 });
  }
  async function begin(page) {
    await page
      .getByRole("button", { name: "Iniciar quiz", exact: true })
      .click();
    await expect(region(page).getByRole("timer")).not.toHaveText("—");
    await expect(
      page.getByRole("complementary").filter({ hasText: "Progreso del curso" }),
    ).toBeHidden();
    await expect(
      page.getByRole("radio", { name: "Dos", exact: true }),
    ).toBeEnabled();
  }
  const seconds = (text) =>
    text.split(":").reduce((total, part) => total * 60 + Number(part), 0);
  const automaticId = await create("Quiz automático del estudiante", [choice]);
  await check(
    "explicit start, autosave and page reload preserve the same attempt and saved answer",
    async () => {
      await open(student.page, automaticId);
      assert.equal(
        (
          await student.client.query(api.courseQuizzes.get, {
            taskId: automaticId,
            now: Date.now(),
          })
        ).attempt,
        null,
      );
      await begin(student.page);
      const before = await student.client.query(api.courseQuizzes.get, {
        taskId: automaticId,
        now: Date.now(),
      });
      await student.page
        .getByRole("radio", { name: "Dos", exact: true })
        .check();
      await expect(saved(student.page)).toBeVisible();
      await open(student.page, automaticId);
      await expect(
        student.page.getByRole("radio", { name: "Dos", exact: true }),
      ).toBeChecked();
      const after = await student.client.query(api.courseQuizzes.get, {
        taskId: automaticId,
        now: Date.now(),
      });
      assert.equal(after.attempt.startedAt, before.attempt.startedAt);
      assert.equal(after.attempt.timeLimitAt, before.attempt.timeLimitAt);
    },
  );
  await check(
    "changing the device clock does not change the server-based countdown",
    async () => {
      const timer = region(student.page).getByRole("timer");
      await expect(timer).not.toHaveText("—");
      const before = seconds(await timer.textContent());
      await student.page.evaluate(() => {
        window.__quizRealNow = Date.now;
        Date.now = () => window.__quizRealNow() + 86_400_000;
      });
      await expect
        .poll(async () => seconds(await timer.textContent()))
        .toBeLessThan(before);
      const after = seconds(await timer.textContent());
      assert.ok(after > before - 5);
      await student.page.evaluate(() => {
        Date.now = window.__quizRealNow;
      });
    },
  );
  await check(
    "manual delivery prepares one automatic grade and keeps the total and keys locked until closing",
    async () => {
      await student.page
        .getByRole("button", { name: "Entregar quiz", exact: true })
        .click();
      await student.page
        .getByRole("button", { name: "Confirmar entrega", exact: true })
        .click();
      await expect(
        student.page.getByText("Quiz entregado", { exact: true }),
      ).toBeVisible();
      await expect(
        student.page
          .getByRole("complementary")
          .filter({ hasText: "Progreso del curso" }),
      ).toBeVisible();
      const grade = await preparedGradeFor(teacher, student, automaticId);
      assert.equal(grade.published.points, 2);
      assert.equal(grade.published.source, "automatic");
      await expect(
        student.page.getByText(
          `${grade.grading.scaleMax} / ${grade.grading.scaleMax}`,
          { exact: true },
        ),
      ).toHaveCount(0);
      await assert.rejects(
        student.client.query(api.courseQuizzes.getReview, {
          taskId: automaticId,
        }),
        /QUIZ_REVIEW_LOCKED/,
      );
      await student.client.mutation(api.courseQuizzes.submit, {
        taskId: automaticId,
      });
      const history = await teacher.client.query(api.courseTaskGrades.history, {
        taskId: automaticId,
        studentId: fixture.users[1].id,
        paginationOpts: { numItems: 10, cursor: null },
      });
      assert.equal(history.page.length, 1);
    },
  );
  const mixedId = await create("Quiz mixto del estudiante", [
    choice,
    { kind: "text", prompt: "Explica tu respuesta", maxPoints: 8 },
  ]);
  await open(student.page, mixedId);
  await begin(student.page);
  await showQuizQuestion(student.page, 2);
  await student.page
    .getByLabel("Explica tu respuesta", { exact: true })
    .fill("Respuesta guardada");
  await expect(saved(student.page)).toBeVisible();
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    await student.page.setViewportSize({ width, height });
    await student.page.addStyleTag({
      content:
        "nextjs-portal{display:none!important}*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}",
    });
    await student.page.evaluate(() =>
      document.getAnimations().forEach((animation) => animation.finish()),
    );
    await region(student.page).evaluate((element) =>
      element.scrollIntoView({ block: "start" }),
    );
    await student.page.screenshot({ path: `${output}/student-${name}.png` });
    assert.ok(
      await student.page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    assert.ok(
      await region(student.page).evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    );
  }
  await student.page.setViewportSize({ width: 1440, height: 1000 });
  await check(
    "live closing changes shorten the countdown and extensions never restart the individual clock",
    async () => {
      const before = await student.client.query(api.courseQuizzes.get, {
        taskId: mixedId,
        now: Date.now(),
      });
      await teacher.client.mutation(api.courseTasks.update, {
        taskId: mixedId,
        dueAt: Date.now() + 120_000,
      });
      await expect
        .poll(async () =>
          seconds(await region(student.page).getByRole("timer").textContent()),
        )
        .toBeLessThanOrEqual(120);
      await teacher.client.mutation(api.courseTasks.update, {
        taskId: mixedId,
        dueAt: Date.now() + 1_200_000,
      });
      await expect
        .poll(async () =>
          seconds(await region(student.page).getByRole("timer").textContent()),
        )
        .toBeGreaterThan(120);
      assert.ok(
        seconds(await region(student.page).getByRole("timer").textContent()) <=
          600,
      );
      assert.equal(
        (
          await student.client.query(api.courseQuizzes.get, {
            taskId: mixedId,
            now: Date.now(),
          })
        ).attempt.timeLimitAt,
        before.attempt.timeLimitAt,
      );
    },
  );
  await check(
    "offline answers stay pending and save after reconnecting",
    async () => {
      await student.context.setOffline(true);
      await expect(
        student.page.getByText(/Sin conexión con el servidor/),
      ).toBeVisible();
      await student.page
        .getByLabel("Explica tu respuesta", { exact: true })
        .fill("Borrador sin red");
      await expect(
        student.page.getByText("Hay respuestas pendientes de guardar.", {
          exact: true,
        }),
      ).toBeVisible();
      const remote = await student.client.query(api.courseQuizzes.get, {
        taskId: mixedId,
        now: Date.now(),
      });
      assert.equal(
        remote.answers.find((answer) => answer.answer.kind === "text").answer
          .text,
        "Respuesta guardada",
      );
      await student.context.setOffline(false);
      await expect(saved(student.page)).toBeVisible();
      await expect
        .poll(
          async () =>
            (
              await student.client.query(api.courseQuizzes.get, {
                taskId: mixedId,
                now: Date.now(),
              })
            ).answers.find((answer) => answer.answer.kind === "text").answer
              .text,
        )
        .toBe("Borrador sin red");
    },
  );
  await check(
    "switching activities before debounce restores the pending session draft on return",
    async () => {
      await student.page
        .getByLabel("Explica tu respuesta", { exact: true })
        .fill("Borrador al volver a la actividad");
      await student.page.goto(`${courseUrl}?task=${automaticId}`);
      await expect(
        student.page.getByText("Quiz entregado", { exact: true }),
      ).toBeVisible();
      await student.page.goto(`${courseUrl}?task=${mixedId}`);
      await expect(
        student.page.getByLabel("Explica tu respuesta", { exact: true }),
      ).toHaveValue("Borrador al volver a la actividad");
      await expect(saved(student.page)).toBeVisible();
    },
  );
  await check(
    "two real browser sessions detect stale edits and require explicit conflict resolution",
    async () => {
      const other = await session(fixture.users[1]);
      await open(other.page, mixedId);
      await showQuizQuestion(other.page, 2);
      await expect(
        other.page.getByLabel("Explica tu respuesta", { exact: true }),
      ).toBeEnabled();
      await student.context.setOffline(true);
      await expect(
        student.page.getByText(/Sin conexión con el servidor/),
      ).toBeVisible();
      await student.page
        .getByLabel("Explica tu respuesta", { exact: true })
        .fill("Cambios locales pendientes");
      await other.page
        .getByLabel("Explica tu respuesta", { exact: true })
        .fill("Desde otra pestaña");
      await expect(saved(other.page)).toBeVisible();
      await student.context.setOffline(false);
      await expect(region(student.page).getByRole("alert")).toContainText(
        "Las respuestas cambiaron en otra pestaña",
      );
      await expect(
        student.page.getByLabel("Explica tu respuesta", { exact: true }),
      ).toHaveValue("Cambios locales pendientes");
      await student.page
        .getByRole("button", {
          name: "Cargar respuestas guardadas",
          exact: true,
        })
        .click();
      await expect(
        student.page.getByLabel("Explica tu respuesta", { exact: true }),
      ).toHaveValue("Desde otra pestaña");
      await other.context.close();
      await student.page
        .getByLabel("Explica tu respuesta", { exact: true })
        .fill("Respuesta final al entregar");
      await student.page
        .getByRole("button", { name: "Entregar quiz", exact: true })
        .click();
      await student.page
        .getByRole("button", { name: "Confirmar entrega", exact: true })
        .click();
      await expect(
        student.page.getByText("Quiz entregado", { exact: true }),
      ).toBeVisible();
      const final = await student.client.query(api.courseQuizzes.get, {
        taskId: mixedId,
        now: Date.now(),
      });
      assert.equal(
        final.answers.find((answer) => answer.answer.kind === "text").answer
          .text,
        "Respuesta final al entregar",
      );
      assert.equal(
        (
          await student.client.query(api.courseTaskGrades.get, {
            taskId: mixedId,
          })
        ).published,
        null,
      );
    },
  );
  await check(
    "server expiry submits saved work while the browser is closed and ignores offline pending changes",
    async () => {
      const dueAt = Date.now() + 15_000;
      const expiringId = await create(
        "Quiz con vencimiento automático",
        [choice],
        dueAt,
      );
      await open(student.page, expiringId);
      await begin(student.page);
      await student.page
        .getByRole("radio", { name: "Dos", exact: true })
        .check();
      await expect(saved(student.page)).toBeVisible();
      await student.context.setOffline(true);
      await expect(
        student.page.getByText(/Sin conexión con el servidor/),
      ).toBeVisible();
      await student.page
        .getByRole("radio", { name: "Uno", exact: true })
        .check();
      const closed = student.page.waitForEvent("close");
      await student.page.close({ runBeforeUnload: true });
      await closed;
      await student.context.setOffline(false);
      await expect
        .poll(
          async () =>
            (
              await student.client.query(api.courseTaskGrades.get, {
                taskId: expiringId,
              })
            ).published?.points,
          { timeout: 35_000 },
        )
        .toBe(2);
      const page = await student.context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await setupClerkTestingToken({ page });
      await open(page, expiringId);
      await expect(
        page.getByText("Quiz entregado", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Iniciar quiz", exact: true }),
      ).toHaveCount(0);
      const submission = await student.client.query(
        api.courseTaskSubmissions.get,
        { taskId: expiringId },
      );
      assert.equal(submission.submittedAt, dueAt);
      assert.equal(submission.submittedLate, false);
    },
  );
}

async function auditReview() {
  const teacher = await session(fixture.users[0]);
  const student = await session(fixture.users[1]);
  const questions = [
    {
      kind: "single_choice",
      prompt: "¿Cuánto es 1 + 1?",
      maxPoints: 2,
      options: [
        { id: "a", label: "Uno" },
        { id: "b", label: "Dos" },
      ],
      correctOptionId: "b",
    },
    {
      kind: "text",
      prompt: "Explica cómo sumaste las unidades.",
      maxPoints: 4,
    },
    {
      kind: "text",
      prompt: "Explica cómo comprobarías el resultado.",
      maxPoints: 4,
    },
  ];
  async function createSubmitted(title) {
    const taskId = await teacher.client.mutation(api.courseQuizzes.create, {
      classId: fixture.classId,
      title: `${title} ${Date.now()}`,
      durationMinutes: 10,
      dueAt: Date.now() + 1_200_000,
      questions,
    });
    tasks.push(taskId);
    await student.client.mutation(api.courseQuizzes.start, { taskId });
    const definition = await student.client.query(api.courseQuizzes.get, {
      taskId,
      now: Date.now(),
    });
    await student.client.mutation(api.courseQuizzes.submit, {
      taskId,
      answers: definition.questions.map((q, i) => ({
        questionId: q._id,
        expectedVersion: 0,
        answer:
          q.kind === "single_choice"
            ? { kind: "single_choice", optionId: "b" }
            : {
                kind: "text",
                text:
                  i === 1
                    ? "Sumé una unidad a otra y obtuve dos."
                    : "Compruebo el resultado restando una unidad: queda una.",
              },
      })),
    });
    return taskId;
  }
  async function open(page, taskId) {
    await page.goto(`${courseUrl}?task=${taskId}`);
    await expect(
      page.getByRole("heading", { name: /Quiz revisión|Quiz publicación/ }),
    ).toBeVisible({ timeout: 30_000 });
  }
  const panel = () => teacher.page.getByRole("dialog", { name: /Quiz Audit/ });
  const score = (number) =>
    panel().getByRole("spinbutton", {
      name: `Puntaje de la pregunta ${number} (sobre 4)`,
      exact: true,
    });
  const save = () =>
    panel().getByRole("button", { name: "Guardar borrador", exact: true });
  const publish = () =>
    panel().getByRole("button", {
      name: /Publicar al cierre|Publicar calificación/,
      exact: true,
    });
  async function review(taskId) {
    return teacher.client.query(api.courseQuizzes.getReview, {
      taskId,
      studentId: fixture.users[1].id,
    });
  }
  async function saveCurrent(taskId) {
    const before = await review(taskId);
    await save().click();
    await expect
      .poll(async () => (await review(taskId)).version)
      .toBeGreaterThan(before.version);
    await expect(save()).toBeDisabled();
  }
  async function capture(page, name, fullPage = false) {
    await page.mouse.move(1, 1);
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
      timeout: 15_000,
    });
    await page.addStyleTag({
      content:
        "nextjs-portal{display:none!important}*,*::before,*::after{animation:none!important;transition:none!important}",
    });
    await page.evaluate(() =>
      document.getAnimations().forEach((animation) => animation.finish()),
    );
    await page.screenshot({ path: `${output}/${name}.png`, fullPage });
  }
  const taskId = await createSubmitted("Quiz revisión docente");
  await check(
    "teacher saves a partial review, student cannot see drafts or keys, and incomplete publication stays disabled",
    async () => {
      await open(teacher.page, taskId);
      await expect(teacher.page.getByRole("table")).toBeVisible();
      for (const [name, width, height] of [
        ["desktop", 1440, 1000],
        ["mobile", 390, 844],
      ]) {
        await teacher.page.setViewportSize({ width, height });
        await capture(teacher.page, `teacher-overview-${name}`, true);
      }
      await teacher.page.setViewportSize({ width: 1440, height: 1000 });
      await teacher.page
        .getByRole("button", { name: "Revisar", exact: true })
        .click();
      await expect(panel()).toBeVisible();
      await score(2).fill("3");
      await saveCurrent(taskId);
      await expect(publish()).toBeDisabled();
      const grade = await student.client.query(api.courseTaskGrades.get, {
        taskId,
      });
      assert.equal(grade.published, null);
      assert.equal(grade.draft, null);
      await open(student.page, taskId);
      await expect(
        student.page.getByText(
          /Podrás consultar los resultados a partir del cierre del quiz/,
        ),
      ).toBeVisible();
      for (const [name, width, height] of [
        ["desktop", 1440, 1000],
        ["mobile", 390, 844],
      ]) {
        await student.page.setViewportSize({ width, height });
        await capture(student.page, `student-pending-${name}`, true);
      }
      await student.page.setViewportSize({ width: 1440, height: 1000 });
      await assert.rejects(
        student.client.query(api.courseQuizzes.getReview, { taskId }),
        /QUIZ_REVIEW_LOCKED/,
      );
      await panel().getByRole("button", { name: "Close", exact: true }).click();
      await teacher.page
        .getByRole("button", { name: "Revisar", exact: true })
        .click();
      await expect(score(2)).toHaveValue("3");
    },
  );
  await check(
    "a concurrent review keeps local scores and requires explicit recovery",
    async () => {
      await score(2).fill("2");
      const before = await review(taskId);
      await teacher.client.mutation(api.courseQuizzes.saveReview, {
        taskId,
        studentId: fixture.users[1].id,
        expectedVersion: before.version,
        expectedSubmissionRevision: before.submissionRevision,
        expectedGrading: before.grading,
        operationId: randomBytes(16).toString("hex"),
        scores: before.questions
          .filter((q) => q.kind === "text")
          .map((q) => ({ questionId: q._id, points: null })),
      });
      await expect(
        panel().getByRole("button", {
          name: "Conservar mi borrador",
          exact: true,
        }),
      ).toBeVisible();
      await expect(score(2)).toHaveValue("2");
      await expect(save()).toBeDisabled();
      await panel()
        .getByRole("button", { name: "Conservar mi borrador", exact: true })
        .click();
      await score(3).fill("4");
      await saveCurrent(taskId);
      await expect(publish()).toBeEnabled();
      await capture(teacher.page, "review-desktop");
      await panel().getByRole("button", { name: "Close", exact: true }).click();
      await teacher.page.setViewportSize({ width: 390, height: 844 });
      await teacher.page
        .getByRole("button", { name: "Revisar", exact: true })
        .click();
      await expect(publish()).toBeEnabled();
      await capture(teacher.page, "review-mobile");
    },
  );
  await check(
    "pending review changes survive cancelling close on desktop and mobile even when browser storage fails",
    async () => {
      const originalSetItem = await teacher.page.evaluateHandle(
        () => Storage.prototype.setItem,
      );
      for (const [name, width, height] of [
        ["desktop", 1440, 1000],
        ["mobile", 390, 844],
      ]) {
        await teacher.page.setViewportSize({ width, height });
        await teacher.page.evaluate(() => {
          Storage.prototype.setItem = function () {
            throw new Error("Audit: storage unavailable");
          };
        });
        await score(2).fill("1");
        await panel()
          .getByRole("button", { name: "Close", exact: true })
          .click();
        const confirmation = teacher.page.getByRole("alertdialog");
        await expect(confirmation).toBeVisible();
        await capture(teacher.page, `review-pending-${name}`);
        await confirmation
          .getByRole("button", { name: "Seguir editando", exact: true })
          .click();
        await expect(score(2)).toHaveValue("1");
        await score(2).fill("2");
      }
      await teacher.page.evaluate((setItem) => {
        Storage.prototype.setItem = setItem;
      }, originalSetItem);
      await originalSetItem.dispose();
    },
  );
  await check(
    "individual confirmation keeps grades and comments private until closing",
    async () => {
      await publish().click();
      await expect(publish()).toBeDisabled();
      await expect
        .poll(
          async () =>
            (await preparedGradeFor(teacher, student, taskId)).published
              ?.points,
        )
        .toBe(8);
      const history = await teacher.client.query(api.courseTaskGrades.history, {
        taskId,
        studentId: fixture.users[1].id,
        paginationOpts: { numItems: 10, cursor: null },
      });
      assert.equal(history.page.length, 1);
      await open(student.page, taskId);
      await expect(
        student.page.getByText("80 / 100", { exact: true }),
      ).toHaveCount(0);
      await expect(
        student.page.getByRole("region", {
          name: "Desglose y respuestas correctas",
          exact: true,
        }),
      ).toHaveCount(0);
      await assert.rejects(
        student.client.query(api.courseQuizzes.getReview, { taskId }),
        /QUIZ_REVIEW_LOCKED/,
      );
      const generic = await student.client.query(api.courseTaskGrades.get, {
        taskId,
      });
      assert.ok(!JSON.stringify(generic).includes("quizScores"));
    },
  );
  await check(
    "global closure reactively releases the published breakdown and keys",
    async () => {
      const dueAt = Date.now() + 5_000;
      await teacher.client.mutation(api.courseTasks.update, { taskId, dueAt });
      const results = student.page.getByRole("region", {
        name: "Desglose y respuestas correctas",
        exact: true,
      });
      await expect(results).toBeVisible({ timeout: 20_000 });
      await expect(
        student.page.getByText("80 / 100", { exact: true }),
      ).toBeVisible();
      await expect(
        results.getByText("Respuesta correcta", { exact: true }),
      ).toBeVisible();
      await expect(
        results.getByText("Puntaje: 2 / 4", { exact: true }),
      ).toBeVisible();
      await results.scrollIntoViewIfNeeded();
      await capture(student.page, "results-desktop");
      await student.page.setViewportSize({ width: 390, height: 844 });
      await results.scrollIntoViewIfNeeded();
      await capture(student.page, "results-mobile");
      assert.ok(
        await student.page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      );
    },
  );
  await check(
    "bulk publication reuses the existing table and publishes a complete quiz draft",
    async () => {
      await panel().getByRole("button", { name: "Close", exact: true }).click();
      await teacher.page.setViewportSize({ width: 1440, height: 1000 });
      const bulkId = await createSubmitted("Quiz publicación masiva");
      const data = await review(bulkId);
      await teacher.client.mutation(api.courseQuizzes.saveReview, {
        taskId: bulkId,
        studentId: fixture.users[1].id,
        expectedVersion: data.version,
        expectedSubmissionRevision: data.submissionRevision,
        expectedGrading: data.grading,
        operationId: randomBytes(16).toString("hex"),
        scores: data.questions
          .filter((q) => q.kind === "text")
          .map((q) => ({ questionId: q._id, points: 4 })),
      });
      await open(teacher.page, bulkId);
      await teacher.page
        .getByRole("button", { name: "Publicar todas al cierre", exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await preparedGradeFor(teacher, student, bulkId)).published
              ?.points,
        )
        .toBe(10);
    },
  );
  await check(
    "a text-only quiz is answered in the platform and requires teacher publication",
    async () => {
      const prompt = "Explica con tus palabras cómo comprobaste la suma.";
      const openId = await teacher.client.mutation(api.courseQuizzes.create, {
        classId: fixture.classId,
        title: `Quiz revisión abierta ${Date.now()}`,
        durationMinutes: 10,
        dueAt: Date.now() + 1_200_000,
        questions: [{ kind: "text", prompt, maxPoints: 4 }],
      });
      tasks.push(openId);
      await open(student.page, openId);
      await student.page
        .getByRole("button", { name: "Iniciar quiz", exact: true })
        .click();
      await student.page
        .getByLabel(prompt, { exact: true })
        .fill("Comprobé la suma restando una unidad del total.");
      await student.page
        .getByRole("button", { name: "Entregar quiz", exact: true })
        .click();
      await student.page
        .getByRole("button", { name: "Confirmar entrega", exact: true })
        .click();
      await expect(
        student.page.getByText("Quiz entregado", { exact: true }),
      ).toBeVisible();
      assert.equal(
        (
          await student.client.query(api.courseTaskGrades.get, {
            taskId: openId,
          })
        ).published,
        null,
      );
      await open(teacher.page, openId);
      await teacher.page
        .getByRole("button", { name: "Revisar", exact: true })
        .click();
      await score(1).fill("3");
      await expect(publish()).toBeEnabled();
      const before = await review(openId);
      await publish().click();
      await expect
        .poll(
          async () =>
            (await preparedGradeFor(teacher, student, openId)).published
              ?.points,
        )
        .toBe(3);
      assert.equal(before.version, 0);
      await expect(
        student.page.getByText("75 / 100", { exact: true }),
      ).toHaveCount(0);
      await expect(
        panel().getByText("Programada para el cierre", { exact: true }),
      ).toBeVisible();
      await teacher.client.mutation(api.courseTasks.update, {
        taskId: openId,
        dueAt: Date.now() + 3000,
      });
      await expect(
        student.page.getByText("75 / 100", { exact: true }),
      ).toBeVisible({ timeout: 20000 });
      await expect(
        panel().getByRole("button", {
          name: "Publicar calificación",
          exact: true,
        }),
      ).toBeVisible();
      await score(1).fill("4");
      await publish().click();
      await expect(
        student.page.getByText("100 / 100", { exact: true }),
      ).toBeVisible();
      const history = await teacher.client.query(api.courseTaskGrades.history, {
        taskId: openId,
        studentId: fixture.users[1].id,
        paginationOpts: { cursor: null, numItems: 10 },
      });
      assert.equal(history.page.length, 2);
      await capture(teacher.page, "review-after-close");
    },
  );
}

function auditPdf(text) {
  const stream = `BT /F1 18 Tf 50 740 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(body);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 6\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}

async function auditFileAssignments() {
  const teacher = await session(fixture.users[0]);
  const student = await session(fixture.users[1]);
  const title = `Tarea PDF de regresión ${Date.now()}`;
  let taskId;
  let initialFile;
  const submission = () =>
    student.client.query(api.courseTaskSubmissions.get, { taskId });
  await check(
    "legacy graded assignments still publish and accept a PDF through the student upload UI",
    async () => {
      await chooseActivity(teacher.page, "Nueva tarea");
      const dialog = teacher.page.getByRole("dialog", { name: "Nueva tarea" });
      await dialog.getByLabel("Título", { exact: false }).fill(title);
      await dialog
        .getByRole("checkbox", {
          name: "Calificar esta actividad",
          exact: true,
        })
        .check();
      await dialog.getByLabel("Puntos máximos", { exact: true }).fill("20");
      await dialog
        .getByRole("button", { name: "Publicar tarea", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      taskId = new URL(teacher.page.url()).searchParams.get("task");
      assert.ok(taskId);
      tasks.push(taskId);
      const task = await teacher.client.query(api.courseTasks.get, { taskId });
      assert.equal(task.kind, undefined);
      assert.equal(task.grading.maxPoints, 20);
      await student.page.goto(`${courseUrl}?task=${taskId}`);
      await student.page.locator('input[type="file"]').setInputFiles({
        name: "entrega-original.pdf",
        mimeType: "application/pdf",
        buffer: auditPdf("Original assignment submission"),
      });
      await student.page
        .getByRole("button", { name: "Entregar tarea", exact: true })
        .click();
      await expect
        .poll(async () => (await submission()).submissionRevision)
        .toBe(1);
      const result = await submission();
      assert.equal(result.files.length, 1);
      assert.equal(result.files[0].contentType, "application/pdf");
      initialFile = result.files[0];
    },
  );
  await check(
    "legacy PDF downloads preserve the submitted binary",
    async () => {
      const [download] = await Promise.all([
        student.page.waitForEvent("download"),
        student.page
          .getByRole("button", {
            name: "Descargar archivo: entrega-original.pdf",
            exact: true,
          })
          .click(),
      ]).catch(async (error) => {
        await writeFile(
          `${output}/file-download-failure.txt`,
          await student.page.locator("body").innerText(),
        );
        await student.page.screenshot({
          path: `${output}/file-download-failure.png`,
        });
        throw error;
      });
      assert.equal(download.suggestedFilename(), "entrega-original.pdf");
      const chunks = [];
      for await (const chunk of await download.createReadStream())
        chunks.push(chunk);
      assert.deepEqual(
        Buffer.concat(chunks),
        auditPdf("Original assignment submission"),
      );
    },
  );
  await check(
    "legacy feedback and institutional grading publish without quiz-only fields",
    async () => {
      await teacher.page
        .getByRole("button", { name: "Revisar", exact: true })
        .click();
      const panel = teacher.page.getByRole("dialog", { name: /Quiz Audit/ });
      await panel
        .getByLabel("Comentario para el estudiante", { exact: true })
        .fill("Comentario de regresión para la primera entrega.");
      await panel
        .getByRole("button", { name: "Enviar comentario", exact: true })
        .click();
      await expect
        .poll(async () => (await submission()).feedback?.text)
        .toBe("Comentario de regresión para la primera entrega.");
      await panel.getByRole("spinbutton", { name: /Nota \(sobre/ }).fill("80");
      const publish = panel.getByRole("button", {
        name: "Publicar calificación",
        exact: true,
      });
      await expect(publish).toBeEnabled({ timeout: 15_000 });
      await publish.click();
      await expect
        .poll(
          async () =>
            (await student.client.query(api.courseTaskGrades.get, { taskId }))
              .published?.institutionalPoints,
        )
        .toBe(80);
      const grade = await student.client.query(api.courseTaskGrades.get, {
        taskId,
      });
      assert.equal(grade.published.points, 16);
      assert.ok(!JSON.stringify(grade).includes("quizScores"));
    },
  );
  await check(
    "the existing teacher PDF editor renders an uploaded document",
    async () => {
      await teacher.page
        .getByRole("button", {
          name: "Calificar PDF: entrega-original.pdf",
          exact: true,
        })
        .click();
      const pdf = teacher.page.getByRole("dialog", {
        name: "entrega-original.pdf",
        exact: true,
      });
      await expect
        .poll(
          () =>
            pdf
              .locator("img")
              .evaluateAll((images) =>
                images.some(
                  (image) =>
                    image.complete &&
                    image.naturalWidth > 300 &&
                    image.naturalHeight > 300,
                ),
              ),
          { timeout: 60_000 },
        )
        .toBe(true);
      await expect(pdf.getByText("Cargando PDF…", { exact: true })).toHaveCount(
        0,
      );
      await pdf.screenshot({ path: `${output}/legacy-pdf-editor.png` });
      await expect(
        teacher.page.getByRole("button", {
          name: "Volver a la entrega",
          exact: true,
        }),
      ).toBeEnabled();
      await teacher.page
        .getByRole("button", { name: "Volver a la entrega", exact: true })
        .click();
    },
  );
  await check(
    "resubmission replaces the PDF and clears revision-bound feedback while preserving the published grade and history",
    async () => {
      await student.page
        .getByRole("button", { name: "Editar entrega", exact: true })
        .click();
      const dialog = student.page.getByRole("dialog", {
        name: "Editar entrega",
        exact: true,
      });
      await dialog.locator('input[type="file"]').setInputFiles({
        name: "segunda-entrega.pdf",
        mimeType: "application/pdf",
        buffer: auditPdf("Second assignment submission"),
      });
      await dialog
        .getByRole("button", { name: "Reemplazar entrega", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect
        .poll(async () => (await submission()).submissionRevision)
        .toBe(2);
      const result = await submission();
      assert.equal(result.files.length, 1);
      assert.notEqual(result.files[0].id, initialFile.id);
      assert.equal(result.feedback, undefined);
      const grade = await student.client.query(api.courseTaskGrades.get, {
        taskId,
      });
      assert.equal(grade.published.institutionalPoints, 80);
      assert.equal(grade.needsReview, true);
      const history = await teacher.client.query(api.courseTaskGrades.history, {
        taskId,
        studentId: fixture.users[1].id,
        paginationOpts: { cursor: null, numItems: 10 },
      });
      assert.equal(history.page.length, 1);
      await expect(
        student.page.getByText(
          "La nota publicada corresponde a una entrega anterior. La nueva entrega necesita revisión.",
          { exact: true },
        ),
      ).toBeVisible();
    },
  );
}

async function auditMultipleChoice() {
  const teacher = await session(fixture.users[0]);
  const student = await session(fixture.users[1]);
  let taskId;
  let definition;
  const screenshot = async (page, name) => {
    await page.addStyleTag({
      content: "nextjs-portal{display:none!important}",
    });
    await page.screenshot({
      path: `${output}/multiple-${name}.png`,
    });
  };
  const open = async (page, id) => {
    await page.goto(`${courseUrl}?task=${id}`);
    await expect(
      page.getByRole("region", { name: "Responder quiz", exact: true }),
    ).toBeVisible();
  };
  const begin = async (page) => {
    await page
      .getByRole("button", { name: "Iniciar quiz", exact: true })
      .click();
    await expect(
      page.getByRole("radio", { name: "Dos", exact: true }),
    ).toBeEnabled();
  };
  const submit = async (id, points) => {
    await student.page
      .getByRole("button", { name: "Entregar quiz", exact: true })
      .click();
    await student.page
      .getByRole("button", { name: "Confirmar entrega", exact: true })
      .click();
    await expect(
      student.page.getByText("Quiz entregado", { exact: true }),
    ).toBeVisible();
    const grade = await preparedGradeFor(teacher, student, id);
    assert.equal(grade.published.points, points);
    assert.equal(grade.published.source, "automatic");
    assert.equal(grade.published.quizScores, undefined);
    await assert.rejects(
      student.client.query(api.courseQuizzes.getReview, { taskId: id }),
      /QUIZ_REVIEW_LOCKED/,
    );
  };
  const fillMultipleQuiz = async (page) => {
    const dialog = await fillQuiz(page, `Selección múltiple ${Date.now()}`);
    await dialog
      .getByRole("button", { name: "Eliminar pregunta 2", exact: true })
      .click();
    await chooseQuestion(page, "Selección múltiple");
    await dialog
      .getByLabel("Enunciado", { exact: false })
      .nth(1)
      .fill("¿Cuáles son animales domésticos?");
    await dialog
      .getByLabel("Peso de la pregunta", { exact: false })
      .nth(1)
      .fill("2");
    await dialog
      .getByRole("button", { name: "Añadir opción", exact: true })
      .nth(1)
      .click();
    await dialog
      .getByRole("button", { name: "Añadir opción", exact: true })
      .nth(1)
      .click();
    for (const [index, label] of ["Gato", "León", "Perro", "Tigre"].entries())
      await dialog
        .getByLabel(`Opción ${index + 1} de pregunta 2`, { exact: true })
        .fill(label);
    await dialog
      .getByRole("checkbox", {
        name: "Marcar opción 1 como correcta en pregunta 2",
        exact: true,
      })
      .check();
    await dialog
      .getByRole("checkbox", {
        name: "Marcar opción 3 como correcta en pregunta 2",
        exact: true,
      })
      .check();
    return dialog;
  };
  await check(
    "teacher creates single and multiple choice questions with two correct selections",
    async () => {
      const dialog = await fillMultipleQuiz(teacher.page);
      await screenshot(teacher.page, "editor-desktop");
      const mobileTeacher = await teacher.context.newPage();
      await mobileTeacher.setViewportSize({ width: 390, height: 844 });
      await mobileTeacher.goto(courseUrl);
      await mobileTeacher.getByRole("tab", { name: /^Tareas/ }).click();
      await fillMultipleQuiz(mobileTeacher);
      await screenshot(mobileTeacher, "editor-mobile");
      await mobileTeacher.close();
      await dialog
        .getByRole("button", { name: "Publicar quiz", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      taskId = new URL(teacher.page.url()).searchParams.get("task");
      assert.ok(taskId);
      tasks.push(taskId);
      definition = await teacher.client.query(api.courseQuizzes.getQuestions, {
        taskId,
      });
      assert.deepEqual(definition[1].correctOptionIds, [
        definition[1].options[0].id,
        definition[1].options[2].id,
      ]);
    },
  );
  await check(
    "one correct selection receives no partial credit and pending selections survive reload",
    async () => {
      await open(student.page, taskId);
      await begin(student.page);
      await student.page
        .getByRole("radio", { name: "Dos", exact: true })
        .check();
      await showQuizQuestion(student.page, 2);
      await student.page
        .getByRole("checkbox", { name: "Gato", exact: true })
        .check();
      await expect(
        student.page.getByText("Todas las respuestas están guardadas.", {
          exact: true,
        }),
      ).toBeVisible();
      await student.page.reload();
      await expect(
        student.page.getByRole("checkbox", { name: "Gato", exact: true }),
      ).toBeChecked();
      await expect(
        student.page.getByRole("checkbox", { name: "Perro", exact: true }),
      ).not.toBeChecked();
      await submit(taskId, 1);
    },
  );
  let fullId;
  await check(
    "multiple selection earns full credit in either order and is usable on mobile",
    async () => {
      fullId = await teacher.client.mutation(api.courseQuizzes.create, {
        classId: fixture.classId,
        title: `Selección completa ${Date.now()}`,
        durationMinutes: 10,
        dueAt: Date.now() + 1_200_000,
        questions: definition.map(({ _id, order, ...question }) => question),
      });
      tasks.push(fullId);
      await open(student.page, fullId);
      await begin(student.page);
      await student.page
        .getByRole("radio", { name: "Dos", exact: true })
        .check();
      await showQuizQuestion(student.page, 2);
      await student.page
        .getByRole("checkbox", { name: "Perro", exact: true })
        .check();
      const cat = student.page.getByRole("checkbox", {
        name: "Gato",
        exact: true,
      });
      await cat.focus();
      await student.page.keyboard.press("Space");
      await expect(cat).toBeChecked();
      await expect(
        student.page.getByText("Todas las respuestas están guardadas.", {
          exact: true,
        }),
      ).toBeVisible();
      await screenshot(student.page, "student-desktop");
      await student.page.setViewportSize({ width: 390, height: 844 });
      await student.page.reload();
      await expect(cat).toBeChecked();
      await expect(
        student.page.getByRole("checkbox", { name: "Perro", exact: true }),
      ).toBeChecked();
      await student.page
        .locator("fieldset")
        .filter({ has: cat })
        .scrollIntoViewIfNeeded();
      await screenshot(student.page, "student-mobile");
      await submit(fullId, 3);
    },
  );
  await check(
    "global closing releases every correct multiple choice answer and preserves automatic review",
    async () => {
      await teacher.client.mutation(api.courseTasks.update, {
        taskId: fullId,
        dueAt: Date.now() + 3_000,
      });
      const results = student.page.getByRole("region", {
        name: "Desglose y respuestas correctas",
        exact: true,
      });
      await expect(results).toBeVisible();
      await expect(
        results.getByText("Respuesta correcta", { exact: true }),
      ).toHaveCount(3);
      await expect(
        results.getByText("Tu respuesta", { exact: true }),
      ).toHaveCount(3);
      await screenshot(student.page, "results-mobile");
      await student.page.setViewportSize({ width: 1440, height: 1000 });
      await student.page.reload();
      await expect(results).toBeVisible();
      await expect(
        results.getByText("Respuesta correcta", { exact: true }),
      ).toHaveCount(3);
      await screenshot(student.page, "results-desktop");
      await teacher.page.goto(
        `${courseUrl}?task=${fullId}&student=${fixture.users[1].id}`,
      );
      const review = teacher.page.getByRole("dialog");
      await expect(
        review.getByRole("button", {
          name: "Ver pregunta automática 2",
          exact: true,
        }),
      ).toBeVisible();
      await expect(review.getByRole("spinbutton")).toHaveCount(0);
    },
  );
}

async function auditShuffle() {
  const teacher = await session(fixture.users[0]);
  const student = await session(fixture.users[1]);
  let taskId;
  let questions;
  const checkboxName = "Mostrar las preguntas en orden aleatorio";
  const assertNativeCopy = async (page, locator, blocked) => {
    await locator.evaluate((element) => {
      window.__quizCopyPrevented = null;
      window.addEventListener(
        "copy",
        (event) => {
          window.__quizCopyPrevented = event.defaultPrevented;
        },
        { once: true },
      );
      if (element instanceof HTMLTextAreaElement) {
        element.focus();
        element.select();
      } else {
        if (document.activeElement instanceof HTMLElement)
          document.activeElement.blur();
        const range = document.createRange();
        range.selectNodeContents(element);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
      }
    });
    await page.keyboard.press("ControlOrMeta+C");
    await expect
      .poll(() => page.evaluate(() => window.__quizCopyPrevented))
      .toBe(blocked);
  };

  const capture = async (page, name) => {
    await page.addStyleTag({
      content: "nextjs-portal{display:none!important}",
    });
    await page.screenshot({ path: `${output}/shuffle-${name}.png` });
  };
  const assertOrder = async (page) => {
    const fields = page
      .getByRole("region", { name: "Responder quiz", exact: true })
      .locator("fieldset");
    await expect(fields).toHaveCount(1);
    for (const [index, question] of questions.entries()) {
      await showQuizQuestion(page, index + 1);
      await expect(fields).toContainText(question.prompt);
      await expect(fields.locator("legend")).toContainText(
        `Pregunta ${index + 1}`,
      );
    }
  };
  const showKind = (page, kind) =>
    showQuizQuestion(page, questions.findIndex((q) => q.kind === kind) + 1);
  await check(
    "teacher publishes the optional shuffle setting and retains the original definition",
    async () => {
      const dialog = await fillQuiz(
        teacher.page,
        `Orden aleatorio ${Date.now()}`,
      );
      const checkbox = dialog.getByRole("checkbox", {
        name: checkboxName,
        exact: true,
      });
      await expect(checkbox).not.toBeChecked();
      await checkbox.focus();
      await teacher.page.keyboard.press("Space");
      await expect(checkbox).toBeChecked();
      await dialog
        .getByLabel("Peso de la pregunta", { exact: false })
        .nth(1)
        .fill("2");
      await checkbox.scrollIntoViewIfNeeded();
      await capture(teacher.page, "editor-desktop");
      await dialog
        .getByRole("button", { name: "Publicar quiz", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      taskId = new URL(teacher.page.url()).searchParams.get("task");
      assert.ok(taskId);
      tasks.push(taskId);
      const task = await teacher.client.query(api.courseTasks.get, { taskId });
      assert.equal(task.quiz.shuffleQuestions, true);
      const definition = await teacher.client.query(
        api.courseQuizzes.getQuestions,
        { taskId },
      );
      assert.deepEqual(
        definition.map((q) => q.order),
        [0, 1],
      );
    },
  );
  await check(
    "shuffled questions and saved answers retain their order across reload, another session and mobile",
    async () => {
      await student.page.goto(`${courseUrl}?task=${taskId}`);
      await student.page
        .getByRole("button", { name: "Iniciar quiz", exact: true })
        .click();
      await expect(student.page.getByRole("timer")).not.toHaveText("—");
      questions = await student.client.query(api.courseQuizzes.getQuestions, {
        taskId,
      });
      const stored = query(
        `return (await ctx.db.query("courseTaskRecipients").withIndex("by_taskId_and_studentId",q=>q.eq("taskId",${JSON.stringify(taskId)}).eq("studentId",${JSON.stringify(fixture.users[1].id)})).unique()).quizAttempt.questionOrder;`,
      );
      assert.deepEqual(
        questions.map((q) => q._id),
        stored,
      );
      assert.equal(new Set(stored).size, 2);
      for (const question of questions)
        assert.equal(question.correctOptionId, undefined);
      await assertOrder(student.page);
      await showKind(student.page, "single_choice");
      await student.page
        .getByRole("radio", { name: "Dos", exact: true })
        .check();
      const text = questions.find((q) => q.kind === "text");
      await showKind(student.page, "text");
      await student.page
        .getByLabel(text.prompt, { exact: true })
        .fill("Dos unidades forman dos.");
      await expect(
        student.page.getByText("Todas las respuestas están guardadas.", {
          exact: true,
        }),
      ).toBeVisible();
      await check(
        "student cannot select or copy questions and options while written answers remain editable",
        async () => {
          await showKind(student.page, "single_choice");
          const prompt = student.page.getByText(
            questions.find((q) => q.kind === "single_choice").prompt,
            { exact: true },
          );
          assert.equal(
            await prompt.evaluate(
              (element) => getComputedStyle(element).userSelect,
            ),
            "none",
          );
          await assertNativeCopy(student.page, prompt, true);
          await assertNativeCopy(
            student.page,
            student.page.getByText("Dos", { exact: true }),
            true,
          );
          await showKind(student.page, "text");
          const input = student.page.getByLabel(text.prompt, { exact: true });
          assert.equal(
            await input.evaluate(
              (element) => getComputedStyle(element).userSelect,
            ),
            "text",
          );
          await assertNativeCopy(student.page, input, false);
          await teacher.page
            .getByRole("button", { name: "Vista previa del quiz", exact: true })
            .click();
          const teacherPrompt = teacher.page.getByText(
            questions.find((q) => q.kind === "single_choice").prompt,
            { exact: true },
          );
          await expect(teacherPrompt).toBeVisible();
          await assertNativeCopy(teacher.page, teacherPrompt, false);
        },
      );
      await capture(student.page, "student-desktop");
      const other = await session(fixture.users[1]);
      await other.page.goto(`${courseUrl}?task=${taskId}`);
      await assertOrder(other.page);
      await showKind(other.page, "text");
      await expect(
        other.page.getByLabel(text.prompt, { exact: true }),
      ).toHaveValue("Dos unidades forman dos.");
      await other.context.close();
      await student.page.setViewportSize({ width: 390, height: 844 });
      await student.page.reload();
      await assertOrder(student.page);
      await showKind(student.page, "single_choice");
      await expect(
        student.page.getByRole("radio", { name: "Dos", exact: true }),
      ).toBeEnabled();
      await expect(
        student.page.getByRole("radio", { name: "Dos", exact: true }),
      ).toBeChecked();
      await showKind(student.page, "text");
      await expect(
        student.page.getByLabel(text.prompt, { exact: true }),
      ).toHaveValue("Dos unidades forman dos.");
      await student.page
        .getByRole("region", { name: "Responder quiz", exact: true })
        .scrollIntoViewIfNeeded();
      await capture(student.page, "student-mobile");
    },
  );
  await check(
    "first attempt locks shuffle settings while date edits and manual grading preserve question identity",
    async () => {
      await teacher.page
        .getByRole("button", { name: "Editar quiz", exact: true })
        .click();
      const dialog = teacher.page.getByRole("dialog", {
        name: "Editar quiz",
        exact: true,
      });
      await expect(
        dialog.getByRole("checkbox", { name: checkboxName, exact: true }),
      ).toHaveCount(0);
      await expect(
        dialog.getByText("Aleatorio para cada estudiante", { exact: true }),
      ).toBeVisible();
      await dialog
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      await teacher.client.mutation(api.courseTasks.update, {
        taskId,
        dueAt: Date.now() + 1_200_000,
      });
      assert.deepEqual(
        (
          await student.client.query(api.courseQuizzes.getQuestions, { taskId })
        ).map((q) => q._id),
        questions.map((q) => q._id),
      );
      await student.page
        .getByRole("button", { name: "Entregar quiz", exact: true })
        .click();
      await student.page
        .getByRole("button", { name: "Confirmar entrega", exact: true })
        .click();
      await expect(
        student.page.getByText("Quiz entregado", { exact: true }),
      ).toBeVisible();
      await teacher.page.goto(
        `${courseUrl}?task=${taskId}&student=${fixture.users[1].id}`,
      );
      const review = teacher.page.getByRole("dialog");
      const textIndex = questions.findIndex((q) => q.kind === "text");
      await review
        .getByRole("spinbutton", {
          name: `Puntaje de la pregunta ${textIndex + 1} (sobre 2)`,
          exact: true,
        })
        .fill("2");
      await review
        .getByRole("button", { name: "Guardar borrador", exact: true })
        .click();
      const publish = review.getByRole("button", {
        name: "Publicar al cierre",
        exact: true,
      });
      await expect(publish).toBeEnabled();
      await publish.click();
      await expect
        .poll(
          async () =>
            (await preparedGradeFor(teacher, student, taskId)).published
              ?.points,
        )
        .toBe(3);
      const teacherReview = await teacher.client.query(
        api.courseQuizzes.getReview,
        { taskId, studentId: fixture.users[1].id },
      );
      assert.deepEqual(
        teacherReview.questions.map((q) => q._id),
        questions.map((q) => q._id),
      );
      await assert.rejects(
        student.client.query(api.courseQuizzes.getReview, { taskId }),
        /QUIZ_REVIEW_LOCKED/,
      );
    },
  );
  await check(
    "global close releases shuffled results in the same order without changing the published grade",
    async () => {
      await teacher.client.mutation(api.courseTasks.update, {
        taskId,
        dueAt: Date.now() + 3_000,
      });
      const results = student.page.getByRole("region", {
        name: "Desglose y respuestas correctas",
        exact: true,
      });
      await expect(results).toBeVisible();
      const review = await student.client.query(api.courseQuizzes.getReview, {
        taskId,
      });
      assert.deepEqual(
        review.questions.map((q) => q._id),
        questions.map((q) => q._id),
      );
      await expect(
        results.locator(":scope > ol > li > p:first-of-type"),
      ).toHaveText(questions.map((question) => question.prompt));
      assert.equal(
        review.questions.find((q) => q.kind === "single_choice")
          .correctOptionId !== undefined,
        true,
      );
      assert.equal(
        (await student.client.query(api.courseTaskGrades.get, { taskId }))
          .published.points,
        3,
      );
      await results.scrollIntoViewIfNeeded();
      await check(
        "published student results keep copy protection while teacher review stays copyable",
        async () => {
          await assertNativeCopy(
            student.page,
            results.getByText(questions[0].prompt, { exact: true }),
            true,
          );
          await assertNativeCopy(
            student.page,
            results.getByText("Dos", { exact: true }),
            true,
          );
          const teacherReview = teacher.page.getByRole("dialog");
          await assertNativeCopy(
            teacher.page,
            teacherReview.getByText(
              questions.find((q) => q.kind === "text").prompt,
              { exact: true },
            ),
            false,
          );
        },
      );
      await capture(student.page, "results-mobile");
    },
  );
}

async function auditEditor() {
  const teacher = await session(fixture.users[0]);
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    const page = await teacher.context.newPage();
    await page.setViewportSize({ width, height });
    await page.goto(courseUrl);
    await page.getByRole("tab", { name: /^Tareas/ }).click();
    await check(
      `empty quizzes allow choosing any first question type and cannot be published on ${name}`,
      async () => {
        await chooseActivity(page, "Nuevo quiz");
        const dialog = page.getByRole("dialog", {
          name: "Nuevo quiz",
          exact: true,
        });
        const questions = dialog.getByRole("region", {
          name: "Preguntas",
          exact: true,
        });
        const add = questions.getByRole("button", {
          name: "Añadir pregunta",
          exact: true,
        });
        await expect(questions.getByRole("button")).toHaveCount(1);
        await expect(
          dialog.getByLabel("Enunciado", { exact: false }),
        ).toHaveCount(0);
        await expect(
          dialog.getByText("0 preguntas", { exact: true }),
        ).toBeVisible();
        await page.screenshot({
          path: `${output}/empty-${name}.png`,
          animations: "disabled",
        });
        await dialog
          .getByLabel("Título", { exact: false })
          .fill("Quiz sin preguntas");
        await dialog.getByLabel("Fecha y hora de cierre").fill(deadline);
        await dialog
          .getByRole("button", { name: "Publicar quiz", exact: true })
          .click();
        await expect(dialog.getByRole("alert")).toHaveText(
          "Añade al menos una pregunta para guardar el quiz.",
        );
        await dialog
          .getByRole("button", { name: "Revisar campo", exact: true })
          .click();
        await expect(add).toBeFocused();
        for (const type of [
          "Respuesta abierta",
          "Selección múltiple",
          "Selección única",
        ]) {
          await chooseQuestion(page, type);
          await expect(
            questions.getByText(type, { exact: true }),
          ).toBeVisible();
          await expect(
            dialog.getByLabel("Enunciado", { exact: false }),
          ).toHaveCount(1);
          await expect(
            dialog.getByLabel("Enunciado", { exact: false }),
          ).toBeFocused();
          const remove = questions.getByRole("button", {
            name: "Eliminar pregunta 1",
            exact: true,
          });
          await expect(remove).toBeEnabled();
          await remove.click();
          await expect(questions.getByRole("button")).toHaveCount(1);
          await expect(add).toBeFocused();
        }
        await dialog
          .getByRole("button", { name: "Cancelar", exact: true })
          .click();
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: "Salir sin guardar", exact: true })
          .click();
        await expect(dialog).toHaveCount(0);
      },
    );
    await check(
      `quiz editor hierarchy, copy, focus and responsive layout on ${name}`,
      async () => {
        const dialog = await fillQuiz(page, `Auditoría visual ${name}`);
        const help = dialog.getByRole("button", {
          name: "Cómo funciona tu quiz",
          exact: true,
        });
        await expect(help).toHaveAttribute("aria-expanded", "false");
        assert.deepEqual(
          await help.evaluate((element) => {
            const style = getComputedStyle(element);
            return [style.paddingLeft, style.paddingRight];
          }),
          ["0px", "0px"],
        );
        assert.equal(
          (await help.boundingBox()).x,
          (
            await dialog
              .getByRole("heading", {
                name: "Información general",
                exact: true,
              })
              .boundingBox()
          ).x,
        );
        assert.equal(
          await help.evaluate(
            (element) =>
              !!(
                element.compareDocumentPosition(
                  document.getElementById("task-title"),
                ) & Node.DOCUMENT_POSITION_FOLLOWING
              ),
          ),
          true,
        );
        await help.click();
        await expect(
          dialog.getByText(
            "Las notas confirmadas y las respuestas correctas se muestran al cierre para todos. Si terminas una revisión después, publicas la nota en ese momento.",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(help.locator("..").locator("li")).toHaveCount(3);
        await page.screenshot({
          path: `${output}/help-${name}.png`,
          animations: "disabled",
        });
        await help.click();
        await expect(help).toHaveAttribute("aria-expanded", "false");
        await dialog
          .getByLabel("Enunciado", { exact: false })
          .nth(1)
          .fill("Explica cómo llegaste a tu respuesta.");
        await expect(
          dialog.getByLabel("Instrucciones para estudiantes (opcional)"),
        ).toHaveCount(1);
        const sections = await dialog
          .locator("form section")
          .evaluateAll((elements) =>
            elements.map((element) => element.getAttribute("aria-label")),
          );
        assert.deepEqual(sections, [
          "Información general",
          "Preguntas",
          "Tiempo y disponibilidad",
        ]);
        await expect(
          dialog.getByText("Puntaje total:", { exact: false }),
        ).toHaveCount(0);
        await expect(
          dialog.getByText("2 preguntas", { exact: true }),
        ).toBeVisible();
        await expect(
          dialog.getByText(
            "Sin fecha de inicio, el quiz estará disponible cuando lo publiques.",
          ),
        ).toHaveCount(1);
        await expect(
          dialog
            .locator('[data-slot="dialog-footer"]')
            .getByRole("button", { name: "Cancelar", exact: true }),
        ).toBeVisible();
        await expect(
          dialog.getByRole("button", { name: "Publicar quiz", exact: true }),
        ).toBeVisible();
        await captureEditor(page, name);
        await dialog.getByLabel("Duración (minutos)").scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `${output}/timing-${name}.png`,
          animations: "disabled",
        });
        const footerButtons = await dialog
          .locator('[data-slot="dialog-footer"] button')
          .evaluateAll((elements) =>
            elements.map((element) => element.getBoundingClientRect().y),
          );
        assert.equal(footerButtons[0], footerButtons[1]);
        await dialog
          .getByRole("button", {
            name: "Expandir o contraer pregunta 1",
            exact: true,
          })
          .click();
        await expect(
          dialog.getByLabel("Enunciado", { exact: false }),
        ).toHaveCount(1);
        await expect(
          dialog.getByText("¿Cuánto es 1 + 1?", { exact: true }),
        ).toBeVisible();
        await dialog
          .getByRole("button", {
            name: "Expandir o contraer pregunta 1",
            exact: true,
          })
          .click();
        await expect(
          dialog.getByLabel("Opción 2 de pregunta 1", { exact: true }),
        ).toHaveValue("Dos");
        await expect(
          dialog.getByRole("radio", {
            name: "Marcar opción 2 como correcta en pregunta 1",
            exact: true,
          }),
        ).toBeChecked();
        const add = dialog.getByRole("button", {
          name: "Añadir pregunta",
          exact: true,
        });
        await add.focus();
        await page.keyboard.press("Enter");
        await page
          .getByRole("menuitem", { name: "Selección múltiple", exact: true })
          .click();
        await expect(
          dialog.getByLabel("Enunciado", { exact: false }).nth(2),
        ).toBeFocused();
        await dialog
          .getByLabel("Enunciado", { exact: false })
          .nth(2)
          .fill("¿Cuáles son animales domésticos?");
        for (const [index, answer] of ["Gato", "Perro"].entries())
          await dialog
            .getByLabel(`Opción ${index + 1} de pregunta 3`, { exact: true })
            .fill(answer);
        await dialog
          .getByRole("button", {
            name: "Expandir o contraer pregunta 3",
            exact: true,
          })
          .click();
        await dialog
          .getByRole("button", { name: "Publicar quiz", exact: true })
          .click();
        await expect(dialog.getByRole("alert")).toHaveText(
          "Pregunta 3: Marca al menos una respuesta correcta.",
        );
        await expect(
          dialog.getByRole("button", {
            name: "Expandir o contraer pregunta 3",
            exact: true,
          }),
        ).toHaveAttribute("aria-expanded", "true");
        await dialog
          .getByRole("button", { name: "Revisar campo", exact: true })
          .click();
        await expect(
          dialog.locator('[role="group"][aria-invalid="true"]'),
        ).toBeFocused();
        await page.screenshot({
          path: `${output}/error-${name}.png`,
          animations: "disabled",
        });
        const correct = dialog.getByRole("checkbox", {
          name: "Marcar opción 1 como correcta en pregunta 3",
          exact: true,
        });
        const label = dialog.locator(
          `label[for="${await correct.getAttribute("id")}"]`,
        );
        await label.click({ position: { x: 3, y: 3 } });
        await expect(correct).toBeChecked();
        await label.click({ position: { x: 3, y: 3 } });
        await expect(correct).not.toBeChecked();
        // Leaving a draft exercises the existing discard protection without publishing anything.
        await dialog
          .getByRole("button", { name: "Cancelar", exact: true })
          .click();
        await page
          .getByRole("alertdialog")
          .getByRole("button", { name: "Salir sin guardar", exact: true })
          .click();
        await expect(dialog).toHaveCount(0);
      },
    );
    await page.close();
  }
  await check(
    "assignment field labels and controls retain their existing presentation",
    async () => {
      await chooseActivity(teacher.page, "Nueva tarea");
      const dialog = teacher.page.getByRole("dialog", {
        name: "Nueva tarea",
        exact: true,
      });
      await expect(dialog.getByLabel("Descripción (opcional)")).toHaveCount(1);
      await expect(
        dialog.getByLabel("Instrucciones para estudiantes (opcional)"),
      ).toHaveCount(0);
      await expect(
        dialog.getByRole("button", { name: "Añadir pregunta", exact: true }),
      ).toHaveCount(0);
      await expect(
        dialog.getByRole("button", { name: "Publicar tarea", exact: true }),
      ).toBeEnabled();
      await dialog
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
    },
  );
}

async function auditPresentation() {
  const teacher = await session(fixture.users[0]);
  const student = await session(fixture.users[1]);
  const existing = query(
    `return await ctx.db.query("courseTasks").withIndex("by_classId_and_releasedAt",q=>q.eq("classId",${JSON.stringify(fixture.classId)})).order("desc").take(100);`,
  );
  const quiz = existing.find((task) => task.kind === "quiz");
  const file = existing.find(
    (task) => task.kind !== "quiz" && task.releasedAt !== undefined,
  );
  assert.ok(quiz && file);
  const capture = async (page, name) => {
    await page.addStyleTag({
      content: "nextjs-portal{display:none!important}",
    });
    await page.screenshot({
      path: `${output}/activity-${name}.png`,
      animations: "disabled",
    });
  };
  await check(
    "one activity menu opens both editors and preserves keyboard focus",
    async () => {
      const trigger = teacher.page.getByRole("button", {
        name: "Nueva actividad",
        exact: true,
      });
      await trigger.focus();
      await teacher.page.keyboard.press("Enter");
      await expect(
        teacher.page.getByRole("menuitem", {
          name: "Nueva tarea",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        teacher.page.getByRole("menuitem", { name: "Nuevo quiz", exact: true }),
      ).toBeVisible();
      await capture(teacher.page, "menu-desktop");
      await teacher.page
        .getByRole("menuitem", { name: "Nueva tarea", exact: true })
        .click();
      for (const label of ["Nueva tarea", "Nuevo quiz"]) {
        if (label === "Nuevo quiz") await chooseActivity(teacher.page, label);
        const dialog = teacher.page.getByRole("dialog", {
          name: label,
          exact: true,
        });
        await expect(dialog).toBeVisible();
        await expect
          .poll(() =>
            dialog.evaluate((element) =>
              element.contains(document.activeElement),
            ),
          )
          .toBe(true);
        await dialog
          .getByRole("button", { name: "Cancelar", exact: true })
          .click();
      }
    },
  );
  await check(
    "quiz and assignment cards share geometry and visual styles",
    async () => {
      await teacher.page.goto(`${courseUrl}?task=${quiz._id}`);
      const cards = teacher.page.locator("button[aria-pressed]");
      await expect(cards.first()).toBeVisible();
      const rows = await cards.evaluateAll((elements) =>
        elements.map((element) => {
          const style = getComputedStyle(element);
          return {
            height: element.getBoundingClientRect().height,
            padding: style.padding,
            background: style.backgroundColor,
            radius: style.borderRadius,
            font: style.font,
            icon: element.querySelector("img")?.getAttribute("src"),
          };
        }),
      );
      assert.ok(rows.some((row) => row.icon?.includes("quizzes-icon.svg")));
      assert.ok(rows.some((row) => row.icon?.includes("assigments-icon.svg")));
      for (const row of rows)
        for (const key of ["height", "padding", "background", "radius", "font"])
          assert.equal(row[key], rows[0][key]);
    },
  );
  await check(
    "shared headers preserve their data and layout on desktop and mobile",
    async () => {
      for (const [name, width, height] of [
        ["desktop", 1440, 1000],
        ["mobile", 390, 844],
      ]) {
        const page = await teacher.context.newPage();
        await page.setViewportSize({ width, height });
        let previous;
        for (const [kind, task] of [
          ["assignment", file],
          ["quiz", quiz],
        ]) {
          await page.goto(`${courseUrl}?task=${task._id}`);
          const title = page.getByRole("heading", {
            name: task.title,
            exact: true,
          });
          await expect(title).toBeVisible();
          const header = title.locator("xpath=ancestor::header[1]");
          if (kind === "quiz") {
            const questions = await teacher.client.query(
              api.courseQuizzes.getQuestions,
              { taskId: task._id },
            );
            await expect(
              page
                .getByText("Número de preguntas", { exact: true })
                .locator("..")
                .locator("dd"),
            ).toHaveText(String(questions.length));
            const preview = page.getByRole("button", {
              name: "Vista previa del quiz",
              exact: true,
            });
            await preview.click();
            await expect(
              page.getByText(questions[0].prompt, { exact: true }),
            ).toBeVisible();
            const appearance = await preview.evaluate((element) => ({
              paddingLeft: getComputedStyle(element).paddingLeft,
              paddingRight: getComputedStyle(element).paddingRight,
              borderTop: getComputedStyle(
                element.closest('[data-slot="collapsible"]'),
              ).borderTopWidth,
            }));
            assert.deepEqual(appearance, {
              paddingLeft: "0px",
              paddingRight: "0px",
              borderTop: "0px",
            });
            assert.equal(
              (await preview.boundingBox()).x,
              (
                await page
                  .getByRole("heading", {
                    name: "Fechas y disponibilidad",
                    exact: true,
                  })
                  .boundingBox()
              ).x,
            );
            await preview.scrollIntoViewIfNeeded();
            await capture(page, `preview-${name}`);
            await preview.click();
          }
          const style = await header.evaluate((element) => {
            const image = element.querySelector("img"),
              text = element.querySelector("h3");
            return {
              layout: getComputedStyle(element).display,
              gap: getComputedStyle(element).gap,
              iconWidth: image.getBoundingClientRect().width,
              iconHeight: image.getBoundingClientRect().height,
              titleSize: getComputedStyle(text).fontSize,
              titleWeight: getComputedStyle(text).fontWeight,
            };
          });
          if (previous) assert.deepEqual(style, previous);
          previous = style;
          await expect(
            header.getByRole("button", {
              name: kind === "quiz" ? "Editar quiz" : "Editar tarea",
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            header.getByRole("button", {
              name: kind === "quiz" ? "Eliminar quiz" : "Eliminar tarea",
              exact: true,
            }),
          ).toBeVisible();
          if (kind === "quiz")
            await expect(
              header.locator('img[src*="quizzes-icon.svg"]'),
            ).toBeVisible();
          await expect(
            page.locator('button[aria-pressed="true"]'),
          ).toBeInViewport();
          await header.evaluate((element) => {
            element.scrollIntoView({ block: "start" });
            window.scrollBy(0, -80);
          });
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > window.innerWidth,
            ),
            false,
          );
          await capture(page, `${kind}-${name}`);
          const editLabel = kind === "quiz" ? "Editar quiz" : "Editar tarea";
          await header
            .getByRole("button", { name: editLabel, exact: true })
            .click();
          const edit = page.getByRole("dialog", {
            name: editLabel,
            exact: true,
          });
          await expect(edit).toBeVisible();
          await edit
            .getByRole("button", { name: "Cancelar", exact: true })
            .click();
          await header
            .getByRole("button", {
              name: kind === "quiz" ? "Eliminar quiz" : "Eliminar tarea",
              exact: true,
            })
            .click();
          const deletion = page.getByRole("alertdialog");
          await expect(
            deletion.getByRole("heading", {
              name:
                kind === "quiz"
                  ? "¿Eliminar este quiz?"
                  : "¿Eliminar esta tarea?",
              exact: true,
            }),
          ).toBeVisible();
          await deletion
            .getByRole("button", { name: "Cancelar", exact: true })
            .click();
        }
        if (name === "mobile") {
          await page
            .getByRole("button", { name: "Nueva actividad", exact: true })
            .click();
          await capture(page, "menu-mobile");
        }
        await page.close();
      }
    },
  );
  await check("students have no creation or management controls", async () => {
    for (const task of [file, quiz]) {
      await student.page.goto(`${courseUrl}?task=${task._id}`);
      await expect(
        student.page.getByRole("heading", { name: task.title, exact: true }),
      ).toBeVisible();
      await expect(
        student.page.getByRole("button", {
          name: "Nueva actividad",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        student.page.getByRole("button", {
          name: /^(Editar|Eliminar) (quiz|tarea)$/,
        }),
      ).toHaveCount(0);
      await expect(
        student.page.getByRole("button", {
          name: "Vista previa del quiz",
          exact: true,
        }),
      ).toHaveCount(0);
    }
  });
}

async function auditEditUi() {
  async function contrastRatios(dialog) {
    return await dialog.evaluate((root) => {
      const context = document.createElement("canvas").getContext("2d");
      function pixel(color, background) {
        context.clearRect(0, 0, 1, 1);
        if (background) {
          context.fillStyle = background;
          context.fillRect(0, 0, 1, 1);
        }
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
      }
      function luminance(rgb) {
        return rgb
          .map((byte) => {
            const value = byte / 255;
            return value <= 0.04045
              ? value / 12.92
              : ((value + 0.055) / 1.055) ** 2.4;
          })
          .reduce(
            (sum, value, index) =>
              sum + value * [0.2126, 0.7152, 0.0722][index],
            0,
          );
      }
      function ratio(foreground, background) {
        const a = luminance(pixel(foreground, background));
        const b = luminance(pixel(background));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      }
      const background = getComputedStyle(root).backgroundColor;
      const description = getComputedStyle(
        root.querySelector('[data-slot="dialog-description"]'),
      );
      const save = getComputedStyle(
        root.querySelector('button[type="submit"]'),
      );
      return {
        secondary: ratio(description.color, background),
        save: ratio(save.color, save.backgroundColor),
      };
    });
  }
  const teacher = await session(fixture.users[0]);
  const student = await session(fixture.users[1]);
  const existing = query(
    `return await ctx.db.query("courseTasks").withIndex("by_classId_and_releasedAt",q=>q.eq("classId",${JSON.stringify(fixture.classId)})).order("desc").take(100);`,
  ).filter((task) => task.kind === "quiz");
  const states = {
    started: existing.find(
      (task) =>
        task.quiz?.firstStartedAt !== undefined &&
        task.quiz?.closedAt === undefined,
    ),
    closed: existing.find(
      (task) =>
        task.quiz?.closedAt !== undefined &&
        task.quiz?.firstStartedAt !== undefined,
    ),
  };
  assert.ok(
    states.started && states.closed,
    "Existing private audit attempts are required",
  );
  for (const state of ["scheduled", "published"]) {
    const taskId = await teacher.client.mutation(api.courseQuizzes.create, {
      classId: fixture.classId,
      title: `Edit UI ${state} ${Date.now()}`,
      ...(state === "scheduled" && { availableAt: Date.now() + 1_200_000 }),
      dueAt: Date.now() + 3_600_000,
      durationMinutes: 10,
      questions: [
        { kind: "text", prompt: "Explain your reasoning", maxPoints: 1 },
        { kind: "text", prompt: "Give an example", maxPoints: 1 },
      ],
    });
    tasks.push(taskId);
    states[state] = await teacher.client.query(api.courseTasks.get, { taskId });
  }
  const observations = [];
  for (const state of ["scheduled", "published", "started", "closed"]) {
    const task = states[state];
    for (const [device, width, height] of [
      ["desktop", 1440, 1000],
      ["tablet", 768, 1024],
      ["mobile", 390, 844],
    ]) {
      await check(
        `edit dialog ${state} on ${device}: hierarchy, readable fixed values, focus and unchanged save`,
        async () => {
          const page = await teacher.context.newPage();
          page.on("pageerror", (error) => errors.push(error.message));
          await page.setViewportSize({ width, height });
          const before = await teacher.client.query(
            api.courseQuizzes.getForEditing,
            { taskId: task._id },
          );
          await page.goto(`${courseUrl}?task=${task._id}`);
          await page
            .getByRole("button", { name: "Editar quiz", exact: true })
            .click();
          const dialog = page.getByRole("dialog", {
            name: "Editar quiz",
            exact: true,
          });
          const title = dialog.getByLabel("Título", { exact: false });
          await expect(title).toBeEnabled();
          await expect(title).toBeFocused();
          const availability = dialog.getByRole("region", {
            name: "Disponibilidad",
            exact: true,
          });
          const attempt = dialog.getByRole("region", {
            name: "Configuración del intento",
            exact: true,
          });
          await expect(availability).toContainText(
            `Zona horaria del curso: ${timeZone}`,
          );
          await expect(
            dialog.getByRole("button", {
              name: "Cómo funciona tu quiz",
              exact: true,
            }),
          ).toHaveCount(0);
          if (state === "scheduled") {
            await expect(
              dialog.getByLabel("Enunciado", { exact: false }).first(),
            ).toBeEnabled();
            await expect(
              dialog.getByText("2 preguntas", { exact: true }),
            ).toBeVisible();
          } else {
            await expect(
              dialog.getByRole("region", { name: "Preguntas", exact: true }),
            ).toHaveCount(0);
            await expect(dialog.getByText(/^[0-9]+ preguntas?$/)).toHaveCount(
              0,
            );
            await expect(
              dialog.getByLabel("Disponible desde", { exact: true }),
            ).toHaveCount(0);
            await expect(
              dialog.getByText(
                "La tarea ya es visible. Su fecha de inicio no se puede cambiar.",
                { exact: true },
              ),
            ).toHaveCount(0);
          }
          if (["started", "closed"].includes(state)) {
            await expect(attempt.getByLabel("Duración (minutos)")).toHaveCount(
              0,
            );
            await expect(attempt.getByRole("checkbox")).toHaveCount(0);
            await expect(attempt.locator("dd")).toHaveCount(2);
            await expect(
              attempt.getByText(
                "Un estudiante ya empezó. La duración y la opción de orden aleatorio ya no se pueden cambiar.",
                { exact: true },
              ),
            ).toHaveCount(1);
          } else {
            await expect(
              attempt.getByLabel("Duración (minutos)"),
            ).toBeEnabled();
            await expect(
              attempt.getByRole("checkbox", {
                name: "Mostrar las preguntas en orden aleatorio",
                exact: true,
              }),
            ).toBeEnabled();
          }
          if (state === "closed") {
            await expect(
              availability.getByLabel("Fecha y hora de cierre"),
            ).toHaveCount(0);
            await expect(availability.locator("dd")).toHaveCount(2);
          } else {
            await expect(
              availability.getByLabel("Fecha y hora de cierre"),
            ).toBeEnabled();
            if (state !== "scheduled")
              await expect(
                availability.getByText(
                  "El cierre se aplica a todos los estudiantes, incluidos quienes están respondiendo. Los intentos entregados no se reabren.",
                  { exact: true },
                ),
              ).toBeVisible();
          }
          const body = dialog.locator('[data-slot="quiz-editor-body"]');
          await page.addStyleTag({
            content: "nextjs-portal{display:none!important}",
          });
          await page.evaluate(() =>
            document.getAnimations().forEach((animation) => animation.finish()),
          );
          await body.evaluate((element) => element.scrollTo(0, 0));
          const generalLeft = (
            await dialog
              .getByRole("heading", {
                name: "Información general",
                exact: true,
              })
              .boundingBox()
          ).x;
          const titleLeft = (await title.boundingBox()).x;
          assert.ok(Math.abs(generalLeft - titleLeft) <= 1);
          assert.ok(
            await dialog.evaluate(
              (element) => element.scrollWidth <= element.clientWidth + 1,
            ),
          );
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          );
          if (device !== "tablet")
            await page.screenshot({
              path: `${output}/${state}-${device}-top.png`,
              animations: "disabled",
            });
          await body.evaluate((element) =>
            element.scrollTo(0, element.scrollHeight),
          );
          const bounds = await dialog.boundingBox();
          const footer = await dialog
            .locator('[data-slot="dialog-footer"]')
            .boundingBox();
          const contrast = await contrastRatios(dialog);
          assert.ok(
            contrast.secondary >= 4.5 && contrast.save >= 4.5,
            JSON.stringify(contrast),
          );
          await dialog
            .getByRole("button", { name: "Guardar cambios", exact: true })
            .hover();
          await page.evaluate(() =>
            document.getAnimations().forEach((animation) => animation.finish()),
          );
          const hovered = await contrastRatios(dialog);
          assert.ok(hovered.save >= 4.5, JSON.stringify(hovered));
          await page.mouse.move(0, 0);
          await page.evaluate(() =>
            document.getAnimations().forEach((animation) => animation.finish()),
          );
          assert.ok(footer.y + footer.height <= bounds.y + bounds.height + 1);
          for (const action of ["Cancelar", "Guardar cambios"])
            assert.ok(
              (
                await dialog
                  .getByRole("button", { name: action, exact: true })
                  .boundingBox()
              ).height >= 44,
            );
          if (device !== "tablet")
            await page.screenshot({
              path: `${output}/${state}-${device}-settings.png`,
              animations: "disabled",
            });
          observations.push({
            state,
            device,
            headingOrder: await dialog
              .getByRole("heading", { level: 3 })
              .allTextContents(),
            horizontalOverflow: false,
            fixedFooter: true,
            contrast,
            saveHoverContrast: hovered.save,
          });
          if (state === "published" && device === "mobile") {
            await title.fill("");
            await dialog
              .getByRole("button", { name: "Guardar cambios", exact: true })
              .click();
            await expect(dialog.getByRole("alert")).toHaveText(
              "Escribe un título para tu quiz.",
            );
            await dialog
              .getByRole("button", { name: "Revisar campo", exact: true })
              .click();
            await expect(title).toBeFocused();
            await title.fill(before.task.title);
          }
          await dialog
            .getByRole("button", { name: "Guardar cambios", exact: true })
            .click();
          await expect(dialog).toHaveCount(0);
          assert.deepEqual(
            await teacher.client.query(api.courseQuizzes.getForEditing, {
              taskId: task._id,
            }),
            before,
          );
          await page.close();
        },
      );
    }
  }
  await check(
    "a new attempt replaces stale local controls with authoritative values and saves only allowed metadata",
    async () => {
      const taskId = states.published._id;
      const page = teacher.page;
      await page.goto(`${courseUrl}?task=${taskId}`);
      await page
        .getByRole("button", { name: "Editar quiz", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Editar quiz",
        exact: true,
      });
      await dialog.getByLabel("Duración (minutos)").fill("20");
      await dialog
        .getByRole("checkbox", {
          name: "Mostrar las preguntas en orden aleatorio",
          exact: true,
        })
        .check();
      await student.client.mutation(api.courseQuizzes.start, { taskId });
      await expect(dialog.getByLabel("Duración (minutos)")).toHaveCount(0);
      await expect(
        dialog.getByText("10 minutos", { exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByText("El orden que definiste", { exact: true }),
      ).toBeVisible();
      await dialog
        .getByLabel("Título", { exact: false })
        .fill("Edit UI metadata after start");
      await dialog
        .getByRole("button", { name: "Guardar cambios", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      const saved = await teacher.client.query(api.courseTasks.get, { taskId });
      assert.equal(saved.quiz.durationMinutes, 10);
      assert.equal(saved.quiz.shuffleQuestions ?? false, false);
      assert.equal(saved.title, "Edit UI metadata after start");
    },
  );
  await writeFile(
    `${output}/observations.json`,
    JSON.stringify({ observations, errors, productionRequests }, null, 2),
  );
}

async function auditDefinitionEditing() {
  const teacher = await session(fixture.users[0]);
  const student = await session(fixture.users[1]);
  const { page, client } = teacher;
  const title = `Editable quiz ${Date.now()}`;
  const choice = {
    kind: "single_choice",
    prompt: "Original question",
    maxPoints: 2,
    options: [
      { id: "a", label: "First" },
      { id: "b", label: "Second" },
    ],
    correctOptionId: "a",
  };
  const taskId = await client.mutation(api.courseQuizzes.create, {
    classId: fixture.classId,
    title,
    availableAt: Date.now() + 600_000,
    dueAt: Date.now() + 1_200_000,
    durationMinutes: 10,
    questions: [
      choice,
      { kind: "text", prompt: "Remove this question", maxPoints: 1 },
    ],
  });
  tasks.push(taskId);
  const original = await client.query(api.courseQuizzes.getForEditing, {
    taskId,
  });
  async function edit(id = taskId) {
    await page.goto(`${courseUrl}?task=${id}`);
    await page
      .getByRole("button", { name: "Editar quiz", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Editar quiz",
      exact: true,
    });
    await expect(
      dialog.getByLabel("Enunciado", { exact: false }).first(),
    ).toBeEnabled();
    return dialog;
  }
  async function save(dialog) {
    await dialog
      .getByRole("button", { name: "Guardar cambios", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
  }
  async function capture(dialog, name) {
    const body = dialog.locator('[data-slot="quiz-editor-body"]');
    assert.ok(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await body.locator("fieldset").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/${name}.png` });
  }
  await check(
    "scheduled teacher edits reuse all question types, persist keys and weights, and preserve IDs",
    async () => {
      await assert.rejects(
        student.client.query(api.courseQuizzes.getForEditing, { taskId }),
        /PERMISSION_DENIED/,
      );
      const dialog = await edit();
      await dialog
        .getByLabel("Enunciado", { exact: false })
        .first()
        .fill("Corrected question");
      await dialog
        .getByRole("radio", {
          name: "Marcar opción 2 como correcta en pregunta 1",
          exact: true,
        })
        .check();
      await dialog
        .getByLabel("Peso de la pregunta", { exact: false })
        .first()
        .fill("3");
      await dialog
        .getByRole("button", { name: "Eliminar pregunta 2", exact: true })
        .click();
      await chooseQuestion(page, "Selección múltiple");
      await dialog
        .getByLabel("Enunciado", { exact: false })
        .nth(1)
        .fill("Choose both animals");
      await dialog
        .getByLabel("Opción 1 de pregunta 2", { exact: true })
        .fill("Cat");
      await dialog
        .getByLabel("Opción 2 de pregunta 2", { exact: true })
        .fill("Dog");
      for (const option of [1, 2])
        await dialog
          .getByRole("checkbox", {
            name: `Marcar opción ${option} como correcta en pregunta 2`,
            exact: true,
          })
          .check();
      await dialog
        .getByRole("button", { name: "Subir pregunta 2", exact: true })
        .click();
      await capture(dialog, "scheduled-desktop");
      await save(dialog);
      const result = await client.query(api.courseQuizzes.getForEditing, {
        taskId,
      });
      assert.equal(result.task.grading.maxPoints, 4);
      assert.equal(result.task.quiz.questionCount, 2);
      assert.equal(result.questions[1]._id, original.questions[0]._id);
      assert.equal(result.questions[1].correctOptionId, "b");
      assert.equal(result.questions[0].kind, "multiple_choice");
      assert.equal(
        result.questions.some((q) => q._id === original.questions[1]._id),
        false,
      );
    },
  );
  await check(
    "scheduled mobile editing stays aligned and saves persisted questions without replacing their IDs",
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      const dialog = await edit();
      await dialog
        .getByLabel("Peso de la pregunta", { exact: false })
        .first()
        .fill("2");
      await capture(dialog, "scheduled-mobile");
      await save(dialog);
      const result = await client.query(api.courseQuizzes.getForEditing, {
        taskId,
      });
      assert.equal(result.task.grading.maxPoints, 5);
      assert.equal(result.questions[1]._id, original.questions[0]._id);
      await page.setViewportSize({ width: 1440, height: 1000 });
    },
  );
  await check(
    "another teacher save preserves local edits and reloads questions and version together",
    async () => {
      const dialog = await edit();
      await dialog
        .getByLabel("Enunciado", { exact: false })
        .first()
        .fill("Local unsaved prompt");
      const snapshot = await client.query(api.courseQuizzes.getForEditing, {
        taskId,
      });
      await client.mutation(api.courseTasks.update, {
        taskId,
        expectedUpdatedAt: snapshot.task.updatedAt,
        title: `${title} corrected`,
      });
      await dialog
        .getByRole("button", { name: "Guardar cambios", exact: true })
        .click();
      await expect(dialog.getByRole("alert")).toContainText(
        "La configuración cambió",
      );
      await expect(
        dialog.getByLabel("Enunciado", { exact: false }).first(),
      ).toHaveValue("Local unsaved prompt");
      await dialog
        .getByRole("button", { name: "Cargar versión actual", exact: true })
        .click();
      await expect(
        dialog.getByLabel("Enunciado", { exact: false }).first(),
      ).toHaveValue("Choose both animals");
      await save(dialog);
    },
  );
  await check(
    "scheduled publication during editing locks questions and never partially saves local settings",
    async () => {
      const raceId = await client.mutation(api.courseQuizzes.create, {
        classId: fixture.classId,
        title: `Publication race ${Date.now()}`,
        availableAt: Date.now() + 600_000,
        dueAt: Date.now() + 1_200_000,
        durationMinutes: 10,
        questions: [choice],
      });
      tasks.push(raceId);
      await page.setViewportSize({ width: 390, height: 844 });
      const dialog = await edit(raceId);
      await dialog.getByLabel("Título", { exact: false }).fill("Must not save");
      await dialog
        .getByLabel("Enunciado", { exact: false })
        .fill("Keep this local correction");
      await client.mutation(api.courseTasks.update, {
        taskId: raceId,
        availableAt: Date.now() + 1500,
      });
      await expect(dialog.getByRole("status")).toContainText(
        "El quiz ya está disponible",
        { timeout: 30_000 },
      );
      await expect(
        dialog.getByLabel("Enunciado", { exact: false }),
      ).toBeDisabled();
      await expect(
        dialog.getByLabel("Enunciado", { exact: false }),
      ).toHaveValue("Keep this local correction");
      await dialog
        .getByRole("button", { name: "Guardar cambios", exact: true })
        .click();
      await expect(dialog.getByRole("alert")).toContainText(
        "sus preguntas ya no se pueden editar",
      );
      const saved = await client.query(api.courseQuizzes.getForEditing, {
        taskId: raceId,
      });
      assert.notEqual(saved.task.title, "Must not save");
      assert.equal(saved.questions, null);
      await capture(dialog, "publication-race-mobile");
      await dialog
        .getByRole("button", { name: "Cargar versión actual", exact: true })
        .click();
      await expect(
        dialog.getByLabel("Enunciado", { exact: false }),
      ).toHaveCount(0);
      await save(dialog);
      await page.setViewportSize({ width: 1440, height: 1000 });
    },
  );
  await check(
    "student answers the corrected definition and receives an automatic grade with keys hidden until global close",
    async () => {
      await client.mutation(api.courseTasks.update, {
        taskId,
        availableAt: null,
      });
      await student.page.goto(`${courseUrl}?task=${taskId}`);
      const region = student.page.getByRole("region", {
        name: "Responder quiz",
        exact: true,
      });
      await region
        .getByRole("button", { name: "Iniciar quiz", exact: true })
        .click();
      await expect(
        region.getByText("Choose both animals", { exact: true }),
      ).toBeVisible();
      const questions = await student.client.query(
        api.courseQuizzes.getQuestions,
        { taskId },
      );
      assert.equal(questions[0].correctOptionIds, undefined);
      assert.equal(questions[1].correctOptionId, undefined);
      for (const animal of ["Cat", "Dog"])
        await region
          .getByRole("checkbox", { name: animal, exact: true })
          .check();
      await showQuizQuestion(student.page, 2);
      await region.getByRole("radio", { name: "Second", exact: true }).check();
      await expect(
        region.getByText("Todas las respuestas están guardadas.", {
          exact: true,
        }),
      ).toBeVisible();
      await region
        .getByRole("button", { name: "Entregar quiz", exact: true })
        .click();
      await student.page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Confirmar entrega", exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await preparedGradeFor(teacher, student, taskId)).published
              ?.points,
        )
        .toBe(5);
      await assert.rejects(
        student.client.query(api.courseQuizzes.getReview, { taskId }),
        /QUIZ_REVIEW_LOCKED/,
      );
      await client.mutation(api.courseTasks.update, {
        taskId,
        dueAt: Date.now() + 1500,
      });
      const results = student.page.getByRole("region", {
        name: "Desglose y respuestas correctas",
        exact: true,
      });
      await expect(results).toBeVisible({ timeout: 30_000 });
      await expect(
        student.page.getByRole("region", { name: "Calificación", exact: true }),
      ).toContainText("100 / 100");
      const review = await student.client.query(api.courseQuizzes.getReview, {
        taskId,
      });
      assert.equal(review.questions[1].correctOptionId, "b");
      assert.equal(
        (await student.client.query(api.courseTaskGrades.get, { taskId }))
          .grading.scaleMax,
        100,
      );
      await results.scrollIntoViewIfNeeded();
      await student.page.screenshot({
        path: `${output}/corrected-results-desktop.png`,
      });
    },
  );
}

try {
  if (studentUiMode || allMode) await auditStudentUi();
  if (editUiMode || allMode) await auditEditUi();
  if (definitionEditMode || allMode) await auditDefinitionEditing();
  if (presentationMode) await auditPresentation();
  if (editorMode) await auditEditor();
  if (allMode || reviewMode) await auditReview();
  if (allMode || studentMode) await auditStudent();
  if (allMode || multipleMode) await auditMultipleChoice();
  if (allMode || shuffleMode) await auditShuffle();
  if (
    allMode ||
    (!reviewMode &&
      !studentMode &&
      !filesMode &&
      !multipleMode &&
      !shuffleMode &&
      !presentationMode &&
      !definitionEditMode &&
      !editUiMode &&
      !studentUiMode &&
      !editorMode)
  ) {
    const teacher = await session(fixture.users[0]);
    const student = await session(fixture.users[1]);
    const { page } = teacher;
    let authoringTaskId;
    await check(
      "teacher can create a mixed quiz in Chrome and see the stored definition",
      async () => {
        const title = `Quiz de prueba ${Date.now()}`;
        const dialog = await fillQuiz(page, title);
        const duration = dialog.getByLabel("Duración (minutos)");
        await duration.fill("");
        await duration.pressSequentially("15");
        await duration.press("ArrowDown");
        await duration.hover();
        const body = dialog.locator('[data-slot="quiz-editor-body"]');
        // Timing now follows the questions, so verify scrolling upward from here.
        const previousScroll = await body.evaluate(
          (element) => element.scrollTop,
        );
        await page.mouse.wheel(0, -240);
        await expect
          .poll(() => body.evaluate((element) => element.scrollTop))
          .toBeLessThan(previousScroll);
        await expect(duration).toHaveValue("15");
        await expect(
          dialog.getByRole("button", { name: "Publicar quiz", exact: true }),
        ).toBeVisible();
        await body.evaluate((element) => element.scrollTo(0, 0));
        const help = dialog.getByRole("button", {
          name: "Cómo funciona tu quiz",
          exact: true,
        });
        await expect(help).toHaveAttribute("aria-expanded", "false");
        await help.click();
        await expect(
          dialog.getByText(
            "Las notas confirmadas y las respuestas correctas se muestran al cierre para todos. Si terminas una revisión después, publicas la nota en ese momento.",
            { exact: true },
          ),
        ).toBeVisible();
        await help.click();
        await captureEditor(page, "desktop");
        await page.setViewportSize({ width: 390, height: 844 });
        await captureEditor(page, "mobile");
        await page.setViewportSize({ width: 1440, height: 1000 });
        await dialog
          .getByRole("button", { name: "Publicar quiz", exact: true })
          .click();
        await expect(dialog).toHaveCount(0);
        const taskId = new URL(page.url()).searchParams.get("task");
        assert.ok(taskId);
        authoringTaskId = taskId;
        tasks.push(taskId);
        const task = await teacher.client.query(api.courseTasks.get, {
          taskId,
        });
        const definition = await teacher.client.query(api.courseQuizzes.get, {
          taskId,
          now: Date.now(),
        });
        assert.equal(task.kind, "quiz");
        assert.equal(task.quiz.durationMinutes, 15);
        assert.equal(task.grading.maxPoints, 2);
        assert.equal(definition.questions.length, 2);
        assert.equal(
          definition.questions[0].correctOptionId,
          definition.questions[0].options[1].id,
        );
        await page
          .getByRole("button", { name: "Vista previa del quiz", exact: true })
          .click();
        await expect(
          page.getByText("Explica cómo llegaste a tu respuesta.", {
            exact: true,
          }),
        ).toBeVisible();
      },
    );
    const taskId = authoringTaskId;
    assert.ok(taskId);
    await check(
      "student has no quiz management or file-submission controls and cannot read keys",
      async () => {
        await student.page.goto(`${courseUrl}?task=${taskId}`);
        await expect(
          student.page.getByRole("button", { name: "Nuevo quiz", exact: true }),
        ).toHaveCount(0);
        await expect(student.page.locator('input[type="file"]')).toHaveCount(0);
        const definition = await student.client.query(api.courseQuizzes.get, {
          taskId,
          now: Date.now(),
        });
        assert.equal(definition.questions.length, 0);
      },
    );
    await check(
      "an attempt starting while settings are open locks duration and preserves the fixed clock",
      async () => {
        await page
          .getByRole("button", { name: "Editar quiz", exact: true })
          .click();
        const dialog = page.getByRole("dialog", { name: "Editar quiz" });
        await dialog.getByLabel("Duración (minutos)").fill("20");
        const attempt = await student.client.mutation(api.courseQuizzes.start, {
          taskId,
        });
        await expect(dialog.getByLabel("Duración (minutos)")).toHaveCount(0);
        await expect(
          dialog.getByText("15 minutos", { exact: true }),
        ).toBeVisible();
        await dialog
          .getByLabel("Fecha y hora de cierre")
          .fill(utcToLocalDateTime(Date.now() + 90_000_000, timeZone));
        await dialog
          .getByRole("button", { name: "Guardar cambios", exact: true })
          .click();
        await expect(dialog).toHaveCount(0);
        const next = await student.client.query(api.courseQuizzes.get, {
          taskId,
          now: Date.now(),
        });
        assert.equal(next.attempt.timeLimitAt, attempt.timeLimitAt);
        await assert.rejects(
          student.client.query(api.courseQuizzes.getReview, { taskId }),
          /QUIZ_REVIEW_LOCKED/,
        );
      },
    );
    await check(
      "concurrent closing changes require reloading settings and a title correction preserves the new deadline",
      async () => {
        await page
          .getByRole("button", { name: "Editar quiz", exact: true })
          .click();
        const dialog = page.getByRole("dialog", { name: "Editar quiz" });
        await dialog
          .getByLabel("Título", { exact: false })
          .fill("Título pendiente de auditoría");
        const before = await teacher.client.query(api.courseTasks.get, {
          taskId,
        });
        const dueAt = before.dueAt + 60_000;
        await teacher.client.mutation(api.courseTasks.update, {
          taskId,
          dueAt,
        });
        await dialog
          .getByRole("button", { name: "Guardar cambios", exact: true })
          .click();
        await expect(dialog.getByRole("alert")).toContainText(
          "La configuración cambió",
        );
        await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
          timeout: 15_000,
        });
        for (const [name, width, height] of [
          ["desktop", 1440, 1000],
          ["mobile", 390, 844],
        ]) {
          await page.setViewportSize({ width, height });
          await dialog
            .getByRole("button", { name: "Cargar versión actual", exact: true })
            .scrollIntoViewIfNeeded();
          await dialog
            .locator('[data-slot="quiz-editor-body"]')
            .evaluate((element) => {
              element.scrollTop = element.scrollHeight;
            });
          await page.screenshot({
            path: `${output}/settings-conflict-${name}.png`,
          });
        }
        await dialog
          .getByRole("button", { name: "Cargar versión actual", exact: true })
          .click();
        await expect(dialog.getByLabel("Título", { exact: false })).toHaveValue(
          before.title,
        );
        await dialog
          .getByLabel("Título", { exact: false })
          .fill(before.title + " corregido");
        await dialog
          .getByRole("button", { name: "Guardar cambios", exact: true })
          .click();
        await expect(dialog).toHaveCount(0);
        assert.equal(
          (await teacher.client.query(api.courseTasks.get, { taskId })).dueAt,
          dueAt,
        );
        await page.setViewportSize({ width: 1440, height: 1000 });
      },
    );
    await check(
      "the original file assignment can still be published with no grading requirement or changed submission controls",
      async () => {
        await chooseActivity(page, "Nueva tarea");
        const dialog = page.getByRole("dialog", { name: "Nueva tarea" });
        await dialog
          .getByLabel("Título", { exact: false })
          .fill(`Tarea de regresión ${Date.now()}`);
        await expect(
          dialog.getByText("Material de apoyo (opcional)", { exact: true }),
        ).toBeVisible();
        await expect(
          dialog.getByRole("button", { name: "Añadir pregunta" }),
        ).toHaveCount(0);
        await dialog
          .getByRole("button", { name: "Publicar tarea", exact: true })
          .click();
        await expect(dialog).toHaveCount(0);
        const fileTaskId = new URL(page.url()).searchParams.get("task");
        tasks.push(fileTaskId);
        const task = await teacher.client.query(api.courseTasks.get, {
          taskId: fileTaskId,
        });
        assert.equal(task.kind, undefined);
        assert.equal(task.grading, undefined);
        await expect(
          page.getByText("Entregas de estudiantes", { exact: true }),
        ).toBeVisible();
      },
    );
    await check(
      "a quiz can be scheduled through the UI and remains hidden from students until release",
      async () => {
        const dialog = await fillQuiz(page, `Quiz programado ${Date.now()}`);
        await dialog
          .getByLabel("Inicio (opcional)")
          .fill(utcToLocalDateTime(Date.now() + 600_000, timeZone));
        await dialog
          .getByRole("button", { name: "Programar quiz", exact: true })
          .click();
        await expect(dialog).toHaveCount(0);
        const scheduledId = new URL(page.url()).searchParams.get("task");
        tasks.push(scheduledId);
        const task = await teacher.client.query(api.courseTasks.get, {
          taskId: scheduledId,
        });
        assert.ok(task.availableAt > Date.now());
        assert.equal(task.releasedAt, undefined);
        await assert.rejects(
          student.client.query(api.courseQuizzes.get, {
            taskId: scheduledId,
            now: Date.now(),
          }),
          /PERMISSION_DENIED/,
        );
      },
    );
  }
  if (allMode || filesMode) await auditFileAssignments();
  assert.deepEqual(errors, []);
  assert.deepEqual(productionRequests, []);
  await writeFile(
    `${output}/browser-report.json`,
    JSON.stringify(
      {
        checks,
        errors,
        productionRequests,
        screenshots: [
          ...(studentUiMode
            ? [
                "first-question-desktop.png",
                "active-desktop.png",
                "active-mobile.png",
                "short-question-mobile.png",
                "confirmation-mobile.png",
                "submitted-mobile.png",
              ]
            : []),
          ...(editUiMode || allMode
            ? ["scheduled", "published", "started", "closed"].flatMap((state) =>
                ["desktop", "mobile"].flatMap((device) =>
                  ["top", "settings"].map(
                    (view) => `${state}-${device}-${view}.png`,
                  ),
                ),
              )
            : []),
          ...(definitionEditMode || allMode
            ? [
                "scheduled-desktop.png",
                "scheduled-mobile.png",
                "publication-race-mobile.png",
                "corrected-results-desktop.png",
              ]
            : []),
          ...(editorMode
            ? [
                "editor-desktop.png",
                "editor-mobile.png",
                "questions-desktop.png",
                "questions-mobile.png",
                "error-desktop.png",
                "error-mobile.png",
                "timing-desktop.png",
                "timing-mobile.png",
                "help-desktop.png",
                "help-mobile.png",
                "empty-desktop.png",
                "empty-mobile.png",
              ]
            : []),
          ...(presentationMode
            ? [
                "activity-menu-desktop.png",
                "activity-menu-mobile.png",
                "activity-assignment-desktop.png",
                "activity-assignment-mobile.png",
                "activity-quiz-desktop.png",
                "activity-quiz-mobile.png",
              ]
            : []),
          ...(allMode || shuffleMode
            ? [
                "shuffle-editor-desktop.png",
                "shuffle-student-desktop.png",
                "shuffle-student-mobile.png",
                "shuffle-results-mobile.png",
              ]
            : []),
          ...(allMode || multipleMode
            ? [
                "multiple-editor-desktop.png",
                "multiple-editor-mobile.png",
                "multiple-student-desktop.png",
                "multiple-student-mobile.png",
                "multiple-results-desktop.png",
                "multiple-results-mobile.png",
              ]
            : []),
          ...(allMode || filesMode ? ["legacy-pdf-editor.png"] : []),
          ...(allMode || reviewMode
            ? [
                "teacher-overview-desktop.png",
                "teacher-overview-mobile.png",
                "student-pending-desktop.png",
                "student-pending-mobile.png",
                "review-desktop.png",
                "review-mobile.png",
                "review-pending-desktop.png",
                "review-pending-mobile.png",
                "results-desktop.png",
                "results-mobile.png",
              ]
            : []),
          ...(allMode || studentMode
            ? ["student-desktop.png", "student-mobile.png"]
            : []),
          ...(allMode ||
          (!reviewMode &&
            !studentMode &&
            !filesMode &&
            !multipleMode &&
            !shuffleMode &&
            !presentationMode &&
            !definitionEditMode &&
            !editUiMode &&
            !studentUiMode &&
            !editorMode)
            ? [
                "editor-desktop.png",
                "editor-mobile.png",
                "questions-desktop.png",
                "questions-mobile.png",
                "settings-conflict-desktop.png",
                "settings-conflict-mobile.png",
              ]
            : []),
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  const retained = [];
  const removed = [];
  for (const taskId of tasks) {
    if (hasGrades(taskId)) retained.push(taskId);
    else {
      run("courseTasks:remove", { taskId });
      removed.push(taskId);
    }
  }
  await writeFile(
    `${output}/browser-cleanup.json`,
    JSON.stringify(
      {
        removedTemporaryActivities: removed,
        retainedGradedActivities: retained,
      },
      null,
      2,
    ),
  );
}
