import type { ClassSessionType } from "./class-session";

type CourseClassroomSchedule = {
  sessionType: ClassSessionType;
  status: "scheduled" | "active" | "completed" | "cancelled";
  isLive: boolean;
};

export function findLiveStandardClassroom<T extends CourseClassroomSchedule>(
  schedules: T[],
) {
  return (
    schedules.find(
      (schedule) =>
        schedule.sessionType === "live" &&
        schedule.status !== "cancelled" &&
        (schedule.isLive || schedule.status === "active"),
    ) ?? null
  );
}
