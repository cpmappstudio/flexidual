import { v } from "convex/values";

export const abekaStatus = v.union(
  v.literal("connecting"),
  v.literal("needs_confirmation"),
  v.literal("connected"),
  v.literal("needs_reconnect"),
  v.literal("error"),
  v.literal("disconnected"),
);
export const abekaError = v.union(
  v.literal("NEEDS_RECONNECT"),
  v.literal("SCHOOL_MISMATCH"),
  v.literal("REPORT_FORMAT_CHANGED"),
  v.literal("PROVIDER_UNAVAILABLE"),
  v.literal("SYNC_FAILED"),
);
export const encryptedSession = v.object({
  iv: v.string(),
  ciphertext: v.string(),
});
export const abekaSchedule = v.object({
  mode: v.union(
    v.literal("manual"),
    v.literal("weekdays"),
    v.literal("weekly"),
  ),
  time: v.string(),
  weekday: v.number(),
  stopAtPeriodEnd: v.boolean(),
});
export const lessonProgress = v.object({
  subjectName: v.string(),
  lessonNumber: v.number(),
  percentage: v.number(),
  completed: v.boolean(),
  lengthSeconds: v.number(),
  watchedSeconds: v.number(),
  lastViewed: v.union(v.string(), v.null()),
  segmentId: v.union(v.string(), v.null()),
  subscriptionItem: v.union(v.string(), v.null()),
  subscriptionNumber: v.union(v.string(), v.null()),
});
export const abekaConnectionFields = {
  // Legacy class links remain authoritative until the last migration batch commits.
  curriculumLinksMigratedAt: v.optional(v.number()),
  curriculumLinksMigrationCursor: v.optional(v.string()),
  catalogSyncedAt: v.optional(v.number()),
  catalogAttemptAt: v.optional(v.number()),
  catalogError: v.optional(abekaError),
  schoolId: v.id("schools"),
  status: abekaStatus,
  confirmed: v.boolean(),
  revision: v.number(),
  externalSchoolId: v.optional(v.string()),
  externalSchoolName: v.optional(v.string()),
  unavailableStudents: v.optional(v.number()),
  latestRunId: v.optional(v.id("abekaSyncRuns")),
  rosterRunId: v.optional(v.id("abekaSyncRuns")),
  lastAttemptAt: v.optional(v.number()),
  lastRenewalAttemptAt: v.optional(v.number()),
  lastSyncedAt: v.optional(v.number()),
  nextSyncAt: v.optional(v.number()),
  syncSchedule: v.optional(abekaSchedule),
  syncAcademicPeriodId: v.optional(v.id("academicPeriods")),
  scheduledSyncId: v.optional(v.id("_scheduled_functions")),
  syncScheduleGeneration: v.optional(v.number()),
  errorCode: v.optional(abekaError),
  connectedBy: v.id("users"),
};
export const abekaStudentFields = {
  connectionId: v.id("abekaConnections"),
  loginId: v.string(),
  name: v.string(),
  rosterRunId: v.id("abekaSyncRuns"),
  userId: v.optional(v.id("users")),
  // Optional for existing rows; association edits never discard provider data.
  syncPending: v.optional(v.boolean()),
  // Maintained atomically with report writes/deletions to keep roster reads small.
  hasProgress: v.optional(v.boolean()),
  lastSyncedAt: v.optional(v.number()),
  syncedRunId: v.optional(v.id("abekaSyncRuns")),
};
export const abekaRunFields = {
  catalog: v.optional(v.boolean()),
  initializeCatalog: v.optional(v.boolean()),
  connectionId: v.id("abekaConnections"),
  revision: v.number(),
  status: v.union(
    v.literal("running"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("canceled"),
  ),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
  studentsSynced: v.number(),
  workflowId: v.optional(v.string()),
  forceRenewal: v.optional(v.boolean()),
  studentId: v.optional(v.id("abekaStudents")),
  renewalAttempted: v.optional(v.boolean()),
  errorCode: v.optional(abekaError),
};
export const abekaProgressFields = {
  studentId: v.id("abekaStudents"),
  subjectId: v.string(),
  subjectName: v.string(),
  lessons: v.array(lessonProgress),
  syncedAt: v.number(),
  runId: v.id("abekaSyncRuns"),
};

export const catalogSubject = v.object({
  subjectId: v.string(),
  name: v.string(),
  totalLessons: v.number(),
});
export const abekaCourseFields = {
  connectionId: v.id("abekaConnections"),
  ...catalogSubject.fields,
  available: v.boolean(),
};
