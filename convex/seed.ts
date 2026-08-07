import { v } from "convex/values";
import { internalMutation, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { DEFAULT_INSTITUTION_GRADES } from "../lib/grades";
import {
  addCivilDays,
  localDateTimeToUtc,
  todayInTimeZone,
} from "../lib/time-zone";
import { deleteScheduleWithDependencies } from "./model/scheduleDeletion";

const UX_DEMO_CURRICULUM_CODE = "UX-DEMO-01";
const UX_DEMO_CLASS_NAME = "UX Demo - Integrated Biology Studio";
const CLASSES_TABLE_DEMO_CODE_PREFIX = "CLASSES-TABLE-DEMO";
const ADVANCED_LITERATURE_CLASS_NAME =
  "Advanced Literature Seminar - Comparative Essays and Guided Reading Workshop";
const LAURA_TODAY_DEMO_USERNAME = "student_lau";
const LAURA_TODAY_DEMO_ROOM_PREFIX = "student-lau-today-demo";
const LAURA_CLASSROOM_DEMO_ROOM_PREFIX = "laura-classroom-layout-demo";
const LAURA_RECORDING_DEMO_EGRESS_PREFIX = "laura-recording-demo";
const LAURA_RECORDING_DEMO_URL =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
const LAURA_CALENDAR_PROVIDER_DEMO_CODE_PREFIX = "LAURA-CALENDAR-PROVIDER-DEMO";
const LAURA_CALENDAR_PROVIDER_DEMO_ROOM_PREFIX = "laura-calendar-provider-demo";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const uxDemoLessons = [
  [
    "Course orientation and learning goals",
    "How this class uses curriculum lessons, custom sessions, and live rooms.",
  ],
  [
    "Cell structure and organelles",
    "Identify key organelles and explain how each one supports cell function.",
  ],
  [
    "Microscopes and lab safety",
    "Prepare students for safe observation work and lab routines.",
  ],
  [
    "Cell membrane transport",
    "Diffusion, osmosis, and active transport through real-life examples.",
  ],
  [
    "Photosynthesis lab prep",
    "Set up the investigation and review materials before lab day.",
  ],
  [
    "Photosynthesis investigation",
    "Collect observations and connect evidence to energy transfer.",
  ],
  [
    "Cellular respiration",
    "Compare respiration and photosynthesis as linked energy processes.",
  ],
  [
    "Review: cells and energy",
    "Spiral review before assessment and student conferences.",
  ],
  [
    "Unit assessment",
    "Demonstrate understanding of cells, energy, and lab evidence.",
  ],
  [
    "Reflection and extension",
    "Use feedback to plan next steps and enrichment work.",
  ],
] as const;

const classesTableDemoClasses = [
  {
    name: ADVANCED_LITERATURE_CLASS_NAME,
    curriculumTitle:
      "Middle School Language Arts - Critical Reading and Composition",
    curriculumCode: `${CLASSES_TABLE_DEMO_CODE_PREFIX}-ELA`,
    academicYear: "2026-2027",
    studentCount: 8,
  },
  {
    name: "Pre-Algebra Foundations - Problem Solving Lab and Skills Practice",
    curriculumTitle:
      "Mathematics Foundations - Ratios, Expressions, and Equations",
    curriculumCode: `${CLASSES_TABLE_DEMO_CODE_PREFIX}-MATH`,
    academicYear: "2026-2027",
    studentCount: 10,
  },
  {
    name: "World History Studio - Civilizations, Trade Routes, and Source Analysis",
    curriculumTitle:
      "World History - Ancient Societies Through Early Modern Change",
    curriculumCode: `${CLASSES_TABLE_DEMO_CODE_PREFIX}-HIST`,
    academicYear: "2026-2027",
    studentCount: 9,
  },
  {
    name: "Earth Science Field Notes - Weather Systems and Environmental Observation",
    curriculumTitle:
      "Earth and Space Science - Systems, Cycles, and Field Investigation",
    curriculumCode: `${CLASSES_TABLE_DEMO_CODE_PREFIX}-SCI`,
    academicYear: "2026-2027",
    studentCount: 11,
  },
  {
    name: "Spanish Conversation Lab - Heritage Speakers and Applied Grammar",
    curriculumTitle:
      "Spanish Language Development - Communication and Cultural Context",
    curriculumCode: `${CLASSES_TABLE_DEMO_CODE_PREFIX}-SPA`,
    academicYear: "2026-2027",
    studentCount: 7,
  },
  {
    name: "Integrated STEM Design Studio - Robotics, Data, and Engineering Challenges",
    curriculumTitle:
      "STEM Design Lab - Coding, Measurement, and Iterative Prototyping",
    curriculumCode: `${CLASSES_TABLE_DEMO_CODE_PREFIX}-STEM`,
    academicYear: "2026-2027",
    studentCount: 12,
  },
] as const;

const LAURA_COURSE_LOAD_TARGET = 18;
const LAURA_COURSE_LOAD_CODE_PREFIX = "LAURA-COURSE-LOAD-DEMO";
const lauraCourseLoadDemoCourses = [
  ["Creative Writing Studio", "Language Arts - Creative Writing"],
  ["Reading Fluency Lab", "Language Arts - Reading Fluency"],
  ["Geometry Explorers", "Mathematics - Geometry Foundations"],
  ["Statistics and Data Lab", "Mathematics - Statistics and Data"],
  ["Physical Science Workshop", "Science - Physical Science"],
  ["Life Science Investigations", "Science - Life Science"],
  ["Civics and Community", "Social Studies - Civics"],
  ["Digital Citizenship", "Technology - Digital Citizenship"],
  ["Media Arts Lab", "Arts - Digital Media"],
  ["Music Appreciation", "Arts - Music Appreciation"],
  ["Health and Wellness", "Health - Personal Wellness"],
  ["Study Skills Seminar", "Academic Skills - Study Habits"],
  ["Research Methods", "Academic Skills - Research"],
  ["Environmental Science", "Science - Environmental Systems"],
  ["Entrepreneurship Basics", "Career Readiness - Entrepreneurship"],
  ["Public Speaking", "Communication - Public Speaking"],
  ["Financial Literacy", "Mathematics - Financial Literacy"],
  ["Intro to Computer Science", "Technology - Computer Science"],
] as const;

const lauraCalendarProviderDemoCourses = [
  {
    key: "LIVE",
    name: "Collaborative Science Lab - Ecosystems and Field Evidence",
    curriculumTitle: "Middle School Science - Collaborative Investigation",
    classType: "standard" as const,
    sessionType: "live" as const,
    color: "#0ea5e9",
    startHour: 8,
  },
  {
    key: "IGNITIA",
    name: "Foundations of Mathematics - Fractions and Proportional Reasoning",
    curriculumTitle: "Ignitia Mathematics - Foundations and Applications",
    classType: "ignitia" as const,
    sessionType: "ignitia" as const,
    color: "#F15A3D",
    startHour: 9,
  },
  {
    key: "ABEKA",
    name: "World History and Cultures - Civilizations and Primary Sources",
    curriculumTitle: "Abeka History - World Cultures and Civilizations",
    classType: "abeka" as const,
    sessionType: "abeka" as const,
    color: "#92278F",
    startHour: 10,
  },
] as const;

const advancedLiteratureLessons = [
  {
    title: "Seminar norms and close reading routines",
    description:
      "Establish discussion protocols, annotation codes, and evidence logs for guided reading.",
    content:
      "Students set expectations for seminar participation and practice close reading with a shared short text.",
  },
  {
    title: "Comparative thesis statements",
    description:
      "Write arguable claims that compare two texts through a clear literary lens.",
    content:
      "Students move from observation to interpretation and draft thesis statements with contrast, significance, and scope.",
  },
  {
    title: "Evidence selection and quote integration",
    description:
      "Choose strong textual evidence and integrate quotations without interrupting the analysis.",
    content:
      "Students evaluate evidence quality, introduce quotations, and explain how each quote supports the comparative claim.",
  },
  {
    title: "Character perspective across texts",
    description:
      "Compare character motivation, conflict, and narrative perspective across paired readings.",
    content:
      "Students build comparison notes that separate surface similarities from meaningful interpretive differences.",
  },
  {
    title: "Theme tracking and motif maps",
    description:
      "Trace recurring ideas, symbols, and motifs to support a deeper comparative reading.",
    content:
      "Students create motif maps and connect patterns to theme statements for both texts.",
  },
  {
    title: "Counterclaim and nuance in literary analysis",
    description:
      "Strengthen literary arguments by addressing alternate readings and adding complexity.",
    content:
      "Students revise body paragraphs to include counterclaims, concessions, and more precise interpretive language.",
  },
  {
    title: "Drafting the comparative essay",
    description:
      "Organize introduction, body paragraphs, transitions, and conclusion for a comparative essay.",
    content:
      "Students turn their outline into a full draft with paragraph-level goals and evidence checkpoints.",
  },
  {
    title: "Revision workshop and final reflection",
    description:
      "Use peer feedback to revise claims, evidence, organization, and final reflection.",
    content:
      "Students complete a revision pass, submit the final essay, and reflect on their growth as literary analysts.",
  },
] as const;

function nextDate(dayOffset: number, hour: number, minute = 0) {
  const date = new Date(Date.now() + dayOffset * DAY);
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
}

function todayInBogota(hour: number, minute = 0) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const dateParts = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return Date.parse(
    `${dateParts.year}-${dateParts.month}-${dateParts.day}T${hour
      .toString()
      .padStart(2, "0")}:${minute.toString().padStart(2, "0")}:00-05:00`,
  );
}

async function getDemoCampus(ctx: MutationCtx): Promise<Doc<"campuses">> {
  const campuses = await ctx.db.query("campuses").collect();
  const cpcaCampus = campuses.find((campus) => campus.slug === "cpca-main");
  if (cpcaCampus) return cpcaCampus;

  const defaultCampus = campuses.find(
    (campus) => campus.slug === "main-campus",
  );
  if (defaultCampus) return defaultCampus;

  const campus = campuses[0];
  if (!campus)
    throw new Error(
      "No campus found. Seed a campus before creating the UX demo class.",
    );
  return campus;
}

async function getUserByRole(
  ctx: MutationCtx,
  role: Doc<"roleAssignments">["role"],
  campusId?: Id<"campuses">,
): Promise<Doc<"users"> | null> {
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_role", (q) => q.eq("role", role))
    .collect();

  const scoped = campusId
    ? assignments.filter((assignment) => assignment.orgId === campusId)
    : assignments;

  for (const assignment of scoped.length > 0 ? scoped : assignments) {
    const user = await ctx.db.get(assignment.userId);
    if (user?.isActive) return user;
  }

  return null;
}

async function getStudents(
  ctx: MutationCtx,
  campusId: Id<"campuses">,
): Promise<Doc<"users">[]> {
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_role", (q) => q.eq("role", "student"))
    .collect();

  const scoped = assignments.filter(
    (assignment) => assignment.orgId === campusId,
  );
  const candidates = scoped.length > 0 ? scoped : assignments;
  const students: Doc<"users">[] = [];

  for (const assignment of candidates) {
    const user = await ctx.db.get(assignment.userId);
    if (user?.isActive) students.push(user);
    if (students.length >= 12) break;
  }

  if (students.length === 0) {
    throw new Error(
      "No active students found. Seed students before creating the UX demo class.",
    );
  }

  return students;
}

async function findUserByName(
  ctx: MutationCtx,
  searchTerm: string,
): Promise<Doc<"users"> | null> {
  const normalizedSearch = searchTerm.toLowerCase();
  const users = await ctx.db.query("users").collect();

  return (
    users.find((user) => {
      const values = [user.fullName, user.firstName, user.lastName, user.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return user.isActive && values.includes(normalizedSearch);
    }) || null
  );
}

async function getUserCampus(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"campuses"> | null> {
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const campusAssignment = assignments.find(
    (assignment) => assignment.orgType === "campus" && assignment.orgId,
  );

  if (!campusAssignment) return null;
  return await ctx.db.get(campusAssignment.orgId as Id<"campuses">);
}

async function getClassByName(
  ctx: MutationCtx,
  name: string,
): Promise<Doc<"classes"> | null> {
  const classes = await ctx.db.query("classes").collect();
  return classes.find((classDoc) => classDoc.name === name) || null;
}

async function deleteSchedulesForClass(
  ctx: MutationCtx,
  classId: Id<"classes">,
) {
  const schedules = await ctx.db
    .query("classSchedule")
    .withIndex("by_class", (q) => q.eq("classId", classId))
    .collect();

  for (const schedule of schedules) {
    const sessions = await ctx.db
      .query("class_sessions")
      .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
      .collect();
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }
    await ctx.db.delete(schedule._id);
  }
}

export const run = internalMutation({
  args: {
    clearExisting: v.optional(v.boolean()),
  },
  returns: v.object({ message: v.string() }),
  handler: async (ctx, args) => {
    // 1. CLEAR EXISTING DATA (Optional)
    if (args.clearExisting) {
      for (const doc of await ctx.db.query("classSchedule").collect())
        await ctx.db.delete(doc._id);
      for (const doc of await ctx.db.query("classes").collect())
        await ctx.db.delete(doc._id);
      for (const doc of await ctx.db.query("lessons").collect())
        await ctx.db.delete(doc._id);
      for (const doc of await ctx.db.query("curriculums").collect())
        await ctx.db.delete(doc._id);
      for (const doc of await ctx.db.query("users").collect())
        await ctx.db.delete(doc._id);
      for (const doc of await ctx.db.query("class_sessions").collect())
        await ctx.db.delete(doc._id);
      for (const doc of await ctx.db.query("schools").collect())
        await ctx.db.delete(doc._id);
      for (const doc of await ctx.db.query("campuses").collect())
        await ctx.db.delete(doc._id);
      for (const doc of await ctx.db.query("roleAssignments").collect())
        await ctx.db.delete(doc._id);
    }

    // 2. CREATE USERS (Identity only)
    const teacherId = await ctx.db.insert("users", {
      clerkId: "user_teacher_frizzle",
      email: "frizzle@school.edu",
      firstName: "Valerie",
      lastName: "Frizzle",
      fullName: "Valerie Frizzle",
      isActive: true,
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
    });

    const studentIds = await Promise.all([
      ctx.db.insert("users", {
        clerkId: "user_student_arnold",
        email: "arnold@school.edu",
        firstName: "Arnold",
        lastName: "Perlstein",
        fullName: "Arnold Perlstein",
        isActive: true,
        createdAt: Date.now(),
      }),
      ctx.db.insert("users", {
        clerkId: "user_student_carlos",
        email: "carlos@school.edu",
        firstName: "Carlos",
        lastName: "Ramon",
        fullName: "Carlos Ramon",
        isActive: true,
        createdAt: Date.now(),
      }),
      ctx.db.insert("users", {
        clerkId: "user_student_keesha",
        email: "keesha@school.edu",
        firstName: "Keesha",
        lastName: "Franklin",
        fullName: "Keesha Franklin",
        isActive: true,
        createdAt: Date.now(),
      }),
    ]);

    const adminId = await ctx.db.insert("users", {
      clerkId: "user_admin_ruhle",
      email: "ruhle@school.edu",
      firstName: "Principal",
      lastName: "Ruhle",
      fullName: "Principal Ruhle",
      isActive: true,
      createdAt: Date.now(),
    });

    // 3. CREATE MULTI-TENANT HIERARCHY
    const schoolId = await ctx.db.insert("schools", {
      name: "Magic School District",
      slug: "magic-school",
      isActive: true,
      createdAt: Date.now(),
      createdBy: adminId,
    });
    await Promise.all(
      DEFAULT_INSTITUTION_GRADES.map((grade, order) =>
        ctx.db.insert("institutionGrades", {
          schoolId,
          ...grade,
          order,
          createdAt: Date.now(),
          createdBy: adminId,
        }),
      ),
    );

    const campusId = await ctx.db.insert("campuses", {
      schoolId: schoolId,
      name: "Main Campus",
      slug: "main-campus",
      isActive: true,
      createdAt: Date.now(),
      createdBy: adminId,
    });

    // 4. ASSIGN ROLES
    await ctx.db.insert("roleAssignments", {
      userId: adminId,
      orgType: "school",
      orgId: schoolId,
      schoolId,
      role: "admin",
      assignedAt: Date.now(),
    });
    await ctx.db.insert("roleAssignments", {
      userId: teacherId,
      orgType: "campus",
      orgId: campusId,
      schoolId,
      role: "teacher",
      assignedAt: Date.now(),
    });
    for (const studentId of studentIds) {
      await ctx.db.insert("roleAssignments", {
        userId: studentId,
        orgType: "campus",
        orgId: campusId,
        schoolId,
        role: "student",
        gradeCode: "07",
        assignedAt: Date.now(),
      });
    }

    // 5. CREATE CURRICULUM (Attached to School)
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Magic School Bus Science",
      description: "Field trips into the unknown!",
      code: "SCI-101",
      color: "#8b5cf6",
      schoolId: schoolId,
      isActive: true,
      createdAt: Date.now(),
      createdBy: teacherId,
    });

    // 6. CREATE LESSONS
    const lesson1Id = await ctx.db.insert("lessons", {
      curriculumId,
      title: "The Solar System",
      description: "Explore the planets.",
      content: "Space is big!",
      order: 1,
      isActive: true,
      createdAt: Date.now(),
      createdBy: teacherId,
    });
    const lesson2Id = await ctx.db.insert("lessons", {
      curriculumId,
      title: "Inside the Human Body",
      description: "A journey through the digestive system.",
      content: "Digestion",
      order: 2,
      isActive: true,
      createdAt: Date.now(),
      createdBy: teacherId,
    });
    const lesson3Id = await ctx.db.insert("lessons", {
      curriculumId,
      title: "The Water Cycle",
      description: "Ocean to clouds to rain.",
      content: "Water cycles",
      order: 3,
      isActive: true,
      createdAt: Date.now(),
      createdBy: teacherId,
    });

    // 7. CREATE CLASS (Attached to Campus)
    const classId = await ctx.db.insert("classes", {
      name: "Science 101 - Fall 2024",
      curriculumId,
      schoolId,
      campusId: campusId,
      teacherId,
      classType: "standard",
      students: studentIds,
      academicYear: "2024-2025",
      isActive: true,
      createdAt: Date.now(),
      createdBy: adminId,
      startDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
      endDate: Date.now() + 60 * 24 * 60 * 60 * 1000,
    });

    // 8. SCHEDULE LESSONS
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    const schedule1Id = await ctx.db.insert("classSchedule", {
      classId,
      lessonIds: [lesson1Id],
      scheduledStart: now - 10 * 60 * 1000,
      scheduledEnd: now + 50 * 60 * 1000,
      roomName: `class-${classId}-lesson-${lesson1Id}-${now}`,
      status: "active",
      isLive: true,
      createdAt: now,
      createdBy: teacherId,
    });

    const tomorrow10AM = new Date();
    tomorrow10AM.setDate(tomorrow10AM.getDate() + 1);
    tomorrow10AM.setHours(10, 0, 0, 0);
    await ctx.db.insert("classSchedule", {
      classId,
      lessonIds: [lesson2Id],
      scheduledStart: tomorrow10AM.getTime(),
      scheduledEnd: tomorrow10AM.getTime() + oneHour,
      roomName: `class-${classId}-lesson-${lesson2Id}-${tomorrow10AM.getTime()}`,
      status: "scheduled",
      isLive: false,
      createdAt: now,
      createdBy: teacherId,
    });

    const nextWeek = now + 7 * 24 * 60 * 60 * 1000;
    await ctx.db.insert("classSchedule", {
      classId,
      lessonIds: [lesson3Id],
      scheduledStart: nextWeek,
      scheduledEnd: nextWeek + oneHour,
      roomName: `class-${classId}-lesson-${lesson3Id}-${nextWeek}`,
      status: "scheduled",
      isLive: false,
      createdAt: now,
      createdBy: teacherId,
    });

    const yesterday = now - 24 * 60 * 60 * 1000;
    await ctx.db.insert("classSchedule", {
      classId,
      lessonIds: [lesson1Id],
      scheduledStart: yesterday,
      scheduledEnd: yesterday + oneHour,
      roomName: `class-${classId}-lesson-${lesson1Id}-${yesterday}`,
      status: "completed",
      isLive: false,
      completedAt: yesterday + oneHour,
      createdAt: yesterday - 2 * 24 * 60 * 60 * 1000,
      createdBy: teacherId,
    });

    // 9. SAMPLE ATTENDANCE
    for (const studentId of studentIds) {
      await ctx.db.insert("class_sessions", {
        scheduleId: schedule1Id,
        studentId,
        joinedAt: yesterday + 5 * 60 * 1000,
        leftAt: yesterday + 55 * 60 * 1000,
        durationSeconds: 50 * 60,
        roomName: `class-${classId}-lesson-${lesson1Id}-${yesterday}`,
        sessionDate: new Date(yesterday).toISOString().split("T")[0],
      });
    }

    return { message: "Multi-Tenant Seed complete!" };
  },
});

export const createClassesUxDemo = internalMutation({
  args: {},
  returns: v.object({
    message: v.string(),
    classId: v.id("classes"),
    curriculumId: v.id("curriculums"),
    school: v.optional(v.string()),
    campus: v.optional(v.string()),
    lessons: v.optional(v.number()),
    students: v.optional(v.number()),
    schedules: v.optional(v.number()),
  }),
  handler: async (ctx) => {
    const existingCurriculum = await ctx.db
      .query("curriculums")
      .withIndex("by_code", (q) => q.eq("code", UX_DEMO_CURRICULUM_CODE))
      .first();

    if (existingCurriculum) {
      const curriculumClasses = await ctx.db
        .query("classes")
        .withIndex("by_curriculum", (q) =>
          q.eq("curriculumId", existingCurriculum._id),
        )
        .collect();
      const existingClass = curriculumClasses.find(
        (classData) => classData.name === UX_DEMO_CLASS_NAME,
      );

      if (existingClass) {
        return {
          message: "UX demo class already exists.",
          classId: existingClass._id,
          curriculumId: existingCurriculum._id,
        };
      }
    }

    const campus = await getDemoCampus(ctx);
    const school = await ctx.db.get(campus.schoolId);
    if (!school) throw new Error("Demo campus has no parent school.");

    const teacher =
      (await getUserByRole(ctx, "teacher", campus._id)) ||
      (await getUserByRole(ctx, "principal", campus._id)) ||
      (await getUserByRole(ctx, "admin"));
    if (!teacher)
      throw new Error("No teacher/admin user found for demo class.");

    const admin = (await getUserByRole(ctx, "admin")) || teacher;
    const students = await getStudents(ctx, campus._id);
    const now = Date.now();

    const curriculumId =
      existingCurriculum?._id ||
      (await ctx.db.insert("curriculums", {
        title: "UX Demo Biology Curriculum",
        description:
          "Demo curriculum for reviewing the class detail flow, scheduling model, and curriculum hierarchy.",
        code: UX_DEMO_CURRICULUM_CODE,
        color: "#2563eb",
        schoolId: school._id,
        gradeCodes: ["07", "08"],
        isActive: true,
        createdAt: now,
        createdBy: admin._id,
      }));

    const existingLessons = await ctx.db
      .query("lessons")
      .withIndex("by_curriculum", (q) => q.eq("curriculumId", curriculumId))
      .collect();

    const lessonIds: Id<"lessons">[] = [];
    if (existingLessons.length > 0) {
      lessonIds.push(
        ...existingLessons
          .sort((a, b) => a.order - b.order)
          .map((lesson) => lesson._id),
      );
    } else {
      for (const [index, lesson] of uxDemoLessons.entries()) {
        const [title, description] = lesson;
        const lessonId = await ctx.db.insert("lessons", {
          curriculumId,
          title,
          description,
          content: `Demo lesson content for ${title}.`,
          order: index + 1,
          isActive: true,
          createdAt: now + index,
          createdBy: teacher._id,
        });
        lessonIds.push(lessonId);
      }
    }

    const classId = await ctx.db.insert("classes", {
      name: UX_DEMO_CLASS_NAME,
      description:
        "A complete demo class to review Overview, Sessions, Curriculum, Students, linked lessons, and custom sessions.",
      curriculumId,
      schoolId: campus.schoolId,
      campusId: campus._id,
      teacherId: teacher._id,
      students: students.map((student) => student._id),
      academicYear: "2026-2027",
      classType: "standard",
      startDate: nextDate(-21, 8),
      endDate: nextDate(75, 15),
      isActive: true,
      createdAt: now,
      createdBy: admin._id,
    });

    const schedules = [
      {
        lessonIds: [lessonIds[0]],
        title: undefined,
        description:
          "Completed orientation session linked to the first curriculum lesson.",
        start: nextDate(-10, 9),
        end: nextDate(-10, 10),
        status: "completed" as const,
        completedAt: nextDate(-10, 10),
      },
      {
        lessonIds: [lessonIds[1]],
        title: undefined,
        description:
          "Live class currently active for reviewing join and active-state UI.",
        start: Date.now() - 20 * 60 * 1000,
        end: Date.now() + 40 * 60 * 1000,
        status: "active" as const,
        isLive: true,
      },
      {
        lessonIds: [lessonIds[2]],
        title: undefined,
        description: "Upcoming curriculum lesson with a normal live session.",
        start: nextDate(1, 10),
        end: nextDate(1, 11),
        status: "scheduled" as const,
      },
      {
        lessonIds: undefined,
        title: "Custom review: notebook check and Q&A",
        description:
          "A custom class session that does not modify or extend the curriculum.",
        start: nextDate(2, 14),
        end: nextDate(2, 15),
        status: "scheduled" as const,
      },
      {
        lessonIds: [lessonIds[3]],
        title: undefined,
        description:
          "Ignitia-style session to inspect external-platform visual states.",
        start: nextDate(4, 9),
        end: nextDate(4, 10),
        status: "scheduled" as const,
        sessionType: "ignitia" as const,
      },
      {
        lessonIds: undefined,
        title: "Custom assessment conference",
        description: "Past custom session with attendance records.",
        start: nextDate(-3, 13),
        end: nextDate(-3, 14),
        status: "completed" as const,
        completedAt: nextDate(-3, 14),
      },
    ];

    const createdScheduleIds: Id<"classSchedule">[] = [];
    for (const [index, schedule] of schedules.entries()) {
      const scheduleId = await ctx.db.insert("classSchedule", {
        classId,
        lessonIds: schedule.lessonIds,
        title: schedule.title,
        description: schedule.description,
        scheduledStart: schedule.start,
        scheduledEnd: schedule.end,
        sessionType: schedule.sessionType || "live",
        roomName: `ux-demo-${classId}-${index}-${schedule.start}`,
        isLive: schedule.isLive || false,
        status: schedule.status,
        completedAt: schedule.completedAt,
        isRecurring: false,
        createdAt: now + index,
        createdBy: teacher._id,
      });
      createdScheduleIds.push(scheduleId);
    }

    const attendedScheduleIds = [
      createdScheduleIds[0],
      createdScheduleIds[5],
    ].filter(Boolean);
    for (const scheduleId of attendedScheduleIds) {
      const schedule = await ctx.db.get(scheduleId);
      if (!schedule) continue;

      for (const [index, student] of students.slice(0, 8).entries()) {
        const joinedAt = schedule.scheduledStart + (index % 3) * 5 * 60 * 1000;
        const leftAt =
          index % 4 === 0
            ? schedule.scheduledStart + 20 * 60 * 1000
            : schedule.scheduledEnd - (index % 2) * 5 * 60 * 1000;

        await ctx.db.insert("class_sessions", {
          scheduleId,
          studentId: student._id,
          joinedAt,
          leftAt,
          durationSeconds: Math.max(0, Math.round((leftAt - joinedAt) / 1000)),
          roomName: schedule.roomName,
          sessionDate: new Date(schedule.scheduledStart)
            .toISOString()
            .split("T")[0],
          attendanceStatus: index === 7 ? "excused" : undefined,
          manualMarkedBy: index === 7 ? teacher._id : undefined,
        });
      }
    }

    return {
      message: "Created UX demo class.",
      school: school.name,
      campus: campus.name,
      classId,
      curriculumId,
      lessons: lessonIds.length,
      students: students.length,
      schedules: createdScheduleIds.length,
    };
  },
});

export const createClassesTableDemo = internalMutation({
  args: {},
  returns: v.object({
    message: v.string(),
    teacher: v.string(),
    campus: v.string(),
    created: v.number(),
    updated: v.number(),
    total: v.number(),
  }),
  handler: async (ctx) => {
    const teacher = await findUserByName(ctx, "betancourt");
    if (!teacher) {
      throw new Error("No active user matching Betancourt was found.");
    }

    const campus =
      (await getUserCampus(ctx, teacher._id)) || (await getDemoCampus(ctx));
    const school = await ctx.db.get(campus.schoolId);
    if (!school) throw new Error("Demo campus has no parent school.");

    const admin = (await getUserByRole(ctx, "admin")) || teacher;
    const students = await getStudents(ctx, campus._id);
    const now = Date.now();
    const createdClassIds: Id<"classes">[] = [];
    const updatedClassIds: Id<"classes">[] = [];

    for (const [index, demoClass] of classesTableDemoClasses.entries()) {
      let curriculum = await ctx.db
        .query("curriculums")
        .withIndex("by_code", (q) => q.eq("code", demoClass.curriculumCode))
        .first();

      if (!curriculum) {
        const curriculumId = await ctx.db.insert("curriculums", {
          title: demoClass.curriculumTitle,
          description: "Demo curriculum for reviewing classes table behavior.",
          code: demoClass.curriculumCode,
          color: "#f97316",
          schoolId: school._id,
          isActive: true,
          createdAt: now + index,
          createdBy: admin._id,
        });
        curriculum = await ctx.db.get(curriculumId);
      }

      if (!curriculum) continue;

      const curriculumClasses = await ctx.db
        .query("classes")
        .withIndex("by_curriculum", (q) => q.eq("curriculumId", curriculum._id))
        .collect();
      const existingClass = curriculumClasses.find(
        (classData) => classData.name === demoClass.name,
      );
      const selectedStudents = students
        .slice(0, Math.min(demoClass.studentCount, students.length))
        .map((student) => student._id);

      const classData = {
        curriculumId: curriculum._id,
        schoolId: campus.schoolId,
        campusId: campus._id,
        teacherId: teacher._id,
        tutorId: undefined,
        students: selectedStudents,
        academicYear: demoClass.academicYear,
        classType: "standard" as const,
        startDate: nextDate(-14 + index, 8),
        endDate: nextDate(90 + index, 15),
        isActive: true,
      };

      if (existingClass) {
        await ctx.db.patch(existingClass._id, classData);
        updatedClassIds.push(existingClass._id);
      } else {
        const classId = await ctx.db.insert("classes", {
          name: demoClass.name,
          description: "Demo class for reviewing classes table layout.",
          ...classData,
          createdAt: now + index,
          createdBy: admin._id,
        });
        createdClassIds.push(classId);
      }
    }

    return {
      message: "Created classes table demo data.",
      teacher: teacher.fullName,
      campus: campus.name,
      created: createdClassIds.length,
      updated: updatedClassIds.length,
      total: classesTableDemoClasses.length,
    };
  },
});

export const createLauraTodaySchedule = internalMutation({
  args: {},
  returns: v.object({
    message: v.string(),
    student: v.string(),
    schedules: v.array(
      v.object({
        className: v.string(),
        roomName: v.string(),
        start: v.string(),
        end: v.string(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const student = (await ctx.db.query("users").collect()).find(
      (user) => user.username === LAURA_TODAY_DEMO_USERNAME,
    );
    if (!student) {
      throw new Error(`Student ${LAURA_TODAY_DEMO_USERNAME} was not found.`);
    }

    const classes = (
      await ctx.db
        .query("classes")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect()
    )
      .filter((classData) => classData.students?.includes(student._id))
      .sort((a, b) => {
        const preferredOrder = [
          "UI Content",
          "Advanced Literature",
          "Integrated STEM",
          "Data Science",
          "Pre-Algebra",
          "World History",
          "Life Science",
        ];
        const aIndex = preferredOrder.findIndex((name) =>
          a.name.includes(name),
        );
        const bIndex = preferredOrder.findIndex((name) =>
          b.name.includes(name),
        );
        return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
      });

    if (classes.length === 0) {
      throw new Error("Laura is not assigned to any active legacy classes.");
    }

    const now = Date.now();
    const createdAt = now;
    const schoolDaySlots = [
      [8, 0, 8, 45],
      [8, 55, 9, 40],
      [9, 50, 10, 35],
      [10, 45, 11, 30],
      [11, 40, 12, 25],
      [13, 15, 14, 0],
      [14, 10, 14, 55],
      [15, 5, 15, 50],
      [16, 0, 16, 45],
      [16, 45, 17, 0],
    ] as const;
    const scheduled = [];

    for (const [index, slot] of schoolDaySlots.entries()) {
      const classData = classes[index % classes.length];
      const [startHour, startMinute, endHour, endMinute] = slot;
      const start = todayInBogota(startHour, startMinute);
      const end = todayInBogota(endHour, endMinute);
      const roomName = `${LAURA_TODAY_DEMO_ROOM_PREFIX}-${classData._id}-${index}`;
      const existing = await ctx.db
        .query("classSchedule")
        .withIndex("by_room", (q) => q.eq("roomName", roomName))
        .first();

      const scheduleData = {
        classId: classData._id,
        lessonIds: [],
        title: "Class Session",
        description:
          "Demo session for reviewing a full student school-day upcoming UI.",
        scheduledStart: start,
        scheduledEnd: end,
        sessionType: "live" as const,
        roomName,
        isLive: false,
        isRecurring: false,
        status: "scheduled" as const,
        createdAt: existing?.createdAt ?? createdAt + index,
        createdBy: classData.teacherId ?? student._id,
      };

      if (existing) {
        await ctx.db.patch(existing._id, scheduleData);
      } else {
        await ctx.db.insert("classSchedule", scheduleData);
      }

      scheduled.push({
        className: classData.name,
        roomName,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
      });
    }

    return {
      message: "Laura today demo schedule is ready.",
      student: student.fullName,
      schedules: scheduled,
    };
  },
});

export const createLauraClassroomLayoutDemo = internalMutation({
  args: {},
  returns: v.object({
    message: v.string(),
    student: v.string(),
    teacher: v.string(),
    campus: v.string(),
    timeZone: v.string(),
    schedules: v.array(
      v.object({
        className: v.string(),
        roomName: v.string(),
        start: v.string(),
        end: v.string(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const student = (await ctx.db.query("users").collect()).find(
      (user) => user.username === LAURA_TODAY_DEMO_USERNAME,
    );
    if (!student) {
      throw new Error(`Student ${LAURA_TODAY_DEMO_USERNAME} was not found.`);
    }

    const teacher =
      (await findUserByName(ctx, "betancourt")) ||
      (await getUserByRole(ctx, "teacher"));
    if (!teacher) throw new Error("No active teacher was found.");

    const campus =
      (await getUserCampus(ctx, student._id)) ||
      (await getUserCampus(ctx, teacher._id)) ||
      (await getDemoCampus(ctx));
    if (!campus.timeZone) {
      throw new Error(`Campus ${campus.name} has no time zone configured.`);
    }

    const admin =
      (await findUserByName(ctx, "laura.horta@correounivalle.edu.co")) ||
      (await getUserByRole(ctx, "admin", campus._id)) ||
      (await getUserByRole(ctx, "admin")) ||
      teacher;
    const enrollments = await ctx.db
      .query("classEnrollments")
      .withIndex("by_student", (query) => query.eq("studentId", student._id))
      .collect();
    const enrolledClasses = (
      await Promise.all(
        enrollments.map((enrollment) => ctx.db.get(enrollment.classId)),
      )
    ).filter((classData): classData is Doc<"classes"> =>
      Boolean(
        classData?.isActive &&
          classData.campusId === campus._id &&
          classData.teacherId === teacher._id,
      ),
    );
    const preferredNames = [
      "Research Methods",
      "Statistics and Data Lab",
      "Media Arts Lab",
      "Life Science Investigations",
      "Study Skills Seminar",
    ];
    const classes = [...enrolledClasses].sort((first, second) => {
      const firstIndex = preferredNames.indexOf(first.name);
      const secondIndex = preferredNames.indexOf(second.name);
      return (
        (firstIndex === -1 ? 99 : firstIndex) -
        (secondIndex === -1 ? 99 : secondIndex)
      );
    });

    if (classes.length === 0) {
      throw new Error(
        "Laura has no active classes assigned to Profesora Betancourt in her campus.",
      );
    }

    const now = Date.now();
    const baseStart = Math.floor(now / 60_000) * 60_000 - 5 * 60_000;
    const slots = [
      [-5, 25],
      [35, 65],
      [75, 105],
      [115, 145],
      [155, 185],
    ] as const;
    const schedules = [];

    for (const [index, [startOffset, endOffset]] of slots.entries()) {
      const classData = classes[index % classes.length];
      const roomName = `${LAURA_CLASSROOM_DEMO_ROOM_PREFIX}-${index + 1}`;
      const existingSchedule = await ctx.db
        .query("classSchedule")
        .withIndex("by_room", (query) => query.eq("roomName", roomName))
        .first();
      if (existingSchedule) {
        await deleteScheduleWithDependencies(ctx, existingSchedule);
      }

      const start = baseStart + (startOffset + 5) * 60_000;
      const end = baseStart + (endOffset + 5) * 60_000;
      await ctx.db.insert("classSchedule", {
        classId: classData._id,
        lessonIds: [],
        title: classData.name,
        scheduledStart: start,
        scheduledEnd: end,
        sessionType: "live",
        roomName,
        isLive: false,
        isRecurring: false,
        status: "scheduled",
        createdAt: now + index,
        createdBy: admin._id,
      });

      schedules.push({
        className: classData.name,
        roomName,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
      });
    }

    return {
      message: "Laura classroom layout demo is ready.",
      student: student.fullName,
      teacher: teacher.fullName,
      campus: campus.name,
      timeZone: campus.timeZone,
      schedules,
    };
  },
});

export const createLauraRecordingDemo = internalMutation({
  args: {},
  returns: v.object({
    message: v.string(),
    student: v.string(),
    recordings: v.array(
      v.object({
        scheduleId: v.id("classSchedule"),
        roomName: v.string(),
        url: v.string(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const student = (await ctx.db.query("users").collect()).find(
      (user) => user.username === LAURA_TODAY_DEMO_USERNAME,
    );
    if (!student) {
      throw new Error(`Student ${LAURA_TODAY_DEMO_USERNAME} was not found.`);
    }

    const classIds = new Set<Id<"classes">>();
    const enrollments = await ctx.db
      .query("classEnrollments")
      .withIndex("by_student", (query) => query.eq("studentId", student._id))
      .collect();
    enrollments.forEach((enrollment) => classIds.add(enrollment.classId));

    const legacyClasses = await ctx.db
      .query("classes")
      .withIndex("by_active", (query) => query.eq("isActive", true))
      .collect();
    legacyClasses.forEach((classData) => {
      if (
        !classData.enrollmentsMigratedAt &&
        classData.students?.includes(student._id)
      ) {
        classIds.add(classData._id);
      }
    });

    const pastSchedules = (
      await Promise.all(
        [...classIds].map((classId) =>
          ctx.db
            .query("classSchedule")
            .withIndex("by_class", (query) => query.eq("classId", classId))
            .collect(),
        ),
      )
    )
      .flat()
      .filter(
        (schedule) =>
          schedule.scheduledEnd < Date.now() &&
          schedule.status !== "cancelled" &&
          Boolean(schedule.roomName),
      )
      .sort((first, second) => second.scheduledStart - first.scheduledStart)
      .slice(0, 2);

    if (pastSchedules.length === 0) {
      throw new Error("No past classes were found for Laura.");
    }

    const schedule = pastSchedules[0];
    const recordingCount = 3;
    const scheduleDuration = schedule.scheduledEnd - schedule.scheduledStart;
    const partDuration = Math.floor(scheduleDuration / recordingCount);
    const recordings = [];

    for (let index = 0; index < recordingCount; index += 1) {
      const partNumber = index + 1;
      const egressId =
        index === 0
          ? `${LAURA_RECORDING_DEMO_EGRESS_PREFIX}-${schedule._id}`
          : `${LAURA_RECORDING_DEMO_EGRESS_PREFIX}-${schedule._id}-part-${partNumber}`;
      const existing = await ctx.db
        .query("recordings")
        .withIndex("by_egress_id", (query) => query.eq("egressId", egressId))
        .first();
      const startedAt = schedule.scheduledStart + partDuration * index;
      const completedAt =
        index === recordingCount - 1
          ? schedule.scheduledEnd
          : startedAt + partDuration;
      const recordingData = {
        scheduleId: schedule._id,
        roomName: schedule.roomName,
        egressId,
        status: "complete" as const,
        fileKey: `dev/${egressId}.mp4`,
        url: LAURA_RECORDING_DEMO_URL,
        durationMs: completedAt - startedAt,
        fileSize: 1_128_375 + index * 125_000,
        startedAt,
        completedAt,
      };

      if (existing) {
        await ctx.db.patch(existing._id, recordingData);
      } else {
        await ctx.db.insert("recordings", recordingData);
      }

      recordings.push({
        scheduleId: schedule._id,
        roomName: schedule.roomName,
        url: LAURA_RECORDING_DEMO_URL,
      });
    }

    return {
      message: "Laura recording demo data is ready.",
      student: student.fullName,
      recordings,
    };
  },
});

export const createLauraCourseLoadDemo = internalMutation({
  args: {},
  returns: v.object({
    message: v.string(),
    student: v.string(),
    targetCourses: v.number(),
    beforeCourses: v.number(),
    afterCourses: v.number(),
    created: v.number(),
    updated: v.number(),
    enrolled: v.number(),
    courses: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const student = (await ctx.db.query("users").collect()).find(
      (user) => user.username === LAURA_TODAY_DEMO_USERNAME,
    );
    if (!student) {
      throw new Error(`Student ${LAURA_TODAY_DEMO_USERNAME} was not found.`);
    }

    const teacher =
      (await findUserByName(ctx, "betancourt")) ||
      (await getUserByRole(ctx, "teacher"));
    if (!teacher) throw new Error("No active teacher was found.");

    const campus =
      (await getUserCampus(ctx, student._id)) ||
      (await getUserCampus(ctx, teacher._id)) ||
      (await getDemoCampus(ctx));
    const school = await ctx.db.get(campus.schoolId);
    if (!school) throw new Error("Demo campus has no parent school.");

    const admin = (await getUserByRole(ctx, "admin")) || teacher;
    const now = Date.now();
    const enrollmentRows = await ctx.db
      .query("classEnrollments")
      .withIndex("by_student", (q) => q.eq("studentId", student._id))
      .collect();
    const lauraClassIds = new Set<Id<"classes">>();

    for (const enrollment of enrollmentRows) {
      const classData = await ctx.db.get(enrollment.classId);
      if (classData?.isActive) lauraClassIds.add(classData._id);
    }

    const legacyClasses = await ctx.db
      .query("classes")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    for (const classData of legacyClasses) {
      if (
        !classData.enrollmentsMigratedAt &&
        classData.students?.includes(student._id)
      ) {
        lauraClassIds.add(classData._id);
      }
    }

    const beforeCourses = lauraClassIds.size;
    let created = 0;
    let updated = 0;
    let enrolled = 0;
    const courses: string[] = [];

    for (const [index, course] of lauraCourseLoadDemoCourses.entries()) {
      if (lauraClassIds.size >= LAURA_COURSE_LOAD_TARGET) break;

      const [className, curriculumTitle] = course;
      const curriculumCode = `${LAURA_COURSE_LOAD_CODE_PREFIX}-${String(
        index + 1,
      ).padStart(2, "0")}`;
      let curriculum = await ctx.db
        .query("curriculums")
        .withIndex("by_code", (q) => q.eq("code", curriculumCode))
        .first();

      if (!curriculum) {
        const curriculumId = await ctx.db.insert("curriculums", {
          title: curriculumTitle,
          description: "Demo curriculum for reviewing student course load UI.",
          code: curriculumCode,
          color: "#0ea5e9",
          schoolId: school._id,
          isActive: true,
          createdAt: now + index,
          createdBy: admin._id,
        });
        curriculum = await ctx.db.get(curriculumId);
      }

      if (!curriculum) continue;

      const curriculumClasses = await ctx.db
        .query("classes")
        .withIndex("by_curriculum", (q) => q.eq("curriculumId", curriculum._id))
        .collect();
      const existingClass = curriculumClasses.find(
        (classData) => classData.name === className,
      );
      const students = Array.from(
        new Set([...(existingClass?.students ?? []), student._id]),
      );
      const classData = {
        curriculumId: curriculum._id,
        schoolId: campus.schoolId,
        campusId: campus._id,
        teacherId: teacher._id,
        tutorId: undefined,
        students,
        academicYear: "2026-2027",
        classType: "standard" as const,
        startDate: nextDate(-10 + index, 8),
        endDate: nextDate(100 + index, 15),
        isActive: true,
      };

      const classId = existingClass
        ? existingClass._id
        : await ctx.db.insert("classes", {
            name: className,
            description: "Demo class for reviewing student course load UI.",
            ...classData,
            createdAt: now + index,
            createdBy: admin._id,
          });

      if (existingClass) {
        await ctx.db.patch(existingClass._id, classData);
        updated++;
      } else {
        created++;
      }

      const existingEnrollment = await ctx.db
        .query("classEnrollments")
        .withIndex("by_class", (q) =>
          q.eq("classId", classId).eq("studentId", student._id),
        )
        .unique();
      if (!existingEnrollment) {
        await ctx.db.insert("classEnrollments", {
          classId,
          studentId: student._id,
          enrolledAt: now + index,
          enrolledBy: admin._id,
        });
        enrolled++;
      }

      lauraClassIds.add(classId);
      courses.push(className);
    }

    return {
      message: "Laura course load demo is ready.",
      student: student.fullName,
      targetCourses: LAURA_COURSE_LOAD_TARGET,
      beforeCourses,
      afterCourses: lauraClassIds.size,
      created,
      updated,
      enrolled,
      courses,
    };
  },
});

export const createLauraCalendarProviderDemo = internalMutation({
  args: {},
  returns: v.object({
    message: v.string(),
    student: v.string(),
    campus: v.string(),
    timeZone: v.string(),
    createdBy: v.string(),
    classes: v.array(
      v.object({
        className: v.string(),
        provider: v.union(
          v.literal("live"),
          v.literal("ignitia"),
          v.literal("abeka"),
        ),
        gradeCode: v.string(),
        teacherName: v.optional(v.string()),
        start: v.string(),
        end: v.string(),
        status: v.union(v.literal("scheduled"), v.literal("completed")),
        hasRecording: v.boolean(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const student = (await ctx.db.query("users").collect()).find(
      (user) => user.username === LAURA_TODAY_DEMO_USERNAME,
    );
    if (!student) {
      throw new Error(`Student ${LAURA_TODAY_DEMO_USERNAME} was not found.`);
    }

    const campus =
      (await getUserCampus(ctx, student._id)) || (await getDemoCampus(ctx));
    if (!campus.timeZone) {
      throw new Error(`Campus ${campus.name} has no time zone configured.`);
    }

    const school = await ctx.db.get(campus.schoolId);
    if (!school) throw new Error("Demo campus has no parent school.");

    const admin =
      (await findUserByName(ctx, "laura.horta@correounivalle.edu.co")) ||
      (await getUserByRole(ctx, "admin", campus._id)) ||
      (await getUserByRole(ctx, "admin"));
    if (!admin) throw new Error("No active administrator was found.");

    const teacher =
      (await findUserByName(ctx, "betancourt")) ||
      (await getUserByRole(ctx, "teacher", campus._id));
    if (!teacher) throw new Error("No active teacher was found.");

    const now = Date.now();
    const localToday = todayInTimeZone(campus.timeZone);
    const scheduleSlots = [
      {
        key: "today",
        dayOffset: 0,
        hourOffset: 0,
        status: "completed" as const,
      },
      {
        key: "tomorrow",
        dayOffset: 1,
        hourOffset: 3,
        status: "scheduled" as const,
      },
      {
        key: "next-week",
        dayOffset: 7,
        hourOffset: 0,
        status: "scheduled" as const,
      },
    ] as const;
    const seededClasses = [];

    for (const [
      courseIndex,
      course,
    ] of lauraCalendarProviderDemoCourses.entries()) {
      const curriculumCode = `${LAURA_CALENDAR_PROVIDER_DEMO_CODE_PREFIX}-${course.key}`;
      let curriculum = await ctx.db
        .query("curriculums")
        .withIndex("by_code", (q) => q.eq("code", curriculumCode))
        .first();

      if (!curriculum) {
        const curriculumId = await ctx.db.insert("curriculums", {
          title: course.curriculumTitle,
          description:
            "Development curriculum for validating calendar provider styles.",
          code: curriculumCode,
          color: course.color,
          gradeCodes: ["08"],
          schoolId: school._id,
          isActive: true,
          createdAt: now + courseIndex,
          createdBy: admin._id,
        });
        curriculum = await ctx.db.get(curriculumId);
      } else {
        await ctx.db.patch(curriculum._id, {
          title: course.curriculumTitle,
          color: course.color,
          gradeCodes: ["08"],
          schoolId: school._id,
          isActive: true,
          createdBy: admin._id,
        });
      }
      if (!curriculum) continue;

      const curriculumClasses = await ctx.db
        .query("classes")
        .withIndex("by_curriculum", (q) => q.eq("curriculumId", curriculum._id))
        .collect();
      const existingClass = curriculumClasses.find(
        (classData) => classData.name === course.name,
      );
      const teacherId = course.sessionType === "live" ? teacher._id : undefined;
      const classData = {
        name: course.name,
        curriculumId: curriculum._id,
        schoolId: campus.schoolId,
        campusId: campus._id,
        teacherId,
        tutorId: undefined,
        students: undefined,
        enrollmentsMigratedAt: existingClass?.enrollmentsMigratedAt ?? now,
        classType: course.classType,
        academicYear: "2026-2027",
        gradeCode: "08",
        timeZone: campus.timeZone,
        isActive: true,
      };
      const classId = existingClass
        ? existingClass._id
        : await ctx.db.insert("classes", {
            ...classData,
            createdAt: now + courseIndex,
            createdBy: admin._id,
          });

      if (existingClass) {
        await ctx.db.patch(existingClass._id, {
          ...classData,
          createdBy: admin._id,
        });
      }

      const enrollment = await ctx.db
        .query("classEnrollments")
        .withIndex("by_class", (q) =>
          q.eq("classId", classId).eq("studentId", student._id),
        )
        .unique();
      if (!enrollment) {
        await ctx.db.insert("classEnrollments", {
          classId,
          studentId: student._id,
          enrolledAt: now + courseIndex,
          enrolledBy: admin._id,
        });
      } else {
        await ctx.db.patch(enrollment._id, { enrolledBy: admin._id });
      }

      for (const [slotIndex, slot] of scheduleSlots.entries()) {
        const localDate = addCivilDays(localToday, slot.dayOffset);
        const startHour = course.startHour + slot.hourOffset;
        const start = localDateTimeToUtc(
          `${localDate}T${String(startHour).padStart(2, "0")}:00`,
          campus.timeZone,
        );
        const end = localDateTimeToUtc(
          `${localDate}T${String(startHour).padStart(2, "0")}:45`,
          campus.timeZone,
        );
        const roomName = `${LAURA_CALENDAR_PROVIDER_DEMO_ROOM_PREFIX}-${course.key.toLowerCase()}-${slot.key}`;
        const existingSchedule = await ctx.db
          .query("classSchedule")
          .withIndex("by_room", (q) => q.eq("roomName", roomName))
          .first();
        const scheduleData = {
          classId,
          lessonIds: [],
          title: course.name,
          scheduledStart: start,
          scheduledEnd: end,
          sessionType: course.sessionType,
          roomName,
          isLive: false,
          isRecurring: true,
          recurrenceRule: "FREQ=WEEKLY;INTERVAL=1",
          status: slot.status,
          completedAt: slot.status === "completed" ? end : undefined,
          createdAt:
            existingSchedule?.createdAt ??
            now + courseIndex * scheduleSlots.length + slotIndex,
          createdBy: admin._id,
        };
        const scheduleId = existingSchedule
          ? existingSchedule._id
          : await ctx.db.insert("classSchedule", scheduleData);

        if (existingSchedule) {
          await ctx.db.patch(existingSchedule._id, scheduleData);
        }

        const hasRecording =
          course.sessionType === "live" && slot.key === "today";
        if (hasRecording) {
          const egressId = `${LAURA_RECORDING_DEMO_EGRESS_PREFIX}-provider-calendar`;
          const existingRecording = await ctx.db
            .query("recordings")
            .withIndex("by_egress_id", (q) => q.eq("egressId", egressId))
            .first();
          const recordingData = {
            scheduleId,
            roomName,
            egressId,
            status: "complete" as const,
            url: LAURA_RECORDING_DEMO_URL,
            durationMs: end - start,
            startedAt: start,
            completedAt: end,
          };

          if (existingRecording) {
            await ctx.db.patch(existingRecording._id, recordingData);
          } else {
            await ctx.db.insert("recordings", recordingData);
          }
        }

        seededClasses.push({
          className: course.name,
          provider: course.sessionType,
          gradeCode: "08",
          teacherName:
            course.sessionType === "live" ? teacher.fullName : undefined,
          start: new Date(start).toISOString(),
          end: new Date(end).toISOString(),
          status: slot.status,
          hasRecording,
        });
      }
    }

    return {
      message: "Laura calendar provider demo data is ready.",
      student: student.fullName,
      campus: campus.name,
      timeZone: campus.timeZone,
      createdBy: admin.fullName,
      classes: seededClasses,
    };
  },
});

export const createAdvancedLiteratureLessonsDemo = internalMutation({
  args: {},
  returns: v.object({
    message: v.string(),
    className: v.string(),
    curriculumTitle: v.string(),
    created: v.number(),
    updated: v.number(),
    total: v.number(),
  }),
  handler: async (ctx) => {
    const classDoc = await getClassByName(ctx, ADVANCED_LITERATURE_CLASS_NAME);
    if (!classDoc) {
      throw new Error(
        `No class found with name "${ADVANCED_LITERATURE_CLASS_NAME}".`,
      );
    }

    const curriculum = await ctx.db.get(classDoc.curriculumId);
    if (!curriculum) {
      throw new Error("Advanced Literature class has no curriculum.");
    }

    const author =
      (classDoc.teacherId && (await ctx.db.get(classDoc.teacherId))) ||
      (await getUserByRole(ctx, "admin"));
    if (!author) throw new Error("No active user found to create lessons.");

    const now = Date.now();
    const existingLessons = await ctx.db
      .query("lessons")
      .withIndex("by_curriculum", (q) => q.eq("curriculumId", curriculum._id))
      .collect();
    const existingByTitle = new Map(
      existingLessons.map((lesson) => [lesson.title, lesson]),
    );
    let order = existingLessons.reduce(
      (max, lesson) => Math.max(max, lesson.order),
      0,
    );
    let created = 0;
    let updated = 0;

    for (const lesson of advancedLiteratureLessons) {
      const existingLesson = existingByTitle.get(lesson.title);
      if (existingLesson) {
        await ctx.db.patch(existingLesson._id, {
          description: lesson.description,
          content: lesson.content,
          isActive: true,
        });
        updated += 1;
        continue;
      }

      order += 1;
      await ctx.db.insert("lessons", {
        curriculumId: curriculum._id,
        title: lesson.title,
        description: lesson.description,
        content: lesson.content,
        order,
        isActive: true,
        createdAt: now + order,
        createdBy: author._id,
      });
      created += 1;
    }

    return {
      message: "Created Advanced Literature demo lessons.",
      className: classDoc.name,
      curriculumTitle: curriculum.title,
      created,
      updated,
      total: advancedLiteratureLessons.length,
    };
  },
});

export const clearClassesTableDemo = internalMutation({
  args: {},
  returns: v.object({
    message: v.string(),
    curriculums: v.number(),
    classes: v.number(),
    lessons: v.number(),
  }),
  handler: async (ctx) => {
    const demoCurriculums = await ctx.db.query("curriculums").collect();
    const targetCurriculums = demoCurriculums.filter((curriculum) =>
      curriculum.code?.startsWith(CLASSES_TABLE_DEMO_CODE_PREFIX),
    );

    let deletedClasses = 0;
    let deletedLessons = 0;
    for (const curriculum of targetCurriculums) {
      const classes = await ctx.db
        .query("classes")
        .withIndex("by_curriculum", (q) => q.eq("curriculumId", curriculum._id))
        .collect();

      for (const classDoc of classes) {
        await deleteSchedulesForClass(ctx, classDoc._id);
        await ctx.db.delete(classDoc._id);
        deletedClasses += 1;
      }

      const lessons = await ctx.db
        .query("lessons")
        .withIndex("by_curriculum", (q) => q.eq("curriculumId", curriculum._id))
        .collect();
      for (const lesson of lessons) {
        await ctx.db.delete(lesson._id);
        deletedLessons += 1;
      }

      await ctx.db.delete(curriculum._id);
    }

    return {
      message: "Cleared classes table demo data.",
      curriculums: targetCurriculums.length,
      classes: deletedClasses,
      lessons: deletedLessons,
    };
  },
});

export const clearClassesUxDemo = internalMutation({
  args: {},
  returns: v.object({
    message: v.string(),
    classes: v.optional(v.number()),
    lessons: v.optional(v.number()),
  }),
  handler: async (ctx) => {
    const curriculum = await ctx.db
      .query("curriculums")
      .withIndex("by_code", (q) => q.eq("code", UX_DEMO_CURRICULUM_CODE))
      .first();

    if (!curriculum) return { message: "No UX demo data found." };

    const classes = await ctx.db
      .query("classes")
      .withIndex("by_curriculum", (q) => q.eq("curriculumId", curriculum._id))
      .collect();

    for (const classDoc of classes) {
      await deleteSchedulesForClass(ctx, classDoc._id);
      await ctx.db.delete(classDoc._id);
    }

    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_curriculum", (q) => q.eq("curriculumId", curriculum._id))
      .collect();
    for (const lesson of lessons) {
      await ctx.db.delete(lesson._id);
    }

    await ctx.db.delete(curriculum._id);

    return {
      message: "Cleared UX demo data.",
      classes: classes.length,
      lessons: lessons.length,
    };
  },
});
