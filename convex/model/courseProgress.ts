import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export const courseProgressFields = {
  totalLessons: v.number(),
  taughtLessons: v.number(),
  pendingLessons: v.number(),
  percentage: v.number(),
};

// Call only after authorizing access to the course or enrolled student profile.
export async function getCourseLessonHistory(
  ctx: QueryCtx,
  classId: Id<"classes">,
  excludeScheduleId?: Id<"classSchedule">,
) {
  const [reports, reportLessons, prerecordedLessons] = await Promise.all([
    ctx.db
      .query("classSessionReports")
      .withIndex("by_class_and_closed_at", (q) => q.eq("classId", classId))
      .collect(),
    ctx.db
      .query("classSessionReportLessons")
      .withIndex("by_class_and_lesson", (q) => q.eq("classId", classId))
      .collect(),
    ctx.db
      .query("classPrerecordedLessonRecords")
      .withIndex("by_classId_and_lessonId", (q) => q.eq("classId", classId))
      .collect(),
  ]);
  const closedAtByReport = new Map(
    reports.map((report) => [report._id, report.closedAt]),
  );
  const sessionsByLesson = new Map<
    Id<"lessons">,
    Map<Id<"classSchedule">, number>
  >();
  const remember = (
    lessonId: Id<"lessons">,
    scheduleId: Id<"classSchedule">,
    taughtAt: number,
  ) => {
    if (scheduleId === excludeScheduleId) return;
    const sessions =
      sessionsByLesson.get(lessonId) ?? new Map<Id<"classSchedule">, number>();
    sessions.set(scheduleId, Math.max(sessions.get(scheduleId) ?? 0, taughtAt));
    sessionsByLesson.set(lessonId, sessions);
  };
  for (const reportLesson of reportLessons) {
    const closedAt = closedAtByReport.get(reportLesson.reportId);
    if (closedAt === undefined) continue;
    remember(reportLesson.lessonId, reportLesson.scheduleId, closedAt);
  }
  for (const record of prerecordedLessons)
    remember(record.lessonId, record.scheduleId, record.taughtAt);
  return new Map(
    [...sessionsByLesson].map(([lessonId, sessions]) => [
      lessonId,
      {
        count: sessions.size,
        lastRecordedAt: Math.max(...sessions.values()),
      },
    ]),
  );
}

export async function getClassCurriculumProgress(
  ctx: QueryCtx,
  classData: Doc<"classes">,
) {
  const [lessons, historyByLesson] = await Promise.all([
    ctx.db
      .query("lessons")
      .withIndex("by_curriculum_active", (q) =>
        q.eq("curriculumId", classData.curriculumId).eq("isActive", true),
      )
      .collect(),
    getCourseLessonHistory(ctx, classData._id),
  ]);
  const lessonsWithProgress = lessons
    .sort((a, b) => a.order - b.order)
    .map((lesson) => {
      const history = historyByLesson.get(lesson._id);
      return {
        ...lesson,
        sessionCount: history?.count ?? 0,
        lastTaughtAt: history?.lastRecordedAt,
        status: history ? ("taught" as const) : ("pending" as const),
      };
    });
  const taughtLessons = lessonsWithProgress.filter(
    (lesson) => lesson.status === "taught",
  ).length;
  const totalLessons = lessonsWithProgress.length;
  return {
    totalLessons,
    taughtLessons,
    pendingLessons: totalLessons - taughtLessons,
    percentage:
      totalLessons === 0 ? 0 : Math.round((taughtLessons / totalLessons) * 100),
    lessons: lessonsWithProgress,
  };
}
