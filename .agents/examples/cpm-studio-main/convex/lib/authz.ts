import { Doc } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import {
  getCurrentUserOrNull,
  requireCurrentUser,
  requireCurrentUserId,
} from "./auth";
import { throwAppError } from "./errors";
import { getOrganizationCapability } from "./capabilities";
import {
  getOrganizationBySlug,
  getOrganizationMembership,
  requireOrganizationById,
} from "./organizations";
import { getOrganizationPersonByPerson } from "./organizationPeople";
import { getEffectivePlatformRole } from "./users";
import type { PlatformCapabilityKey } from "../../lib/platform/capabilities";

type Context = QueryCtx | MutationCtx;
export type OrganizationRole = Doc<"organizationMemberships">["role"];
export type PlatformRole = "superadmin" | "viewer";

const ORGANIZATION_ROLE_RANK: Record<OrganizationRole, number> = {
  member: 0,
  admin: 1,
  owner: 2,
};

export function hasOrganizationRole(
  role: OrganizationRole,
  minimumRole: OrganizationRole,
) {
  return ORGANIZATION_ROLE_RANK[role] >= ORGANIZATION_ROLE_RANK[minimumRole];
}

export async function getCurrentPlatformAdminOrNull(ctx: Context) {
  const user = await getCurrentUserOrNull(ctx);

  if (!user || getEffectivePlatformRole(user) !== "superadmin") {
    return null;
  }

  return user;
}

export async function getCurrentPlatformUserOrNull(ctx: Context) {
  const user = await getCurrentUserOrNull(ctx);

  if (!user || !getEffectivePlatformRole(user)) {
    return null;
  }

  return user;
}

export async function requirePlatformAdmin(ctx: Context) {
  return await requirePlatformSuperadmin(ctx);
}

export async function requirePlatformSuperadmin(ctx: Context) {
  const user = await requireCurrentUser(ctx);

  if (getEffectivePlatformRole(user) !== "superadmin") {
    throwAppError("UNAUTHORIZED");
  }

  return user;
}

export async function requirePlatformMember(ctx: Context) {
  const user = await requireCurrentUser(ctx);

  if (!getEffectivePlatformRole(user)) {
    throwAppError("UNAUTHORIZED");
  }

  return user;
}

export function hasPlatformRole(
  role: PlatformRole | undefined,
  minimumRole: PlatformRole,
) {
  if (minimumRole === "viewer") {
    return role === "viewer" || role === "superadmin";
  }

  return role === "superadmin";
}

export async function getCurrentOrganizationAccess(ctx: Context, slug: string) {
  const userId = await requireCurrentUserId(ctx);
  const user = await ctx.db.get("users", userId);
  const organization = await getOrganizationBySlug(ctx, slug);

  if (!user || !organization || !organization.isActive) {
    return null;
  }

  if (getEffectivePlatformRole(user) === "superadmin") {
    return {
      organization,
      userId,
      membership: null,
      organizationPerson: null,
      effectiveRole: "owner" as const,
      isPlatformAdmin: true,
    };
  }

  const membership = await getOrganizationMembership(
    ctx,
    userId,
    organization._id,
  );
  if (!membership) {
    if (!user.personId) {
      return null;
    }

    const organizationPerson = await getOrganizationPersonByPerson(ctx, {
      organizationId: organization._id,
      personId: user.personId,
    });
    if (!organizationPerson?.isActive) {
      return null;
    }

    return {
      organization,
      userId,
      membership: null,
      organizationPerson,
      effectiveRole: "member" as const,
      isPlatformAdmin: false,
    };
  }

  return {
    organization,
    userId,
    membership,
    organizationPerson: null,
    effectiveRole: membership.role,
    isPlatformAdmin: false,
  };
}

export async function requireOrganizationAccess(ctx: Context, slug: string) {
  const access = await getCurrentOrganizationAccess(ctx, slug);

  if (!access) {
    throwAppError("UNAUTHORIZED");
  }

  return access;
}

export async function requireOrganizationRole(
  ctx: Context,
  args: {
    slug: string;
    minimumRole: OrganizationRole;
  },
) {
  const access = await requireOrganizationAccess(ctx, args.slug);

  if (!access.isPlatformAdmin && !access.membership) {
    throwAppError("UNAUTHORIZED");
  }

  if (!hasOrganizationRole(access.effectiveRole, args.minimumRole)) {
    throwAppError("UNAUTHORIZED");
  }

  return access;
}

export async function requireOrganizationRoleByUserId(
  ctx: Context,
  args: {
    organizationId: Doc<"organizations">["_id"];
    userId: Doc<"users">["_id"];
    minimumRole: OrganizationRole;
  },
) {
  const [organization, user] = await Promise.all([
    requireOrganizationById(ctx, args.organizationId),
    ctx.db.get("users", args.userId),
  ]);

  if (!user) {
    throwAppError("USER_NOT_FOUND");
  }

  if (!organization.isActive) {
    throwAppError("ORGANIZATION_NOT_FOUND");
  }

  if (getEffectivePlatformRole(user) === "superadmin") {
    return {
      organization,
      membership: null,
      effectiveRole: "owner" as const,
      isPlatformAdmin: true,
    };
  }

  const membership = await getOrganizationMembership(
    ctx,
    args.userId,
    args.organizationId,
  );

  if (!membership || !hasOrganizationRole(membership.role, args.minimumRole)) {
    throwAppError("UNAUTHORIZED");
  }

  return {
    organization,
    membership,
    effectiveRole: membership.role,
    isPlatformAdmin: false,
  };
}

export async function requireModuleCapability(
  ctx: Context,
  slug: string,
  capabilityKey: PlatformCapabilityKey,
) {
  const access = await requireOrganizationAccess(ctx, slug);
  const capability = await getOrganizationCapability(
    ctx,
    access.organization._id,
    capabilityKey,
  );

  if (!capability?.enabled) {
    throwAppError("CAPABILITY_NOT_ENABLED");
  }

  return access;
}
