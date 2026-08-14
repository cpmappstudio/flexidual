import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

test("course access is copied to the session and scoped to active students", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const data = await t.run(async (ctx) => {
    const teacherId = await ctx.db.insert("users", {
      clerkId: "teacher-clerk-id",
      email: "teacher@example.com",
      firstName: "Taylor",
      lastName: "Teacher",
      fullName: "Taylor Teacher",
      isActive: true,
      createdAt: now,
    });
    const secondTeacherId = await ctx.db.insert("users", {
      clerkId: "second-teacher-clerk-id",
      email: "second-teacher@example.com",
      firstName: "Uma",
      lastName: "Teacher",
      fullName: "Uma Teacher",
      isActive: true,
      createdAt: now,
    });
    const studentId = await ctx.db.insert("users", {
      clerkId: "student-clerk-id",
      username: "student",
      firstName: "Sam",
      lastName: "Student",
      fullName: "Sam Student",
      isActive: true,
      createdAt: now,
    });
    const schoolAId = await ctx.db.insert("schools", {
      name: "School A",
      slug: "school-a",
      timeZone: "America/Bogota",
      isActive: true,
      createdAt: now,
      createdBy: teacherId,
    });
    const schoolBId = await ctx.db.insert("schools", {
      name: "School B",
      slug: "school-b",
      timeZone: "America/Bogota",
      isActive: true,
      createdAt: now,
      createdBy: teacherId,
    });
    const campusAId = await ctx.db.insert("campuses", {
      schoolId: schoolAId,
      name: "Campus A",
      slug: "campus-a",
      isActive: true,
      createdAt: now,
      createdBy: teacherId,
    });
    const campusBId = await ctx.db.insert("campuses", {
      schoolId: schoolBId,
      name: "Campus B",
      slug: "campus-b",
      isActive: true,
      createdAt: now,
      createdBy: teacherId,
    });
    const secondCampusAId = await ctx.db.insert("campuses", {
      schoolId: schoolAId,
      name: "Campus A2",
      slug: "campus-a2",
      isActive: true,
      createdAt: now,
      createdBy: teacherId,
    });
    await ctx.db.insert("roleAssignments", {
      userId: studentId,
      orgId: campusAId,
      orgType: "campus",
      role: "student",
      schoolId: schoolAId,
      gradeCode: "05",
      assignedAt: now,
      assignedBy: teacherId,
    });
    await ctx.db.insert("roleAssignments", {
      userId: teacherId,
      orgId: campusAId,
      orgType: "campus",
      role: "teacher",
      schoolId: schoolAId,
      assignedAt: now,
      assignedBy: teacherId,
    });
    await ctx.db.insert("roleAssignments", {
      userId: secondTeacherId,
      orgId: secondCampusAId,
      orgType: "campus",
      role: "teacher",
      schoolId: schoolAId,
      assignedAt: now,
      assignedBy: teacherId,
    });
    const curriculumAId = await ctx.db.insert("curriculums", {
      title: "Curriculum A",
      iconKey: "microscope",
      isActive: true,
      createdAt: now,
      createdBy: teacherId,
      schoolId: schoolAId,
      gradeCodes: ["05"],
    });
    const curriculumBId = await ctx.db.insert("curriculums", {
      title: "Curriculum B",
      isActive: true,
      createdAt: now,
      createdBy: teacherId,
      schoolId: schoolBId,
      gradeCodes: ["05"],
    });
    const liveAccess = {
      mode: "school" as const,
      allowedGradeCodes: ["05"],
    };
    const classAId = await ctx.db.insert("classes", {
      name: "Class A",
      curriculumId: curriculumAId,
      schoolId: schoolAId,
      campusId: campusAId,
      teacherId,
      classType: "standard",
      gradeCode: "05",
      liveAccess,
      isActive: true,
      createdAt: now,
      createdBy: teacherId,
    });
    const classBId = await ctx.db.insert("classes", {
      name: "Class B",
      curriculumId: curriculumBId,
      schoolId: schoolBId,
      campusId: campusBId,
      teacherId,
      classType: "standard",
      gradeCode: "05",
      liveAccess,
      isActive: true,
      createdAt: now,
      createdBy: teacherId,
    });
    await ctx.db.insert("classes", {
      name: "Private Class A",
      curriculumId: curriculumAId,
      schoolId: schoolAId,
      campusId: campusAId,
      teacherId,
      classType: "standard",
      gradeCode: "05",
      liveAccess: { mode: "private", allowedGradeCodes: [] },
      isActive: true,
      createdAt: now,
      createdBy: teacherId,
    });
    const ignitiaClassId = await ctx.db.insert("classes", {
      name: "Ignitia Class A",
      curriculumId: curriculumAId,
      schoolId: schoolAId,
      campusId: campusAId,
      classType: "ignitia",
      gradeCode: "05",
      liveAccess,
      isActive: true,
      createdAt: now,
      createdBy: teacherId,
    });
    const legacyIgnitiaClassId = await ctx.db.insert("classes", {
      name: "Legacy Ignitia Class A",
      curriculumId: curriculumAId,
      campusId: campusAId,
      gradeCode: "05",
      liveAccess,
      isActive: true,
      createdAt: now,
      createdBy: teacherId,
    });
    const scheduleAId = await ctx.db.insert("classSchedule", {
      classId: classAId,
      sessionType: "live",
      scheduledStart: now - 60_000,
      scheduledEnd: now + 60 * 60_000,
      roomName: "room-a",
      isLive: false,
      status: "scheduled",
      createdAt: now,
      createdBy: teacherId,
    });
    const pastRecordedScheduleId = await ctx.db.insert("classSchedule", {
      classId: classAId,
      schoolId: schoolAId,
      sessionType: "live",
      title: "Recorded review",
      scheduledStart: now - 2 * 60 * 60_000,
      scheduledEnd: now - 60 * 60_000,
      roomName: "room-a-recorded",
      status: "completed",
      completedAt: now - 60 * 60_000,
      createdAt: now,
      createdBy: teacherId,
    });
    const pastUnrecordedScheduleId = await ctx.db.insert("classSchedule", {
      classId: classAId,
      schoolId: schoolAId,
      sessionType: "live",
      title: "Unrecorded review",
      scheduledStart: now - 4 * 60 * 60_000,
      scheduledEnd: now - 3 * 60 * 60_000,
      roomName: "room-a-unrecorded",
      status: "completed",
      completedAt: now - 3 * 60 * 60_000,
      createdAt: now,
      createdBy: teacherId,
    });
    const pastIgnitiaScheduleId = await ctx.db.insert("classSchedule", {
      classId: classAId,
      schoolId: schoolAId,
      sessionType: "ignitia",
      title: "Ignitia practice",
      scheduledStart: now - 6 * 60 * 60_000,
      scheduledEnd: now - 5 * 60 * 60_000,
      roomName: "room-a-ignitia-past",
      status: "completed",
      completedAt: now - 5 * 60 * 60_000,
      createdAt: now,
      createdBy: teacherId,
    });
    await ctx.db.insert("recordings", {
      scheduleId: pastRecordedScheduleId,
      roomName: "room-a-recorded",
      egressId: "egress-room-a-recorded",
      status: "complete",
      url: "https://example.com/recording.mp4",
      startedAt: now - 2 * 60 * 60_000,
      completedAt: now - 60 * 60_000,
    });
    await ctx.db.insert("recordings", {
      scheduleId: pastIgnitiaScheduleId,
      roomName: "room-a-ignitia-past",
      egressId: "legacy-invalid-ignitia-egress",
      status: "complete",
      url: "https://example.com/invalid-provider-recording.mp4",
      startedAt: now - 6 * 60 * 60_000,
      completedAt: now - 5 * 60 * 60_000,
    });
    await ctx.db.insert("classSchedule", {
      classId: classAId,
      schoolId: schoolAId,
      sessionType: "ignitia",
      scheduledStart: now + 60 * 60_000,
      scheduledEnd: now + 2 * 60 * 60_000,
      roomName: "room-a-ignitia",
      status: "scheduled",
      createdAt: now,
      createdBy: teacherId,
    });
    await ctx.db.insert("classSchedule", {
      classId: classAId,
      schoolId: schoolAId,
      sessionType: "live",
      scheduledStart: now + 2 * 60 * 60_000,
      scheduledEnd: now + 3 * 60 * 60_000,
      roomName: "room-a-next",
      status: "scheduled",
      createdAt: now,
      createdBy: teacherId,
    });
    await ctx.db.insert("classSchedule", {
      classId: ignitiaClassId,
      schoolId: schoolAId,
      sessionType: "ignitia",
      scheduledStart: now + 60 * 60_000,
      scheduledEnd: now + 2 * 60 * 60_000,
      roomName: "ignitia-room-a",
      status: "scheduled",
      createdAt: now,
      createdBy: teacherId,
    });
    await ctx.db.insert("classSchedule", {
      classId: legacyIgnitiaClassId,
      schoolId: schoolAId,
      sessionType: "ignitia",
      scheduledStart: now + 60 * 60_000,
      scheduledEnd: now + 2 * 60 * 60_000,
      roomName: "legacy-ignitia-room-a",
      status: "scheduled",
      createdAt: now,
      createdBy: teacherId,
    });
    await ctx.db.insert("classSchedule", {
      classId: classBId,
      schoolId: schoolBId,
      sessionType: "live",
      scheduledStart: now - 60_000,
      scheduledEnd: now + 60 * 60_000,
      roomName: "room-b",
      isLive: true,
      liveAccess,
      status: "active",
      createdAt: now,
      createdBy: teacherId,
    });

    return {
      scheduleAId,
      schoolAId,
      teacherId,
      studentId,
      classAId,
      classBId,
      campusAId,
      campusBId,
      secondCampusAId,
      pastRecordedScheduleId,
      pastUnrecordedScheduleId,
      pastIgnitiaScheduleId,
    };
  });

  const asTeacher = t.withIdentity({ subject: "teacher-clerk-id" });
  const classDetails = await asTeacher.query(api.classes.get, {
    id: data.classAId,
  });
  expect(classDetails?.curriculumIconKey).toBe("microscope");

  const pastClasses = await asTeacher.query(
    api.recordings.listRecentPastClasses,
    { classId: data.classAId, now },
  );
  expect(pastClasses).toEqual([
    expect.objectContaining({
      scheduleId: data.pastRecordedScheduleId,
      title: "Recorded review",
      hasRecording: true,
    }),
    expect.objectContaining({
      scheduleId: data.pastUnrecordedScheduleId,
      title: "Unrecorded review",
      hasRecording: false,
    }),
    expect.objectContaining({
      scheduleId: data.pastIgnitiaScheduleId,
      title: "Ignitia practice",
      sessionType: "ignitia",
      hasRecording: false,
    }),
  ]);
  expect(
    await asTeacher.query(api.recordings.getBySchedule, {
      scheduleId: data.pastIgnitiaScheduleId,
    }),
  ).toEqual([]);
  const asUnassignedTeacher = t.withIdentity({
    subject: "second-teacher-clerk-id",
  });
  expect(
    await asUnassignedTeacher.query(api.recordings.listRecentPastClasses, {
      classId: data.classAId,
      now,
    }),
  ).toEqual([]);

  await asTeacher.mutation(api.schedule.markLive, {
    roomName: "room-a",
    isLive: true,
  });

  const startedSchedule = await t.run((ctx) =>
    ctx.db.get("classSchedule", data.scheduleAId),
  );
  expect(startedSchedule).toMatchObject({
    schoolId: data.schoolAId,
    status: "active",
    isLive: true,
    liveAccess: { mode: "school", allowedGradeCodes: ["05"] },
  });

  const asStudent = t.withIdentity({ subject: "student-clerk-id" });
  const discoverable = await asStudent.query(
    api.schedule.listAccessibleLiveClasses,
    {},
  );
  expect(discoverable.map((session) => session.roomName)).toEqual(["room-a"]);

  const studentCatalog = await asStudent.query(api.classes.listCatalog, {
    orgSlug: "campus-a",
    now,
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(studentCatalog.page.map((course) => course.name)).toEqual(["Class A"]);
  expect(studentCatalog.page[0].liveSession).toMatchObject({
    roomName: "room-a",
    canOpen: true,
  });
  expect(studentCatalog.page[0].nextSession).toMatchObject({
    roomName: "room-a-next",
    canOpen: false,
  });
  expect(studentCatalog.page[0].curriculumIconKey).toBe("microscope");

  const staffCatalog = await asTeacher.query(api.classes.listCatalog, {
    orgSlug: "campus-a",
    now,
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(staffCatalog.page.map((course) => course.name).sort()).toEqual([
    "Class A",
    "Private Class A",
  ]);
  expect(
    staffCatalog.page.find((course) => course.name === "Class A")?.nextSession,
  ).toMatchObject({ roomName: "room-a-next", canOpen: true });

  const firstPage = await asTeacher.query(api.classes.listCatalog, {
    orgSlug: "campus-a",
    now,
    paginationOpts: { numItems: 1, cursor: null },
  });
  const secondPage = await asTeacher.query(api.classes.listCatalog, {
    orgSlug: "campus-a",
    now,
    paginationOpts: {
      numItems: 1,
      cursor: firstPage.continueCursor,
    },
  });
  expect(
    [...firstPage.page, ...secondPage.page].map((course) => course.name).sort(),
  ).toEqual(["Class A", "Private Class A"]);

  const catalogFilters = await asTeacher.query(api.classes.getCatalogFilters, {
    orgSlug: "campus-a",
  });
  expect(catalogFilters.campuses).toEqual([
    { value: data.campusAId, label: "Campus A" },
    { value: data.secondCampusAId, label: "Campus A2" },
  ]);
  expect(catalogFilters.curriculums).toEqual([
    { value: expect.any(String), label: "Curriculum A" },
  ]);
  expect(catalogFilters.teachers).toEqual([
    { value: expect.any(String), label: "Taylor Teacher" },
    { value: expect.any(String), label: "Uma Teacher" },
  ]);

  const campusFilters = await asTeacher.query(api.classes.getCatalogFilters, {
    orgSlug: "campus-a",
    campusId: data.campusAId,
  });
  expect(campusFilters.teachers).toEqual([
    { value: expect.any(String), label: "Taylor Teacher" },
  ]);

  const campusCatalog = await asTeacher.query(api.classes.listCatalog, {
    orgSlug: "campus-a",
    now,
    campusId: data.campusAId,
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(campusCatalog.page.map((course) => course.name).sort()).toEqual([
    "Class A",
    "Private Class A",
  ]);
  await expect(
    asTeacher.query(api.classes.getCatalogFilters, {
      orgSlug: "campus-a",
      campusId: data.campusBId,
    }),
  ).rejects.toThrow("INVALID_CAMPUS");

  const courseDetail = await asTeacher.query(api.classes.getCatalog, {
    orgSlug: "campus-a",
    classId: data.classAId,
    now,
  });
  expect(courseDetail?.course).toMatchObject({
    _id: data.classAId,
    name: "Class A",
    curriculumIconKey: "microscope",
  });
  expect(
    await asTeacher.query(api.classes.getCatalog, {
      orgSlug: "campus-a",
      classId: data.classBId,
      now,
    }),
  ).toBeNull();
  expect(
    await asTeacher.query(api.classes.getCatalog, {
      orgSlug: "campus-a",
      classId: "not-a-convex-id",
      now,
    }),
  ).toBeNull();

  await t.run((ctx) =>
    ctx.db.insert("classEnrollments", {
      classId: data.classAId,
      studentId: data.studentId,
      enrolledAt: now,
      enrolledBy: data.teacherId,
    }),
  );
  const studentDashboard = await asStudent.query(
    api.student.getStudentDashboardStats,
    { now },
  );
  expect(studentDashboard?.classes).toEqual([
    expect.objectContaining({
      classId: data.classAId,
      curriculumIconKey: "microscope",
    }),
  ]);

  await t.run((ctx) =>
    ctx.db.patch("users", data.studentId, { isActive: false }),
  );
  expect(await asStudent.query(api.users.getCurrentUser, {})).toBeNull();
  expect(
    await asStudent.query(api.schedule.listAccessibleLiveClasses, {}),
  ).toEqual([]);
});
