"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";

type Draft = { text: string; revision: number };

export function useTaskFeedbackDraft(taskId: string, studentId: string) {
  const { userId } = useAuth();
  const key = userId
    ? `flexidual:task-feedback:${userId}:${taskId}:${studentId}`
    : undefined;
  const [state, setState] = useState<{ key: string; draft?: Draft }>();
  const draft = state?.key === key ? state?.draft : undefined;

  useEffect(() => {
    if (!key) return;
    try {
      const raw = sessionStorage.getItem(key);
      const value: unknown = raw ? JSON.parse(raw) : undefined;
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
      )
        setState({
          key,
          draft: { text: value.text, revision: value.revision },
        });
    } catch {
      // Keep editing in memory when the browser blocks temporary storage.
    }
  }, [key]);

  function persist(value: Draft | undefined) {
    if (!key) return;
    try {
      if (value) sessionStorage.setItem(key, JSON.stringify(value));
      else sessionStorage.removeItem(key);
    } catch {
      // Keep the draft in the mounted review when storage is unavailable.
    }
  }

  function setDraft(value: Draft | undefined) {
    if (key) setState({ key, draft: value });
    persist(value);
  }

  return { draft, setDraft };
}
