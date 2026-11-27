"use client";

import { useQuery } from "convex/react";
import { useFormatter, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { areQuizResultsAvailable } from "@/lib/course-quizzes";
import { Skeleton } from "@/components/ui/skeleton";
import { CourseQuizReviewQuestions } from "./course-quiz-review-questions";

export function CourseQuizResults({
  task,
  timeZone,
}: {
  task: Doc<"courseTasks">;
  timeZone: string;
}) {
  const t = useTranslations("courseQuizzes");
  const format = useFormatter();
  const closed = areQuizResultsAvailable(task);
  const review = useQuery(
    api.courseQuizzes.getReview,
    closed ? { taskId: task._id } : "skip",
  );
  if (!closed)
    return (
      <p className="text-sm text-muted-foreground">
        {task.dueAt === undefined
          ? t("reviewAtCloseHint")
          : t("resultsAvailableAt", {
              date: format.dateTime(task.dueAt, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone,
              }),
            })}
      </p>
    );
  return (
    <section className="space-y-4 border-t pt-5" aria-label={t("results")}>
      <h3 className="font-semibold">{t("results")}</h3>
      {review === undefined ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <CourseQuizReviewQuestions review={review} audience="student" />
      )}
    </section>
  );
}
