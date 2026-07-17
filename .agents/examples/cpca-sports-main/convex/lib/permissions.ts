import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { getCurrentUser } from "./auth";

/**
 * Get user's membership in a specific organization.
 */
export async function getOrgMembership(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  organizationId: Id<"organizations">,
) {
  return await ctx.db
    .query("organizationMembers")
    .withIndex("byUserAndOrg", (q) =>
      q.eq("userId", userId).eq("organizationId", organizationId),
    )
    .unique();
}

/**
 * Check if user has admin access to a specific organization.
 * Returns true if user is a global superadmin OR has admin/superadmin role in the org.
 */
export async function hasOrgAdminAccess(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  organizationId: Id<"organizations">,
): Promise<boolean> {
  // Check global superadmin first
  const user = await ctx.db.get(userId);
  if (user?.isSuperAdmin) {
    return true;
  }

  // Check org membership
  const membership = await getOrgMembership(ctx, userId, organizationId);
  return membership?.role === "admin" || membership?.role === "superadmin";
}

/**
 * Require that the current user is a global SuperAdmin.
 * Throws if not authenticated or not a SuperAdmin.
 */
export async function requireSuperAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);

  if (!user.isSuperAdmin) {
    throw new Error("SuperAdmin access required");
  }

  return user;
}

/**
 * Require that the current user has access to the specified organization.
 * Returns the user and their membership (membership may be null for global superadmins).
 */
export async function requireOrgAccess(
  ctx: QueryCtx | MutationCtx,
  organizationSlug: string,
) {
  const user = await getCurrentUser(ctx);

  // Find the organization
  const organization = await ctx.db
    .query("organizations")
    .withIndex("bySlug", (q) => q.eq("slug", organizationSlug))
    .unique();

  if (!organization) {
    throw new Error(`Organization "${organizationSlug}" not found`);
  }

  // Check membership
  const membership = await getOrgMembership(ctx, user._id, organization._id);

  // Global superadmins have access to all organizations
  if (user.isSuperAdmin) {
    return { user, organization, membership };
  }

  if (!membership) {
    throw new Error("You do not have access to this organization");
  }

  return { user, organization, membership };
}

/**
 * Require that the current user has admin access (admin or superadmin) to the organization.
 */
export async function requireOrgAdmin(
  ctx: QueryCtx | MutationCtx,
  organizationSlug: string,
) {
  const { user, organization, membership } = await requireOrgAccess(
    ctx,
    organizationSlug,
  );

  // Global superadmins always have admin access
  if (user.isSuperAdmin) {
    return { user, organization, membership };
  }

  if (
    !membership ||
    (membership.role !== "admin" && membership.role !== "superadmin")
  ) {
    throw new Error("Admin access required for this action");
  }

  return { user, organization, membership };
}
