import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { internalMutation, mutation, query } from "../_generated/server";
import { requireCurrentUser, requireCurrentUserId } from "../lib/auth";
import {
  hasOrganizationRole,
  requireOrganizationRole,
  requireOrganizationRoleByUserId,
} from "../lib/authz";
import { throwAppError } from "../lib/errors";
import {
  applyAcceptedOrganizationInvitation,
  createOrganizationInvitation,
  getOrganizationInvitationByTokenHash,
  hashOrganizationInvitationToken,
  isOrganizationInvitationExpired,
  normalizeOrganizationInvitationEmail,
} from "../lib/organizationInvitations";
import { getOrganizationBySlug } from "../lib/organizations";
import { getUserPersonOrNull } from "../lib/people";
import { clampPaginationOpts } from "../lib/queryLimits";
import { getDisplayUserName } from "../lib/users";
import {
  organizationInvitationStatusValidator,
  organizationInvitationValidator,
  organizationRoleValidator,
} from "../lib/validators";

const organizationMembershipInvitationSummaryValidator = v.object({
  _id: v.id("organizationInvitations"),
  email: v.string(),
  role: organizationRoleValidator,
  invitedBy: v.string(),
  sentAt: v.number(),
});

const publicOrganizationInvitationStateValidator = v.union(
  v.object({
    state: v.literal("invalid"),
  }),
  v.object({
    state: v.union(organizationInvitationStatusValidator, v.literal("expired")),
    email: v.string(),
    organizationName: v.string(),
    organizationSlug: v.string(),
    expiresAt: v.number(),
  }),
);

async function createPendingOrganizationInvitationForOrganization(
  ctx: MutationCtx,
  args: {
    organization: Doc<"organizations">;
    email: string;
    invitedByUserId: Doc<"users">["_id"];
    tokenHash: string;
    expiresAt: number;
    membershipRole: Doc<"organizationMemberships">["role"];
  },
) {
  const access = await requireOrganizationRoleByUserId(ctx, {
    organizationId: args.organization._id,
    userId: args.invitedByUserId,
    minimumRole: "admin",
  });

  if (!hasOrganizationRole(access.effectiveRole, args.membershipRole)) {
    throwAppError("UNAUTHORIZED");
  }

  const invitation = await createOrganizationInvitation(ctx, {
    organizationId: args.organization._id,
    email: args.email,
    invitedByUserId: args.invitedByUserId,
    tokenHash: args.tokenHash,
    expiresAt: args.expiresAt,
    membershipRole: args.membershipRole,
  });

  await ctx.scheduler.runAt(
    invitation.expiresAt,
    internal.platform.organizationInvitations.expireIfPendingInternal,
    {
      invitationId: invitation._id,
    },
  );

  return invitation;
}

export const prepareForPasswordSignUpInternal = internalMutation({
  args: {
    tokenHash: v.string(),
    email: v.string(),
  },
  returns: v.union(
    v.object({
      email: v.string(),
      organizationId: v.id("organizations"),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const invitation = await getOrganizationInvitationByTokenHash(
      ctx,
      args.tokenHash,
    );
    if (!invitation || invitation.status !== "pending") {
      return null;
    }

    if (isOrganizationInvitationExpired(invitation)) {
      return null;
    }

    if (
      normalizeOrganizationInvitationEmail(invitation.email) !==
      normalizeOrganizationInvitationEmail(args.email)
    ) {
      return null;
    }

    return {
      email: invitation.email,
      organizationId: invitation.organizationId,
    };
  },
});

export const getPublicByToken = query({
  args: {
    token: v.string(),
    now: v.number(),
  },
  returns: publicOrganizationInvitationStateValidator,
  handler: async (ctx, args) => {
    const tokenHash = await hashOrganizationInvitationToken(args.token);
    const invitation = await getOrganizationInvitationByTokenHash(
      ctx,
      tokenHash,
    );

    if (!invitation) {
      return { state: "invalid" as const };
    }

    const organization = await ctx.db.get(
      "organizations",
      invitation.organizationId,
    );
    if (!organization) {
      return { state: "invalid" as const };
    }

    if (
      invitation.status === "pending" &&
      isOrganizationInvitationExpired(invitation, args.now)
    ) {
      return {
        state: "expired" as const,
        email: invitation.email,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        expiresAt: invitation.expiresAt,
      };
    }

    return {
      state: invitation.status,
      email: invitation.email,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      expiresAt: invitation.expiresAt,
    };
  },
});

export const createPendingForOrganizationSlugInternal = internalMutation({
  args: {
    slug: v.string(),
    email: v.string(),
    invitedByUserId: v.id("users"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    membershipRole: organizationRoleValidator,
  },
  returns: v.object({
    invitation: organizationInvitationValidator,
    organizationName: v.string(),
    organizationSlug: v.string(),
  }),
  handler: async (ctx, args) => {
    const organization = await getOrganizationBySlug(ctx, args.slug);
    if (!organization) {
      throwAppError("ORGANIZATION_NOT_FOUND");
    }

    const invitation = await createPendingOrganizationInvitationForOrganization(
      ctx,
      {
        organization,
        email: args.email,
        invitedByUserId: args.invitedByUserId,
        tokenHash: args.tokenHash,
        expiresAt: args.expiresAt,
        membershipRole: args.membershipRole,
      },
    );

    return {
      invitation,
      organizationName: organization.name,
      organizationSlug: organization.slug,
    };
  },
});

export const listMembershipForOrganization = query({
  args: {
    slug: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    organizationMembershipInvitationSummaryValidator,
  ),
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });

    const invitations = await ctx.db
      .query("organizationInvitations")
      .withIndex("by_org_id_and_status_and_created_at", (query) =>
        query
          .eq("organizationId", access.organization._id)
          .eq("status", "pending"),
      )
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
      page: await Promise.all(
        invitations.page.map(async (invitation, index) => {
          return {
            _id: invitation._id,
            email: invitation.email,
            role: invitation.membershipRole,
            invitedBy: inviters[index]
              ? getDisplayUserName({
                  user: inviters[index]!,
                  person: inviterPeople[index],
                })
              : invitation.email,
            sentAt: invitation.createdAt,
          };
        }),
      ),
    };
  },
});

export const expireIfPendingInternal = internalMutation({
  args: {
    invitationId: v.id("organizationInvitations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(
      "organizationInvitations",
      args.invitationId,
    );
    if (!invitation || invitation.status !== "pending") {
      return null;
    }

    if (!isOrganizationInvitationExpired(invitation)) {
      return null;
    }

    await ctx.db.patch("organizationInvitations", invitation._id, {
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
    const invitation = await getOrganizationInvitationByTokenHash(
      ctx,
      args.tokenHash,
    );
    if (!invitation) {
      throwAppError("ORGANIZATION_INVITATION_NOT_FOUND");
    }

    if (
      invitation.status === "accepted" &&
      invitation.acceptedByUserId === args.userId
    ) {
      return null;
    }

    if (invitation.status !== "pending") {
      throwAppError("ORGANIZATION_INVITATION_NOT_PENDING");
    }

    if (isOrganizationInvitationExpired(invitation)) {
      throwAppError("ORGANIZATION_INVITATION_EXPIRED");
    }

    if (
      normalizeOrganizationInvitationEmail(invitation.email) !==
      normalizeOrganizationInvitationEmail(args.email)
    ) {
      throwAppError("ORGANIZATION_INVITATION_EMAIL_MISMATCH");
    }

    await applyAcceptedOrganizationInvitation(ctx, {
      invitation,
      userId: args.userId,
    });

    const now = Date.now();
    await ctx.db.patch("organizationInvitations", invitation._id, {
      status: "accepted",
      acceptedAt: now,
      acceptedByUserId: args.userId,
      updatedAt: now,
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

    const invitation = await getOrganizationInvitationByTokenHash(
      ctx,
      await hashOrganizationInvitationToken(args.token),
    );
    if (!invitation) {
      throwAppError("ORGANIZATION_INVITATION_NOT_FOUND");
    }

    if (
      invitation.status === "accepted" &&
      invitation.acceptedByUserId === currentUserId
    ) {
      return null;
    }

    if (invitation.status !== "pending") {
      throwAppError("ORGANIZATION_INVITATION_NOT_PENDING");
    }

    if (isOrganizationInvitationExpired(invitation)) {
      throwAppError("ORGANIZATION_INVITATION_EXPIRED");
    }

    if (
      normalizeOrganizationInvitationEmail(invitation.email) !==
      normalizeOrganizationInvitationEmail(currentUser.email)
    ) {
      throwAppError("ORGANIZATION_INVITATION_EMAIL_MISMATCH");
    }

    await applyAcceptedOrganizationInvitation(ctx, {
      invitation,
      userId: currentUserId,
    });

    const now = Date.now();
    await ctx.db.patch("organizationInvitations", invitation._id, {
      status: "accepted",
      acceptedAt: now,
      acceptedByUserId: currentUserId,
      updatedAt: now,
    });

    return null;
  },
});

export const revokeInternal = internalMutation({
  args: {
    invitationId: v.id("organizationInvitations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(
      "organizationInvitations",
      args.invitationId,
    );
    if (!invitation) {
      return null;
    }

    await ctx.db.patch("organizationInvitations", invitation._id, {
      status: "revoked",
      revokedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const cancelForOrganization = mutation({
  args: {
    slug: v.string(),
    invitationId: v.id("organizationInvitations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });
    const invitation = await ctx.db.get(
      "organizationInvitations",
      args.invitationId,
    );
    if (
      !invitation ||
      invitation.organizationId !== access.organization._id ||
      invitation.status !== "pending"
    ) {
      throwAppError("ORGANIZATION_INVITATION_NOT_FOUND");
    }
    if (!hasOrganizationRole(access.effectiveRole, invitation.membershipRole)) {
      throwAppError("UNAUTHORIZED");
    }

    await ctx.db.patch("organizationInvitations", invitation._id, {
      status: "revoked",
      revokedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const setMembershipRoleForOrganization = mutation({
  args: {
    slug: v.string(),
    invitationId: v.id("organizationInvitations"),
    role: organizationRoleValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await requireOrganizationRole(ctx, {
      slug: args.slug,
      minimumRole: "admin",
    });
    if (!hasOrganizationRole(access.effectiveRole, args.role)) {
      throwAppError("UNAUTHORIZED");
    }

    const invitation = await ctx.db.get(
      "organizationInvitations",
      args.invitationId,
    );
    if (
      !invitation ||
      invitation.organizationId !== access.organization._id ||
      invitation.status !== "pending"
    ) {
      throwAppError("ORGANIZATION_INVITATION_NOT_FOUND");
    }

    await ctx.db.patch("organizationInvitations", invitation._id, {
      membershipRole: args.role,
      updatedAt: Date.now(),
    });

    return null;
  },
});
