"use client";

import { useRef } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MAX_QUIZ_QUESTIONS,
  QUIZ_QUESTION_TYPE_LABELS,
  type QuizQuestionInput,
  type getQuizQuestionIssue,
} from "@/lib/course-quizzes";
import { CourseQuizQuestionEditor } from "./course-quiz-question-editor";

type ChoiceQuestion = Extract<QuizQuestionInput, { kind: "single_choice" }>;
export type QuizQuestionDraft = {
  id: string;
  _id?: Id<"courseQuizQuestions">;
  prompt: string;
  maxPoints: string;
} & (
  | { kind: "text" }
  | {
      kind: "single_choice";
      options: ChoiceQuestion["options"];
      correctOptionId: string;
    }
  | {
      kind: "multiple_choice";
      options: ChoiceQuestion["options"];
      correctOptionIds: string[];
    }
);

export function quizQuestionToDraft(
  question: Doc<"courseQuizQuestions">,
): QuizQuestionDraft {
  const common = {
    id: question._id,
    _id: question._id,
    prompt: question.prompt,
    maxPoints: String(question.maxPoints),
  };
  if (question.kind === "text") return { ...common, kind: question.kind };
  const choice = { ...common, options: question.options };
  return question.kind === "single_choice"
    ? {
        ...choice,
        kind: question.kind,
        correctOptionId: question.correctOptionId,
      }
    : {
        ...choice,
        kind: question.kind,
        correctOptionIds: question.correctOptionIds,
      };
}

export function createQuizQuestionDraft(
  kind: QuizQuestionDraft["kind"],
): QuizQuestionDraft {
  const common = { id: crypto.randomUUID(), prompt: "", maxPoints: "1" };
  if (kind === "text") return { ...common, kind };
  const options = [
    { id: crypto.randomUUID(), label: "" },
    { id: crypto.randomUUID(), label: "" },
  ];
  return kind === "single_choice"
    ? { ...common, kind, options, correctOptionId: "" }
    : { ...common, kind, options, correctOptionIds: [] };
}

export function CourseQuizQuestionsEditor({
  questions,
  onChange,
  decimalPlaces,
  disabled,
  issues,
  validationAttempt,
  children,
}: {
  questions: QuizQuestionDraft[];
  onChange: (questions: QuizQuestionDraft[]) => void;
  decimalPlaces: number;
  disabled: boolean;
  issues: ReturnType<typeof getQuizQuestionIssue>[];
  validationAttempt: number;
  children: React.ReactNode;
}) {
  const t = useTranslations("courseQuizzes");
  const focusNewQuestion = useRef<string | undefined>(undefined);
  function update(id: string, change: Partial<QuizQuestionDraft>) {
    onChange(
      questions.map((question) =>
        question.id === id
          ? ({ ...question, ...change } as QuizQuestionDraft)
          : question,
      ),
    );
  }
  function move(index: number, offset: number) {
    const next = [...questions];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  }
  return (
    <section className="min-w-0 space-y-4" aria-label={t("questions")}>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">
          {t("questions")}{" "}
          <span className="text-destructive" aria-hidden="true">
            *
          </span>{" "}
          {questions.length > 0 && (
            <span className="font-normal text-muted-foreground">
              · {questions.length}
            </span>
          )}
        </h3>
        {questions.length > 0 && (
          <p className="text-xs text-muted-foreground">{t("weightsHint")}</p>
        )}
      </div>
      {questions.map((question, index) => (
        <CourseQuizQuestionEditor
          key={question.id}
          question={question}
          number={index + 1}
          count={questions.length}
          decimalPlaces={decimalPlaces}
          disabled={disabled}
          onChange={(change) => update(question.id, change)}
          onMove={(offset) => move(index, offset)}
          onRemove={() => {
            onChange(questions.filter((item) => item.id !== question.id));
            if (questions.length === 1)
              requestAnimationFrame(() =>
                document.getElementById("quiz-add-question")?.focus(),
              );
          }}
          issue={issues[index]}
          validationAttempt={validationAttempt}
        />
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              id="quiz-add-question"
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={disabled || questions.length >= MAX_QUIZ_QUESTIONS}
            >
              <Plus className="size-4" />
              {t("addQuestion")}
              <ChevronDown className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            onCloseAutoFocus={(event) => {
              const id = focusNewQuestion.current;
              if (!id) return;
              event.preventDefault();
              focusNewQuestion.current = undefined;
              requestAnimationFrame(() =>
                document.getElementById(`${id}-prompt`)?.focus(),
              );
            }}
          >
            {(["single_choice", "multiple_choice", "text"] as const).map(
              (kind) => (
                <DropdownMenuItem
                  key={kind}
                  className="min-h-11"
                  onSelect={() => {
                    if (disabled || questions.length >= MAX_QUIZ_QUESTIONS)
                      return;
                    const question = createQuizQuestionDraft(kind);
                    focusNewQuestion.current = question.id;
                    onChange([...questions, question]);
                  }}
                >
                  {t(QUIZ_QUESTION_TYPE_LABELS[kind])}
                </DropdownMenuItem>
              ),
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {questions.length >= MAX_QUIZ_QUESTIONS && (
          <span className="text-xs text-muted-foreground">
            {t("questionLimit", {
              count: questions.length,
              max: MAX_QUIZ_QUESTIONS,
            })}
          </span>
        )}
      </div>
      {questions.length > 0 && children}
    </section>
  );
}
