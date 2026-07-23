import { getAuthUserId } from "@convex-dev/auth/server";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { throwAppError } from "./errors";

type AuthContext = QueryCtx | MutationCtx;

export async function getCurrentUserId(ctx: AuthContext) {
  return await getAuthUserId(ctx);
}

export async function requireCurrentUserId(ctx: AuthContext) {
  const userId = await getCurrentUserId(ctx);
  if (!userId) {
    throwAppError("NOT_AUTHENTICATED");
  }

  return userId;
}

export async function getCurrentUserOrNull(ctx: AuthContext) {
  const userId = await getCurrentUserId(ctx);
  if (!userId) {
    return null;
  }

  return await ctx.db.get("users", userId);
}

export async function requireCurrentUser(ctx: AuthContext) {
  const userId = await requireCurrentUserId(ctx);
  const user = await ctx.db.get("users", userId);

  if (!user) {
    throwAppError("AUTHENTICATED_USER_NOT_FOUND");
  }

  return user;
}
