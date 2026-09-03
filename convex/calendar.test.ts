import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const NOW = Date.UTC(2026, 7, 31, 12);
const DAY_MS = 24 * 60 * 60 * 1_000;

test("calendar events stay tenant-scoped and apply course filters", async () => {
  const t = convexTest(schema, modules);
  const data = await t.run(async (ctx) => {
    const createUser = (clerkId: string, fullName: string) => {
      const [firstName, ...lastName] = fullName.split(" ");
      return ctx.db.insert("users", {
        clerkId,
        firstName,
        lastName: lastName.join(" "),
        fullName,
        isActive: true,
        createdAt: NOW,
      });
    };
    const adminId = await createUser("calendar-admin", "Ada Admin");
    const teacherOneId = await createUser("calendar-teacher-one", "Taylor One");
    const teacherTwoId = await createUser("calendar-teacher-two", "Taylor Two");
    const studentId = await createUser("calendar-student", "Sam Student");
    await ctx.db.insert("roleAssignments", {
      userId: adminId,
      orgType: "system",
      role: "superadmin",
      assignedAt: NOW,
      assignedBy: adminId,
    });
    const schoolId = await ctx.db.insert("schools", {
      name: "Calendar School",
      slug: "calendar-school",
      timeZone: "UTC",
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const campusOneId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Campus One",
      slug: "calendar-campus-one",
      timeZone: "UTC",
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const campusTwoId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Campus Two",
      slug: "calendar-campus-two",
      timeZone: "UTC",
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Calendar Curriculum",
      color: "#0ea5e9",
      schoolId,
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const createClass = (args: {
      name: string;
      campusId: typeof campusOneId;
      gradeCode: string;
      teacherId: typeof teacherOneId;
    }) =>
      ctx.db.insert("classes", {
        name: args.name,
        curriculumId,
        schoolId,
        campusId: args.campusId,
        gradeCode: args.gradeCode,
        teacherId: args.teacherId,
        timeZone: "UTC",
        isActive: true,
        createdAt: NOW,
        createdBy: adminId,
      });
    const gradeOneClassId = await createClass({
      name: "Grade One",
      campusId: campusOneId,
      gradeCode: "01",
      teacherId: teacherOneId,
    });
    const gradeTwoClassId = await createClass({
      name: "Grade Two",
      campusId: campusOneId,
      gradeCode: "02",
      teacherId: teacherTwoId,
    });
    const otherCampusClassId = await createClass({
      name: "Other Campus",
      campusId: campusTwoId,
      gradeCode: "01",
      teacherId: teacherOneId,
    });
    const createSchedule = (classId: typeof gradeOneClassId, offset: number) =>
      ctx.db.insert("classSchedule", {
        classId,
        schoolId,
        sessionType: "live",
        scheduledStart: NOW + offset,
        scheduledEnd: NOW + offset + 40 * 60_000,
        roomName: `calendar-${classId}`,
        status: "scheduled",
        createdAt: NOW,
        createdBy: adminId,
      });
    await Promise.all([
      createSchedule(gradeOneClassId, 60_000),
      createSchedule(gradeTwoClassId, 120_000),
      createSchedule(otherCampusClassId, 180_000),
      ctx.db.insert("classEnrollments", {
        classId: gradeOneClassId,
        studentId,
        enrolledAt: NOW,
        enrolledBy: adminId,
      }),
      ctx.db.insert("roleAssignments", {
        userId: studentId,
        orgId: campusOneId,
        orgType: "campus",
        role: "student",
        schoolId,
        gradeCode: "01",
        assignedAt: NOW,
        assignedBy: adminId,
      }),
    ]);

    return {
      campusOneId,
      gradeOneClassId,
      gradeTwoClassId,
      teacherTwoId,
    };
  });

  const range = { from: NOW, to: NOW + DAY_MS };
  const admin = t.withIdentity({ subject: "calendar-admin" });
  const [campusEvents, gradeEvents, teacherEvents, studentEvents] =
    await Promise.all([
      admin.query(api.calendar.listEvents, {
        ...range,
        campusId: data.campusOneId,
      }),
      admin.query(api.calendar.listEvents, {
        ...range,
        campusId: data.campusOneId,
        gradeCode: "01",
      }),
      admin.query(api.calendar.listEvents, {
        ...range,
        campusId: data.campusOneId,
        teacherId: data.teacherTwoId,
      }),
      t
        .withIdentity({ subject: "calendar-student" })
        .query(api.calendar.listEvents, {
          ...range,
          campusId: data.campusOneId,
        }),
    ]);

  expect(campusEvents.map((event) => event.classId)).toEqual([
    data.gradeOneClassId,
    data.gradeTwoClassId,
  ]);
  expect(gradeEvents.map((event) => event.classId)).toEqual([
    data.gradeOneClassId,
  ]);
  expect(teacherEvents.map((event) => event.classId)).toEqual([
    data.gradeTwoClassId,
  ]);
  expect(studentEvents.map((event) => event.classId)).toEqual([
    data.gradeOneClassId,
  ]);
});

test("calendar query handles a production-sized visible month", async () => {
  const t = convexTest(schema, modules);
  const campusId = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", {
      clerkId: "calendar-volume-admin",
      firstName: "Volume",
      lastName: "Admin",
      fullName: "Volume Admin",
      isActive: true,
      createdAt: NOW,
    });
    await ctx.db.insert("roleAssignments", {
      userId: adminId,
      orgType: "system",
      role: "superadmin",
      assignedAt: NOW,
      assignedBy: adminId,
    });
    const schoolId = await ctx.db.insert("schools", {
      name: "Volume School",
      slug: "calendar-volume-school",
      timeZone: "UTC",
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Volume Campus",
      slug: "calendar-volume-campus",
      timeZone: "UTC",
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Volume Curriculum",
      schoolId,
      isActive: true,
      createdAt: NOW,
      createdBy: adminId,
    });
    const classIds = await Promise.all(
      Array.from({ length: 49 }, (_, index) =>
        ctx.db.insert("classes", {
          name: `Volume Course ${index + 1}`,
          curriculumId,
          schoolId,
          campusId,
          gradeCode: String((index % 12) + 1).padStart(2, "0"),
          timeZone: "UTC",
          isActive: true,
          createdAt: NOW,
          createdBy: adminId,
        }),
      ),
    );
    for (let index = 0; index < 672; index++) {
      const scheduledStart = NOW + (index % 42) * DAY_MS + index * 1_000;
      await ctx.db.insert("classSchedule", {
        classId: classIds[index % classIds.length],
        schoolId,
        sessionType: index % 3 === 0 ? "abeka" : "live",
        scheduledStart,
        scheduledEnd: scheduledStart + 40 * 60_000,
        roomName: `calendar-volume-${index}`,
        status: "scheduled",
        createdAt: NOW,
        createdBy: adminId,
      });
    }
    return campusId;
  });

  const events = await t
    .withIdentity({ subject: "calendar-volume-admin" })
    .query(api.calendar.listEvents, {
      campusId,
      from: NOW,
      to: NOW + 42 * DAY_MS,
    });

  expect(events).toHaveLength(672);
});

test("calendar query rejects ranges larger than the visible calendar", async () => {
  const t = convexTest(schema, modules);

  await expect(
    t
      .withIdentity({ subject: "missing-calendar-user" })
      .query(api.calendar.listEvents, {
        from: NOW,
        to: NOW + 63 * DAY_MS,
      }),
  ).rejects.toThrow("INVALID_DATE_RANGE");
});
