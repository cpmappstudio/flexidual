import { ConvexError } from "convex/values";

export function validateTaskDates({
  availableAt,
  releasedAt,
  dueAt,
  now,
  courseEndAt,
  requireFutureDue,
}: {
  availableAt: number | undefined;
  releasedAt?: number;
  dueAt: number | undefined;
  now: number;
  courseEndAt: number;
  requireFutureDue: boolean;
}) {
  const effectiveStartAt = releasedAt ?? availableAt;
  if (
    (availableAt !== undefined &&
      (!Number.isFinite(availableAt) ||
        availableAt > courseEndAt ||
        (releasedAt === undefined && availableAt <= now))) ||
    (dueAt !== undefined &&
      (!Number.isFinite(dueAt) ||
        dueAt > courseEndAt ||
        (effectiveStartAt !== undefined && dueAt <= effectiveStartAt) ||
        (requireFutureDue && dueAt <= now)))
  ) {
    throw new ConvexError("INVALID_TASK_DATES");
  }
}
