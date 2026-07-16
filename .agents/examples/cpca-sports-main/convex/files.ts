import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserOrNull } from "./lib/auth";
import { getApplicationPhotoStorageIds } from "./lib/applicationSnapshots";
import { hasOrgAdminAccess } from "./lib/permissions";

function assertMigrationSecret(secret: string) {
  const expected = process.env.LEGACY_MIGRATION_SECRET;
  if (!expected) {
    throw new Error("LEGACY_MIGRATION_SECRET is not configured");
  }
  if (secret !== expected) {
    throw new Error("Invalid migration secret");
  }
}

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx): Promise<string> => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const generateUploadUrlForMigration = mutation({
  args: {
    secret: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    assertMigrationSecret(args.secret);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getUrl = query({
  args: {
    storageId: v.id("_storage"),
    applicationId: v.id("applications"),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) {
      return null;
    }

    const application = await ctx.db.get(args.applicationId);
    if (!application) {
      return null;
    }

    const isOwner = application.userId === user._id;
    const isAdmin = await hasOrgAdminAccess(
      ctx,
      user._id,
      application.organizationId,
    );

    if (!isOwner && !isAdmin) {
      return null;
    }

    const photoStorageIds = getApplicationPhotoStorageIds(application);
    if (photoStorageIds.includes(args.storageId)) {
      return await ctx.storage.getUrl(args.storageId);
    }

    const documents = await ctx.db
      .query("applicationDocuments")
      .withIndex("byApplication", (q) => q.eq("applicationId", application._id))
      .collect();

    const isApplicationDocument = documents.some(
      (document) => document.storageId === args.storageId,
    );

    if (!isApplicationDocument) {
      return null;
    }

    return await ctx.storage.getUrl(args.storageId);
  },
});
