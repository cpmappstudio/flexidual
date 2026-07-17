export type LiveAccess = {
  mode: "private" | "school";
  allowedGradeCodes: string[];
};

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

  return liveAccess?.mode === "school"
    && !!studentGrade
    && liveAccess.allowedGradeCodes.includes(studentGrade)
    && !!classSchoolId
    && studentSchoolIds.has(classSchoolId);
}
