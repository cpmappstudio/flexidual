import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DatabaseCtx = Pick<QueryCtx | MutationCtx, "db">;

type ProposedCourseScheduleContext = {
  campusId?: Id<"campuses">;
  academicPeriodId?: Id<"academicPeriods">;
  teacherId?: Id<"users">;
  gradeCode?: string;
};

export function canCoursesShareSchedule(
  proposed: ProposedCourseScheduleContext,
  existing: Pick<
    Doc<"classes">,
    "campusId" | "academicPeriodId" | "teacherId" | "gradeCode"
  >,
) {
  return Boolean(
    proposed.campusId &&
      proposed.academicPeriodId &&
      proposed.teacherId &&
      proposed.gradeCode &&
      existing.campusId === proposed.campusId &&
      existing.academicPeriodId === proposed.academicPeriodId &&
      existing.teacherId === proposed.teacherId &&
      existing.gradeCode &&
      existing.gradeCode !== proposed.gradeCode,
  );
}

export async function listScheduleShareClassIds(
  ctx: DatabaseCtx,
  classId: Id<"classes">,
) {
  const [asClass, asSharedClass] = await Promise.all([
    ctx.db
      .query("courseScheduleShares")
      .withIndex("by_class_and_shared_class", (q) => q.eq("classId", classId))
      .collect(),
    ctx.db
      .query("courseScheduleShares")
      .withIndex("by_shared_class_and_class", (q) =>
        q.eq("sharedClassId", classId),
      )
      .collect(),
  ]);
  return new Set<Id<"classes">>([
    ...asClass.map((share) => share.sharedClassId),
    ...asSharedClass.map((share) => share.classId),
  ]);
}

export async function areCourseSchedulesShared(
  ctx: DatabaseCtx,
  classId: Id<"classes">,
  otherClassId: Id<"classes">,
) {
  const [firstId, secondId] =
    String(classId) < String(otherClassId)
      ? [classId, otherClassId]
      : [otherClassId, classId];
  return Boolean(
    await ctx.db
      .query("courseScheduleShares")
      .withIndex("by_class_and_shared_class", (q) =>
        q.eq("classId", firstId).eq("sharedClassId", secondId),
      )
      .unique(),
  );
}

export async function insertScheduleShares(
  ctx: MutationCtx,
  {
    classId,
    sharedClassIds,
    schoolId,
    campusId,
    academicPeriodId,
    teacherId,
    createdBy,
  }: {
    classId: Id<"classes">;
    sharedClassIds: Id<"classes">[];
    schoolId: Id<"schools">;
    campusId: Id<"campuses">;
    academicPeriodId: Id<"academicPeriods">;
    teacherId: Id<"users">;
    createdBy: Id<"users">;
  },
) {
  for (const sharedClassId of new Set(sharedClassIds)) {
    const [firstId, secondId] =
      String(classId) < String(sharedClassId)
        ? [classId, sharedClassId]
        : [sharedClassId, classId];
    if (await areCourseSchedulesShared(ctx, firstId, secondId)) continue;

    await ctx.db.insert("courseScheduleShares", {
      classId: firstId,
      sharedClassId: secondId,
      schoolId,
      campusId,
      academicPeriodId,
      teacherId,
      createdAt: Date.now(),
      createdBy,
    });
  }
}
