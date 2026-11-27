"use client";

import { useId } from "react";
import { ChevronDown } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { useFormatter, useTranslations } from "next-intl";
import type { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { isValidPoints } from "@/lib/grading";
import { useCourseQuizCopyProtection } from "@/hooks/use-course-quiz-copy-protection";
import {
  isAutomaticQuizQuestion,
  QUIZ_QUESTION_TYPE_LABELS,
} from "@/lib/course-quizzes";

export type QuizReview = FunctionReturnType<typeof api.courseQuizzes.getReview>;

export function CourseQuizReviewQuestions({
  review,
  editor,
  audience = "teacher",
}: {
  review: QuizReview;
  editor?: {
    scores: Record<string, string>;
    readOnly: boolean;
    onChange: (questionId: string, value: string) => void;
  };
  audience?: "teacher" | "student";
}) {
  const t = useTranslations("courseQuizzes");
  const format = useFormatter();
  const id = useId();
  const protectedContent = useCourseQuizCopyProtection<HTMLOListElement>(
    audience === "student",
  );
  const answers = new Map(
    review.answers.map((answer) => [answer.questionId, answer.answer]),
  );
  const scores = new Map(
    review.scores.map((score) => [score.questionId, score.points]),
  );
  return (
    <ol
      ref={protectedContent}
      className={audience === "student" ? "divide-y select-none" : "divide-y"}
    >
      {review.questions.map((question, index) => {
        const answer = answers.get(question._id);
        const text = answer?.kind === "text" ? answer.text : "";
        const optionIds =
          answer?.kind === "multiple_choice"
            ? answer.optionIds
            : answer?.kind === "single_choice" && answer.optionId !== null
              ? [answer.optionId]
              : [];
        const correctIds =
          question.kind === "multiple_choice"
            ? (question.correctOptionIds ?? [])
            : question.kind === "single_choice" &&
                question.correctOptionId !== undefined
              ? [question.correctOptionId]
              : [];
        const points = scores.get(question._id);
        const value =
          editor?.scores[question._id] ??
          (points == null ? "" : String(points));
        const scoreId = `${id}-${question._id}`;
        const number = (n: number) =>
          format.number(n, {
            maximumFractionDigits: review.grading.decimalPlaces,
          });
        const automaticReview = !!editor && isAutomaticQuizQuestion(question);
        const title = (
          <>
            {t("questionNumber", { number: index + 1 })} ·{" "}
            {t(QUIZ_QUESTION_TYPE_LABELS[question.kind])}
          </>
        );
        const heading = (
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <h4 className="font-semibold">{title}</h4>
            <span className="tabular-nums text-muted-foreground">
              {t("questionPoints", { points: number(question.maxPoints) })}
            </span>
          </div>
        );
        const content = (
          <>
            <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
              {question.prompt}
            </p>
            {question.kind !== "text" ? (
              <ul className="space-y-2 text-sm">
                {question.options.map((option) => (
                  <li
                    key={option.id}
                    className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-md bg-muted/40 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                      {option.label}
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      {optionIds.includes(option.id) && (
                        <Badge variant="outline">
                          {t(
                            audience === "student"
                              ? "yourAnswer"
                              : "selectedAnswer",
                          )}
                        </Badge>
                      )}
                      {correctIds.includes(option.id) && (
                        <Badge variant="active">
                          {t(
                            audience === "student"
                              ? "correctAnswer"
                              : "correct",
                          )}
                        </Badge>
                      )}
                    </span>
                  </li>
                ))}
                {optionIds.length === 0 && (
                  <li className="text-muted-foreground">{t("unanswered")}</li>
                )}
              </ul>
            ) : (
              <div className="space-y-1 text-sm">
                <p className="font-medium text-muted-foreground">
                  {t(audience === "student" ? "yourAnswer" : "studentAnswer")}
                </p>
                <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {text.trim() ? text : t("unanswered")}
                </p>
              </div>
            )}
            {editor && question.kind === "text" && text.trim() ? (
              <div className="grid gap-1.5">
                <Label htmlFor={scoreId}>
                  {t("scoreQuestion", {
                    number: index + 1,
                    max: number(question.maxPoints),
                  })}
                  <span className="text-destructive" aria-hidden="true">
                    *
                  </span>
                </Label>
                <Input
                  id={scoreId}
                  aria-required="true"
                  type="number"
                  className="w-32 min-h-11"
                  min={0}
                  max={question.maxPoints}
                  step={10 ** -review.grading.decimalPlaces}
                  value={value}
                  readOnly={editor.readOnly}
                  onChange={(event) =>
                    editor.onChange(question._id, event.target.value)
                  }
                  aria-invalid={
                    value.trim() !== "" &&
                    !isValidPoints(
                      Number(value),
                      question.maxPoints,
                      review.grading.decimalPlaces,
                    )
                  }
                />
              </div>
            ) : (
              !automaticReview && (
                <p className="text-sm font-medium tabular-nums">
                  {points == null
                    ? t("scorePending")
                    : t("scoreValue", {
                        points: number(points),
                        max: number(question.maxPoints),
                      })}
                </p>
              )
            )}
          </>
        );
        return (
          <li key={question._id} className="min-w-0 space-y-3 py-5 first:pt-0">
            {automaticReview ? (
              <Collapsible className="group space-y-3">
                <h4>
                  <CollapsibleTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11 w-full justify-between gap-3 whitespace-normal px-0 text-left hover:bg-transparent"
                      aria-label={t("toggleAutomaticReview", {
                        number: index + 1,
                      })}
                    >
                      <span className="space-y-1">
                        <span className="block font-semibold">{title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {t("automaticReview")}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-sm tabular-nums">
                        {t("scoreValue", {
                          points: number(points ?? 0),
                          max: number(question.maxPoints),
                        })}
                        <ChevronDown
                          aria-hidden="true"
                          className="size-4 transition-transform group-data-[state=open]:rotate-180"
                        />
                      </span>
                    </Button>
                  </CollapsibleTrigger>
                </h4>
                <CollapsibleContent className="space-y-3">
                  {content}
                </CollapsibleContent>
              </Collapsible>
            ) : (
              <>
                {heading}
                {content}
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}
