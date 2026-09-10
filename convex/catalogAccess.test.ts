import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

async function setup(legacy = false) {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const data = await t.run(async (ctx) => {
    const users = {} as Record<
      "teacher" | "student" | "principal" | "admin",
      Id<"users">
    >;
    for (const role of ["teacher", "student", "principal", "admin"] as const) {
      users[role] = await ctx.db.insert("users", {
        clerkId: role,
        fullName: role,
        firstName: role,
        lastName: "Test",
        isActive: true,
        createdAt: now,
      });
    }
    const schoolId = await ctx.db.insert("schools", {
      name: "School",
      slug: "school",
      isActive: true,
      createdAt: now,
      createdBy: users.admin,
    });
    const foreignSchoolId = await ctx.db.insert("schools", {
      name: "Foreign",
      slug: "foreign",
      isActive: true,
      createdAt: now,
      createdBy: users.admin,
    });
    const campusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Campus",
      slug: "campus",
      isActive: true,
      createdAt: now,
      createdBy: users.admin,
    });
    const secondCampusId = await ctx.db.insert("campuses", {
      schoolId,
      name: "Second",
      slug: "second",
      isActive: true,
      createdAt: now,
      createdBy: users.admin,
    });
    const foreignCampusId = await ctx.db.insert("campuses", {
      schoolId: foreignSchoolId,
      name: "Foreign",
      slug: "foreign-campus",
      isActive: true,
      createdAt: now,
      createdBy: users.admin,
    });
    for (const role of ["teacher", "student", "principal", "admin"] as const) {
      await ctx.db.insert("roleAssignments", {
        userId: users[role],
        role,
        orgType: role === "admin" ? "school" : "campus",
        orgId: role === "admin" ? schoolId : campusId,
        schoolId,
        ...(role === "student" && { gradeCode: "08" }),
        assignedAt: now,
        assignedBy: users.admin,
      });
    }
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Curriculum",
      schoolId,
      isActive: true,
      createdAt: now,
      createdBy: users.admin,
    });
    const courses: Record<string, Id<"classes">> = {};
    async function course(
      name: string,
      overrides: Partial<Doc<"classes">> = {},
    ) {
      const id = await ctx.db.insert("classes", {
        name,
        schoolId,
        campusId,
        curriculumId,
        classType: "standard",
        gradeCode: "08",
        liveAccess: { mode: "private", allowedGradeCodes: [] },
        isActive: true,
        createdAt: now,
        createdBy: users.admin,
        ...(!legacy && { enrollmentsMigratedAt: now }),
        ...overrides,
      });
      courses[name] = id;
      for (const offset of [-60_000, 3_600_000]) {
        await ctx.db.insert("classSchedule", {
          classId: id,
          schoolId: overrides.schoolId ?? schoolId,
          sessionType: "live",
          status: "scheduled",
          isLive: false,
          liveAccess: overrides.liveAccess ?? {
            mode: "private",
            allowedGradeCodes: [],
          },
          scheduledStart: now + offset,
          scheduledEnd: now + offset + 1_800_000,
          roomName: `${name}-${offset}`,
          createdAt: now,
          createdBy: users.admin,
        });
      }
      return id;
    }
    await course("Public", {
      liveAccess: { mode: "school", allowedGradeCodes: ["08"] },
    });
    await course("Other grade public", {
      liveAccess: { mode: "school", allowedGradeCodes: ["07"] },
    });
    await course("Teacher private", { teacherId: users.teacher });
    const enrolledId = await course(
      "Student private",
      legacy ? { students: [users.student] } : {},
    );
    const enrollmentId = legacy
      ? undefined
      : await ctx.db.insert("classEnrollments", {
          classId: enrolledId,
          studentId: users.student,
          enrolledAt: now,
          enrolledBy: users.admin,
        });
    await course("Unrelated private");
    await course("Second campus private", { campusId: secondCampusId });
    // Even assignment/membership cannot leak a course from another institution.
    await course("Foreign private", {
      schoolId: foreignSchoolId,
      campusId: foreignCampusId,
      teacherId: users.teacher,
      students: [users.student],
      enrollmentsMigratedAt: undefined,
    });
    return { courses, enrollmentId, users, campusId, secondCampusId };
  });
  const args = {
    orgSlug: "campus",
    now,
    paginationOpts: { numItems: 48, cursor: null },
  };
  return { t, data, args };
}

test.each([false, true])(
  "catalog honors own private courses and revocation (legacy=%s)",
  async (legacy) => {
    const { t, data, args } = await setup(legacy);
    const student = t.withIdentity({ subject: "student" });
    const teacher = t.withIdentity({ subject: "teacher" });
    for (const query of [
      api.classes.listCatalog,
      api.classes.listCurrentCatalog,
    ]) {
      const studentPage = (await student.query(query, args)).page;
      expect(studentPage.map((c) => c.name).sort()).toEqual([
        "Public",
        "Student private",
      ]);
      expect(studentPage.find((c) => c.name === "Public")?.canViewDetails).toBe(
        false,
      );
      const own = studentPage.find((c) => c.name === "Student private")!;
      expect(own.canViewDetails).toBe(true);
      if (own.currentSession) {
        expect(own.currentSession).toMatchObject({
          canOpen: true,
          isLive: false,
        });
        expect(
          studentPage.find((c) => c.name === "Public")?.currentSession?.canOpen,
        ).toBe(true);
      } else {
        expect(own.nextSession?.canOpen).toBe(false);
      }
      const teacherPage = (await teacher.query(query, args)).page;
      expect(teacherPage.map((c) => c.name).sort()).toEqual([
        "Other grade public",
        "Public",
        "Teacher private",
      ]);
      expect(
        teacherPage.find((c) => c.name === "Teacher private")?.canViewDetails,
      ).toBe(true);
      expect(teacherPage.find((c) => c.name === "Public")?.canViewDetails).toBe(
        false,
      );
    }
    await expect(
      student.query(api.classes.get, { id: data.courses.Public }),
    ).rejects.toThrow("PERMISSION_DENIED");
    await t.run(async (ctx) => {
      if (data.enrollmentId) await ctx.db.delete(data.enrollmentId);
      else
        await ctx.db.patch(data.courses["Student private"], { students: [] });
      await ctx.db.patch(data.courses["Teacher private"], {
        teacherId: undefined,
      });
    });
    for (const query of [
      api.classes.listCatalog,
      api.classes.listCurrentCatalog,
    ]) {
      expect(
        (await student.query(query, args)).page.map((c) => c.name),
      ).toEqual(["Public"]);
      expect(
        (await teacher.query(query, args)).page.map((c) => c.name).sort(),
      ).toEqual(["Other grade public", "Public"]);
    }
  },
);

test("principal discovers the institution's private courses without gaining cross-campus management", async () => {
  const { t, data, args } = await setup();
  const principal = t.withIdentity({ subject: "principal" });
  const admin = t.withIdentity({ subject: "admin" });
  expect(
    (
      await principal.query(api.classes.getCatalogFilters, {
        orgSlug: "campus",
      })
    ).canViewPrivateCourses,
  ).toBe(true);
  for (const query of [
    api.classes.listCatalog,
    api.classes.listCurrentCatalog,
  ]) {
    const principalPage = (
      await principal.query(query, { ...args, visibility: "all" })
    ).page;
    const adminPage = (await admin.query(query, { ...args, visibility: "all" }))
      .page;
    expect(principalPage.map((c) => c._id)).toEqual(
      adminPage.map((c) => c._id),
    );
    expect(principalPage).toHaveLength(6);
    expect(
      principalPage.find((c) => c.name === "Second campus private")
        ?.canViewDetails,
    ).toBe(false);
    expect(
      adminPage.find((c) => c.name === "Second campus private")?.canViewDetails,
    ).toBe(true);
    expect(
      (
        await principal.query(query, {
          ...args,
          visibility: "private",
          campusId: data.secondCampusId,
        })
      ).page.map((c) => c.name),
    ).toEqual(["Second campus private"]);
    expect(
      (await principal.query(query, { ...args, visibility: "public" })).page
        .map((c) => c.name)
        .sort(),
    ).toEqual(["Other grade public", "Public"]);
  }
  await expect(
    principal.query(api.classes.get, {
      id: data.courses["Second campus private"],
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
  await expect(
    principal.query(api.classes.listCatalog, {
      ...args,
      orgSlug: "foreign-campus",
    }),
  ).rejects.toThrow("PERMISSION_DENIED");
});

test("filtered pagination retains own courses without exposing other private courses", async () => {
  const { t, args } = await setup();
  const student = t.withIdentity({ subject: "student" });
  const names: string[] = [];
  let cursor: string | null = null;
  let exhausted = false;
  for (let page = 0; page < 10 && !exhausted; page++) {
    const result: FunctionReturnType<typeof api.classes.listCatalog> =
      await student.query(api.classes.listCatalog, {
        ...args,
        paginationOpts: { numItems: 1, cursor },
      });
    names.push(...result.page.map((course) => course.name));
    cursor = result.continueCursor;
    exhausted = result.isDone;
  }
  expect(exhausted).toBe(true);
  expect(names.sort()).toEqual(["Public", "Student private"]);
  expect(
    (
      await student.query(api.classes.listCatalog, {
        ...args,
        search: "private",
      })
    ).page.map((course) => course.name),
  ).toEqual(["Student private"]);
  expect(
    (
      await student.query(api.classes.listCatalog, {
        ...args,
        visibility: "public",
      })
    ).page.map((course) => course.name),
  ).toEqual(["Public"]);
});
