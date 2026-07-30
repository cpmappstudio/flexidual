import { v, type Infer } from "convex/values";

export const liveAccessValidator = v.object({
  mode: v.union(v.literal("private"), v.literal("school")),
  allowedGradeCodes: v.array(v.string()),
});

export type LiveAccess = Infer<typeof liveAccessValidator>;

export function normalizeLiveAccess(liveAccess?: LiveAccess): LiveAccess {
  if (liveAccess?.mode !== "school") {
    return { mode: "private", allowedGradeCodes: [] };
  }

  return {
    mode: "school",
    allowedGradeCodes: [...new Set(liveAccess.allowedGradeCodes)],
  };
}

export function canStudentAccessLiveClass({
  isEnrolled,
  liveAccess,
  studentGrade,
  classSchoolId,
  studentSchoolIds,
}: {
  isEnrolled: boolean;
  liveAccess?: LiveAccess;
  studentGrade?: string;
  classSchoolId?: string;
  studentSchoolIds: Set<string>;
}) {
  if (isEnrolled) return true;

  return (
    liveAccess?.mode === "school" &&
    !!studentGrade &&
    liveAccess.allowedGradeCodes.includes(studentGrade) &&
    !!classSchoolId &&
    studentSchoolIds.has(classSchoolId)
  );
}
