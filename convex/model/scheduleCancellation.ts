import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { dateInTimeZone } from "../../lib/time-zone";
import { recordClassCancellationEvent } from "./classCancellationEvents";

export type CancellationSource =
  | "calendar"
  | "course_schedule"
  | "calendar_closure";

type CancellationFields = Pick<
  Doc<"classSchedule">,
  | "status"
  | "cancellationReason"
  | "cancelledAt"
  | "cancelledBy"
  | "cancellationScope"
  | "cancellationEffectiveAt"
  | "calendarClosureId"
>;

type ScheduleOccurrenceCancellation = {
  schedule: Doc<"classSchedule">;
  classData: Doc<"classes">;
  schoolId?: Id<"schools">;
  actorId: Id<"users">;
  reason: string;
  occurredAt: number;
  source: CancellationSource;
  calendarClosureId?: Id<"calendarClosures">;
  publishNotification?: boolean;
};

export function isScheduleCancellable(
  schedule: Doc<"classSchedule">,
  now: number,
) {
  return (
    schedule.status === "scheduled" &&
    schedule.scheduledStart > now &&
    schedule.isLive !== true
  );
}

export function isScheduleCancellableForCalendarClosure(
  schedule: Doc<"classSchedule">,
  closureCreatedAt: number,
  timeZone: string,
) {
  return (
    schedule.status === "scheduled" &&
    schedule.isLive !== true &&
    (schedule.scheduledStart > closureCreatedAt ||
      dateInTimeZone(schedule.scheduledStart, timeZone) ===
        dateInTimeZone(closureCreatedAt, timeZone))
  );
}

export function buildScheduleCancellationFields({
  actorId,
  reason,
  scope,
  effectiveAt,
  occurredAt,
  calendarClosureId,
}: {
  actorId: Id<"users">;
  reason: string;
  scope: "occurrence" | "series";
  effectiveAt: number;
  occurredAt: number;
  calendarClosureId?: Id<"calendarClosures">;
}): CancellationFields {
  return {
    status: "cancelled",
    cancellationReason: reason,
    cancelledAt: occurredAt,
    cancelledBy: actorId,
    cancellationScope: scope,
    cancellationEffectiveAt: effectiveAt,
    calendarClosureId,
  };
}

async function applyScheduleOccurrenceCancellation(
  ctx: MutationCtx,
  {
    schedule,
    classData,
    schoolId,
    actorId,
    reason,
    occurredAt,
    source,
    calendarClosureId,
    publishNotification = true,
  }: ScheduleOccurrenceCancellation,
) {
  await ctx.db.patch(
    "classSchedule",
    schedule._id,
    buildScheduleCancellationFields({
      actorId,
      reason,
      scope: "occurrence",
      effectiveAt: schedule.scheduledStart,
      occurredAt,
      calendarClosureId,
    }),
  );
  await recordClassCancellationEvent(
    ctx,
    {
      classId: classData._id,
      schoolId,
      scheduleId: schedule._id,
      affectedScheduleIds: [schedule._id],
      actorId,
      scope: "occurrence",
      source,
      reason,
      effectiveAt: schedule.scheduledStart,
      occurredAt,
      calendarClosureId,
    },
    { publishNotification },
  );
  return true;
}

export async function cancelScheduleOccurrence(
  ctx: MutationCtx,
  input: ScheduleOccurrenceCancellation,
) {
  if (!isScheduleCancellable(input.schedule, input.occurredAt)) return false;
  return await applyScheduleOccurrenceCancellation(ctx, input);
}

export async function cancelScheduleOccurrenceForCalendarClosure(
  ctx: MutationCtx,
  input: ScheduleOccurrenceCancellation & {
    closureCreatedAt: number;
    closureTimeZone: string;
  },
) {
  const { closureCreatedAt, closureTimeZone, ...cancellation } = input;
  if (
    !isScheduleCancellableForCalendarClosure(
      cancellation.schedule,
      closureCreatedAt,
      closureTimeZone,
    )
  ) {
    return false;
  }

  return await applyScheduleOccurrenceCancellation(ctx, cancellation);
}
