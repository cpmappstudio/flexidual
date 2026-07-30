export function isCurriculumAvailableForGrade(
  gradeCodes: readonly string[] | undefined,
  gradeCode: string,
) {
  return gradeCodes?.includes(gradeCode) ?? false;
}

export function retainOfferedGradeCodes(
  gradeCodes: readonly string[],
  offeredGradeCodes: readonly string[],
) {
  const offered = new Set(offeredGradeCodes);
  return [...new Set(gradeCodes)].filter((code) => offered.has(code));
}
