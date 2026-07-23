import { v } from "convex/values";

export const academicPersonProfileInputValidator = v.object({
  firstName: v.string(),
  lastName: v.string(),
  displayName: v.optional(v.string()),
  imageStorageId: v.optional(v.id("_storage")),
  campusId: v.optional(v.id("campuses")),
});

export const guardianProfileInputValidator = v.object({
  firstName: v.string(),
  lastName: v.string(),
  displayName: v.optional(v.string()),
});

export const academicAccountKindValidator = v.union(
  v.object({
    kind: v.literal("teacher"),
    profile: academicPersonProfileInputValidator,
  }),
  v.object({
    kind: v.literal("selfManagedStudent"),
    profile: academicPersonProfileInputValidator,
  }),
  v.object({
    kind: v.literal("guardianStudents"),
    guardianProfile: guardianProfileInputValidator,
    guardianPin: v.string(),
    students: v.array(academicPersonProfileInputValidator),
  }),
);
