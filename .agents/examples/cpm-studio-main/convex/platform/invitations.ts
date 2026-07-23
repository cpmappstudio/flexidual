import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internalMutation, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireCurrentUser, requireCurrentUserId } from "../lib/auth";
import { requirePlatformMember, requirePlatformSuperadmin } from "../lib/authz";
import {
  ensureNoActivePendingInvitationForEmail,
  hashPlatformInvitationToken,
  isPlatformInvitationExpired,
  normalizePlatformInvitationEmail,
} from "../lib/platformInvitations";
import {
  platformInvitationStatusValidator,
  platformInvitationValidator,
  platformRoleValidator,
} from "../lib/validators";
import { throwAppError } from "../lib/errors";
import { clampPaginationOpts } from "../lib/queryLimits";
import {
  buildPlatformAccessPatch,
  getDisplayUserName,
  getEffectivePlatformRole,
  requirePlatformSuperadminById,
} from "../lib/users";
import { getUserPersonOrNull, savePersonProfileForUser } from "../lib/people";

const platformInvitationSummaryValidator = v.object({
  _id: v.id("platformInvitations"),
  email: v.string(),
  role: platformRoleValidator,
  invitedBy: v.string(),
  sentAt: v.number(),
});

const publicPlatformInvitationStateValidator = v.union(
  v.object({
    state: v.literal("invalid"),
  }),
  v.object({
    state: v.union(
      platformInvitationStatusValidator,
      v.literal("expired"),
    ),
    email: v.string(),
    role: platformRoleValidator,
    expiresAt: v.number(),
  }),
);

const avatarChangeValidator = v.union(
  v.object({ kind: v.literal("keep") }),
  v.object({ kind: v.literal("set"), storageId: v.id("_storage") }),
  v.object({ kind: v.literal("remove") }),
);

async function getInvitationByTokenHash(
  ctx: QueryCtx | MutationCtx,
  tokenHash: string,
) {
  return await ctx.db
    .query("platformInvitations")
    .withIndex("by_token_hash", (query) => query.eq("tokenHash", tokenHash))
    .unique();
}

// Validates the invitation token and email. Returns the invitation context
// when the password sign-up flow can proceed, or `null` when the token is
// invalid, expired, or for a different email. Account-existence is intentionally
// NOT pre-checked here so that the provider does not leak which emails have
// existing accounts: the SDK's `createAccount` call is the single point of
// failure for that condition.
export const prepareForPasswordSignUpInternal = internalMutation({
  args: {
    tokenHash: v.string(),
    email: v.string(),
  },
  returns: v.union(
    v.object({
      email: v.string(),
      role: platformRoleValidator,
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const invitation = await getInvitationByTokenHash(ctx, args.tokenHash);
    if (!invitation || invitation.status !== "pending") {
      return null;
    }

    if (isPlatformInvitationExpired(invitation)) {
      return null;
    }

    if (
      normalizePlatformInvitationEmail(invitation.email) !==
      normalizePlatformInvitationEmail(args.email)
    ) {
      return null;
    }

    return {
      email: invitation.email,
      role: invitation.role,
    };
  },
});

export const getPublicByToken = query({
  args: {
    token: v.string(),
    // Caller-provided "current time" so the query result is cacheable. Pass
    // a value rounded to a coarse boundary (e.g. the start of the current
    // minute) to avoid invalidating the cache on every millisecond. Using
    // `Date.now()` directly inside the query would invalidate the Convex
    // query cache constantly.
    now: v.number(),
  },
  returns: publicPlatformInvitationStateValidator,
  handler: async (ctx, args) => {
    const tokenHash = await hashPlatformInvitationToken(args.token);
    const invitation = await getInvitationByTokenHash(ctx, tokenHash);

    if (!invitation) {
      return { state: "invalid" as const };
    }

    if (
      invitation.status === "pending" &&
      isPlatformInvitationExpired(invitation, args.now)
    ) {
      return {
        state: "expired" as const,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      };
    }

    return {
      state: invitation.status,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    };
  },
});

export const listForPlatform = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(platformInvitationSummaryValidator),
  handler: async (ctx, args) => {
    await requirePlatformMember(ctx);

    const invitations = await ctx.db
      .query("platformInvitations")
      .withIndex("by_status_and_created_at", (query) => query.eq("status", "pending"))
      .order("desc")
      .paginate(clampPaginationOpts(args.paginationOpts));

    const inviters = await Promise.all(
      invitations.page.map((invitation) =>
        ctx.db.get("users", invitation.invitedByUserId),
      ),
    );
    const inviterPeople = await Promise.all(
      inviters.map((inviter) =>
        inviter ? getUserPersonOrNull(ctx, inviter) : Promise.resolve(null),
      ),
    );

    return {
      ...invitations,
      page: invitations.page.map((invitation, index) => ({
        _id: invitation._id,
        email: invitation.email,
        role: invitation.role,
        invitedBy: inviters[index]
          ? getDisplayUserName({
              user: inviters[index]!,
              person: inviterPeople[index],
            })
          : invitation.email,
        sentAt: invitation.createdAt,
      })),
    };
  },
});

export const createPendingInternal = internalMutation({
  args: {
    email: v.string(),
    role: platformRoleValidator,
    invitedByUserId: v.id("users"),
    tokenHash: v.string(),
    expiresAt: v.number(),
  },
  returns: platformInvitationValidator,
  handler: async (ctx, args) => {
    await requirePlatformSuperadminById(ctx, args.invitedByUserId);

    const email = normalizePlatformInvitationEmail(args.email);
    const now = Date.now();
    await ensureNoActivePendingInvitationForEmail(ctx, email, now);

    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (query) => query.eq("email", email))
      .unique();

    if (existingUser && getEffectivePlatformRole(existingUser)) {
      throwAppError("PLATFORM_MEMBER_ALREADY_EXISTS");
    }

    const invitationId = await ctx.db.insert("platformInvitations", {
      email,
      role: args.role,
      status: "pending",
      invitedByUserId: args.invitedByUserId,
      tokenHash: args.tokenHash,
      createdAt: now,
      updatedAt: now,
      expiresAt: args.expiresAt,
    });

    const invitation = await ctx.db.get("platformInvitations", invitationId);
    if (!invitation) {
      throwAppError("PLATFORM_INVITATION_CREATE_FAILED");
    }

    await ctx.scheduler.runAt(
      invitation.expiresAt,
      internal.platform.invitations.expireIfPendingInternal,
      {
        invitationId: invitation._id,
      },
    );

    return invitation;
  },
});

export const expireIfPendingInternal = internalMutation({
  args: {
    invitationId: v.id("platformInvitations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(
      "platformInvitations",
      args.invitationId,
    );
    if (!invitation || invitation.status !== "pending") {
      return null;
    }

    if (!isPlatformInvitationExpired(invitation)) {
      return null;
    }

    await ctx.db.patch("platformInvitations", invitation._id, {
      status: "expired",
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const acceptAfterSignUpInternal = internalMutation({
  args: {
    tokenHash: v.string(),
    email: v.string(),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const invitation = await getInvitationByTokenHash(ctx, args.tokenHash);
    if (!invitation) {
      throwAppError("INVITATION_NOT_FOUND");
    }

    if (
      invitation.status === "accepted" &&
      invitation.acceptedByUserId === args.userId
    ) {
      return null;
    }

    if (invitation.status !== "pending") {
      throwAppError("INVITATION_NOT_PENDING");
    }

    if (isPlatformInvitationExpired(invitation)) {
      throwAppError("INVITATION_EXPIRED");
    }

    if (
      normalizePlatformInvitationEmail(invitation.email) !==
      normalizePlatformInvitationEmail(args.email)
    ) {
      throwAppError("INVITATION_EMAIL_MISMATCH");
    }

    const user = await ctx.db.get("users", args.userId);
    if (!user) {
      throwAppError("INVITATION_ACCOUNT_NOT_FOUND");
    }

    const now = Date.now();

    await ctx.db.patch("users", user._id, buildPlatformAccessPatch(invitation.role));

    await ctx.db.patch("platformInvitations", invitation._id, {
      status: "accepted",
      acceptedAt: now,
      acceptedByUserId: args.userId,
      updatedAt: now,
    });

    return null;
  },
});

export const revokeInternal = internalMutation({
  args: {
    invitationId: v.id("platformInvitations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(
      "platformInvitations",
      args.invitationId,
    );
    if (!invitation) {
      return null;
    }

    await ctx.db.patch("platformInvitations", invitation._id, {
      status: "revoked",
      revokedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const cancelForPlatform = mutation({
  args: {
    invitationId: v.id("platformInvitations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requirePlatformSuperadmin(ctx);

    const invitation = await ctx.db.get(
      "platformInvitations",
      args.invitationId,
    );
    if (!invitation || invitation.status !== "pending") {
      throwAppError("INVITATION_NOT_FOUND");
    }

    await ctx.db.patch("platformInvitations", invitation._id, {
      status: "revoked",
      revokedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const setRoleForPlatform = mutation({
  args: {
    invitationId: v.id("platformInvitations"),
    role: platformRoleValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requirePlatformSuperadmin(ctx);

    const invitation = await ctx.db.get(
      "platformInvitations",
      args.invitationId,
    );
    if (!invitation || invitation.status !== "pending") {
      throwAppError("INVITATION_NOT_FOUND");
    }

    await ctx.db.patch("platformInvitations", invitation._id, {
      role: args.role,
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const completeInviteProfile = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    avatarChange: avatarChangeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);

    if (!currentUser.email) {
      throwAppError("ACCOUNT_EMAIL_REQUIRED");
    }

    if (!getEffectivePlatformRole(currentUser)) {
      throwAppError("UNAUTHORIZED");
    }

    await savePersonProfileForUser(ctx, {
      user: currentUser,
      firstName: args.firstName,
      lastName: args.lastName,
      avatarChange: args.avatarChange,
    });

    return null;
  },
});

export const acceptForCurrentUser = mutation({
  args: {
    token: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const currentUser = await requireCurrentUser(ctx);
    const currentUserId = await requireCurrentUserId(ctx);

    if (!currentUser.email) {
      throwAppError("ACCOUNT_EMAIL_REQUIRED");
    }

    const invitation = await getInvitationByTokenHash(
      ctx,
      await hashPlatformInvitationToken(args.token),
    );

    if (!invitation) {
      throwAppError("INVITATION_NOT_FOUND");
    }

    if (
      invitation.status === "accepted" &&
      invitation.acceptedByUserId === currentUserId
    ) {
      return null;
    }

    if (invitation.status !== "pending") {
      throwAppError("INVITATION_NOT_PENDING");
    }

    if (isPlatformInvitationExpired(invitation)) {
      throwAppError("INVITATION_EXPIRED");
    }

    if (
      normalizePlatformInvitationEmail(invitation.email) !==
      normalizePlatformInvitationEmail(currentUser.email)
    ) {
      throwAppError("INVITATION_EMAIL_MISMATCH");
    }

    const now = Date.now();

    await ctx.db.patch(
      "users",
      currentUserId,
      buildPlatformAccessPatch(invitation.role),
    );

    await ctx.db.patch("platformInvitations", invitation._id, {
      status: "accepted",
      acceptedAt: now,
      acceptedByUserId: currentUserId,
      updatedAt: now,
    });

    return null;
  },
});
