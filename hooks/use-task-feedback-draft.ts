"use client";

import { useAuth } from "@clerk/nextjs";
import { useSessionDraft } from "./use-session-draft";

type Draft = { text: string; revision: number };

function decode(value: unknown): Draft | undefined {
  if (
    value &&
    typeof value === "object" &&
    "text" in value &&
    typeof value.text === "string" &&
    value.text.length <= 2000 &&
    "revision" in value &&
    typeof value.revision === "number" &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 1
  ) {
    return { text: value.text, revision: value.revision };
  }
}

export function useTaskFeedbackDraft(taskId: string, studentId: string) {
  const { userId } = useAuth();
  const key = userId
    ? `flexidual:task-feedback:${userId}:${taskId}:${studentId}`
    : undefined;
  return useSessionDraft(key, decode);
}
