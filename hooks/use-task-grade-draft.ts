"use client";

import { useAuth } from "@clerk/nextjs";
import { useSessionDraft } from "./use-session-draft";
import { isValidGradingPolicy, type GradingConfiguration } from "@/lib/grading";

export type TaskGradeDraft = {
  points: string;
  institutionalScale?: true;
  comment: string;
  version: number;
  submissionRevision: number;
  operationId: string;
  // Older drafts have no snapshot. Preserve their text, but require review.
  grading?: GradingConfiguration;
};

function decode(value: unknown): TaskGradeDraft | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    !("points" in value) ||
    typeof value.points !== "string" ||
    value.points.length > 32 ||
    !("comment" in value) ||
    typeof value.comment !== "string" ||
    value.comment.length > 2000 ||
    !("version" in value) ||
    typeof value.version !== "number" ||
    !Number.isSafeInteger(value.version) ||
    value.version < 0 ||
    !("submissionRevision" in value) ||
    typeof value.submissionRevision !== "number" ||
    !Number.isSafeInteger(value.submissionRevision) ||
    value.submissionRevision < 0 ||
    !("operationId" in value) ||
    typeof value.operationId !== "string" ||
    !value.operationId ||
    value.operationId.length > 128
  )
    return;
  const snapshot = "grading" in value ? value.grading : undefined;
  const passingPercentage =
    snapshot && typeof snapshot === "object" && "passingPercentage" in snapshot
      ? snapshot.passingPercentage
      : undefined;
  const grading =
    snapshot &&
    typeof snapshot === "object" &&
    "maxPoints" in snapshot &&
    typeof snapshot.maxPoints === "number" &&
    "scaleMax" in snapshot &&
    typeof snapshot.scaleMax === "number" &&
    "decimalPlaces" in snapshot &&
    typeof snapshot.decimalPlaces === "number" &&
    (passingPercentage === undefined || typeof passingPercentage === "number") &&
    isValidGradingPolicy({
      defaultMaxPoints: snapshot.maxPoints,
      scaleMax: snapshot.scaleMax,
      decimalPlaces: snapshot.decimalPlaces,
      passingPercentage,
    })
      ? {
          maxPoints: snapshot.maxPoints,
          scaleMax: snapshot.scaleMax,
          decimalPlaces: snapshot.decimalPlaces,
          passingPercentage,
        }
      : undefined;
  return {
    points: value.points,
    institutionalScale:
      "institutionalScale" in value && value.institutionalScale === true
        ? true
        : undefined,
    comment: value.comment,
    version: value.version,
    submissionRevision: value.submissionRevision,
    operationId: value.operationId,
    grading,
  };
}

function taskDraftPrefix(userId: string, taskId: string) {
  return `flexidual:task-grade:${userId}:${taskId}:`;
}

export function hasUnloadedTaskGradeDraft(
  userId: string | null | undefined,
  taskId: string,
  loadedStudentIds: ReadonlySet<string>,
) {
  if (!userId) return false;
  const prefix = taskDraftPrefix(userId, taskId);
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (
        !key?.startsWith(prefix) ||
        loadedStudentIds.has(key.slice(prefix.length))
      ) continue;
      try {
        if (decode(JSON.parse(sessionStorage.getItem(key) ?? "null"))) return true;
      } catch {
        // An unreadable entry does not represent a recoverable draft.
      }
    }
  } catch {
    // The visible editors still guard in-memory drafts when storage is unavailable.
  }
  return false;
}

export function useTaskGradeDraft(taskId: string, studentId: string) {
  const { userId } = useAuth();
  const key = userId ? taskDraftPrefix(userId, taskId) + studentId : undefined;
  return useSessionDraft(key, decode);
}
