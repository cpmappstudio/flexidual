import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import {
  peopleDirectoryFields,
  syncPeopleDirectory,
} from "./model/peopleDirectory";
import {
  listTeacherClasses,
  syncCourseGradeAssignments,
} from "./model/courseAssignments";
import { syncCoursePeopleDirectory } from "./model/teacherPeopleDirectory";
import type { FunctionArgs, FunctionReturnType } from "convex/server";

afterEach(() => vi.useRealTimers());

async function setup(count = 1005) {
  const t = convexTest(schema, modules);
  const data = await t.run(async (ctx) => {
    const create = (name: string, active = true) =>
      ctx.db.insert("users", {
        clerkId: name,
        firstName: name,
        lastName: "Test",
        fullName: name,
        email: `${name}@example.com`,
        isActive: active,
        createdAt: 1,
        externalPassword: "private",
      });
    const admin = await create("admin");
    const teacher = await create("teacher");
    const gradeTeacher = await create("grade-teacher");
    const school = await ctx.db.insert("schools", {
      name: "School",
      slug: "school",
      isActive: true,
      createdAt: 1,
      createdBy: admin,
    });
    const campus = await ctx.db.insert("campuses", {
      name: "Campus",
      slug: "campus",
      schoolId: school,
      isActive: true,
      createdAt: 1,
      createdBy: admin,
    });
    const otherCampus = await ctx.db.insert("campuses", {
      name: "Other",
      slug: "other",
      schoolId: school,
      isActive: true,
      createdAt: 1,
      createdBy: admin,
    });
    await ctx.db.insert("roleAssignments", {
      userId: admin,
      orgId: school,
      orgType: "school",
      role: "admin",
      assignedAt: 1,
    });
    for (const userId of [teacher, gradeTeacher])
      await ctx.db.insert("roleAssignments", {
        userId,
        orgId: campus,
        orgType: "campus",
        role: "teacher",
        assignedAt: 1,
      });
    const students = [];
    for (let i = 0; i < count; i++) {
      const id = await create(
        `Student${String(i).padStart(4, "0")}`,
        i % 2 === 0,
      );
      students.push(id);
      await ctx.db.insert("roleAssignments", {
        userId: id,
        orgId: campus,
        orgType: "campus",
        role: "student",
        gradeCode: i % 2 === 0 ? "05" : "06",
        assignedAt: 1,
      });
    }
    const outsider = await create("OutsideStudent");
    await ctx.db.insert("roleAssignments", {
      userId: outsider,
      orgId: otherCampus,
      orgType: "campus",
      role: "student",
      assignedAt: 1,
    });
    // convex-test evaluates search before tenant filters, including non-indexed fixtures.
    await syncPeopleDirectory(ctx, admin);
    await syncPeopleDirectory(ctx, outsider);
    const curriculum = await ctx.db.insert("curriculums", {
      title: "Science",
      schoolId: school,
      gradeCodes: ["05", "06"],
      isActive: true,
      createdAt: 1,
      createdBy: admin,
    });
    const academicPeriodId = await ctx.db.insert("academicPeriods", {
      schoolId: school,
      name: "Year",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      createdAt: 1,
      createdBy: admin,
    });
    const course = await ctx.db.insert("classes", {
      academicPeriodId,
      name: "Science",
      campusId: campus,
      schoolId: school,
      curriculumId: curriculum,
      teacherId: teacher,
      gradeCode: "05",
      gradeAssignments: [
        { gradeCode: "05" },
        { gradeCode: "06", teacherId: gradeTeacher },
      ],
      students: [students.at(-1)!],
      isActive: true,
      createdAt: 1,
      createdBy: admin,
    });
    await syncCourseGradeAssignments(
      ctx,
      (await ctx.db.get("classes", course))!,
    );
    return {
      admin,
      teacher,
      gradeTeacher,
      school,
      campus,
      otherCampus,
      students,
      outsider,
      course,
    };
  });
  const admin = t.withIdentity({ subject: "admin" });
  return { t, data, admin };
}

const pagination = {
  numItems: 25,
  cursor: null,
  maximumRowsRead: 100,
  maximumBytesRead: 512 * 1024,
};
function args(
  campusId: FunctionArgs<typeof api.people.list>["campusId"],
): FunctionArgs<typeof api.people.list> {
  return {
    campusId,
    role: "student",
    sortBy: "fullName",
    direction: "asc",
    paginationOpts: pagination,
  };
}
async function prepare(fixture: Awaited<ReturnType<typeof setup>>) {
  vi.useFakeTimers();
  await fixture.admin.mutation(api.people.prepare, {
    campusId: fixture.data.campus,
    role: "student",
  });
  await fixture.t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
}

async function prepareTeachers(fixture: Awaited<ReturnType<typeof setup>>) {
  vi.useFakeTimers();
  for (const subject of ["teacher", "grade-teacher"])
    await fixture.t.withIdentity({ subject }).mutation(api.people.prepare, {
      campusId: fixture.data.campus,
      role: "student",
    });
  await fixture.t.finishAllScheduledFunctions(vi.runAllTimers);
  vi.useRealTimers();
}

test("1005 legacy people initialize in bounded batches and page/search/filter/sort on the server", async () => {
  const f = await setup();
  expect(
    await f.admin.query(api.people.isReady, {
      campusId: f.data.campus,
      role: "student",
    }),
  ).toBe(false);
  await prepare(f);
  const first = await f.admin.query(api.people.list, args(f.data.campus));
  expect(first.page).toHaveLength(25);
  expect(first.page[0].fullName).toBe("Student0000");
  expect(first.isDone).toBe(false);
  expect(first.page.every((p) => !("externalPassword" in p))).toBe(true);
  const second = await f.admin.query(api.people.list, {
    ...args(f.data.campus),
    paginationOpts: { ...pagination, cursor: first.continueCursor },
  });
  expect(second.page[0].fullName).toBe("Student0025");
  expect(new Set([...first.page, ...second.page].map((p) => p._id)).size).toBe(
    50,
  );
  const found = await f.admin.query(api.people.list, {
    ...args(f.data.campus),
    search: "student1004",
  });
  expect(found.page.map((p) => p._id)).toEqual([f.data.students[1004]]);
  const email = await f.admin.query(api.people.list, {
    ...args(f.data.campus),
    search: "student1004@example.com",
  });
  expect(email.page.map((p) => p._id)).toEqual([f.data.students[1004]]);
  const filtered = await f.admin.query(api.people.list, {
    ...args(f.data.campus),
    grade: "06",
    isActive: false,
  });
  expect(filtered.page.length).toBeGreaterThan(0);
  expect(filtered.page.every((p) => p.grade === "06" && !p.isActive)).toBe(
    true,
  );
  const reversed = await f.admin.query(api.people.list, {
    ...args(f.data.campus),
    sortBy: "email",
    direction: "desc",
  });
  expect(reversed.page[0]._id).toBe(f.data.students[1004]);
  const legacy = await f.admin.query(api.users.getUsers, {
    orgType: "campus",
    orgId: f.data.campus,
    role: "student",
  });
  expect(legacy).toHaveLength(1005);
  expect(JSON.stringify(first).length).toBeLessThan(
    JSON.stringify(legacy).length / 10,
  );
  const roles = await f.admin.query(api.roleAssignments.getUserRoles, {
    userId: f.data.students[0],
  });
  expect(roles).toHaveLength(1);
  expect(roles[0]).not.toHaveProperty("directory");
  await expect(
    f.admin.query(api.people.list, {
      ...args(f.data.campus),
      paginationOpts: { numItems: 1000, cursor: null },
    }),
  ).rejects.toThrow("INVALID_PAGINATION");
});

test.each([false, true])(
  "teacher/grade-teacher pages preserve enrollment and revocation, migrated=%s",
  async (migrated) => {
    const f = await setup(40);
    await prepare(f);
    if (migrated)
      await f.t.run(async (ctx) => {
        await ctx.db.patch("classes", f.data.course, {
          enrollmentsMigratedAt: 1,
          students: [],
        });
        await ctx.db.insert("classEnrollments", {
          classId: f.data.course,
          studentId: f.data.students.at(-1)!,
          enrolledAt: 1,
          enrolledBy: f.data.admin,
        });
      });
    const query = { ...args(f.data.campus), search: "Student0039" };
    await prepareTeachers(f);
    for (const subject of ["teacher", "grade-teacher"]) {
      const teacher = f.t.withIdentity({ subject });
      expect(
        (await teacher.query(api.people.list, query)).page.map((p) => p._id),
      ).toEqual([f.data.students[39]]);
      expect(
        (
          await teacher.query(api.people.list, {
            ...query,
            search: "Student0000",
          })
        ).page,
      ).toEqual([]);
      await expect(
        teacher.query(api.people.list, { ...query, role: "teacher" }),
      ).rejects.toThrow("PERMISSION_DENIED");
      await expect(
        teacher.query(api.people.list, {
          ...query,
          campusId: f.data.otherCampus,
        }),
      ).rejects.toThrow("PERMISSION_DENIED");
    }
    await f.t.run(async (ctx) => {
      await ctx.db.patch("classes", f.data.course, { isActive: false });
    });
    expect(
      (
        await f.t
          .withIdentity({ subject: "teacher" })
          .query(api.people.list, query)
      ).page,
    ).toEqual([]);
    await f.t.run(async (ctx) => {
      const membership = await ctx.db
        .query("roleAssignments")
        .withIndex("by_user", (q) => q.eq("userId", f.data.teacher))
        .first();
      await ctx.db.delete("roleAssignments", membership!._id);
    });
    await expect(
      f.t.withIdentity({ subject: "teacher" }).query(api.people.list, query),
    ).rejects.toThrow("PERMISSION_DENIED");
    await expect(
      f.t
        .withIdentity({ subject: "Student0000" })
        .query(api.people.list, query),
    ).rejects.toThrow("PERMISSION_DENIED");
  },
);

test("profile updates maintain the same index transactionally; retries don't duplicate initialization", async () => {
  const f = await setup(3);
  await prepare(f);
  const studentId = f.data.students[0];
  await f.t.mutation(internal.users.updateUserInternal, {
    userId: studentId,
    updates: {
      firstName: "Renamed",
      lastName: "Person",
      email: "changed@example.org",
      isActive: false,
    },
  });
  const renamed = await f.admin.query(api.people.list, {
    ...args(f.data.campus),
    search: "Renamed",
    isActive: false,
  });
  expect(renamed.page.map((p) => p._id)).toEqual([studentId]);
  expect(
    (
      await f.admin.query(api.people.list, {
        ...args(f.data.campus),
        search: "Student0000",
      })
    ).page,
  ).toEqual([]);
  await f.t.run(async (ctx) => {
    const membership = await ctx.db
      .query("roleAssignments")
      .withIndex("by_user", (q) => q.eq("userId", studentId))
      .first();
    await ctx.db.patch("roleAssignments", membership!._id, { gradeCode: "08" });
    await syncPeopleDirectory(ctx, studentId);
    expect(
      (await ctx.db.get("roleAssignments", membership!._id))?.directory,
    ).toEqual(
      peopleDirectoryFields((await ctx.db.get("users", studentId))!, "08"),
    );
  });
  await f.admin.mutation(api.people.prepare, {
    campusId: f.data.campus,
    role: "student",
  });
  expect(
    await f.t.run((ctx) => ctx.db.query("peopleDirectoryState").collect()),
  ).toHaveLength(1);
});

test("concurrent preparation and a cancelled job restart without duplicating memberships or changing access", async () => {
  const f = await setup(205);
  vi.useFakeTimers();
  const scope = { campusId: f.data.campus, role: "student" as const };
  await Promise.all([
    f.admin.mutation(api.people.prepare, scope),
    f.admin.mutation(api.people.prepare, scope),
  ]);
  const initial = await f.t.run(async (ctx) => {
    const states = await ctx.db.query("peopleDirectoryState").collect();
    expect(states).toHaveLength(1);
    const jobId = states[0].jobId!;
    await ctx.scheduler.cancel(jobId);
    return jobId;
  });
  await f.admin.mutation(api.people.prepare, scope);
  expect(
    await f.t.run(
      async (ctx) =>
        (await ctx.db.query("peopleDirectoryState").first())?.jobId,
    ),
  ).not.toBe(initial);
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await f.admin.query(api.people.isReady, scope)).toBe(true);
  expect(
    await f.t.run(async (ctx) => {
      const memberships = await ctx.db
        .query("roleAssignments")
        .withIndex("by_org_role", (q) =>
          q
            .eq("orgId", f.data.campus)
            .eq("orgType", "campus")
            .eq("role", "student"),
        )
        .collect();
      expect(
        memberships.every(
          (m) => m.assignedAt === 1 && m.directory !== undefined,
        ),
      ).toBe(true);
      return memberships.length;
    }),
  ).toBe(205);
});

test("legacy duplicate memberships never repeat a person across pages or under different grade filters", async () => {
  const f = await setup(3);
  await f.t.run(async (ctx) => {
    await ctx.db.insert("roleAssignments", {
      userId: f.data.students[0],
      orgId: f.data.campus,
      orgType: "campus",
      role: "student",
      gradeCode: "99",
      assignedAt: 1,
    });
  });
  await prepare(f);
  let cursor: string | null = null;
  const ids: string[] = [];
  for (let i = 0; i < 10; i++) {
    const page: FunctionReturnType<typeof api.people.list> =
      await f.admin.query(api.people.list, {
        ...args(f.data.campus),
        paginationOpts: { numItems: 1, cursor },
      });
    ids.push(...page.page.map((p) => p._id));
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  expect(ids).toHaveLength(3);
  expect(new Set(ids).size).toBe(3);
  expect(
    (
      await f.admin.query(api.people.list, {
        ...args(f.data.campus),
        grade: "99",
      })
    ).page,
  ).toEqual([]);
  expect(
    await f.t.run((ctx) =>
      ctx.db
        .query("roleAssignments")
        .withIndex("by_user", (q) => q.eq("userId", f.data.students[0]))
        .collect(),
    ),
  ).toHaveLength(2);
});

test.each([false, true])(
  "sparse teachers get full authorized pages without scanning campus people, migrated=%s",
  async (migrated) => {
    const f = await setup();
    const students = f.data.students.slice(-63);
    const otherCourse = await f.t.run(async (ctx) => {
      await ctx.db.patch("classes", f.data.course, {
        students: migrated ? [] : [...students, f.data.outsider],
        enrollmentsMigratedAt: migrated ? 1 : undefined,
      });
      const course = (await ctx.db.get("classes", f.data.course))!;
      const { _id, _creationTime, ...fields } = course;
      void _id;
      void _creationTime;
      const other = await ctx.db.insert("classes", {
        ...fields,
        name: "Second shared course",
      });
      await syncCourseGradeAssignments(
        ctx,
        (await ctx.db.get("classes", other))!,
      );
      if (migrated)
        for (const classId of [f.data.course, other])
          for (const studentId of [...students, f.data.outsider])
            await ctx.db.insert("classEnrollments", {
              classId,
              studentId,
              enrolledAt: 1,
              enrolledBy: f.data.admin,
            });
      return other;
    });
    // Teacher initialization is independent of the campus-wide directory.
    await prepareTeachers(f);
    vi.useFakeTimers();
    const teacher = f.t.withIdentity({ subject: "teacher" });
    const first = await teacher.query(async (ctx) => {
      const result = await ctx.runQuery(api.people.list, args(f.data.campus));
      return { result, metrics: await ctx.meta.getTransactionMetrics() };
    });
    expect(first.result.page).toHaveLength(25);
    expect(first.result.page[0]._id).toBe(students[0]);
    expect(first.metrics.documentsRead.used).toBeLessThan(150);
    const ids: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 4; i++) {
      const page: FunctionReturnType<typeof api.people.list> =
        await teacher.query(api.people.list, {
          ...args(f.data.campus),
          paginationOpts: { numItems: 25, cursor },
        });
      expect(page.page.length).toBeGreaterThan(0);
      ids.push(...page.page.map((p) => p._id));
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    expect(ids).toEqual(students);
    expect(new Set(ids).size).toBe(63);
    for (const grade of [undefined, "05"])
      for (const isActive of [undefined, true])
        for (const sortBy of [
          "fullName",
          "email",
          "grade",
          "isActive",
        ] as const) {
          const page = await teacher.query(api.people.list, {
            ...args(f.data.campus),
            grade,
            isActive,
            sortBy,
          });
          expect(page.page).toHaveLength(25);
          expect(
            page.page.every(
              (p) =>
                students.includes(p._id) &&
                (grade === undefined || p.grade === grade) &&
                (isActive === undefined || p.isActive === isActive),
            ),
          ).toBe(true);
        }
    expect(
      (
        await teacher.query(api.people.list, {
          ...args(f.data.campus),
          search: "student1004@example.com",
        })
      ).page.map((p) => p._id),
    ).toEqual([students.at(-1)]);
    const target = students.at(-1)!;
    await f.t.mutation(internal.users.updateUserInternal, {
      userId: target,
      updates: {
        firstName: "Changed",
        lastName: "Student",
        email: "new@example.org",
        isActive: false,
      },
    });
    expect(
      (
        await teacher.query(api.people.list, {
          ...args(f.data.campus),
          search: "Changed",
          isActive: false,
        })
      ).page.map((p) => p._id),
    ).toEqual([target]);
    await f.admin.mutation(api.classes.removeStudent, {
      classId: f.data.course,
      studentId: target,
    });
    expect(
      (
        await teacher.query(api.people.list, {
          ...args(f.data.campus),
          search: "Changed",
        })
      ).page,
    ).toHaveLength(1);
    await f.admin.mutation(api.classes.removeStudent, {
      classId: otherCourse,
      studentId: target,
    });
    expect(
      (
        await teacher.query(api.people.list, {
          ...args(f.data.campus),
          search: "Changed",
        })
      ).page,
    ).toEqual([]);
    await f.admin.mutation(api.classes.addStudent, {
      classId: f.data.course,
      studentId: target,
    });
    expect(
      (
        await teacher.query(api.people.list, {
          ...args(f.data.campus),
          search: "Changed",
        })
      ).page,
    ).toHaveLength(1);
    const assignmentId = await f.t.run(
      async (ctx) =>
        (await ctx.db
          .query("roleAssignments")
          .withIndex("by_user_org_role", (q) =>
            q
              .eq("userId", target)
              .eq("orgId", f.data.campus)
              .eq("orgType", "campus")
              .eq("role", "student"),
          )
          .first())!._id,
    );
    await f.admin.mutation(api.roleAssignments.removeRole, { assignmentId });
    expect(
      (
        await teacher.query(api.people.list, {
          ...args(f.data.campus),
          search: "Changed",
        })
      ).page,
    ).toEqual([]);
  },
);

test("teacher reassignment and course deletion maintain directory relationships in the same transaction", async () => {
  const f = await setup(3);
  await f.t.run(async (ctx) => {
    for (const [order, code] of ["05", "06"].entries())
      await ctx.db.insert("institutionGrades", {
        schoolId: f.data.school,
        code,
        name: code,
        order,
        createdAt: 1,
        createdBy: f.data.admin,
      });
  });
  await prepareTeachers(f);
  await f.admin.mutation(api.classes.update, {
    classId: f.data.course,
    teacherId: f.data.gradeTeacher,
    gradeAssignments: [{ gradeCode: "05" }, { gradeCode: "06" }],
  });
  const teacher = f.t.withIdentity({ subject: "teacher" });
  const next = f.t.withIdentity({ subject: "grade-teacher" });
  expect(
    (await teacher.query(api.people.list, args(f.data.campus))).page,
  ).toEqual([]);
  expect(
    (await next.query(api.people.list, args(f.data.campus))).page.map(
      (p) => p._id,
    ),
  ).toEqual([f.data.students[2]]);
  await f.admin.mutation(api.classes.remove, { id: f.data.course });
  expect((await next.query(api.people.list, args(f.data.campus))).page).toEqual(
    [],
  );
  expect(
    await f.t.run((ctx) => ctx.db.query("teacherStudentDirectory").collect()),
  ).toEqual([]);
});

test("teacher preparation is restartable and idempotent and does not create duplicate shared-course rows", async () => {
  const f = await setup(205);
  await f.t.run((ctx) =>
    ctx.db.patch("classes", f.data.course, { students: f.data.students }),
  );
  vi.useFakeTimers();
  const teacher = f.t.withIdentity({ subject: "teacher" });
  const scope = { campusId: f.data.campus, role: "student" as const };
  await Promise.all([
    teacher.mutation(api.people.prepare, scope),
    teacher.mutation(api.people.prepare, scope),
  ]);
  await f.t.run(async (ctx) => {
    const state = (await ctx.db.query("peopleDirectoryState").first())!;
    await ctx.scheduler.cancel(state.jobId!);
  });
  await teacher.mutation(api.people.prepare, scope);
  await f.t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await teacher.query(api.people.isReady, scope)).toBe(true);
  await f.t.run(async (ctx) => {
    const course = (await ctx.db.get("classes", f.data.course))!;
    await syncCoursePeopleDirectory(ctx, course);
    expect(
      await ctx.db
        .query("teacherStudentDirectory")
        .withIndex("by_campusId_and_teacherId_and_studentId", (q) =>
          q.eq("campusId", f.data.campus).eq("teacherId", f.data.teacher),
        )
        .collect(),
    ).toHaveLength(205);
  });
});

test("a single student at the end of a 1,005-person campus appears on the first teacher page", async () => {
  const f = await setup();
  await prepareTeachers(f);
  const teacher = f.t.withIdentity({ subject: "teacher" });
  const read = await teacher.query(async (ctx) => {
    const result = await ctx.runQuery(api.people.list, args(f.data.campus));
    return { result, metrics: await ctx.meta.getTransactionMetrics() };
  });
  expect(read.result.page.map((row) => row._id)).toEqual([
    f.data.students.at(-1),
  ]);
  expect(read.result.isDone).toBe(true);
  expect(read.metrics.documentsRead.used).toBeLessThan(40);
  expect(
    await f.admin.query(api.people.isReady, {
      campusId: f.data.campus,
      role: "student",
    }),
  ).toBe(false);
});

test("editing a profile does not scan unrelated legacy course rosters", async () => {
  const f = await setup(3);
  await prepareTeachers(f);
  await f.t.run(async (ctx) => {
    const course = (await ctx.db.get("classes", f.data.course))!;
    const { _id, _creationTime, ...fields } = course;
    void _id;
    void _creationTime;
    for (let i = 0; i < 200; i++)
      await ctx.db.insert("classes", {
        ...fields,
        campusId: f.data.campus,
        teacherId: f.data.admin,
        gradeAssignments: undefined,
        name: `Unrelated legacy ${i}`,
        students: [],
        description: "x".repeat(12_000),
      });
  });
  const metrics = await f.t.mutation(async (ctx) => {
    await ctx.runMutation(internal.users.updateUserInternal, {
      userId: f.data.students[2],
      updates: { firstName: "Edited", lastName: "Profile" },
    });
    return await ctx.meta.getTransactionMetrics();
  });
  expect(metrics.documentsRead.used).toBeLessThan(100);
  expect(metrics.bytesRead.used).toBeLessThan(100_000);
  const teacher = f.t.withIdentity({ subject: "teacher" });
  expect(
    (
      await teacher.query(api.people.list, {
        ...args(f.data.campus),
        search: "Edited",
      })
    ).page.map((p) => p._id),
  ).toEqual([f.data.students[2]]);
});

test("teacher directory reads and profile edits stay campus-scoped for primary and multigrade teachers", async () => {
  const f = await setup(3);
  await f.t.run(async (ctx) => {
    const course = (await ctx.db.get("classes", f.data.course))!;
    const { _id, _creationTime, ...fields } = course;
    void _id;
    void _creationTime;
    for (let i = 0; i < 150; i++) {
      const foreign = await ctx.db.insert("classes", {
        ...fields,
        campusId: f.data.otherCampus,
        name: `Other campus ${i}`,
        students: [f.data.outsider],
        description: "x".repeat(12_000),
      });
      await syncCourseGradeAssignments(
        ctx,
        (await ctx.db.get("classes", foreign))!,
      );
    }
    for (let i = 0; i < 20; i++) {
      const inactive = await ctx.db.insert("classes", {
        ...fields,
        isActive: false,
        gradeAssignments: undefined,
        students: [f.data.students[0]],
        description: "x".repeat(12_000),
      });
      await syncCourseGradeAssignments(
        ctx,
        (await ctx.db.get("classes", inactive))!,
      );
    }
    // Campus scope must still include active courses without a period.
    await ctx.db.insert("classes", {
      ...fields,
      academicPeriodId: undefined,
      gradeAssignments: undefined,
      students: [f.data.students[0]],
    });
  });
  await prepareTeachers(f);
  await f.t.run(async (ctx) => {
    const course = (await ctx.db.get("classes", f.data.course))!;
    const periodScope = {
      campusId: f.data.campus,
      academicPeriodId: course.academicPeriodId!,
    };
    for (const teacherId of [f.data.teacher, f.data.gradeTeacher])
      expect(
        (await listTeacherClasses(ctx, teacherId, true, periodScope)).map(
          (row) => row._id,
        ),
      ).toEqual([f.data.course]);
    expect(
      await listTeacherClasses(ctx, f.data.teacher, false, {
        campusId: f.data.campus,
      }),
    ).toHaveLength(20);
  });
  for (const subject of ["teacher", "grade-teacher"]) {
    const read = await f.t.withIdentity({ subject }).query(async (ctx) => {
      const result = await ctx.runQuery(api.people.list, args(f.data.campus));
      return { result, metrics: await ctx.meta.getTransactionMetrics() };
    });
    expect(read.result.page.map((row) => row._id)).toEqual(
      subject === "teacher"
        ? [f.data.students[0], f.data.students[2]]
        : [f.data.students[2]],
    );
    expect(read.result.isDone).toBe(true);
    expect(read.metrics.documentsRead.used).toBeLessThan(60);
    expect(read.metrics.bytesRead.used).toBeLessThan(50_000);
  }
  const metrics = await f.t.mutation(async (ctx) => {
    await ctx.runMutation(internal.users.updateUserInternal, {
      userId: f.data.students[2],
      updates: { firstName: "Scoped", lastName: "Edit" },
    });
    return await ctx.meta.getTransactionMetrics();
  });
  expect(metrics.documentsRead.used).toBeLessThan(100);
  expect(metrics.bytesRead.used).toBeLessThan(100_000);
  for (const subject of ["teacher", "grade-teacher"])
    expect(
      (
        await f.t.withIdentity({ subject }).query(api.people.list, {
          ...args(f.data.campus),
          search: "Scoped",
          grade: "05",
          isActive: true,
        })
      ).page.map((row) => row._id),
    ).toEqual([f.data.students[2]]);
});

test.each([undefined, 0, 1])(
  "grade changes reconcile roster and teacher access consistently, migration marker=%s",
  async (marker) => {
    const f = await setup(3);
    await f.t.run(async (ctx) => {
      for (const [order, code] of ["05", "06"].entries())
        await ctx.db.insert("institutionGrades", {
          schoolId: f.data.school,
          code,
          name: code,
          order,
          createdAt: 1,
          createdBy: f.data.admin,
        });
      await ctx.db.patch("classes", f.data.course, {
        gradeAssignments: [{ gradeCode: "05" }],
        endDate: Date.now() + 86_400_000,
        enrollmentsMigratedAt: marker,
        students: marker ? [] : [f.data.students[2]],
      });
      await syncCourseGradeAssignments(
        ctx,
        (await ctx.db.get("classes", f.data.course))!,
      );
      if (marker)
        await ctx.db.insert("classEnrollments", {
          classId: f.data.course,
          studentId: f.data.students[2],
          enrolledAt: 1,
          enrolledBy: f.data.admin,
        });
    });
    await prepareTeachers(f);
    vi.useFakeTimers();
    const teacher = f.t.withIdentity({ subject: "teacher" });
    expect(
      (await teacher.query(api.people.list, args(f.data.campus))).page,
    ).toHaveLength(1);
    await f.admin.mutation(api.roleAssignments.assignRole, {
      userId: f.data.students[2],
      orgType: "campus",
      orgId: f.data.campus,
      role: "student",
      gradeCode: "06",
    });
    expect(
      (await teacher.query(api.people.list, args(f.data.campus))).page,
    ).toEqual([]);
    await f.t.run(async (ctx) => {
      expect(await ctx.db.get("users", f.data.students[2])).not.toBeNull();
      const course = (await ctx.db.get("classes", f.data.course))!;
      expect(course.students ?? []).not.toContain(f.data.students[2]);
      expect(
        await ctx.db
          .query("classEnrollments")
          .withIndex("by_class", (q) => q.eq("classId", f.data.course))
          .collect(),
      ).toEqual([]);
    });
  },
);

test.each([false, true])(
  "restoring student membership discovers existing rosters, but unchanged membership does not rebuild them, migrated=%s",
  async (migrated) => {
    const f = await setup(3);
    await f.t.run(async (ctx) => {
      await ctx.db.insert("institutionGrades", {
        schoolId: f.data.school,
        code: "05",
        name: "Fifth",
        order: 5,
        createdAt: 1,
        createdBy: f.data.admin,
      });
      if (migrated) {
        await ctx.db.patch("classes", f.data.course, {
          students: [],
          enrollmentsMigratedAt: 1,
        });
        await ctx.db.insert("classEnrollments", {
          classId: f.data.course,
          studentId: f.data.students[2],
          enrolledAt: 1,
          enrolledBy: f.data.admin,
        });
      }
    });
    await prepareTeachers(f);
    vi.useFakeTimers();
    const studentId = f.data.students[2];
    const assignmentId = await f.t.run(
      async (ctx) =>
        (await ctx.db
          .query("roleAssignments")
          .withIndex("by_user_org_role", (q) =>
            q
              .eq("userId", studentId)
              .eq("orgId", f.data.campus)
              .eq("orgType", "campus")
              .eq("role", "student"),
          )
          .first())!._id,
    );
    const teacher = f.t.withIdentity({ subject: "teacher" });
    await f.admin.mutation(api.roleAssignments.removeRole, { assignmentId });
    expect(
      (await teacher.query(api.people.list, args(f.data.campus))).page,
    ).toEqual([]);
    const assignment = {
      userId: studentId,
      orgType: "campus" as const,
      orgId: String(f.data.campus),
      role: "student" as const,
      gradeCode: "05",
    };
    await f.admin.mutation(api.roleAssignments.assignRole, assignment);
    expect(
      (await teacher.query(api.people.list, args(f.data.campus))).page.map(
        (row) => row._id,
      ),
    ).toEqual([studentId]);
    await f.t.run(async (ctx) => {
      const course = (await ctx.db.get("classes", f.data.course))!;
      const { _id, _creationTime, ...fields } = course;
      void _id;
      void _creationTime;
      for (let i = 0; i < 150; i++)
        await ctx.db.insert("classes", {
          ...fields,
          teacherId: f.data.admin,
          gradeAssignments: undefined,
          students: [],
          enrollmentsMigratedAt: undefined,
          description: "x".repeat(12_000),
        });
    });
    const metrics = await f.admin.mutation(async (ctx) => {
      await ctx.runMutation(api.roleAssignments.assignRole, assignment);
      return await ctx.meta.getTransactionMetrics();
    });
    expect(metrics.documentsRead.used).toBeLessThan(100);
    expect(metrics.bytesRead.used).toBeLessThan(100_000);
    expect(
      (
        await teacher.query(api.people.list, {
          ...args(f.data.campus),
          grade: "05",
        })
      ).page.map((row) => row._id),
    ).toEqual([studentId]);
  },
);
