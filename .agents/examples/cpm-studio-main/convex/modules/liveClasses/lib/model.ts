import type { Doc, Id } from "../../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../_generated/server";
import { requireCampusInOrganization } from "../../../lib/campuses";
import { throwAppError } from "../../../lib/errors";
import {
  getOrganizationPersonCampusAssignment,
  listOrganizationPersonRoles,
  requireOrganizationPersonInOrganization,
} from "../../../lib/organizationPeople";
import { MAX_LIVE_CLASS_SERIES_PER_CAMPUS } from "../../../lib/queryLimits";
import type { OrganizationPersonRole } from "../../../../lib/people/roles";

type Context = QueryCtx | MutationCtx;
type LiveClassSessionStatus = Doc<"liveClassSessions">["status"];

const LIVE_CLASS_SESSION_STATUS_TRANSITIONS: Record<
  LiveClassSessionStatus,
  readonly LiveClassSessionStatus[]
> = {
  scheduled: ["scheduled", "live", "ended", "canceled"],
  live: ["live", "ended", "canceled"],
  ended: ["ended"],
  canceled: ["canceled"],
};

function normalizeRequiredText(value: string, errorCode: string) {
  const normalized = value.trim();
  if (!normalized) {
    throwAppError(errorCode);
  }

  return normalized;
}

function normalizeOptionalText(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeTimestamp(value: number, errorCode: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throwAppError(errorCode);
  }

  return value;
}

function normalizeOptionalTimestamp(value: number | undefined, errorCode: string) {
  return value === undefined ? undefined : normalizeTimestamp(value, errorCode);
}

async function requireOrganizationPersonRole(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    organizationPersonId: Id<"organizationPeople">;
    role: OrganizationPersonRole;
  },
) {
  // Live class participant roles intentionally mirror core person roles.
  // If another module needs this helper, lift it to convex/lib/organizationPeople.
  const roles = await listOrganizationPersonRoles(ctx, {
    organizationId: args.organizationId,
    organizationPersonId: args.organizationPersonId,
  });

  if (!roles.includes(args.role)) {
    throwAppError("ORGANIZATION_PERSON_ROLE_REQUIRED");
  }
}

async function requireActiveCampusAssignment(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    campusId: Id<"campuses">;
    organizationPersonId: Id<"organizationPeople">;
  },
) {
  await requireOrganizationPersonInOrganization(ctx, {
    organizationId: args.organizationId,
    organizationPersonId: args.organizationPersonId,
  });
  await requireCampusInOrganization(ctx, {
    organizationId: args.organizationId,
    campusId: args.campusId,
  });

  const assignment = await getOrganizationPersonCampusAssignment(ctx, args);
  if (!assignment?.isActive) {
    throwAppError("ORGANIZATION_PERSON_CAMPUS_ASSIGNMENT_REQUIRED");
  }

  return assignment;
}

export async function requireLiveClassSeriesInOrganization(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    seriesId: Id<"liveClassSeries">;
  },
) {
  const series = await ctx.db.get("liveClassSeries", args.seriesId);
  if (!series) {
    throwAppError("LIVE_CLASS_SERIES_NOT_FOUND");
  }

  if (series.organizationId !== args.organizationId) {
    throwAppError("LIVE_CLASS_SERIES_SCOPE_MISMATCH");
  }

  return series;
}

export async function requireLiveClassSessionInOrganization(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    sessionId: Id<"liveClassSessions">;
  },
) {
  const session = await ctx.db.get("liveClassSessions", args.sessionId);
  if (!session) {
    throwAppError("LIVE_CLASS_SESSION_NOT_FOUND");
  }

  if (session.organizationId !== args.organizationId) {
    throwAppError("LIVE_CLASS_SESSION_SCOPE_MISMATCH");
  }

  return session;
}

export async function listLiveClassSeriesForCampus(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    campusId: Id<"campuses">;
  },
) {
  await requireCampusInOrganization(ctx, args);

  return await ctx.db
    .query("liveClassSeries")
    .withIndex("by_org_id_and_campus_id_and_updated_at", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("campusId", args.campusId),
    )
    .order("desc")
    .take(MAX_LIVE_CLASS_SERIES_PER_CAMPUS);
}

export async function createLiveClassSeries(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    campusId: Id<"campuses">;
    title: string;
    description?: string;
  },
) {
  const title = normalizeRequiredText(
    args.title,
    "LIVE_CLASS_SERIES_TITLE_REQUIRED",
  );
  const description = normalizeOptionalText(args.description);

  await requireCampusInOrganization(ctx, args);
  const existingSeries = await listLiveClassSeriesForCampus(ctx, {
    organizationId: args.organizationId,
    campusId: args.campusId,
  });
  if (existingSeries.length >= MAX_LIVE_CLASS_SERIES_PER_CAMPUS) {
    throwAppError("LIVE_CLASS_SERIES_LIMIT_EXCEEDED");
  }

  const now = Date.now();
  const seriesId = await ctx.db.insert("liveClassSeries", {
    organizationId: args.organizationId,
    campusId: args.campusId,
    title,
    description,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  const series = await ctx.db.get("liveClassSeries", seriesId);
  if (!series) {
    throwAppError("LIVE_CLASS_SERIES_CREATE_FAILED");
  }

  return series;
}

export async function updateLiveClassSeries(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    seriesId: Id<"liveClassSeries">;
    title?: string;
    description?: string;
    isActive?: boolean;
  },
) {
  const series = await requireLiveClassSeriesInOrganization(ctx, args);
  const patch: Partial<
    Pick<Doc<"liveClassSeries">, "title" | "description" | "isActive" | "updatedAt">
  > = {};

  if (args.title !== undefined) {
    patch.title = normalizeRequiredText(
      args.title,
      "LIVE_CLASS_SERIES_TITLE_REQUIRED",
    );
  }

  if (args.description !== undefined) {
    patch.description = normalizeOptionalText(args.description);
  }

  if (args.isActive !== undefined) {
    patch.isActive = args.isActive;
  }

  patch.updatedAt = Date.now();
  await ctx.db.patch("liveClassSeries", series._id, patch);

  const updatedSeries = await ctx.db.get("liveClassSeries", series._id);
  if (!updatedSeries) {
    throwAppError("LIVE_CLASS_SERIES_NOT_FOUND");
  }

  return updatedSeries;
}

export async function listLiveClassSessionsForCampus(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    campusId: Id<"campuses">;
    paginationOpts: {
      numItems: number;
      cursor: string | null;
    };
  },
) {
  await requireCampusInOrganization(ctx, args);

  return await ctx.db
    .query("liveClassSessions")
    .withIndex("by_org_id_and_campus_id_and_scheduled_start_at", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("campusId", args.campusId),
    )
    .order("desc")
    .paginate(args.paginationOpts);
}

export async function createLiveClassSession(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    campusId: Id<"campuses">;
    seriesId: Id<"liveClassSeries">;
    teacherOrganizationPersonId: Id<"organizationPeople">;
    title: string;
    scheduledStartAt: number;
    scheduledEndAt?: number;
  },
) {
  const title = normalizeRequiredText(
    args.title,
    "LIVE_CLASS_SESSION_TITLE_REQUIRED",
  );
  const scheduledStartAt = normalizeTimestamp(
    args.scheduledStartAt,
    "LIVE_CLASS_SESSION_START_INVALID",
  );
  const scheduledEndAt = normalizeOptionalTimestamp(
    args.scheduledEndAt,
    "LIVE_CLASS_SESSION_END_INVALID",
  );
  if (scheduledEndAt !== undefined && scheduledEndAt <= scheduledStartAt) {
    throwAppError("LIVE_CLASS_SESSION_END_BEFORE_START");
  }

  const series = await requireLiveClassSeriesInOrganization(ctx, {
    organizationId: args.organizationId,
    seriesId: args.seriesId,
  });
  if (!series.isActive) {
    throwAppError("LIVE_CLASS_SERIES_INACTIVE");
  }

  if (series.campusId !== args.campusId) {
    throwAppError("LIVE_CLASS_SERIES_CAMPUS_MISMATCH");
  }

  await requireActiveCampusAssignment(ctx, {
    organizationId: args.organizationId,
    campusId: args.campusId,
    organizationPersonId: args.teacherOrganizationPersonId,
  });
  await requireOrganizationPersonRole(ctx, {
    organizationId: args.organizationId,
    organizationPersonId: args.teacherOrganizationPersonId,
    role: "teacher",
  });

  const now = Date.now();
  const sessionId = await ctx.db.insert("liveClassSessions", {
    organizationId: args.organizationId,
    campusId: args.campusId,
    seriesId: args.seriesId,
    teacherOrganizationPersonId: args.teacherOrganizationPersonId,
    title,
    scheduledStartAt,
    scheduledEndAt,
    status: "scheduled",
    createdAt: now,
    updatedAt: now,
  });
  const session = await ctx.db.get("liveClassSessions", sessionId);
  if (!session) {
    throwAppError("LIVE_CLASS_SESSION_CREATE_FAILED");
  }

  await upsertLiveClassParticipant(ctx, {
    organizationId: args.organizationId,
    sessionId: session._id,
    organizationPersonId: args.teacherOrganizationPersonId,
    role: "teacher",
  });

  return session;
}

export async function updateLiveClassSessionStatus(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    sessionId: Id<"liveClassSessions">;
    status: LiveClassSessionStatus;
  },
) {
  const session = await requireLiveClassSessionInOrganization(ctx, args);
  if (!LIVE_CLASS_SESSION_STATUS_TRANSITIONS[session.status].includes(args.status)) {
    throwAppError("LIVE_CLASS_SESSION_STATUS_TRANSITION_INVALID");
  }

  const now = Date.now();
  const patch: Partial<
    Pick<Doc<"liveClassSessions">, "status" | "startedAt" | "endedAt" | "updatedAt">
  > = {
    status: args.status,
    updatedAt: now,
  };

  if (args.status === "live" && !session.startedAt) {
    patch.startedAt = now;
  }

  if (args.status === "ended" && !session.endedAt) {
    patch.endedAt = now;
  }

  await ctx.db.patch("liveClassSessions", session._id, patch);

  const updatedSession = await ctx.db.get("liveClassSessions", session._id);
  if (!updatedSession) {
    throwAppError("LIVE_CLASS_SESSION_NOT_FOUND");
  }

  return updatedSession;
}

export async function getLiveClassParticipant(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    sessionId: Id<"liveClassSessions">;
    organizationPersonId: Id<"organizationPeople">;
  },
) {
  // Uniqueness is maintained by the upsert flow; Convex indexes do not enforce it.
  return await ctx.db
    .query("liveClassParticipants")
    .withIndex("by_org_id_and_session_id_and_op_id", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("sessionId", args.sessionId)
        .eq("organizationPersonId", args.organizationPersonId),
    )
    .unique();
}

export async function listLiveClassParticipantsForSession(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    sessionId: Id<"liveClassSessions">;
    paginationOpts: {
      numItems: number;
      cursor: string | null;
    };
  },
) {
  await requireLiveClassSessionInOrganization(ctx, args);

  return await ctx.db
    .query("liveClassParticipants")
    .withIndex("by_org_id_and_session_id_and_op_id", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("sessionId", args.sessionId),
    )
    .paginate(args.paginationOpts);
}

export async function upsertLiveClassParticipant(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    sessionId: Id<"liveClassSessions">;
    organizationPersonId: Id<"organizationPeople">;
    role: Doc<"liveClassParticipants">["role"];
  },
) {
  const session = await requireLiveClassSessionInOrganization(ctx, args);
  if (
    (args.role === "teacher") !==
    (args.organizationPersonId === session.teacherOrganizationPersonId)
  ) {
    throwAppError("LIVE_CLASS_SESSION_TEACHER_MISMATCH");
  }

  await requireActiveCampusAssignment(ctx, {
    organizationId: args.organizationId,
    campusId: session.campusId,
    organizationPersonId: args.organizationPersonId,
  });
  await requireOrganizationPersonRole(ctx, {
    organizationId: args.organizationId,
    organizationPersonId: args.organizationPersonId,
    role: args.role,
  });

  const existingParticipant = await getLiveClassParticipant(ctx, args);
  const now = Date.now();

  if (existingParticipant) {
    await ctx.db.patch("liveClassParticipants", existingParticipant._id, {
      role: args.role,
      isActive: true,
      updatedAt: now,
    });

    const participant = await ctx.db.get(
      "liveClassParticipants",
      existingParticipant._id,
    );
    if (!participant) {
      throwAppError("LIVE_CLASS_PARTICIPANT_NOT_FOUND");
    }

    return participant;
  }

  const participantId = await ctx.db.insert("liveClassParticipants", {
    organizationId: args.organizationId,
    sessionId: session._id,
    organizationPersonId: args.organizationPersonId,
    role: args.role,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  const participant = await ctx.db.get("liveClassParticipants", participantId);
  if (!participant) {
    throwAppError("LIVE_CLASS_PARTICIPANT_CREATE_FAILED");
  }

  return participant;
}

export async function deactivateLiveClassParticipant(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    sessionId: Id<"liveClassSessions">;
    organizationPersonId: Id<"organizationPeople">;
  },
) {
  const session = await requireLiveClassSessionInOrganization(ctx, args);
  if (args.organizationPersonId === session.teacherOrganizationPersonId) {
    throwAppError("LIVE_CLASS_SESSION_TEACHER_REQUIRED");
  }

  const participant = await getLiveClassParticipant(ctx, args);
  if (!participant) {
    throwAppError("LIVE_CLASS_PARTICIPANT_NOT_FOUND");
  }

  await ctx.db.patch("liveClassParticipants", participant._id, {
    isActive: false,
    updatedAt: Date.now(),
  });

  const updatedParticipant = await ctx.db.get(
    "liveClassParticipants",
    participant._id,
  );
  if (!updatedParticipant) {
    throwAppError("LIVE_CLASS_PARTICIPANT_NOT_FOUND");
  }

  return updatedParticipant;
}

export async function getLiveClassAttendanceRecord(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    sessionId: Id<"liveClassSessions">;
    organizationPersonId: Id<"organizationPeople">;
  },
) {
  // Uniqueness is maintained by the join flow; Convex indexes do not enforce it.
  return await ctx.db
    .query("liveClassAttendanceRecords")
    .withIndex("by_org_id_and_session_id_and_op_id", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("sessionId", args.sessionId)
        .eq("organizationPersonId", args.organizationPersonId),
    )
    .unique();
}

export async function listLiveClassAttendanceRecordsForSession(
  ctx: Context,
  args: {
    organizationId: Id<"organizations">;
    sessionId: Id<"liveClassSessions">;
    paginationOpts: {
      numItems: number;
      cursor: string | null;
    };
  },
) {
  await requireLiveClassSessionInOrganization(ctx, args);

  return await ctx.db
    .query("liveClassAttendanceRecords")
    .withIndex("by_org_id_and_session_id_and_op_id", (query) =>
      query
        .eq("organizationId", args.organizationId)
        .eq("sessionId", args.sessionId),
    )
    .paginate(args.paginationOpts);
}

export async function recordLiveClassParticipantJoin(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    sessionId: Id<"liveClassSessions">;
    organizationPersonId: Id<"organizationPeople">;
  },
) {
  const session = await requireLiveClassSessionInOrganization(ctx, args);
  if (session.status !== "live") {
    throwAppError("LIVE_CLASS_SESSION_NOT_LIVE");
  }

  const participant = await getLiveClassParticipant(ctx, args);
  if (!participant?.isActive) {
    throwAppError("LIVE_CLASS_PARTICIPANT_REQUIRED");
  }

  const now = Date.now();
  const existingRecord = await getLiveClassAttendanceRecord(ctx, args);
  if (existingRecord) {
    return existingRecord;
  }

  const recordId = await ctx.db.insert("liveClassAttendanceRecords", {
    organizationId: args.organizationId,
    sessionId: session._id,
    organizationPersonId: args.organizationPersonId,
    status: "present",
    firstJoinedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  const record = await ctx.db.get("liveClassAttendanceRecords", recordId);
  if (!record) {
    throwAppError("LIVE_CLASS_ATTENDANCE_RECORD_CREATE_FAILED");
  }

  return record;
}
