import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
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
    const adminId = await ctx.db.insert("users", {
      clerkId: "admin-clerk-id",
      email: "admin@example.com",
      firstName: "Avery",
      lastName: "Admin",
      fullName: "Avery Admin",
      isActive: true,
      createdAt: now,
    });
    const principalId = await ctx.db.insert("users", {
      clerkId: "principal-clerk-id",
      email: "principal@example.com",
      firstName: "Parker",
      lastName: "Principal",
      fullName: "Parker Principal",
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
      userId: adminId,
      orgId: schoolAId,
      orgType: "school",
      role: "admin",
      schoolId: schoolAId,
      assignedAt: now,
      assignedBy: adminId,
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
      userId: principalId,
      orgId: campusAId,
      orgType: "campus",
      role: "principal",
      schoolId: schoolAId,
      assignedAt: now,
      assignedBy: adminId,
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
      enrollmentsMigratedAt: now,
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
      principalId,
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

  const chatOptions = await asTeacher.query(api.classes.listChatOptions, {
    campusId: data.campusAId,
  });
  expect(chatOptions).toContainEqual({
    _id: data.classAId,
    name: "Class A",
    curriculumIconKey: "microscope",
    archived: false,
  });

  const chatContext = await asTeacher.query(api.classes.getChatContext, {
    classId: data.classAId,
  });
  expect(chatContext).toMatchObject({
    course: {
      _id: data.classAId,
      curriculumIconKey: "microscope",
    },
    participants: [
      {
        _id: data.teacherId,
        role: "teacher",
        isMuted: false,
      },
    ],
    canModerate: true,
    canDisableChat: false,
    chatSettings: { studentsMuted: false, disabled: false },
  });
  const asPrincipal = t.withIdentity({ subject: "principal-clerk-id" });
  expect(
    await asPrincipal.query(api.classes.getChatContext, {
      classId: data.classAId,
    }),
  ).toMatchObject({
    canModerate: true,
    canDisableChat: true,
  });

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
  await expect(
    asUnassignedTeacher.query(api.courseChatMessages.list, {
      classId: data.classAId,
      paginationOpts: { numItems: 20, cursor: null },
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    asUnassignedTeacher.mutation(api.courseChatMessages.send, {
      classId: data.classAId,
      body: "I should not be here",
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
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

  await t.run((ctx) =>
    ctx.db.insert("classEnrollments", {
      classId: data.classAId,
      studentId: data.studentId,
      enrolledAt: now,
      enrolledBy: data.teacherId,
    }),
  );
  await asTeacher.mutation(api.courseChatMessages.send, {
    classId: data.classAId,
    body: "  Welcome to the course  ",
  });
  await asStudent.mutation(api.courseChatMessages.send, {
    classId: data.classAId,
    body: "Thank you!",
  });
  const teacherMessages = await asTeacher.query(api.courseChatMessages.list, {
    classId: data.classAId,
    paginationOpts: { numItems: 20, cursor: null },
  });
  expect(teacherMessages.page).toEqual([
    expect.objectContaining({
      authorId: data.studentId,
      authorName: "Sam Student",
      authorRole: "member",
      body: "Thank you!",
      isOwn: false,
    }),
    expect.objectContaining({
      authorId: data.teacherId,
      authorName: "Taylor Teacher",
      authorRole: "teacher",
      body: "Welcome to the course",
      isOwn: true,
    }),
  ]);
  const studentMessages = await asStudent.query(api.courseChatMessages.list, {
    classId: data.classAId,
    paginationOpts: { numItems: 1, cursor: null },
  });
  expect(studentMessages.page[0]).toMatchObject({
    authorId: data.studentId,
    isOwn: true,
  });
  expect(studentMessages.isDone).toBe(false);
  const olderStudentMessages = await asStudent.query(
    api.courseChatMessages.list,
    {
      classId: data.classAId,
      paginationOpts: {
        numItems: 1,
        cursor: studentMessages.continueCursor,
      },
    },
  );
  expect(olderStudentMessages.page[0]).toMatchObject({
    authorId: data.teacherId,
    body: "Welcome to the course",
    isOwn: false,
  });
  const asAdmin = t.withIdentity({ subject: "admin-clerk-id" });
  await asAdmin.mutation(api.courseChatMessages.setMuted, {
    classId: data.classAId,
    userId: data.studentId,
    muted: true,
  });
  expect(
    await asStudent.query(api.courseChatMessages.getMyStatus, {
      classId: data.classAId,
    }),
  ).toEqual({ isMuted: true, archived: false });
  await expect(
    asStudent.mutation(api.courseChatMessages.send, {
      classId: data.classAId,
      body: "Muted message",
    }),
  ).rejects.toThrow("CHAT_MUTED");
  const mutedChatContext = await asTeacher.query(api.classes.getChatContext, {
    classId: data.classAId,
  });
  expect(
    mutedChatContext?.participants.find(
      (participant) => participant._id === data.studentId,
    ),
  ).toMatchObject({ isMuted: true });
  await expect(
    asStudent.mutation(api.courseChatMessages.setMuted, {
      classId: data.classAId,
      userId: data.studentId,
      muted: false,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await asTeacher.mutation(api.courseChatMessages.setMuted, {
    classId: data.classAId,
    userId: data.studentId,
    muted: false,
  });
  expect(
    await asStudent.query(api.courseChatMessages.getMyStatus, {
      classId: data.classAId,
    }),
  ).toEqual({ isMuted: false, archived: false });
  await asTeacher.mutation(api.courseChatMessages.setSetting, {
    classId: data.classAId,
    setting: "studentsMuted",
    enabled: true,
  });
  expect(
    await asStudent.query(api.courseChatMessages.getMyStatus, {
      classId: data.classAId,
    }),
  ).toEqual({ isMuted: true, archived: false });
  expect(
    await asTeacher.query(api.courseChatMessages.getMyStatus, {
      classId: data.classAId,
    }),
  ).toEqual({ isMuted: false, archived: false });
  await expect(
    asTeacher.mutation(api.courseChatMessages.setSetting, {
      classId: data.classAId,
      setting: "disabled",
      enabled: true,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await asPrincipal.mutation(api.courseChatMessages.setSetting, {
    classId: data.classAId,
    setting: "disabled",
    enabled: true,
  });
  expect(
    await asTeacher.query(api.courseChatMessages.getMyStatus, {
      classId: data.classAId,
    }),
  ).toEqual({ isMuted: true, archived: false });
  await expect(
    asTeacher.mutation(api.courseChatMessages.send, {
      classId: data.classAId,
      body: "Disabled chat message",
    }),
  ).rejects.toThrow("CHAT_MUTED");
  await asPrincipal.mutation(api.courseChatMessages.send, {
    classId: data.classAId,
    body: "Moderator announcement",
  });
  await asPrincipal.mutation(api.courseChatMessages.setSetting, {
    classId: data.classAId,
    setting: "disabled",
    enabled: false,
  });
  await asTeacher.mutation(api.courseChatMessages.setSetting, {
    classId: data.classAId,
    setting: "studentsMuted",
    enabled: false,
  });
  await expect(
    asStudent.mutation(api.courseChatMessages.send, {
      classId: data.classAId,
      body: "   ",
    }),
  ).rejects.toThrow("MESSAGE_REQUIRED");
  await expect(
    asStudent.mutation(api.courseChatMessages.send, {
      classId: data.classAId,
      body: "a".repeat(2_001),
    }),
  ).rejects.toThrow("MESSAGE_TOO_LONG");
  await expect(
    asTeacher.mutation(api.courseChatMessages.clear, {
      classId: data.classAId,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await asPrincipal.mutation(api.courseChatMessages.clear, {
    classId: data.classAId,
  });
  const clearedMessages = await asStudent.query(api.courseChatMessages.list, {
    classId: data.classAId,
    paginationOpts: { numItems: 20, cursor: null },
  });
  expect(clearedMessages.page).toEqual([]);
  await expect(
    asTeacher.mutation(api.courseChatMessages.setArchived, {
      classId: data.classAId,
      archived: true,
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await asPrincipal.mutation(api.courseChatMessages.setArchived, {
    classId: data.classAId,
    archived: true,
  });
  expect(
    await asTeacher.query(api.classes.getChatContext, {
      classId: data.classAId,
    }),
  ).toBeNull();
  expect(
    await asStudent.query(api.courseChatMessages.getMyStatus, {
      classId: data.classAId,
    }),
  ).toEqual({ isMuted: true, archived: true });
  expect(
    (
      await asStudent.query(api.courseChatMessages.list, {
        classId: data.classAId,
        paginationOpts: { numItems: 20, cursor: null },
      })
    ).page,
  ).toEqual([]);
  await expect(
    asStudent.mutation(api.courseChatMessages.send, {
      classId: data.classAId,
      body: "Archived chat message",
    }),
  ).rejects.toThrow("CHAT_ARCHIVED");
  expect(
    await asTeacher.query(api.classes.listChatOptions, {
      campusId: data.campusAId,
    }),
  ).toContainEqual({
    _id: data.classAId,
    name: "Class A",
    curriculumIconKey: "microscope",
    archived: true,
  });
  await asPrincipal.mutation(api.courseChatMessages.setArchived, {
    classId: data.classAId,
    archived: false,
  });
  expect(
    await asStudent.query(api.courseChatMessages.getMyStatus, {
      classId: data.classAId,
    }),
  ).toEqual({ isMuted: false, archived: false });
  const endedAt = Date.now() - 1;
  await t.run((ctx) =>
    ctx.db.patch("classes", data.classAId, { endDate: endedAt }),
  );
  await t.mutation(internal.courseChatMessages.archiveAtCourseEnd, {
    classId: data.classAId,
    expectedEndDate: endedAt,
  });
  expect(
    await t.run(
      async (ctx) =>
        (await ctx.db.get("classes", data.classAId))?.chatArchivedAt,
    ),
  ).toBeTypeOf("number");
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
  const studentProfile = await asTeacher.query(
    api.student.getStudentDashboardStats,
    { now, studentId: data.studentId, orgSlug: "campus-a" },
  );
  expect(studentProfile?.student._id).toBe(data.studentId);

  await t.run((ctx) =>
    ctx.db.patch("users", data.studentId, { isActive: false }),
  );
  expect(await asStudent.query(api.users.getCurrentUser, {})).toBeNull();
  expect(
    await asStudent.query(api.schedule.listAccessibleLiveClasses, {}),
  ).toEqual([]);
});
