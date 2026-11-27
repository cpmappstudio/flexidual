"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_QUIZ_OPTIONS,
  MAX_QUIZ_TEXT_LENGTH,
  QUIZ_QUESTION_TYPE_LABELS,
  updateQuizSelection,
  type getQuizQuestionIssue,
} from "@/lib/course-quizzes";
import type { QuizQuestionDraft } from "./course-quiz-questions-editor";

export function CourseQuizQuestionEditor({
  question,
  number,
  count,
  decimalPlaces,
  disabled,
  onChange,
  onMove,
  onRemove,
  issue,
  validationAttempt,
}: {
  question: QuizQuestionDraft;
  number: number;
  count: number;
  decimalPlaces: number;
  disabled: boolean;
  onChange: (change: Partial<QuizQuestionDraft>) => void;
  onMove: (offset: number) => void;
  onRemove: () => void;
  issue: ReturnType<typeof getQuizQuestionIssue>;
  validationAttempt: number;
}) {
  const t = useTranslations("courseQuizzes");
  const [disclosure, setDisclosure] = useState({
    expanded: true,
    validationAttempt,
  });
  if (disclosure.validationAttempt !== validationAttempt) {
    setDisclosure({
      expanded: disclosure.expanded || !!issue,
      validationAttempt,
    });
  }
  const { expanded } = disclosure;
  const OptionGroup = question.kind === "single_choice" ? RadioGroup : "div";
  const errorId = `${question.id}-error`;
  const error = issue && (
    <p id={errorId} className="text-sm text-destructive">
      {t(issue.message, { decimalPlaces })}
    </p>
  );
  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 rounded-xl border p-3 sm:p-4"
    >
      <legend className="sr-only">{t("questionNumber", { number })}</legend>
      <Collapsible
        open={expanded}
        onOpenChange={(expanded) =>
          setDisclosure({ expanded, validationAttempt })
        }
      >
        <div className="flex flex-wrap items-start gap-1">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              className="h-auto min-h-11 min-w-0 flex-1 justify-start gap-2 px-0 text-left whitespace-normal hover:bg-transparent"
              aria-label={t("toggleQuestion", { number })}
              aria-describedby={
                !expanded ? `${question.id}-summary` : undefined
              }
            >
              <ChevronDown
                aria-hidden="true"
                className={`size-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
              />
              <span className="min-w-0 space-y-1">
                <span className="block text-sm font-semibold">
                  {t("questionNumber", { number })}
                </span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {t(QUIZ_QUESTION_TYPE_LABELS[question.kind])}
                </span>
                {!expanded && (
                  <span
                    id={`${question.id}-summary`}
                    className="line-clamp-2 break-words text-sm font-normal [overflow-wrap:anywhere]"
                  >
                    {question.prompt.trim() || t("emptyQuestion")}
                  </span>
                )}
              </span>
            </Button>
          </CollapsibleTrigger>
          <div className="flex items-center">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-11"
              disabled={disabled || number === 1}
              aria-label={t("moveUp", { number })}
              onClick={() => onMove(-1)}
            >
              <ArrowUp className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-11"
              disabled={disabled || number === count}
              aria-label={t("moveDown", { number })}
              onClick={() => onMove(1)}
            >
              <ArrowDown className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-11 text-destructive"
              disabled={disabled}
              aria-label={t("removeQuestion", { number })}
              onClick={onRemove}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
        <CollapsibleContent className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor={`${question.id}-prompt`}>
              {t("prompt")}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </Label>
            <Textarea
              id={`${question.id}-prompt`}
              value={question.prompt}
              onChange={(event) => onChange({ prompt: event.target.value })}
              rows={3}
              maxLength={MAX_QUIZ_TEXT_LENGTH}
              required
              aria-invalid={issue?.field === "prompt" || undefined}
              aria-describedby={issue?.field === "prompt" ? errorId : undefined}
            />
            {issue?.field === "prompt" && error}
          </div>
          {question.kind !== "text" ? (
            <div className="space-y-3">
              <p
                id={`${question.id}-options-label`}
                className="text-sm font-medium"
              >
                {t(
                  question.kind === "single_choice"
                    ? "correctOptionHint"
                    : "correctOptionsHint",
                )}
                <span className="text-destructive" aria-hidden="true">
                  *
                </span>
              </p>
              <OptionGroup
                {...(question.kind === "single_choice"
                  ? {
                      value: question.correctOptionId,
                      onValueChange: (correctOptionId: string) =>
                        onChange({ correctOptionId }),
                      disabled,
                      required: true,
                    }
                  : { role: "group" })}
                className="grid gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                id={`${question.id}-options`}
                tabIndex={-1}
                aria-invalid={issue?.field === "options" || undefined}
                aria-describedby={
                  issue?.field === "options" ? errorId : undefined
                }
                aria-labelledby={`${question.id}-options-label`}
              >
                {question.options.map((option, optionIndex) => (
                  <div
                    key={option.id}
                    className="flex min-w-0 items-start gap-2"
                  >
                    <div className="relative mt-4 flex size-11 shrink-0 items-center justify-center">
                      {question.kind === "single_choice" ? (
                        <RadioGroupItem
                          id={`${option.id}-correct`}
                          className="relative z-10"
                          value={option.id}
                          aria-label={t("correctOption", {
                            option: optionIndex + 1,
                            question: number,
                          })}
                        />
                      ) : (
                        <Checkbox
                          id={`${option.id}-correct`}
                          className="relative z-10"
                          checked={question.correctOptionIds.includes(
                            option.id,
                          )}
                          onCheckedChange={(checked) =>
                            onChange({
                              correctOptionIds: updateQuizSelection(
                                question.correctOptionIds,
                                option.id,
                                checked === true,
                              ),
                            })
                          }
                          disabled={disabled}
                          aria-label={t("correctOption", {
                            option: optionIndex + 1,
                            question: number,
                          })}
                        />
                      )}
                      <Label
                        htmlFor={`${option.id}-correct`}
                        className="absolute inset-0 cursor-pointer"
                      >
                        <span className="sr-only">
                          {t("correctOption", {
                            option: optionIndex + 1,
                            question: number,
                          })}
                        </span>
                      </Label>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <Label htmlFor={option.id} className="text-xs">
                        {t("optionPlaceholder", { number: optionIndex + 1 })}
                        <span className="text-destructive" aria-hidden="true">
                          *
                        </span>
                      </Label>
                      <Input
                        id={option.id}
                        value={option.label}
                        onChange={(event) =>
                          onChange({
                            options: question.options.map((item) =>
                              item.id === option.id
                                ? { ...item, label: event.target.value }
                                : item,
                            ),
                          })
                        }
                        maxLength={1_000}
                        required
                        aria-label={t("optionLabel", {
                          option: optionIndex + 1,
                          question: number,
                        })}
                        aria-invalid={
                          (issue?.field === "option" &&
                            issue.optionId === option.id) ||
                          undefined
                        }
                        aria-describedby={
                          issue?.field === "option" &&
                          issue.optionId === option.id
                            ? errorId
                            : undefined
                        }
                      />
                      {issue?.field === "option" &&
                        issue.optionId === option.id &&
                        error}
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="mt-4 size-11 shrink-0 text-destructive"
                      disabled={disabled || question.options.length <= 2}
                      aria-label={t("removeOption", {
                        option: optionIndex + 1,
                        question: number,
                      })}
                      onClick={() =>
                        onChange({
                          options: question.options.filter(
                            (item) => item.id !== option.id,
                          ),
                          ...(question.kind === "single_choice"
                            ? {
                                correctOptionId:
                                  question.correctOptionId === option.id
                                    ? ""
                                    : question.correctOptionId,
                              }
                            : {
                                correctOptionIds:
                                  question.correctOptionIds.filter(
                                    (id) => id !== option.id,
                                  ),
                              }),
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </OptionGroup>
              {issue?.field === "options" && error}
              {question.kind === "multiple_choice" && (
                <p className="text-xs text-muted-foreground">
                  {t("multipleChoiceGradingHint")}
                </p>
              )}
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                disabled={
                  disabled || question.options.length >= MAX_QUIZ_OPTIONS
                }
                onClick={() =>
                  onChange({
                    options: [
                      ...question.options,
                      { id: crypto.randomUUID(), label: "" },
                    ],
                  })
                }
              >
                <Plus className="size-4" />
                {t("addOption")}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("manualQuestionHint")}
            </p>
          )}

          <div className="max-w-48 space-y-2">
            <Label htmlFor={`${question.id}-points`}>
              {t("questionWeight")}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </Label>
            <Input
              id={`${question.id}-points`}
              type="number"
              min={10 ** -decimalPlaces}
              max={1_000_000}
              step={10 ** -decimalPlaces}
              value={question.maxPoints}
              onChange={(event) => onChange({ maxPoints: event.target.value })}
              required
              aria-invalid={issue?.field === "points" || undefined}
              aria-describedby={issue?.field === "points" ? errorId : undefined}
            />
            {issue?.field === "points" && error}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </fieldset>
  );
}
