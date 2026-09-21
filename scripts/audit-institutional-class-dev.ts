import { randomBytes } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const BASE_URL = "http://localhost:3000";
const CAMPUS_ID = "jx76efgw0fvqkj3jthqpgggkt183598q";
const CURRICULUM_ID = "js752f3gptadxm0jcax0pvvm6s8dcmb3";
const ACADEMIC_PERIOD_ID = "m573rmhtvg0ncs6vdmw1zvhcbx8bjvsn";
const ADMIN_CLERK_ID = "user_3AlBmA6A02VVAlepVF7VZEyGaWo";
const ADMIN_IDENTITY = {
  subject: ADMIN_CLERK_ID,
  issuer: "https://test.clerk.accounts.dev",
};
const ALL_GRADE_CODES = [
  "K",
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
];

type ConvexUser = {
  _id: string;
  email?: string;
  role?: string;
};

type Schedule = {
  _id: string;
  roomName: string;
  scheduledStart: number;
  scheduledEnd: number;
  status: string;
  isLive?: boolean;
};

type BrowserEvidence = {
  label: string;
  gradeCode?: string;
  enrolled: boolean;
  navigationStatus: number | null;
  finalPath: string;
  classroomRendered: boolean;
  liveStatusRendered: boolean;
  applicationErrorRendered: boolean;
  connectionErrorRendered: boolean;
  liveKitWebSockets: string[];
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  failedResponses: string[];
};

function assertDevelopmentEnvironment() {
  if (!process.env.CONVEX_DEPLOYMENT?.startsWith("dev:")) {
    throw new Error("Refusing to run: CONVEX_DEPLOYMENT is not a dev deployment");
  }
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_")) {
    throw new Error("Refusing to run: Clerk publishable key is not a test key");
  }
  if (!process.env.CLERK_SECRET_KEY?.startsWith("sk_test_")) {
    throw new Error("Refusing to run: Clerk secret key is not a test key");
  }
  if (!process.env.NEXT_PUBLIC_CONVEX_URL?.includes("bright-bat-393")) {
    throw new Error("Refusing to run: unexpected Convex development deployment");
  }
}

function runConvex<T>(functionName: string, args: unknown): T {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "convex",
      "run",
      functionName,
      JSON.stringify(args),
      "--identity",
      JSON.stringify(ADMIN_IDENTITY),
      "--typecheck",
      "disable",
      "--codegen",
      "disable",
    ],
    { encoding: "utf8", env: process.env },
  );

  if (result.status !== 0) {
    throw new Error(
      `Convex ${functionName} failed: ${result.stderr || result.stdout}`,
    );
  }
  return JSON.parse(result.stdout) as T;
}

function runInlineQuery<T>(source: string): T {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "convex",
      "run",
      "--inline-query",
      source,
      "--typecheck",
      "disable",
      "--codegen",
      "disable",
    ],
    { encoding: "utf8", env: process.env },
  );

  if (result.status !== 0) {
    throw new Error(`Convex inline query failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout) as T;
}

function developmentCampusScheduleSlot() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = value("weekday");
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));
  if (!weekday || !Number.isInteger(weekdays[weekday])) {
    throw new Error("Could not determine the development schedule weekday");
  }

  return {
    dayOfWeek: weekdays[weekday],
    startMinutes: hour * 60 + Math.max(0, minute - 2),
    durationMinutes: 45,
    sessionType: "live" as const,
  };
}

function startFrontend(): ChildProcess {
  const child = spawn("pnpm", ["run", "dev:frontend"], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  return child;
}

async function waitForFrontend() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/en/sign-in`, {
        redirect: "manual",
      });
      if (response.status < 500) return;
    } catch {
      // The dev server is still starting.
    }
    await delay(1_000);
  }
  throw new Error("Timed out waiting for the Next.js development server");
}

function sanitizeUrl(value: string) {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (/token|ticket|key|secret/i.test(key)) url.searchParams.set(key, "[redacted]");
    }
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return value.replace(/(token|ticket|key|secret)=([^&\s]+)/gi, "$1=[redacted]");
  }
}

function instrumentPage(page: Page) {
  const evidence = {
    consoleErrors: [] as string[],
    pageErrors: [] as string[],
    failedRequests: [] as string[],
    failedResponses: [] as string[],
    liveKitWebSockets: [] as string[],
  };

  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    evidence.failedRequests.push(
      `${request.method()} ${sanitizeUrl(request.url())}: ${request.failure()?.errorText ?? "failed"}`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      evidence.failedResponses.push(
        `${response.status()} ${response.request().method()} ${sanitizeUrl(response.url())}`,
      );
    }
  });
  page.on("websocket", (socket) => {
    const url = sanitizeUrl(socket.url());
    if (/livekit/i.test(url)) evidence.liveKitWebSockets.push(url);
  });

  return evidence;
}

async function signInContext(context: BrowserContext, email: string) {
  const page = await context.newPage();
  const network = instrumentPage(page);
  await page.goto(`${BASE_URL}/en/sign-in`, { waitUntil: "domcontentloaded" });
  await clerk.signIn({ page, emailAddress: email });
  return { page, network };
}

async function collectEvidence({
  context,
  email,
  label,
  gradeCode,
  enrolled,
  roomName,
  courseName,
}: {
  context: BrowserContext;
  email: string;
  label: string;
  gradeCode?: string;
  enrolled: boolean;
  roomName: string;
  courseName: string;
}): Promise<BrowserEvidence> {
  const { page, network } = await signInContext(context, email);
  const response = await page.goto(
    `${BASE_URL}/en/cpca-main/classroom/${encodeURIComponent(roomName)}`,
    { waitUntil: "domcontentloaded" },
  );

  await page
    .getByRole("heading", { name: courseName, exact: true })
    .waitFor({ state: "visible", timeout: 25_000 })
    .catch(() => undefined);
  await delay(3_000);

  const body = await page.locator("body").innerText().catch(() => "");
  return {
    label,
    gradeCode,
    enrolled,
    navigationStatus: response?.status() ?? null,
    finalPath: new URL(page.url()).pathname,
    classroomRendered: await page
      .getByRole("heading", { name: courseName, exact: true })
      .isVisible()
      .catch(() => false),
    liveStatusRendered: await page
      .locator('[role="status"][aria-label="Live"]')
      .first()
      .isVisible()
      .catch(() => false),
    applicationErrorRendered: body.includes("Application error"),
    connectionErrorRendered: body.includes("Could not connect to the classroom"),
    liveKitWebSockets: [...new Set(network.liveKitWebSockets)],
    consoleErrors: network.consoleErrors,
    pageErrors: network.pageErrors,
    failedRequests: network.failedRequests,
    failedResponses: network.failedResponses,
  };
}

async function main() {
  assertDevelopmentEnvironment();
  console.log(`Validated isolated environment: ${process.env.CONVEX_DEPLOYMENT}`);

  const reuseRunId = process.env.AUDIT_REUSE_RUN_ID;
  const runId = reuseRunId ?? Date.now().toString(36);
  const courseName = `DEVOTIONAL — DEV AUDIT ${runId}`;
  const password = randomBytes(24).toString("base64url");
  const teacherIdentity = {
    label: "teacher",
    firstName: "Audit",
    lastName: "Teacher",
    email: `audit.teacher.${runId}+clerk_test@example.com`,
    role: "teacher",
  };
  const studentIdentities = ["01", "02", "09", "12"].map(
    (gradeCode) => ({
      label: `student-grade-${gradeCode}`,
      firstName: "Audit",
      lastName: `Student ${gradeCode}`,
      email: `audit.student.${gradeCode}.${runId}+clerk_test@example.com`,
      role: "student",
      grade: gradeCode,
    }),
  );
  const identities = [teacherIdentity, ...studentIdentities];

  if (!reuseRunId) {
    const creation = runConvex<
      Array<{ email?: string; status: "success" | "error"; reason?: string }>
    >("users:createUsersWithClerk", {
      users: identities.map((identity) => ({
        firstName: identity.firstName,
        lastName: identity.lastName,
        email: identity.email,
        password,
        role: identity.role,
        grade: "grade" in identity ? identity.grade : undefined,
        school: "CPCA Honduras",
      })),
      orgType: "campus",
      orgId: CAMPUS_ID,
    });
    const creationErrors = creation.filter(
      (result) => result.status !== "success",
    );
    if (creationErrors.length > 0) {
      throw new Error(
        `Could not create all audit identities: ${JSON.stringify(creationErrors)}`,
      );
    }
    console.log("Created isolated teacher and grade 01/02/09/12 students in dev");
  } else {
    console.log(`Reusing development-only audit fixture ${reuseRunId}`);
  }

  const [teachers, students] = [
    runConvex<ConvexUser[]>("users:getUsers", {
      roles: ["teacher"],
      isActive: true,
      orgType: "campus",
      orgId: CAMPUS_ID,
    }),
    runConvex<ConvexUser[]>("users:getUsers", {
      roles: ["student"],
      isActive: true,
      orgType: "campus",
      orgId: CAMPUS_ID,
    }),
  ];
  const teacher = teachers.find((user) => user.email === identities[0].email);
  const auditStudents = studentIdentities.map((identity) => {
    const user = students.find((candidate) => candidate.email === identity.email);
    if (!user) throw new Error(`Missing Convex user for ${identity.label}`);
    return { ...identity, user };
  });
  if (!teacher) throw new Error("Missing Convex teacher after creation");

  let created: { classId: string; classesCreated: number };
  if (reuseRunId) {
    const existingClass = runInlineQuery<{ _id: string } | null>(
      `const rows = await ctx.db.query("classes").collect(); return rows.find(row => row.name === "${courseName}") ?? null;`,
    );
    if (!existingClass) throw new Error(`Missing audit class ${courseName}`);
    created = { classId: existingClass._id, classesCreated: 0 };
  } else {
    const slot = developmentCampusScheduleSlot();
    created = runConvex<{ classId: string; classesCreated: number }>(
      "classes:createWithSchedule",
      {
        name: courseName,
        description: "Development-only reproduction of institutional live access.",
        curriculumId: CURRICULUM_ID,
        campusId: CAMPUS_ID,
        teacherId: teacher._id,
        academicPeriodId: ACADEMIC_PERIOD_ID,
        gradeCode: "01",
        studentIds: [auditStudents[0].user._id],
        liveAccess: { mode: "school", allowedGradeCodes: ALL_GRADE_CODES },
        weeklySlots: [slot],
      },
    );
    console.log(
      `Created ${courseName}: grade 01, Bible 1, institutional K–12, ${created.classesCreated} occurrences`,
    );
  }

  const schedules = runInlineQuery<Schedule[]>(
    `return await ctx.db.query("classSchedule").withIndex("by_class", q => q.eq("classId", "${created.classId}")).collect();`,
  );
  const now = Date.now();
  const schedule = schedules.find(
    (candidate) =>
      candidate.scheduledStart <= now + 5 * 60_000 &&
      candidate.scheduledEnd >= now,
  );
  if (!schedule) throw new Error("Could not find the current audit occurrence");
  console.log(`Selected room ${schedule.roomName}`);

  const frontend = startFrontend();
  let browser;
  const contexts: BrowserContext[] = [];
  try {
    await waitForFrontend();
    await clerkSetup();
    browser = await chromium.launch({
      channel: "chrome",
      headless: true,
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    });

    const teacherContext = await browser.newContext({ serviceWorkers: "block" });
    contexts.push(teacherContext);
    const { page: teacherPage, network: teacherNetwork } = await signInContext(
      teacherContext,
      teacherIdentity.email,
    );
    const teacherResponse = await teacherPage.goto(
      `${BASE_URL}/en/cpca-main/classroom/${encodeURIComponent(schedule.roomName)}`,
      { waitUntil: "domcontentloaded" },
    );
    if (!schedule.isLive) {
      const startDialog = teacherPage.getByRole("alertdialog");
      const dialogVisible = await startDialog
        .waitFor({ state: "visible", timeout: 25_000 })
        .then(() => true)
        .catch(() => false);
      if (!dialogVisible) {
        const body = await teacherPage.locator("body").innerText().catch(() => "");
        throw new Error(
          `Teacher start dialog did not render. Final URL: ${teacherPage.url()}. Body: ${body.slice(0, 1_000)}`,
        );
      }
      const startButton = teacherPage.getByRole("button", {
        name: /^(Start live class|Start Class|Iniciar clase en vivo|Iniciar Clase)$/i,
      });
      const startButtonVisible = await startButton
        .first()
        .isVisible()
        .catch(() => false);
      if (!startButtonVisible) {
        const body = await teacherPage.locator("body").innerText().catch(() => "");
        throw new Error(
          `Teacher start button did not render. Final URL: ${teacherPage.url()}. Body: ${body.slice(0, 2_000)}`,
        );
      }
      await startButton.first().click();
    }
    await delay(3_000);
    const startedSchedule = runInlineQuery<Schedule | null>(
      `return await ctx.db.query("classSchedule").withIndex("by_room", q => q.eq("roomName", "${schedule.roomName}")).first();`,
    );
    if (!startedSchedule?.isLive) {
      const body = await teacherPage.locator("body").innerText().catch(() => "");
      throw new Error(`Session did not become live. Body: ${body.slice(0, 2_000)}`);
    }
    console.log("Teacher entered the room and started the session through the UI");

    const results: BrowserEvidence[] = [
      {
        label: "teacher",
        enrolled: false,
        navigationStatus: teacherResponse?.status() ?? null,
        finalPath: new URL(teacherPage.url()).pathname,
        classroomRendered: await teacherPage
          .getByRole("heading", { name: courseName, exact: true })
          .isVisible(),
        liveStatusRendered: await teacherPage
          .locator('[role="status"][aria-label="Live"]')
          .first()
          .isVisible()
          .catch(() => false),
        applicationErrorRendered: false,
        connectionErrorRendered: false,
        liveKitWebSockets: [...new Set(teacherNetwork.liveKitWebSockets)],
        consoleErrors: teacherNetwork.consoleErrors,
        pageErrors: teacherNetwork.pageErrors,
        failedRequests: teacherNetwork.failedRequests,
        failedResponses: teacherNetwork.failedResponses,
      },
    ];

    for (const student of auditStudents) {
      const context = await browser.newContext({ serviceWorkers: "block" });
      contexts.push(context);
      results.push(
        await collectEvidence({
          context,
          email: student.email,
          label: student.label,
          gradeCode: student.grade,
          enrolled: student.grade === "01",
          roomName: schedule.roomName,
          courseName,
        }),
      );
      console.log(`Completed browser entry for ${student.label}`);
    }

    const finalSchedule = runInlineQuery<Schedule | null>(
      `return await ctx.db.query("classSchedule").withIndex("by_room", q => q.eq("roomName", "${schedule.roomName}")).first();`,
    );
    const report = {
      environment: {
        convexDeployment: process.env.CONVEX_DEPLOYMENT,
        baseUrl: BASE_URL,
        clerkMode: "test",
      },
      fixture: {
        classId: created.classId,
        courseName,
        roomName: schedule.roomName,
        curriculum: "Bible 1",
        baseGradeCode: "01",
        enrolledGradeCodes: ["01"],
        institutionalAllowedGradeCodes: ALL_GRADE_CODES,
        scheduleStatus: finalSchedule?.status,
        isLive: finalSchedule?.isLive === true,
      },
      results,
    };

    console.log("AUDIT_REPORT_START");
    console.log(JSON.stringify(report, null, 2));
    console.log("AUDIT_REPORT_END");

    const failures = results.filter(
      (result) =>
        result.navigationStatus !== 200 ||
        !result.classroomRendered ||
        result.applicationErrorRendered ||
        result.connectionErrorRendered ||
        result.pageErrors.length > 0 ||
        result.liveKitWebSockets.length === 0,
    );
    if (failures.length > 0) {
      process.exitCode = 1;
      console.error(`Audit detected ${failures.length} failed classroom entries`);
    }
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
    await browser?.close().catch(() => undefined);
    frontend.kill("SIGTERM");
  }
}

void main().catch((error: unknown) => {
  process.exitCode = 1;
  console.error(error instanceof Error ? error.message : String(error));
});
