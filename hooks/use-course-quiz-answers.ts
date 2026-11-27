"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  MAX_QUIZ_OPTIONS,
  MAX_QUIZ_QUESTIONS,
  MAX_QUIZ_TEXT_LENGTH,
  sameQuizAnswer,
} from "@/lib/course-quizzes";
import { useSessionDraft } from "./use-session-draft";

export type QuizAnswer = FunctionReturnType<
  typeof api.courseQuizzes.getAttempt
>["answers"][number];
type Update = FunctionArgs<
  typeof api.courseQuizzes.saveAnswers
>["answers"][number];
type Model = {
  drafts: Record<string, Update>;
  acknowledged: Record<string, QuizAnswer>;
};
export type QuizRequestError = "conflict" | "expired" | "access" | "save";

function decodeDrafts(value: unknown): Update[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_QUIZ_QUESTIONS) return;
  const result: Update[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.questionId !== "string" ||
      !item.questionId ||
      item.questionId.length > 128 ||
      ["__proto__", "constructor", "prototype"].includes(item.questionId) ||
      ids.has(item.questionId) ||
      !Number.isSafeInteger(item.expectedVersion) ||
      item.expectedVersion < 0 ||
      item.expectedVersion >= Number.MAX_SAFE_INTEGER ||
      !item.answer ||
      typeof item.answer !== "object"
    )
      return;
    const answer = item.answer;
    if (
      answer.kind === "text" &&
      typeof answer.text === "string" &&
      answer.text.length <= MAX_QUIZ_TEXT_LENGTH
    ) {
      result.push({
        questionId: item.questionId as Update["questionId"],
        expectedVersion: item.expectedVersion,
        answer: { kind: "text", text: answer.text },
      });
    } else if (
      answer.kind === "single_choice" &&
      (answer.optionId === null ||
        (typeof answer.optionId === "string" && answer.optionId.length <= 100))
    ) {
      result.push({
        questionId: item.questionId as Update["questionId"],
        expectedVersion: item.expectedVersion,
        answer: { kind: "single_choice", optionId: answer.optionId },
      });
    } else if (
      answer.kind === "multiple_choice" &&
      Array.isArray(answer.optionIds) &&
      answer.optionIds.length <= MAX_QUIZ_OPTIONS &&
      new Set(answer.optionIds).size === answer.optionIds.length &&
      answer.optionIds.every(
        (id: unknown) =>
          typeof id === "string" && id.length > 0 && id.length <= 100,
      )
    ) {
      result.push({
        questionId: item.questionId as Update["questionId"],
        expectedVersion: item.expectedVersion,
        answer: { kind: "multiple_choice", optionIds: answer.optionIds },
      });
    } else return;
    ids.add(item.questionId);
  }
  return result;
}

export function quizRequestError(error: unknown): QuizRequestError {
  const code = error instanceof ConvexError ? error.data : undefined;
  if (code === "QUIZ_ANSWER_CHANGED") return "conflict";
  if (
    code === "QUIZ_TIME_EXPIRED" ||
    code === "QUIZ_ALREADY_SUBMITTED" ||
    code === "TASK_SUBMISSION_CLOSED"
  )
    return "expired";
  if (code === "PERMISSION_DENIED" || code === "QUIZ_NOT_FOUND")
    return "access";
  return "save";
}

function confirmedAnswer(
  saved: QuizAnswer | undefined,
  acknowledged: QuizAnswer | undefined,
) {
  return acknowledged && (!saved || acknowledged.version > saved.version)
    ? acknowledged
    : saved;
}

export function useCourseQuizAnswers({
  taskId,
  answers,
  enabled,
  connected,
  completed,
  storageKey,
}: {
  taskId: Id<"courseTasks">;
  answers: QuizAnswer[];
  enabled: boolean;
  connected: boolean;
  completed: boolean;
  storageKey: string;
}) {
  const saveMutation = useMutation(api.courseQuizzes.saveAnswers);
  const submitMutation = useMutation(api.courseQuizzes.submit);
  const stored = useSessionDraft(storageKey, decodeDrafts);
  const persist = useRef(stored.setDraft);
  const mounted = useRef(true);
  const completedRef = useRef(completed);
  useEffect(() => {
    persist.current = stored.setDraft;
  }, [stored.setDraft]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    completedRef.current = completed;
    if (completed) persist.current(undefined);
  }, [completed]);
  const [model, setModel] = useState<Model>(() => ({
    drafts: Object.fromEntries(
      (stored.draft ?? []).map((update) => [update.questionId, update]),
    ),
    acknowledged: {},
  }));
  const modelRef = useRef(model);
  const [error, setError] = useState<QuizRequestError | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const hasPending = Object.keys(model.drafts).length > 0;
  const changeModel = useCallback((change: (previous: Model) => Model) => {
    const next = change(modelRef.current);
    modelRef.current = next;
    if (mounted.current) {
      setModel(next);
      const drafts = Object.values(next.drafts);
      persist.current(
        !completedRef.current && drafts.length ? drafts : undefined,
      );
    }
  }, []);

  const save = useCallback((): Promise<boolean> => {
    if (inFlight.current) return inFlight.current;
    if (!enabled || !connected || submittingRef.current)
      return Promise.resolve(false);
    const updates = Object.values(modelRef.current.drafts);
    if (!updates.length) return Promise.resolve(true);
    setSaving(true);
    const request = (async () => {
      try {
        const versions = await saveMutation({ taskId, answers: updates });
        changeModel((previous) => {
          const drafts = { ...previous.drafts };
          const acknowledged = { ...previous.acknowledged };
          for (const { questionId, version } of versions) {
            const sent = updates.find(
              (update) => update.questionId === questionId,
            )!;
            acknowledged[questionId] = {
              questionId,
              answer: sent.answer,
              version,
            };
            if (drafts[questionId]) {
              if (sameQuizAnswer(drafts[questionId].answer, sent.answer))
                delete drafts[questionId];
              else
                drafts[questionId] = {
                  ...drafts[questionId],
                  expectedVersion: version,
                };
            }
          }
          return { drafts, acknowledged };
        });
        setError(null);
        return true;
      } catch (cause) {
        setError(quizRequestError(cause));
        return false;
      } finally {
        inFlight.current = null;
        setSaving(false);
      }
    })();
    inFlight.current = request;
    return request;
  }, [taskId, saveMutation, enabled, connected, changeModel]);

  useEffect(() => {
    if (!hasPending || !enabled || !connected || error || submitting) return;
    const timer = window.setTimeout(() => {
      void save();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [model.drafts, hasPending, enabled, connected, error, submitting, save]);

  useEffect(() => {
    if (!hasPending || completed) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasPending, completed]);

  function edit(
    questionId: Id<"courseQuizQuestions">,
    answer: QuizAnswer["answer"],
  ) {
    if (!enabled || submittingRef.current) return;
    const saved = answers.find((item) => item.questionId === questionId);
    changeModel((previous) => {
      const confirmed = confirmedAnswer(
        saved,
        previous.acknowledged[questionId],
      );
      return {
        ...previous,
        drafts: {
          ...previous.drafts,
          [questionId]: {
            questionId,
            answer,
            expectedVersion:
              previous.drafts[questionId]?.expectedVersion ??
              confirmed?.version ??
              0,
          },
        },
      };
    });
  }

  function answerFor(questionId: Id<"courseQuizQuestions">) {
    return (
      model.drafts[questionId]?.answer ??
      confirmedAnswer(
        answers.find((answer) => answer.questionId === questionId),
        model.acknowledged[questionId],
      )?.answer
    );
  }

  async function submit() {
    if (!enabled || !connected || submittingRef.current || error) return null;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (inFlight.current && !(await inFlight.current)) return null;
      const receipt = await submitMutation({
        taskId,
        answers: Object.values(modelRef.current.drafts),
      });
      changeModel((previous) => ({ ...previous, drafts: {} }));
      return receipt;
    } catch (cause) {
      setError(quizRequestError(cause));
      return null;
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function loadSaved(load: () => Promise<QuizAnswer[]>) {
    if (!connected || inFlight.current || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const saved = await load();
      changeModel(() => ({
        drafts: {},
        acknowledged: Object.fromEntries(
          saved.map((answer) => [answer.questionId, answer]),
        ),
      }));
      setError(null);
    } catch (cause) {
      setError(quizRequestError(cause));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function retry() {
    setError(null);
    void save();
  }
  return {
    edit,
    answerFor,
    submit,
    loadSaved,
    retry,
    hasPending,
    saving,
    submitting,
    error,
  };
}
