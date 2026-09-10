import { isLiveClassSession, type ClassSessionType } from "./class-session";

type CourseClassroomSchedule = {
  sessionType: ClassSessionType;
  status: "scheduled" | "active" | "completed" | "cancelled";
  isLive: boolean;
};

export function findLiveStandardClassroom<T extends CourseClassroomSchedule>(
  schedules: T[],
) {
  return schedules.find(isLiveClassSession) ?? null;
}
