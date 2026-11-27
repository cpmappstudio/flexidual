import type { Infer } from "convex/values";
import type {
  courseQuizAnswerValidator,
  courseQuizQuestionInputValidator,
} from "../convex/model/courseQuizValidators";
import { isValidPoints } from "./grading";

export type QuizQuestionInput = Infer<typeof courseQuizQuestionInputValidator>;
export const MAX_QUIZ_QUESTIONS = 50;
export const MAX_QUIZ_OPTIONS = 10;
export const MAX_QUIZ_TEXT_LENGTH = 10_000;
export const MAX_QUIZ_DURATION_MINUTES = 1_440;
export const QUIZ_QUESTION_TYPE_LABELS = {
  single_choice: "singleChoice",
  multiple_choice: "multipleChoice",
  text: "text",
} as const;

export function areQuizResultsAvailable(task: {
  dueAt?: number;
  quiz?: { closedAt?: number };
}) {
  return task.dueAt !== undefined && task.quiz?.closedAt === task.dueAt;
}

export function updateQuizSelection(
  ids: string[],
  id: string,
  selected: boolean,
) {
  return selected
    ? [...new Set([...ids, id])]
    : ids.filter((value) => value !== id);
}

export function sumQuizPoints(points: number[], decimalPlaces: number) {
  const factor = 10 ** decimalPlaces;
  return (
    points.reduce((sum, value) => sum + Math.round(value * factor), 0) / factor
  );
}

export function isValidQuizDuration(minutes: number) {
  return (
    Number.isInteger(minutes) &&
    minutes >= 1 &&
    minutes <= MAX_QUIZ_DURATION_MINUTES
  );
}

export function isAutomaticQuizQuestion(question: {
  kind: QuizQuestionInput["kind"];
}) {
  return (
    question.kind === "single_choice" || question.kind === "multiple_choice"
  );
}

export function sameQuizOptionIds(a: string[], b: string[]) {
  return (
    a.length === b.length &&
    new Set(a).size === a.length &&
    new Set(b).size === b.length &&
    a.every((id) => b.includes(id))
  );
}

export function sameQuizAnswer(
  a: Infer<typeof courseQuizAnswerValidator>["answer"],
  b: Infer<typeof courseQuizAnswerValidator>["answer"],
) {
  if (a.kind === "text") return b.kind === "text" && a.text === b.text;
  if (a.kind === "single_choice")
    return b.kind === "single_choice" && a.optionId === b.optionId;
  return (
    b.kind === "multiple_choice" && sameQuizOptionIds(a.optionIds, b.optionIds)
  );
}

export function getQuizQuestionIssue(
  question: QuizQuestionInput,
  decimalPlaces: number,
) {
  if (!question.prompt.trim() || question.prompt.length > MAX_QUIZ_TEXT_LENGTH)
    return { field: "prompt", message: "invalidPrompt" } as const;
  if (
    question.maxPoints <= 0 ||
    !isValidPoints(question.maxPoints, 1_000_000, decimalPlaces)
  )
    return { field: "points", message: "invalidWeight" } as const;
  if (question.kind !== "text") {
    const ids = new Set(question.options.map((option) => option.id));
    const correctIds =
      question.kind === "single_choice"
        ? [question.correctOptionId]
        : question.correctOptionIds;
    if (
      question.options.length < 2 ||
      question.options.length > MAX_QUIZ_OPTIONS ||
      ids.size !== question.options.length
    )
      return { field: "options", message: "invalidOptions" } as const;
    for (const option of question.options) {
      if (
        !option.id.trim() ||
        option.id.length > 100 ||
        !option.label.trim() ||
        option.label.length > 1_000
      )
        return {
          field: "option",
          optionId: option.id,
          message: "invalidOption",
        } as const;
    }
    if (
      correctIds.length < 1 ||
      correctIds.length > question.options.length ||
      new Set(correctIds).size !== correctIds.length ||
      correctIds.some((id) => !ids.has(id))
    )
      return { field: "options", message: "correctAnswerRequired" } as const;
  }
}

export function areQuizQuestionsValid(
  questions: QuizQuestionInput[],
  decimalPlaces: number,
) {
  if (!questions.length || questions.length > MAX_QUIZ_QUESTIONS) return false;
  if (
    questions.some((question) => getQuizQuestionIssue(question, decimalPlaces))
  )
    return false;
  return isValidPoints(
    sumQuizPoints(
      questions.map((question) => question.maxPoints),
      decimalPlaces,
    ),
    1_000_000,
    decimalPlaces,
  );
}
