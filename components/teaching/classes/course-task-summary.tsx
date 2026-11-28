"use client";

import { CalendarClock, Clock3, ListChecks } from "lucide-react";
import { CourseQuizDefinition } from "./course-quiz-definition";
import { useFormatter, useTranslations } from "next-intl";
import type { Doc } from "@/convex/_generated/dataModel";

export function CourseTaskSummary({
  task,
  timeZone,
  canManage = false,
}: {
  task: Doc<"courseTasks">;
  timeZone: string;
  canManage?: boolean;
}) {
  const t = useTranslations("courseTasks");
  const quizT = useTranslations("courseQuizzes");
  const weightsT = useTranslations("grading.weights");
  const format = useFormatter();
  const date = (value: number | undefined, fallback: string) =>
    value === undefined
      ? fallback
      : format.dateTime(value, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone,
        });
  const facts = [
    {
      label: t("availableFrom"),
      value: date(task.releasedAt ?? task.availableAt, t("noStartDate")),
      icon: CalendarClock,
    },
    {
      label: t("deadlineLabel"),
      value: date(task.dueAt, t("noDeadline")),
      icon: CalendarClock,
    },
    ...(task.kind === "quiz"
      ? [
          {
            label: quizT("durationLabel"),
            value: task.quiz?.durationMinutes ?? "—",
            icon: Clock3,
          },
          {
            label: quizT("questionCount"),
            value:
              task.quiz?.questionCount === undefined
                ? "—"
                : format.number(task.quiz.questionCount),
            icon: ListChecks,
          },
        ]
      : []),
    ...(task.manuallyClosedAt === undefined
      ? []
      : [
          {
            label: t("closedAtLabel"),
            value: date(task.manuallyClosedAt, "—"),
            icon: Clock3,
          },
        ]),
  ];
  return (
    <section className="space-y-4">
      {task.grading && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">{weightsT("category")}: </span>
          {task.gradingCategory
            ? weightsT(`categories.${task.gradingCategory}`)
            : weightsT("unclassified")}
        </p>
      )}
      <h3 className="font-semibold text-foreground">
        {t("datesAndAvailability")}
      </h3>
      <dl className="grid gap-y-4 sm:grid-cols-2">
        {facts.map(({ label, value, icon: Icon }) => (
          <div key={label} className="flex min-w-0 items-start gap-2 py-1">
            <span
              className="flex size-9 shrink-0 items-center justify-center"
              aria-hidden="true"
            >
              <Icon className="size-6 text-primary" />
            </span>
            <div className="min-w-0 space-y-1">
              <dt className="text-xs font-medium text-muted-foreground">
                {label}
              </dt>
              <dd className="break-words text-sm font-semibold text-foreground">
                {value}
              </dd>
            </div>
          </div>
        ))}
      </dl>
      {canManage && task.kind !== "quiz" && task.dueAt !== undefined && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">{t("lateSubmissionsLabel")}: </span>
          {t(
            task.allowLateSubmissions
              ? "lateSubmissionsAllowed"
              : "lateSubmissionsNotAllowed",
          )}
        </p>
      )}
      {task.dueAt === undefined && (
        <p className="text-sm text-muted-foreground">{t("noDeadlineHint")}</p>
      )}
      {task.kind === "quiz" && canManage && (
        <CourseQuizDefinition task={task} canManage />
      )}
    </section>
  );
}
