import { v } from "convex/values";

export const liveClassSessionStatusValidator = v.union(
  v.literal("scheduled"),
  v.literal("live"),
  v.literal("ended"),
  v.literal("canceled"),
);

export const liveClassParticipantRoleValidator = v.union(
  v.literal("teacher"),
  v.literal("student"),
);

export const liveClassAttendanceStatusValidator = v.literal("present");

export const liveClassSeriesValidator = v.object({
  _id: v.id("liveClassSeries"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  campusId: v.id("campuses"),
  title: v.string(),
  description: v.optional(v.string()),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const liveClassSessionValidator = v.object({
  _id: v.id("liveClassSessions"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  campusId: v.id("campuses"),
  seriesId: v.id("liveClassSeries"),
  teacherOrganizationPersonId: v.id("organizationPeople"),
  title: v.string(),
  scheduledStartAt: v.number(),
  scheduledEndAt: v.optional(v.number()),
  status: liveClassSessionStatusValidator,
  startedAt: v.optional(v.number()),
  endedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const liveClassParticipantValidator = v.object({
  _id: v.id("liveClassParticipants"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  sessionId: v.id("liveClassSessions"),
  organizationPersonId: v.id("organizationPeople"),
  role: liveClassParticipantRoleValidator,
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const liveClassAttendanceRecordValidator = v.object({
  _id: v.id("liveClassAttendanceRecords"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  sessionId: v.id("liveClassSessions"),
  organizationPersonId: v.id("organizationPeople"),
  status: liveClassAttendanceStatusValidator,
  firstJoinedAt: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});
