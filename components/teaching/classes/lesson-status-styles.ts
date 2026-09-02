import type { CurriculumLessonProgress } from "@/lib/course-progress";

type LessonStatus = CurriculumLessonProgress["status"];

export const LESSON_STATUS_STYLES = {
  taught: {
    indicator: "bg-success/15 text-success",
    badge: "border-success/30 bg-success/10 text-success",
    icon: "bg-success text-white",
    label: "text-success",
  },
  pending: {
    indicator: "bg-warning/15 text-warning",
    badge: "border-warning/40 bg-warning/15 text-warning-foreground",
    icon: "bg-warning text-white",
    label: "text-warning-foreground",
  },
} satisfies Record<
  LessonStatus,
  { indicator: string; badge: string; icon: string; label: string }
>;
