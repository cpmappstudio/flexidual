export function isCurriculumAvailableForGrade(
  gradeCodes: readonly string[] | undefined,
  gradeCode: string,
) {
  return gradeCodes?.includes(gradeCode) ?? false;
}
