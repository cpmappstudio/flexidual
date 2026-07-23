import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { mutation, query } from "../_generated/server";
import { platformRoleValidator } from "../lib/validators";
import { requireCurrentUserId } from "../lib/auth";
import { requirePlatformMember, requirePlatformSuperadmin } from "../lib/authz";
import { clampPaginationOpts } from "../lib/queryLimits";
import {
  buildPlatformAccessPatch,
  getDisplayUserName,
  getEffectivePlatformRole,
} from "../lib/users";
import {
  getEffectivePersonAvatarUrl,
  getUserPersonOrNull,
} from "../lib/people";
import { throwAppError } from "../lib/errors";

const platformTeamMemberValidator = v.object({
  _id: v.id("users"),
  name: v.string(),
  email: v.string(),
  avatarUrl: v.union(v.string(), v.null()),
  role: platformRoleValidator,
  isCurrentUser: v.boolean(),
});

export const listMembersForPlatform = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(platformTeamMemberValidator),
  handler: async (ctx, args) => {
    await requirePlatformMember(ctx);
    const currentUserId = await requireCurrentUserId(ctx);

    const users = await ctx.db
      .query("users")
      .withIndex("by_has_platform_access_and_email", (query) =>
        query.eq("hasPlatformAccess", true),
      )
      .paginate(clampPaginationOpts(args.paginationOpts));
    const people = await Promise.all(
      users.page.map((user) => getUserPersonOrNull(ctx, user)),
    );

    return {
      ...users,
      page: await Promise.all(
        users.page.map(async (user, index) => ({
          _id: user._id,
          name: getDisplayUserName({
            user,
            person: people[index],
          }),
          email: user.email!,
          avatarUrl: await getEffectivePersonAvatarUrl(ctx, {
            person: people[index],
            fallbackImage: user.image,
          }),
          role: getEffectivePlatformRole(user)!,
          isCurrentUser: user._id === currentUserId,
        })),
      ),
    };
  },
});

export const setMemberRoleForPlatform = mutation({
  args: {
    userId: v.id("users"),
    role: platformRoleValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const currentUser = await requirePlatformSuperadmin(ctx);

    if (currentUser._id === args.userId) {
      throwAppError("SELF_ROLE_CHANGE_NOT_ALLOWED");
    }

    const user = await ctx.db.get("users", args.userId);
    if (!user?.email || !getEffectivePlatformRole(user)) {
      throwAppError("PLATFORM_MEMBER_NOT_FOUND");
    }

    await ctx.db.patch("users", user._id, buildPlatformAccessPatch(args.role));

    return null;
  },
});

export const removeMemberForPlatform = mutation({
  args: {
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const currentUser = await requirePlatformSuperadmin(ctx);

    if (currentUser._id === args.userId) {
      throwAppError("SELF_REMOVE_NOT_ALLOWED");
    }

    const user = await ctx.db.get("users", args.userId);
    if (!user || !getEffectivePlatformRole(user)) {
      throwAppError("PLATFORM_MEMBER_NOT_FOUND");
    }

    await ctx.db.patch("users", user._id, buildPlatformAccessPatch(undefined));

    return null;
  },
});
