export type CourseProgress = {
  totalClasses: number;
  completedClasses: number;
  pendingClasses: number;
  percentage: number;
};

type CourseProgressSchedule = {
  status?: string;
};

export function calculateCourseProgress(
  schedules: readonly CourseProgressSchedule[],
): CourseProgress {
  const courseClasses = schedules.filter(
    (schedule) => schedule.status !== "cancelled",
  );
  const totalClasses = courseClasses.length;
  const completedClasses = courseClasses.filter(
    (schedule) => schedule.status === "completed",
  ).length;
  const pendingClasses = totalClasses - completedClasses;
  const percentage =
    totalClasses === 0
      ? 0
      : Math.round((completedClasses / totalClasses) * 100);

  return {
    totalClasses,
    completedClasses,
    pendingClasses,
    percentage,
  };
}
