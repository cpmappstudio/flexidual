"use client";

import { useAuth } from "@clerk/nextjs";
import { z } from "zod";
import { isValidGradingPolicy } from "@/lib/grading";
import { MAX_QUIZ_QUESTIONS } from "@/lib/course-quizzes";
import { useSessionDraft } from "./use-session-draft";

const draftSchema = z.object({
  scores: z
    .record(z.string().min(1).max(128), z.string().max(32))
    .refine((scores) => Object.keys(scores).length <= MAX_QUIZ_QUESTIONS),
  comment: z.string().max(2000),
  version: z.number().int().nonnegative().safe(),
  submissionRevision: z.number().int().nonnegative().safe(),
  operationId: z.string().min(1).max(128),
  grading: z
    .object({
      maxPoints: z.number(),
      scaleMax: z.number(),
      decimalPlaces: z.number(),
      passingPercentage: z.number().optional(),
    })
    .refine((grading) =>
      isValidGradingPolicy({
        ...grading,
        defaultMaxPoints: grading.maxPoints,
      }),
    ),
});

export type QuizReviewDraft = z.infer<typeof draftSchema>;

function decode(value: unknown): QuizReviewDraft | undefined {
  const result = draftSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

function prefix(userId: string, taskId: string) {
  return `flexidual:quiz-review:${userId}:${taskId}:`;
}

export function hasLocalQuizReviewDraft(
  userId: string | null | undefined,
  taskId: string,
) {
  if (!userId) return false;
  try {
    for (let index = 0; index < sessionStorage.length; index++) {
      const key = sessionStorage.key(index);
      if (!key?.startsWith(prefix(userId, taskId))) continue;
      try {
        if (decode(JSON.parse(sessionStorage.getItem(key) ?? "null")))
          return true;
      } catch {
        /* An unreadable entry cannot be recovered. */
      }
    }
  } catch {
    /* The mounted review also guards drafts kept in memory. */
  }
  return false;
}

export function useCourseQuizReviewDraft(taskId: string, studentId: string) {
  const { userId } = useAuth();
  return useSessionDraft(
    userId ? prefix(userId, taskId) + studentId : undefined,
    decode,
  );
}
