import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { getCurrentUserOrThrow, getCurrentUserFromAuth } from "./users";
import { hasSystemRole, hasOrgRole } from "./permissions";

export const list = query({
  args: { 
    schoolId: v.optional(v.id("schools")),
    isActive: v.optional(v.boolean()) 
  },
  handler: async (ctx, args) => {
    if (args.schoolId) {
      if (args.isActive !== undefined) {
        return await ctx.db
          .query("campuses")
          .withIndex("by_school", (q) => q.eq("schoolId", args.schoolId!).eq("isActive", args.isActive!))
          .order("desc")
          .collect();
      }
      return await ctx.db
        .query("campuses")
        .withIndex("by_school", (q) => q.eq("schoolId", args.schoolId!))
        .order("desc")
        .collect();
    }
    
    // Fallback if no schoolId is provided
    if (args.isActive !== undefined) {
       return await ctx.db
         .query("campuses")
         .filter((q) => q.eq(q.field("isActive"), args.isActive!))
         .order("desc")
         .collect();
    }

    return await ctx.db.query("campuses").order("desc").collect();
  },
});

export const get = query({
  args: { id: v.id("campuses") },
  handler: async (ctx, args) => await ctx.db.get(args.id),
});

export const create = mutation({
  args: {
    schoolId: v.id("schools"),
    name: v.string(),
    slug: v.string(),
    code: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    
    // Superadmins OR Admins of this specific school can create campuses
    const isSuperAdmin = await hasSystemRole(ctx, user._id, ["superadmin"]);
    const isSchoolAdmin = await hasOrgRole(ctx, user._id, args.schoolId, "school", ["admin"]);

    if (!isSuperAdmin && !isSchoolAdmin) {
      throw new Error("Only administrators can create campuses for this school.");
    }

    const existing = await ctx.db
      .query("campuses")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    
    if (existing) throw new Error("A campus with this slug already exists.");

    return await ctx.db.insert("campuses", {
      schoolId: args.schoolId,
      name: args.name,
      slug: args.slug,
      code: args.code,
      isActive: true,
      createdAt: Date.now(),
      createdBy: user._id,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("campuses"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    code: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const campus = await ctx.db.get(args.id);
    if (!campus) throw new Error("Campus not found");

    const isSuperAdmin = await hasSystemRole(ctx, user._id, ["superadmin"]);
    const isSchoolAdmin = await hasOrgRole(ctx, user._id, campus.schoolId, "school", ["admin"]);

    if (!isSuperAdmin && !isSchoolAdmin) {
      throw new Error("Only administrators can modify this campus.");
    }

    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);

    // When the slug changes, all users' Clerk metadata must be rebuilt with the new key
    if (args.slug && args.slug !== campus.slug) {
      await ctx.scheduler.runAfter(0, internal.roleAssignments.syncOrgUsersToClerk, {
        orgId: id,
        orgType: "campus",
      });
    }
  },
});