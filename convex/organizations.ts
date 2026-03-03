import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Resolves a URL slug into a concrete Organization ID and Type.
 * Used by the frontend to determine its current context.
 */
export const resolveSlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    // 1. Check if it's the global system dashboard
    if (args.slug === "system" || args.slug === "admin") {
      return { type: "system" as const, _id: undefined, name: "Global System" };
    }

    // 2. Check if it's a School
    const school = await ctx.db
      .query("schools")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (school) {
      return { type: "school" as const, _id: school._id, name: school.name };
    }

    // 3. Check if it's a Campus
    const campus = await ctx.db
      .query("campuses")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (campus) {
      return { type: "campus" as const, _id: campus._id, name: campus.name };
    }

    return null; // Not found
  },
});