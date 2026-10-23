export const ROUTES = {
  org: {
    root: (orgSlug: string) => `/${orgSlug}`,
    taskSubmission: (
      orgSlug: string,
      classId: string,
      taskId: string,
      studentId: string,
    ) => `/${orgSlug}/classes/${classId}?task=${taskId}&student=${studentId}`,
  },
};
