"use client";

import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { QuizAnswer } from "@/hooks/use-course-quiz-answers";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_QUIZ_TEXT_LENGTH,
  QUIZ_QUESTION_TYPE_LABELS,
  updateQuizSelection,
} from "@/lib/course-quizzes";

export function CourseQuizAnswerQuestion({
  question,
  index,
  answer,
  disabled,
  onChange,
}: {
  question: FunctionReturnType<typeof api.courseQuizzes.getQuestions>[number];
  index: number;
  answer: QuizAnswer["answer"] | undefined;
  disabled: boolean;
  onChange: (answer: QuizAnswer["answer"]) => void;
}) {
  const t = useTranslations("courseQuizzes");
  const format = useFormatter();
  const OptionGroup = question.kind === "single_choice" ? RadioGroup : "div";
  return (
    <fieldset
      data-quiz-question
      tabIndex={-1}
      disabled={disabled}
      className="min-w-0 scroll-mt-[calc(var(--header-height,4rem)+var(--quiz-toolbar-height,9rem)+1rem)] space-y-4 pb-5 outline-none"
    >
      <legend className="mb-2 text-sm font-semibold">
        {t("questionNumber", { number: index + 1 })} ·{" "}
        {t(QUIZ_QUESTION_TYPE_LABELS[question.kind])}
      </legend>
      <Label
        id={`prompt-${question._id}`}
        htmlFor={`answer-${question._id}`}
        className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]"
      >
        {question.prompt}
      </Label>
      <p
        id={`question-hint-${question._id}`}
        className="text-sm text-foreground/80"
      >
        {t(
          question.kind === "multiple_choice"
            ? "multipleChoiceAnswerHint"
            : question.kind === "single_choice"
              ? "singleChoiceAnswerHint"
              : "textAnswerHint",
        )}
      </p>
      {question.kind !== "text" ? (
        <>
          <OptionGroup
            aria-labelledby={`prompt-${question._id}`}
            {...(question.kind === "single_choice"
              ? {
                  disabled,
                  value:
                    answer?.kind === "single_choice"
                      ? (answer.optionId ?? "")
                      : "",
                  onValueChange: (optionId: string) =>
                    onChange({
                      kind: "single_choice",
                      optionId,
                    }),
                }
              : {
                  role: "group",
                  "aria-describedby": `question-hint-${question._id}`,
                })}
            className="grid gap-3"
          >
            {question.options.map((option) => (
              <label
                key={option.id}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-3 has-[:disabled]:cursor-default hover:bg-muted/50"
              >
                {question.kind === "single_choice" ? (
                  <RadioGroupItem
                    className="mt-0.5"
                    value={option.id}
                    aria-label={option.label}
                  />
                ) : (
                  <Checkbox
                    className="mt-0.5"
                    aria-label={option.label}
                    disabled={disabled}
                    checked={
                      answer?.kind === "multiple_choice" &&
                      answer.optionIds.includes(option.id)
                    }
                    onCheckedChange={(checked) =>
                      onChange({
                        kind: "multiple_choice",
                        optionIds: updateQuizSelection(
                          answer?.kind === "multiple_choice"
                            ? answer.optionIds
                            : [],
                          option.id,
                          checked === true,
                        ),
                      })
                    }
                  />
                )}
                <span className="min-w-0 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
                  {option.label}
                </span>
              </label>
            ))}
          </OptionGroup>
          {((answer?.kind === "single_choice" && answer.optionId !== null) ||
            (answer?.kind === "multiple_choice" &&
              answer.optionIds.length > 0)) && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() =>
                onChange(
                  question.kind === "single_choice"
                    ? { kind: "single_choice", optionId: null }
                    : { kind: "multiple_choice", optionIds: [] },
                )
              }
            >
              {t("clearAnswer")}
            </Button>
          )}
        </>
      ) : (
        <Textarea
          id={`answer-${question._id}`}
          className="select-text"
          aria-describedby={`question-hint-${question._id}`}
          rows={4}
          maxLength={MAX_QUIZ_TEXT_LENGTH}
          value={answer?.kind === "text" ? answer.text : ""}
          onChange={(event) =>
            onChange({
              kind: "text",
              text: event.target.value,
            })
          }
        />
      )}
      <p className="text-xs text-foreground/80">
        {t("questionWeightValue", {
          weight: format.number(question.maxPoints),
        })}
      </p>
    </fieldset>
  );
}
