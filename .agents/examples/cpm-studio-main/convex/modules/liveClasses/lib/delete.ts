import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";

export async function deleteLiveClassAttendanceRecordBatch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  batchSize: number,
) {
  const records = await ctx.db
    .query("liveClassAttendanceRecords")
    .withIndex("by_org_id_and_session_id_and_op_id", (query) =>
      query.eq("organizationId", organizationId),
    )
    .take(batchSize);

  for (const record of records) {
    await ctx.db.delete("liveClassAttendanceRecords", record._id);
  }

  return records.length;
}

export async function deleteLiveClassParticipantBatch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  batchSize: number,
) {
  const participants = await ctx.db
    .query("liveClassParticipants")
    .withIndex("by_org_id_and_session_id_and_op_id", (query) =>
      query.eq("organizationId", organizationId),
    )
    .take(batchSize);

  for (const participant of participants) {
    await ctx.db.delete("liveClassParticipants", participant._id);
  }

  return participants.length;
}

export async function deleteLiveClassSessionBatch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  batchSize: number,
) {
  const sessions = await ctx.db
    .query("liveClassSessions")
    .withIndex("by_org_id_and_campus_id_and_scheduled_start_at", (query) =>
      query.eq("organizationId", organizationId),
    )
    .take(batchSize);

  for (const session of sessions) {
    await ctx.db.delete("liveClassSessions", session._id);
  }

  return sessions.length;
}

export async function deleteLiveClassSeriesBatch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  batchSize: number,
) {
  const series = await ctx.db
    .query("liveClassSeries")
    .withIndex("by_org_id_and_campus_id_and_updated_at", (query) =>
      query.eq("organizationId", organizationId),
    )
    .take(batchSize);

  for (const item of series) {
    await ctx.db.delete("liveClassSeries", item._id);
  }

  return series.length;
}

export async function deleteLiveClassRowsBatch(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  batchSize: number,
) {
  const deletedLiveClassAttendanceRecordCount =
    await deleteLiveClassAttendanceRecordBatch(ctx, organizationId, batchSize);
  const deletedLiveClassParticipantCount =
    await deleteLiveClassParticipantBatch(ctx, organizationId, batchSize);
  const deletedLiveClassSessionCount = await deleteLiveClassSessionBatch(
    ctx,
    organizationId,
    batchSize,
  );
  const deletedLiveClassSeriesCount = await deleteLiveClassSeriesBatch(
    ctx,
    organizationId,
    batchSize,
  );

  return {
    deletedLiveClassAttendanceRecordCount,
    deletedLiveClassParticipantCount,
    deletedLiveClassSessionCount,
    deletedLiveClassSeriesCount,
  };
}

export async function deleteLiveClassRowsForOrganizationPersonBatch(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    batchSize: number;
  },
) {
  const [attendanceRecords, participants] = await Promise.all([
    ctx.db
      .query("liveClassAttendanceRecords")
      .withIndex("by_org_id_and_op_id", (query) =>
        query
          .eq("organizationId", args.organizationId)
          .eq("organizationPersonId", args.organizationPersonId),
      )
      .take(args.batchSize),
    ctx.db
      .query("liveClassParticipants")
      .withIndex("by_org_id_and_op_id", (query) =>
        query
          .eq("organizationId", args.organizationId)
          .eq("organizationPersonId", args.organizationPersonId),
      )
      .take(args.batchSize),
  ]);

  for (const record of attendanceRecords) {
    await ctx.db.delete("liveClassAttendanceRecords", record._id);
  }

  for (const participant of participants) {
    await ctx.db.delete("liveClassParticipants", participant._id);
  }

  return {
    deletedLiveClassAttendanceRecordCount: attendanceRecords.length,
    deletedLiveClassParticipantCount: participants.length,
  };
}
