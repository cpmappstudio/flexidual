import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { assertNoActiveEventRoom } from "./eventRoomAccess";

export async function deleteEvent(ctx: MutationCtx, eventId: Id<"events">) {
  await assertNoActiveEventRoom(ctx, eventId);
  await ctx.db.delete(eventId);
  await ctx.scheduler.runAfter(0, internal.events.removeOccurrencesByEvent, {
    eventId,
  });
  await ctx.scheduler.runAfter(0, internal.eventChatMessages.removeByEvent, {
    eventId,
  });
  await ctx.scheduler.runAfter(
    0,
    internal.eventChatNotifications.removeByEvent,
    {
      eventId,
    },
  );
  await ctx.scheduler.runAfter(
    0,
    internal.recordings.removeEventNotifications,
    {
      eventId,
    },
  );
}

export async function deleteCampusEvents(
  ctx: MutationCtx,
  campusId: Id<"campuses">,
) {
  // shortcut: many events can exceed one transaction; batch parent deletion if needed.
  const events = ctx.db
    .query("events")
    .withIndex("by_campusId_and_createdAt", (q) => q.eq("campusId", campusId));
  for await (const event of events) {
    await deleteEvent(ctx, event._id);
  }
}

export async function removeGradeFromEvents(
  ctx: MutationCtx,
  schoolId: Id<"schools">,
  gradeCode: string,
) {
  // shortcut: scanning a large school's events can exceed one transaction; index grade audiences if needed.
  const events = ctx.db
    .query("events")
    .withIndex("by_schoolId_and_createdAt", (q) => q.eq("schoolId", schoolId));
  for await (const event of events) {
    if (!event.gradeCodes?.includes(gradeCode)) continue;
    const gradeCodes = event.gradeCodes.filter((code) => code !== gradeCode);
    if (gradeCodes.length) {
      await assertNoActiveEventRoom(ctx, event._id);
      await ctx.db.patch(event._id, { gradeCodes });
    } else {
      await deleteEvent(ctx, event._id);
    }
  }
}
