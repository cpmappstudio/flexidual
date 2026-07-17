import { v } from "convex/values";

export const applicationStatus = v.union(
  v.literal("pending"),
  v.literal("reviewing"),
  v.literal("pre-admitted"),
  v.literal("admitted"),
  v.literal("denied"),
);

export const applicantValidator = v.object({
  photoStorageId: v.optional(v.id("_storage")),
  firstName: v.string(),
  lastName: v.string(),
  email: v.string(),
  telephone: v.string(),
});

export const programSnapshotValidator = v.object({
  name: v.string(),
  iconKey: v.optional(v.string()),
});

export const formDataValidator = v.record(
  v.string(),
  v.record(
    v.string(),
    v.union(v.string(), v.number(), v.boolean(), v.null(), v.id("_storage")),
  ),
);

export const paginationArgs = {
  limit: v.optional(v.number()),
  cursor: v.optional(v.string()),
};
