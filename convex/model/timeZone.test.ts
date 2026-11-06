import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import schema from "../schema";
import { modules } from "../test.setup";
import { getClassTimeZone } from "./timeZone";

test.each([
  { kind: "course override", expected: "Europe/Madrid" },
  { kind: "campus override", expected: "America/Bogota" },
  { kind: "campus institution", expected: "America/New_York" },
  { kind: "no campus", expected: "America/Tegucigalpa" },
  { kind: "missing campus", expected: "America/Tegucigalpa" },
  { kind: "missing curriculum", expected: "America/New_York" },
  { kind: "both missing", expected: undefined },
  { kind: "missing campus institution", expected: undefined },
  { kind: "unconfigured institution", expected: undefined },
])("time-zone scope reuse preserves $kind", async ({ kind, expected }) => {
  const t = convexTest(schema, modules);
  const classId = await t.run(async (ctx) => {
    const createdBy = await ctx.db.insert("users", {
      clerkId: "time-zone-admin",
      firstName: "Test",
      lastName: "Admin",
      fullName: "Test Admin",
      isActive: true,
      createdAt: 1,
    });
    const school = (name: string, timeZone: string | undefined) =>
      ctx.db.insert("schools", {
        name,
        slug: name,
        timeZone,
        isActive: true,
        createdAt: 1,
        createdBy,
      });
    const campusSchoolId = await school(
      "campus-school",
      kind === "unconfigured institution" ? undefined : "America/New_York",
    );
    const curriculumSchoolId = await school(
      "curriculum-school",
      "America/Tegucigalpa",
    );
    const legacySchoolId = await school("legacy-school", "Asia/Tokyo");
    const campusId = await ctx.db.insert("campuses", {
      name: "Campus",
      slug: "campus",
      schoolId: campusSchoolId,
      timeZone: kind === "campus override" ? "America/Bogota" : undefined,
      isActive: true,
      createdAt: 1,
      createdBy,
    });
    const curriculumId = await ctx.db.insert("curriculums", {
      title: "Curriculum",
      schoolId: curriculumSchoolId,
      isActive: true,
      createdAt: 1,
      createdBy,
    });
    const id = await ctx.db.insert("classes", {
      name: "Legacy time zone",
      curriculumId,
      campusId: kind === "no campus" ? undefined : campusId,
      // This legacy field does not select the institution for time zones.
      schoolId: legacySchoolId,
      timeZone: kind === "course override" ? "Europe/Madrid" : undefined,
      isActive: true,
      createdAt: 1,
      createdBy,
    });
    if (kind === "missing campus" || kind === "both missing") {
      await ctx.db.delete("campuses", campusId);
    }
    if (kind === "missing curriculum" || kind === "both missing") {
      await ctx.db.delete("curriculums", curriculumId);
    }
    if (kind === "missing campus institution") {
      await ctx.db.delete("schools", campusSchoolId);
    }
    return id;
  });

  await t.query(async (ctx) => {
    const course = (await ctx.db.get("classes", classId))!;
    const [curriculum, campus] = await Promise.all([
      ctx.db.get("curriculums", course.curriculumId),
      course.campusId ? ctx.db.get("campuses", course.campusId) : null,
    ]);
    expect(await getClassTimeZone(ctx, course)).toBe(expected);
    const get = vi.spyOn(ctx.db, "get");
    try {
      expect(await getClassTimeZone(ctx, course, { curriculum, campus })).toBe(
        expected,
      );
      expect(
        get.mock.calls.some(
          ([table]) => table === "curriculums" || table === "campuses",
        ),
      ).toBe(false);
      // Retain the early return and the original school fallback, including
      // confirmed missing documents. Never resolve using course.schoolId.
      expect(get).toHaveBeenCalledTimes(
        course.timeZone || !(campus?.schoolId ?? curriculum?.schoolId) ? 0 : 1,
      );
    } finally {
      get.mockRestore();
    }
    expect((await ctx.meta.getTransactionMetrics()).documentsWritten.used).toBe(
      0,
    );
  });
});
