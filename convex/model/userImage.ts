import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export async function getUserImageUrl(ctx: QueryCtx, user: Doc<"users">) {
  if (!user.avatarStorageId) return user.imageUrl;
  return (await ctx.storage.getUrl(user.avatarStorageId)) ?? user.imageUrl;
}
