import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { summarizeAbekaProgress } from "./abekaProgressSummary";

// Only call with the enrolled classes already authorized by the student dashboard.
async function getAbekaStudentCourseData<T>(
  ctx: QueryCtx,
  userId: Id<"users">,
  classes: Doc<"classes">[],
  readProgress: (
    studentId: Id<"abekaStudents">,
    subjectId: string,
  ) => Promise<T | null>,
) {
  const result = new Map<Id<"classes">, T>();
  const campusIds = [
    ...new Set(classes.flatMap((c) => (c.campusId ? [c.campusId] : []))),
  ];
  const campuses = await Promise.all(
    campusIds.map((id) => ctx.db.get("campuses", id)),
  );
  const schoolByCampus = new Map(
    campuses.filter((c) => c?.isActive).map((c) => [c!._id, c!.schoolId]),
  );
  const schoolIds = [...new Set(schoolByCampus.values())];
  await Promise.all(
    schoolIds.map(async (schoolId) => {
      const connection = await ctx.db
        .query("abekaConnections")
        .withIndex("by_school", (q) => q.eq("schoolId", schoolId))
        .unique();
      if (!connection?.confirmed || connection.status !== "connected") return;
      const student = await ctx.db
        .query("abekaStudents")
        .withIndex("by_connection_user", (q) =>
          q.eq("connectionId", connection._id).eq("userId", userId),
        )
        .unique();
      if (!student || student.rosterRunId !== connection.rosterRunId) return;
      const byCurriculum = connection.curriculumLinksMigratedAt !== undefined;
      const reportCache = new Map<string, Promise<T | null>>();
      async function readReport(c: Doc<"classes">) {
        const link = byCurriculum
          ? await ctx.db
              .query("abekaCurriculumLinks")
              .withIndex("by_connectionId_and_curriculumId", (q) =>
                q
                  .eq("connectionId", connection!._id)
                  .eq("curriculumId", c.curriculumId),
              )
              .unique()
          : await ctx.db
              .query("abekaCourseLinks")
              .withIndex("by_connectionId_and_classId", (q) =>
                q.eq("connectionId", connection!._id).eq("classId", c._id),
              )
              .unique();
        if (!link) return null;
        if (byCurriculum) {
          const curriculum = await ctx.db.get("curriculums", c.curriculumId);
          if (curriculum?.schoolId !== schoolId) return null;
        }
        const course = await ctx.db.get("abekaCourses", link.courseId);
        if (!course?.available || course.connectionId !== connection!._id)
          return null;
        return readProgress(student!._id, course.subjectId);
      }
      await Promise.all(
        classes
          .filter(
            (c) =>
              c.isActive &&
              c.campusId &&
              schoolByCampus.get(c.campusId) === schoolId &&
              (!c.schoolId || c.schoolId === schoolId),
          )
          .map(async (c) => {
            const key = byCurriculum ? c.curriculumId : c._id;
            if (!reportCache.has(key)) reportCache.set(key, readReport(c));
            const progress = await reportCache.get(key)!;
            if (progress) result.set(c._id, progress);
          }),
      );
    }),
  );
  return result;
}

async function readAbekaProgressReport(
  ctx: QueryCtx,
  studentId: Id<"abekaStudents">,
  subjectId: string,
) {
  const report = await ctx.db
    .query("abekaProgress")
    .withIndex("by_student_subject", (q) =>
      q.eq("studentId", studentId).eq("subjectId", subjectId),
    )
    .unique();
  return report?.lessons.length ? report : null;
}

export async function getAbekaStudentCourseReports(
  ctx: QueryCtx,
  userId: Id<"users">,
  classes: Doc<"classes">[],
) {
  return getAbekaStudentCourseData(
    ctx,
    userId,
    classes,
    (studentId, subjectId) =>
      readAbekaProgressReport(ctx, studentId, subjectId),
  );
}

export async function getAbekaStudentCourseProgress(
  ctx: QueryCtx,
  userId: Id<"users">,
  classes: Doc<"classes">[],
) {
  return getAbekaStudentCourseData(
    ctx,
    userId,
    classes,
    async (studentId, subjectId) => {
      const summary = await ctx.db
        .query("abekaProgressSummaries")
        .withIndex("by_studentId_and_subjectId", (q) =>
          q.eq("studentId", studentId).eq("subjectId", subjectId),
        )
        .unique();
      if (summary) {
        if (!summary.total) return null;
        const { completed, total, percentage, syncedAt } = summary;
        return { completed, total, percentage, syncedAt };
      }
      // Additive rollout: never replace legacy reports with missing/zero progress.
      const report = await readAbekaProgressReport(ctx, studentId, subjectId);
      return report ? summarizeAbekaProgress(report) : null;
    },
  );
}
