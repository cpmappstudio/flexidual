import { v } from "convex/values";
import type { UserRole } from "./roles";

export type SessionLeaderRole = Exclude<UserRole, "student" | "tutor">;

export const sessionLeaderRoleValidator = v.union(
  v.literal("teacher"),
  v.literal("principal"),
  v.literal("admin"),
  v.literal("superadmin"),
);

export const sessionLeadershipEventTypeValidator = v.union(
  v.literal("started"),
  v.literal("claimed"),
  v.literal("transferred"),
  v.literal("transfer_rejected"),
  v.literal("recovered"),
  v.literal("takeover"),
);

export const sessionClosureStatusValidator = v.union(
  v.literal("pending"),
  v.literal("completed"),
);
