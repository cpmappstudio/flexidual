import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function deleteSchedulesWithDependencies(
  ctx: MutationCtx,
  schedules: Doc<"classSchedule">[],
) {
  const dependencies = await Promise.all(
    schedules.map(async (schedule) => {
      const [sessions, recordings, whiteboard] = await Promise.all([
        ctx.db
          .query("class_sessions")
          .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
          .collect(),
        ctx.db
          .query("recordings")
          .withIndex("by_schedule", (q) => q.eq("scheduleId", schedule._id))
          .collect(),
        ctx.db
          .query("whiteboardSessions")
          .withIndex("by_roomName", (q) => q.eq("roomName", schedule.roomName))
          .unique(),
      ]);
      return { sessions, recordings, whiteboard };
    }),
  );
  const whiteboards = [
    ...new Map(
      dependencies.flatMap(({ whiteboard }) =>
        whiteboard ? [[whiteboard._id, whiteboard] as const] : [],
      ),
    ).values(),
  ];

  await Promise.allSettled(
    whiteboards.flatMap((whiteboard) =>
      Object.values(whiteboard.fileRefs ?? {}).map((file) =>
        ctx.storage.delete(file.storageId),
      ),
    ),
  );
  await Promise.all([
    ...dependencies.flatMap(({ sessions }) =>
      sessions.map((session) => ctx.db.delete(session._id)),
    ),
    ...dependencies.flatMap(({ recordings }) =>
      recordings.map((recording) => ctx.db.delete(recording._id)),
    ),
    ...whiteboards.map((whiteboard) => ctx.db.delete(whiteboard._id)),
    ...schedules.map((schedule) => ctx.db.delete(schedule._id)),
  ]);
}

export async function deleteScheduleWithDependencies(
  ctx: MutationCtx,
  schedule: Doc<"classSchedule">,
) {
  await deleteSchedulesWithDependencies(ctx, [schedule]);
}
