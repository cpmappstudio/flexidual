import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { internalMutation, mutation, query } from "../../_generated/server";
import { clampPaginationOpts } from "../../lib/queryLimits";
import { requireLiveClassesAdmin } from "./lib/access";
import {
  createLiveClassSeries,
  createLiveClassSession,
  deactivateLiveClassParticipant,
  listLiveClassAttendanceRecordsForSession,
  listLiveClassParticipantsForSession,
  listLiveClassSeriesForCampus,
  listLiveClassSessionsForCampus,
  recordLiveClassParticipantJoin,
  updateLiveClassSeries,
  updateLiveClassSessionStatus,
  upsertLiveClassParticipant,
} from "./lib/model";
import {
  liveClassAttendanceRecordValidator,
  liveClassParticipantRoleValidator,
  liveClassParticipantValidator,
  liveClassSeriesValidator,
  liveClassSessionStatusValidator,
  liveClassSessionValidator,
} from "./validators";

export const listSeriesForCampus = query({
  args: {
    slug: v.string(),
    campusId: v.id("campuses"),
  },
  returns: v.array(liveClassSeriesValidator),
  handler: async (ctx, args) => {
    const access = await requireLiveClassesAdmin(ctx, args.slug);

    return await listLiveClassSeriesForCampus(ctx, {
      organizationId: access.organization._id,
      campusId: args.campusId,
    });
  },
});

export const createSeries = mutation({
  args: {
    slug: v.string(),
    campusId: v.id("campuses"),
    title: v.string(),
    description: v.optional(v.string()),
  },
  returns: liveClassSeriesValidator,
  handler: async (ctx, args) => {
    const access = await requireLiveClassesAdmin(ctx, args.slug);

    return await createLiveClassSeries(ctx, {
      organizationId: access.organization._id,
      campusId: args.campusId,
      title: args.title,
      description: args.description,
    });
  },
});

export const updateSeries = mutation({
  args: {
    slug: v.string(),
    seriesId: v.id("liveClassSeries"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  returns: liveClassSeriesValidator,
  handler: async (ctx, args) => {
    const access = await requireLiveClassesAdmin(ctx, args.slug);

    return await updateLiveClassSeries(ctx, {
      organizationId: access.organization._id,
      seriesId: args.seriesId,
      title: args.title,
      description: args.description,
      isActive: args.isActive,
    });
  },
});

export const listSessionsForCampus = query({
  args: {
    slug: v.string(),
    campusId: v.id("campuses"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(liveClassSessionValidator),
  handler: async (ctx, args) => {
    const access = await requireLiveClassesAdmin(ctx, args.slug);

    return await listLiveClassSessionsForCampus(ctx, {
      organizationId: access.organization._id,
      campusId: args.campusId,
      paginationOpts: clampPaginationOpts(args.paginationOpts),
    });
  },
});

export const createSession = mutation({
  args: {
    slug: v.string(),
    campusId: v.id("campuses"),
    seriesId: v.id("liveClassSeries"),
    teacherOrganizationPersonId: v.id("organizationPeople"),
    title: v.string(),
    scheduledStartAt: v.number(),
    scheduledEndAt: v.optional(v.number()),
  },
  returns: liveClassSessionValidator,
  handler: async (ctx, args) => {
    const access = await requireLiveClassesAdmin(ctx, args.slug);

    return await createLiveClassSession(ctx, {
      organizationId: access.organization._id,
      campusId: args.campusId,
      seriesId: args.seriesId,
      teacherOrganizationPersonId: args.teacherOrganizationPersonId,
      title: args.title,
      scheduledStartAt: args.scheduledStartAt,
      scheduledEndAt: args.scheduledEndAt,
    });
  },
});

export const setSessionStatus = mutation({
  args: {
    slug: v.string(),
    sessionId: v.id("liveClassSessions"),
    status: liveClassSessionStatusValidator,
  },
  returns: liveClassSessionValidator,
  handler: async (ctx, args) => {
    const access = await requireLiveClassesAdmin(ctx, args.slug);

    return await updateLiveClassSessionStatus(ctx, {
      organizationId: access.organization._id,
      sessionId: args.sessionId,
      status: args.status,
    });
  },
});

export const listParticipantsForSession = query({
  args: {
    slug: v.string(),
    sessionId: v.id("liveClassSessions"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(liveClassParticipantValidator),
  handler: async (ctx, args) => {
    const access = await requireLiveClassesAdmin(ctx, args.slug);

    return await listLiveClassParticipantsForSession(ctx, {
      organizationId: access.organization._id,
      sessionId: args.sessionId,
      paginationOpts: clampPaginationOpts(args.paginationOpts),
    });
  },
});

export const addParticipant = mutation({
  args: {
    slug: v.string(),
    sessionId: v.id("liveClassSessions"),
    organizationPersonId: v.id("organizationPeople"),
    role: liveClassParticipantRoleValidator,
  },
  returns: liveClassParticipantValidator,
  handler: async (ctx, args) => {
    const access = await requireLiveClassesAdmin(ctx, args.slug);

    return await upsertLiveClassParticipant(ctx, {
      organizationId: access.organization._id,
      sessionId: args.sessionId,
      organizationPersonId: args.organizationPersonId,
      role: args.role,
    });
  },
});

export const removeParticipant = mutation({
  args: {
    slug: v.string(),
    sessionId: v.id("liveClassSessions"),
    organizationPersonId: v.id("organizationPeople"),
  },
  returns: liveClassParticipantValidator,
  handler: async (ctx, args) => {
    const access = await requireLiveClassesAdmin(ctx, args.slug);

    return await deactivateLiveClassParticipant(ctx, {
      organizationId: access.organization._id,
      sessionId: args.sessionId,
      organizationPersonId: args.organizationPersonId,
    });
  },
});

export const listAttendanceForSession = query({
  args: {
    slug: v.string(),
    sessionId: v.id("liveClassSessions"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(liveClassAttendanceRecordValidator),
  handler: async (ctx, args) => {
    const access = await requireLiveClassesAdmin(ctx, args.slug);

    return await listLiveClassAttendanceRecordsForSession(ctx, {
      organizationId: access.organization._id,
      sessionId: args.sessionId,
      paginationOpts: clampPaginationOpts(args.paginationOpts),
    });
  },
});

export const markParticipantJoined = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    sessionId: v.id("liveClassSessions"),
    organizationPersonId: v.id("organizationPeople"),
  },
  returns: liveClassAttendanceRecordValidator,
  handler: async (ctx, args) => {
    return await recordLiveClassParticipantJoin(ctx, {
      organizationId: args.organizationId,
      sessionId: args.sessionId,
      organizationPersonId: args.organizationPersonId,
    });
  },
});
