import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import { requireSuperAdmin, getOrgMembership } from "./lib/permissions";
import { getCurrentUserOrNull } from "./lib/auth";

const organizationValidator = v.object({
  _id: v.id("organizations"),
  _creationTime: v.number(),
  clerkOrgId: v.string(),
  name: v.string(),
  slug: v.string(),
  imageUrl: v.optional(v.string()),
  createdAt: v.number(),
});

/**
 * Get organization by slug.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(organizationValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("organizations")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

/**
 * Check if current user is admin in organization (by slug).
 * Returns true if user is superadmin or has admin/superadmin role in the org.
 * Returns false if not authenticated or not admin.
 */
export const isAdminInOrg = query({
  args: { slug: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return false;

    // Global superadmin has access everywhere
    if (user.isSuperAdmin) return true;

    // Find organization
    const org = await ctx.db
      .query("organizations")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!org) return false;

    // Check membership
    const membership = await getOrgMembership(ctx, user._id, org._id);
    return membership?.role === "admin" || membership?.role === "superadmin";
  },
});

/**
 * Get organization by ID.
 */
export const getById = query({
  args: { organizationId: v.id("organizations") },
  returns: v.union(organizationValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.organizationId);
  },
});

/**
 * Get organization by Clerk organization ID.
 */
export const getByClerkOrgId = query({
  args: { clerkOrgId: v.string() },
  returns: v.union(organizationValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("organizations")
      .withIndex("byClerkOrgId", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .unique();
  },
});

/**
 * List all organizations (SuperAdmin only).
 */
export const listAll = query({
  args: {},
  returns: v.array(organizationValidator),
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    return await ctx.db.query("organizations").order("desc").collect();
  },
});

/**
 * Create organization from Clerk webhook (internal).
 */
export const createFromClerk = internalMutation({
  args: {
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.string(),
    imageUrl: v.optional(v.string()),
  },
  returns: v.id("organizations"),
  handler: async (ctx, args) => {
    // Check if organization already exists
    const existing = await ctx.db
      .query("organizations")
      .withIndex("byClerkOrgId", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .unique();

    if (existing) {
      return existing._id;
    }

    // Check slug uniqueness
    const existingBySlug = await ctx.db
      .query("organizations")
      .withIndex("bySlug", (q) => q.eq("slug", args.slug))
      .unique();

    if (existingBySlug) {
      throw new Error(`Organization with slug "${args.slug}" already exists`);
    }

    return await ctx.db.insert("organizations", {
      clerkOrgId: args.clerkOrgId,
      name: args.name,
      slug: args.slug,
      imageUrl: args.imageUrl,
      createdAt: Date.now(),
    });
  },
});

/**
 * Update organization from Clerk webhook (internal).
 */
export const updateFromClerk = internalMutation({
  args: {
    clerkOrgId: v.string(),
    name: v.string(),
    slug: v.string(),
    imageUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const organization = await ctx.db
      .query("organizations")
      .withIndex("byClerkOrgId", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .unique();

    if (!organization) {
      console.error(
        `Organization not found for clerkOrgId: ${args.clerkOrgId}`,
      );
      return null;
    }

    // Check slug uniqueness if changing
    if (args.slug !== organization.slug) {
      const existingBySlug = await ctx.db
        .query("organizations")
        .withIndex("bySlug", (q) => q.eq("slug", args.slug))
        .unique();

      if (existingBySlug && existingBySlug._id !== organization._id) {
        console.error(
          `Cannot update organization: slug "${args.slug}" already exists`,
        );
        return null;
      }
    }

    await ctx.db.patch(organization._id, {
      name: args.name,
      slug: args.slug,
      imageUrl: args.imageUrl,
    });

    return null;
  },
});

/**
 * Delete organization from Clerk webhook (internal).
 */
export const deleteFromClerk = internalMutation({
  args: { clerkOrgId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const organization = await ctx.db
      .query("organizations")
      .withIndex("byClerkOrgId", (q) => q.eq("clerkOrgId", args.clerkOrgId))
      .unique();

    if (organization) {
      // Delete all memberships for this organization
      const memberships = await ctx.db
        .query("organizationMembers")
        .withIndex("byOrganization", (q) =>
          q.eq("organizationId", organization._id),
        )
        .collect();

      for (const membership of memberships) {
        await ctx.db.delete(membership._id);
      }

      await ctx.db.delete(organization._id);
    }

    return null;
  },
});
