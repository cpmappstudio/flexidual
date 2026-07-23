export const FLEXIDUAL_COURSE_DETAIL_TABS = [
  "sessions",
  "content",
  "people",
] as const;

export type FlexidualCourseDetailTab =
  (typeof FLEXIDUAL_COURSE_DETAIL_TABS)[number];

export const DEFAULT_FLEXIDUAL_COURSE_DETAIL_TAB: FlexidualCourseDetailTab =
  "sessions";

export function isFlexidualCourseDetailTab(
  value: string | null | undefined,
): value is FlexidualCourseDetailTab {
  return FLEXIDUAL_COURSE_DETAIL_TABS.includes(
    value as FlexidualCourseDetailTab,
  );
}

export type FlexidualCourseWeekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday";

export type FlexidualCourseSessionListItem = {
  id: string;
  title: string;
  dateLabel: string;
  timeLabel: string;
  lessonLabel: string;
};

export type FlexidualCourseLesson = {
  id: string;
  title: string;
  summary: string;
  objectives: readonly string[];
};

export type FlexidualCourse = {
  id: string;
  name: string;
  curriculumName: string;
  academicPeriod: string;
  tags: readonly string[];
  teacher: {
    name: string;
    role: string;
    email: string;
  };
  students: ReadonlyArray<{
    id: string;
    name: string;
    gradeLevel: string;
    guardianLinked?: boolean;
  }>;
  sessions: {
    scheduledThisWeek: number;
    completedThisWeek: number;
    nextSession: {
      dateLabel: string;
      title: string;
    };
    weeklySchedule: ReadonlyArray<{
      id: string;
      weekday: FlexidualCourseWeekday;
      title: string;
      timeLabel: string;
      sessionType: string;
      lessonLabel: string;
    }>;
    upcoming: ReadonlyArray<FlexidualCourseSessionListItem>;
    recent: ReadonlyArray<FlexidualCourseSessionListItem>;
  };
  content: {
    inheritedLessons: ReadonlyArray<
      FlexidualCourseLesson & {
        moduleLabel: string;
        plannedUse: string;
      }
    >;
    customLessons: ReadonlyArray<
      FlexidualCourseLesson & {
        placement: string;
      }
    >;
  };
};

export type FlexidualCourseCard = Pick<
  FlexidualCourse,
  "id" | "name" | "curriculumName" | "academicPeriod"
> & {
  href?: string;
};

export type FlexidualCourseStudent = FlexidualCourse["students"][number];

export type FlexidualOrganizationIdentity = {
  name: string;
  imageUrl?: string | null;
};
