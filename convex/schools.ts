import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserOrThrow } from "./users";
import { hasSystemRole } from "./permissions";

export const list = query({
  args: { isActive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    if (args.isActive !== undefined) {
      return await ctx.db
        .query("schools")
        .withIndex("by_active", (q) => q.eq("isActive", args.isActive!))
        .order("desc")
        .collect();
    }
    return await ctx.db.query("schools").order("desc").collect();
  },
});

export const get = query({
  args: { id: v.id("schools") },
  handler: async (ctx, args) => await ctx.db.get(args.id),
});

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    logoStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    
    // Only Superadmins create schools
    if (!(await hasSystemRole(ctx, user._id, ["superadmin"]))) {
      throw new Error("Only superadmins can create schools.");
    }

    const existing = await ctx.db
      .query("schools")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    
    if (existing) throw new Error("A school with this slug already exists.");

    return await ctx.db.insert("schools", {
      name: args.name,
      slug: args.slug,
      logoStorageId: args.logoStorageId,
      isActive: true,
      createdAt: Date.now(),
      createdBy: user._id,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("schools"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    logoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    if (!(await hasSystemRole(ctx, user._id, ["superadmin"]))) {
      throw new Error("Only superadmins can modify schools.");
    }

    const { id, ...updates } = args;
    const cleanUpdates: any = { ...updates };
    if (cleanUpdates.logoStorageId === null) cleanUpdates.logoStorageId = undefined;

    await ctx.db.patch(id, cleanUpdates);
  },
});