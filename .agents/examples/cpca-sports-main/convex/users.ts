import { action, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { clerkClient } from "./clerk";
import { api, internal } from "./_generated/api";
import { DEFAULT_TENANT_SLUG, isSingleTenantMode } from "./lib/tenancy";

type SingleTenantAppRole = "admin" | "member";

type CurrentUserWithMemberships = {
  clerkId: string;
  isSuperAdmin: boolean;
  memberships: Array<{
    organizationSlug: string;
    role: "superadmin" | "admin" | "member";
  }>;
};

/**
 * Get the current authenticated user's profile with their organization memberships.
 */
export const me = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      clerkId: v.string(),
      firstName: v.string(),
      lastName: v.string(),
      email: v.string(),
      imageUrl: v.optional(v.string()),
      isActive: v.boolean(),
      isSuperAdmin: v.boolean(),
      memberships: v.array(
        v.object({
          organizationId: v.id("organizations"),
          organizationSlug: v.string(),
          organizationName: v.string(),
          role: v.union(
            v.literal("superadmin"),
            v.literal("admin"),
            v.literal("member"),
          ),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("byClerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      return null;
    }

    // Get all memberships for this user
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("byUserId", (q) => q.eq("userId", user._id))
      .collect();

    // Batch fetch all organizations at once to avoid N+1
    const orgIds = [...new Set(memberships.map((m) => m.organizationId))];
    const orgs = await Promise.all(orgIds.map((id) => ctx.db.get(id)));
    const orgMap = new Map(orgs.filter(Boolean).map((o) => [o!._id, o!]));

    const enrichedMemberships = memberships.map((m) => {
      const org = orgMap.get(m.organizationId);
      return {
        organizationId: m.organizationId,
        organizationSlug: org?.slug ?? "",
        organizationName: org?.name ?? "",
        role: m.role,
      };
    });

    return {
      ...user,
      memberships: enrichedMemberships,
    };
  },
});

/**
 * Get a user by ID.
 */
export const getById = query({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      clerkId: v.string(),
      firstName: v.string(),
      lastName: v.string(),
      email: v.string(),
      imageUrl: v.optional(v.string()),
      isActive: v.boolean(),
      isSuperAdmin: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("byClerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!currentUser) {
      return null;
    }

    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) {
      return null;
    }

    if (currentUser._id === targetUser._id || currentUser.isSuperAdmin) {
      return targetUser;
    }

    const [currentMemberships, targetMemberships] = await Promise.all([
      ctx.db
        .query("organizationMembers")
        .withIndex("byUserId", (q) => q.eq("userId", currentUser._id))
        .collect(),
      ctx.db
        .query("organizationMembers")
        .withIndex("byUserId", (q) => q.eq("userId", targetUser._id))
        .collect(),
    ]);

    const currentOrgIds = new Set(
      currentMemberships.map((membership) => membership.organizationId),
    );
    const sharesOrganization = targetMemberships.some((membership) =>
      currentOrgIds.has(membership.organizationId),
    );

    return sharesOrganization ? targetUser : null;
  },
});

/**
 * Upsert user from Clerk webhook (internal).
 * Handles both user.created and user.updated events.
 * Reads isSuperAdmin from Clerk's publicMetadata.
 */
export const upsertFromClerk = internalMutation({
  args: { data: v.any() },
  returns: v.id("users"),
  handler: async (ctx, { data }) => {
    const clerkId = data.id;

    const email =
      data.email_addresses?.[0]?.email_address ||
      data.primary_email_address ||
      `user_${clerkId}@temp.clerk`;

    const firstName = data.first_name || "";
    const lastName = data.last_name || "";
    const imageUrl = data.image_url || data.profile_image_url || undefined;
    const isSuperAdmin = data.public_metadata?.isSuperAdmin === true;

    const existingUser = await ctx.db
      .query("users")
      .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (existingUser) {
      await ctx.db.patch(existingUser._id, {
        email,
        firstName,
        lastName,
        imageUrl,
        isActive: true,
        isSuperAdmin,
      });
      return existingUser._id;
    }

    const userId = await ctx.db.insert("users", {
      clerkId,
      email,
      firstName,
      lastName,
      imageUrl,
      isActive: true,
      isSuperAdmin,
    });
    return userId;
  },
});

/**
 * Deactivate user from Clerk webhook (internal).
 */
export const deactivateUser = internalMutation({
  args: { clerkId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("byClerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (user) {
      await ctx.db.patch(user._id, { isActive: false });
    }

    return null;
  },
});

function hasAdminAccessForOrg(
  user: CurrentUserWithMemberships,
  organizationSlug: string,
): boolean {
  if (user.isSuperAdmin) {
    return true;
  }

  const membership = user.memberships.find(
    (item) => item.organizationSlug === organizationSlug,
  );
  return membership?.role === "admin" || membership?.role === "superadmin";
}

/**
 * Update a user's role in single-tenant mode by writing to Clerk publicMetadata.
 * Convex membership is updated immediately to keep the UI in sync.
 */
export const setSingleTenantRole = action({
  args: {
    organizationSlug: v.string(),
    clerkUserId: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!isSingleTenantMode()) {
      throw new Error("Single-tenant role updates are not enabled");
    }

    if (args.organizationSlug !== DEFAULT_TENANT_SLUG) {
      throw new Error("Organization not found");
    }

    const currentUser = await ctx.runQuery(api.users.me, {});
    if (!currentUser) {
      throw new Error("Unauthorized");
    }

    if (!hasAdminAccessForOrg(currentUser, args.organizationSlug)) {
      throw new Error("Forbidden");
    }

    if (currentUser.clerkId === args.clerkUserId) {
      throw new Error("You cannot change your own role");
    }

    const targetUser = await clerkClient.users.getUser(args.clerkUserId);
    const targetRole = targetUser.publicMetadata?.role;
    const isTargetSuperAdmin =
      targetUser.publicMetadata?.isSuperAdmin === true ||
      targetRole === "superadmin" ||
      targetRole === "org:superadmin";
    if (isTargetSuperAdmin) {
      throw new Error("Cannot update role for a SuperAdmin");
    }

    await clerkClient.users.updateUserMetadata(args.clerkUserId, {
      publicMetadata: {
        ...(targetUser.publicMetadata ?? {}),
        role: args.role as SingleTenantAppRole,
      },
    });

    await ctx.runMutation(internal.members.upsertFromSingleTenant, {
      clerkUserId: args.clerkUserId,
      organizationSlug: args.organizationSlug,
      role: args.role,
    });

    return null;
  },
});

/**
 * Delete a user from Clerk in single-tenant mode.
 * The Convex user record is deactivated immediately.
 */
export const deleteSingleTenantUser = action({
  args: {
    organizationSlug: v.string(),
    clerkUserId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!isSingleTenantMode()) {
      throw new Error("Single-tenant user deletion is not enabled");
    }

    if (args.organizationSlug !== DEFAULT_TENANT_SLUG) {
      throw new Error("Organization not found");
    }

    const currentUser = await ctx.runQuery(api.users.me, {});
    if (!currentUser) {
      throw new Error("Unauthorized");
    }

    if (!hasAdminAccessForOrg(currentUser, args.organizationSlug)) {
      throw new Error("Forbidden");
    }

    if (currentUser.clerkId === args.clerkUserId) {
      throw new Error("You cannot delete your own account");
    }

    const targetUser = await clerkClient.users.getUser(args.clerkUserId);
    const targetRole = targetUser.publicMetadata?.role;
    const isTargetSuperAdmin =
      targetUser.publicMetadata?.isSuperAdmin === true ||
      targetRole === "superadmin" ||
      targetRole === "org:superadmin";
    if (isTargetSuperAdmin) {
      throw new Error("Cannot delete a SuperAdmin");
    }

    await clerkClient.users.deleteUser(args.clerkUserId);

    await ctx.runMutation(internal.users.deactivateUser, {
      clerkId: args.clerkUserId,
    });

    return null;
  },
});
