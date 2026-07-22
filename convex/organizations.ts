import { v } from "convex/values";
import { query } from "./_generated/server";
import { getCurrentUserOrThrow } from "./users";
import { hasOrgRole, hasSystemRole } from "./permissions";

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

export const getSettingsContext = query({
  args: {
    orgSlug: v.optional(v.string()),
    schoolId: v.optional(v.id("schools")),
  },
  returns: v.union(
    v.null(),
    v.object({
      institution: v.object({
        _id: v.id("schools"),
        name: v.string(),
        slug: v.string(),
        isActive: v.boolean(),
      }),
      canManageInstitution: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const isSuperAdmin = await hasSystemRole(ctx, user._id, ["superadmin"]);

    if (args.schoolId) {
      if (!isSuperAdmin) return null;
      const school = await ctx.db.get(args.schoolId);
      if (!school) return null;

      return {
        institution: {
          _id: school._id,
          name: school.name,
          slug: school.slug,
          isActive: school.isActive,
        },
        canManageInstitution: true,
      };
    }

    if (!args.orgSlug) return null;

    const school = await ctx.db
      .query("schools")
      .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug!))
      .first();

    const campus = school
      ? null
      : await ctx.db
          .query("campuses")
          .withIndex("by_slug", (q) => q.eq("slug", args.orgSlug!))
          .first();
    const institution = school ?? (campus ? await ctx.db.get(campus.schoolId) : null);

    if (!institution) return null;

    const hasCurrentOrgAccess = school
      ? await hasOrgRole(ctx, user._id, school._id, "school", ["admin"])
      : await hasOrgRole(ctx, user._id, campus!._id, "campus", [
          "admin",
          "principal",
          "teacher",
          "tutor",
          "student",
        ]);

    if (!isSuperAdmin && !hasCurrentOrgAccess) return null;

    const canManageInstitution =
      isSuperAdmin ||
      (await hasOrgRole(ctx, user._id, institution._id, "school", ["admin"]));

    return {
      institution: {
        _id: institution._id,
        name: institution.name,
        slug: institution.slug,
        isActive: institution.isActive,
      },
      canManageInstitution,
    };
  },
});
