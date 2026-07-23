import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCurrentUserId } from "../lib/auth";
import { hasOrganizationRole, requireOrganizationRole } from "../lib/authz";
import { throwAppError } from "../lib/errors";
import { getOrganizationMembership, upsertOrganizationMembership } from "../lib/organizations";
import {
  getEffectivePersonAvatarUrl,
  getUserPersonOrNull,
} from "../lib/people";
import { clampPaginationOpts } from "../lib/queryLimits";
import {
  getDisplayUserName,
  reassignUserDefaultOrganizationIfMatches,
  requireUserById,
} from "../lib/users";
import { organizationRoleValidator } from "../lib/validators";

const organizationTeamMemberValidator = v.object({
  _id: v.id("users"),
  membershipId: v.id("organizationMemberships"),
  name: v.string(),
  email: v.string(),
  avatarUrl: v.union(v.string(), v.null()),
  role: organizationRoleValidator,
  isCurrentUser: v.boolean(),
});

export const listMembersForOrganization = query({
  args: {
    slug: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(organizationTeamMemberValidator),
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });
    const currentUserId = await requireCurrentUserId(ctx);

    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_id", (query) =>
        query.eq("organizationId", access.organization._id),
      )
      .paginate(clampPaginationOpts(args.paginationOpts));

    return {
      ...memberships,
      page: await Promise.all(
        memberships.page.map(async (membership) => {
          const user = await requireUserById(ctx, membership.userId);
          const person = await getUserPersonOrNull(ctx, user);

          return {
            _id: user._id,
            membershipId: membership._id,
            name: getDisplayUserName({ user, person }),
            email: user.email ?? "",
            avatarUrl: await getEffectivePersonAvatarUrl(ctx, {
              person,
              fallbackImage: user.image,
            }),
            role: membership.role,
            isCurrentUser: user._id === currentUserId,
          };
        }),
      ),
    };
  },
});

export const setMemberRoleForOrganization = mutation({
  args: {
    slug: v.string(),
    userId: v.id("users"),
    role: organizationRoleValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });
    const currentUserId = await requireCurrentUserId(ctx);
    if (currentUserId === args.userId) {
      throwAppError("SELF_ROLE_CHANGE_NOT_ALLOWED");
    }
    if (!hasOrganizationRole(access.effectiveRole, args.role)) {
      throwAppError("UNAUTHORIZED");
    }

    const membership = await getOrganizationMembership(
      ctx,
      args.userId,
      access.organization._id,
    );
    if (!membership) {
      throwAppError("ORGANIZATION_MEMBER_NOT_FOUND");
    }
    if (!hasOrganizationRole(access.effectiveRole, membership.role)) {
      throwAppError("UNAUTHORIZED");
    }

    await upsertOrganizationMembership(ctx, {
      organizationId: access.organization._id,
      userId: args.userId,
      role: args.role,
    });

    return null;
  },
});

export const removeMemberForOrganization = mutation({
  args: {
    slug: v.string(),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });
    const currentUserId = await requireCurrentUserId(ctx);
    if (currentUserId === args.userId) {
      throwAppError("SELF_REMOVE_NOT_ALLOWED");
    }

    const membership = await getOrganizationMembership(
      ctx,
      args.userId,
      access.organization._id,
    );
    if (!membership) {
      throwAppError("ORGANIZATION_MEMBER_NOT_FOUND");
    }
    if (!hasOrganizationRole(access.effectiveRole, membership.role)) {
      throwAppError("UNAUTHORIZED");
    }

    await ctx.db.delete("organizationMemberships", membership._id);
    await reassignUserDefaultOrganizationIfMatches(
      ctx,
      args.userId,
      access.organization._id,
    );

    return null;
  },
});
