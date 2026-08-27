import type { Doc } from "@/convex/_generated/dataModel";

export type CourseProgress = {
  totalLessons: number;
  taughtLessons: number;
  pendingLessons: number;
  percentage: number;
};

export type CurriculumLessonProgress = Doc<"lessons"> & {
  sessionCount: number;
  lastTaughtAt?: number;
  status: "taught" | "pending";
};
