import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";

export async function recordClassCancellationEvent(
  ctx: MutationCtx,
  event: {
    classId: Id<"classes">;
    schoolId?: Id<"schools">;
    scheduleId: Id<"classSchedule">;
    affectedScheduleIds: Id<"classSchedule">[];
    actorId: Id<"users">;
    scope: "occurrence" | "series";
    source: "calendar" | "course_schedule";
    reason: string;
    effectiveAt: number;
    occurredAt: number;
  },
) {
  if (event.affectedScheduleIds.length === 0) return null;
  const cancellationEventId = await ctx.db.insert(
    "classCancellationEvents",
    event,
  );
  await ctx.scheduler.runAfter(
    0,
    internal.systemNotifications.publishClassCancellation,
    { cancellationEventId },
  );
  return cancellationEventId;
}
