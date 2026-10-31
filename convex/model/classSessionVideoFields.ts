import { v } from "convex/values";

export const classSessionVideoFields = v.object({
  scheduleId: v.id("classSchedule"),
  classId: v.id("classes"),
  uploadedBy: v.id("users"),
  bucket: v.string(),
  name: v.string(),
  contentType: v.string(),
  size: v.number(),
  durationMs: v.number(),
  state: v.union(
    v.literal("uploading"),
    v.literal("ready"),
    v.literal("retired"),
  ),
  createdAt: v.number(),
  uploadId: v.optional(v.string()),
  expiresAt: v.optional(v.number()),
  expectedVideoId: v.optional(v.id("classSessionVideos")),
  lessonIds: v.optional(v.array(v.id("lessons"))),
  lessonsRecordedAt: v.optional(v.number()),
});
