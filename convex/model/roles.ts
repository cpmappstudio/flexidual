import { v } from "convex/values";

export const roleValidator = v.union(
  v.literal("superadmin"),
  v.literal("admin"),
  v.literal("principal"),
  v.literal("teacher"),
  v.literal("tutor"),
  v.literal("student"),
);
