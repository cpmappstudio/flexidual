import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getCourseTeacherIds, listTeacherClasses } from "./courseAssignments";
import { isStudentEnrolled, listClassStudentIds } from "./enrollments";
import { peopleDirectoryFields } from "./peopleDirectoryFields";

/** One derived row per relationship, irrespective of how many courses they share. */
export async function syncTeacherStudentDirectory(
  ctx: MutationCtx,
  campusId: Id<"campuses">,
  teacherId: Id<"users">,
  studentId: Id<"users">,
  courses?: readonly Doc<"classes">[],
) {
  const existing = await ctx.db
    .query("teacherStudentDirectory")
    .withIndex("by_campusId_and_teacherId_and_studentId", (q) =>
      q
        .eq("campusId", campusId)
        .eq("teacherId", teacherId)
        .eq("studentId", studentId),
    )
    .unique();
  const membership = await ctx.db
    .query("roleAssignments")
    .withIndex("by_user_org_role", (q) =>
      q
        .eq("userId", studentId)
        .eq("orgId", campusId)
        .eq("orgType", "campus")
        .eq("role", "student"),
    )
    .first();
  const student = membership ? await ctx.db.get("users", studentId) : null;
  let enrolled = false;
  if (student) {
    for (const course of courses ??
      (await listTeacherClasses(ctx, teacherId, true, { campusId }))) {
      if (
        course.campusId === campusId &&
        (await isStudentEnrolled(ctx, course, studentId))
      ) {
        enrolled = true;
        break;
      }
    }
  }
  if (!student || !membership || !enrolled) {
    if (existing) await ctx.db.delete("teacherStudentDirectory", existing._id);
    return;
  }
  const directory = peopleDirectoryFields(student, membership.gradeCode);
  if (!existing)
    await ctx.db.insert("teacherStudentDirectory", {
      campusId,
      teacherId,
      studentId,
      directory,
    });
  else if (
    Object.entries(directory).some(
      ([key, value]) =>
        existing.directory[key as keyof typeof directory] !== value,
    )
  )
    await ctx.db.patch("teacherStudentDirectory", existing._id, { directory });
}

export async function syncCoursePeopleDirectory(
  ctx: MutationCtx,
  course: Doc<"classes">,
  previous?: Doc<"classes">,
  studentIds?: Iterable<Id<"users">>,
) {
  if (!course.campusId) return;
  const teachers = new Set([
    ...getCourseTeacherIds(course),
    ...(previous ? getCourseTeacherIds(previous) : []),
  ]);
  const students = new Set(
    studentIds ?? (await listClassStudentIds(ctx, course)),
  );
  if (studentIds === undefined && previous)
    for (const studentId of await listClassStudentIds(ctx, previous))
      students.add(studentId);
  for (const teacherId of teachers) {
    const courses = await listTeacherClasses(ctx, teacherId, true, {
      campusId: course.campusId,
    });
    for (const studentId of students)
      await syncTeacherStudentDirectory(
        ctx,
        course.campusId,
        teacherId,
        studentId,
        courses,
      );
  }
}
