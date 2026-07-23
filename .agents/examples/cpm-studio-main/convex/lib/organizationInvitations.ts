import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  buildInvitationAcceptUrl,
  buildInvitationAcceptUrlForBaseUrl,
  createInvitationToken,
  hashInvitationToken,
  INVITATION_TTL_MS,
  normalizeInvitationBaseUrl,
  normalizeInvitationEmail,
} from "./invitationTokens";
import { hasOrganizationRole } from "./authz";
import { throwAppError } from "./errors";
import {
  getOrganizationMembership,
  requireOrganizationById,
  upsertOrganizationMembership,
} from "./organizations";
import { requireUserById } from "./users";

type Context = QueryCtx | MutationCtx;
type OrganizationInvitationDoc = Doc<"organizationInvitations">;

export const ORGANIZATION_INVITATION_TTL_MS = INVITATION_TTL_MS;
const EXPIRED_PENDING_INVITATION_CLEANUP_BATCH_SIZE = 32;

export function normalizeOrganizationInvitationEmail(email: string) {
  return normalizeInvitationEmail(email);
}

export function createOrganizationInvitationToken() {
  return createInvitationToken();
}

export async function hashOrganizationInvitationToken(token: string) {
  return await hashInvitationToken(token);
}

export function normalizeOrganizationInvitationBaseUrl(baseUrlOrRootDomain: string) {
  return normalizeInvitationBaseUrl(baseUrlOrRootDomain);
}

export function buildOrganizationInvitationAcceptUrlForBaseUrl(args: {
  baseUrl: string;
  locale: "en" | "es";
  token: string;
}) {
  return buildInvitationAcceptUrlForBaseUrl(args);
}

export function buildOrganizationInvitationAcceptUrl(args: {
  locale: "en" | "es";
  token: string;
}) {
  return buildInvitationAcceptUrl(args);
}

export function isOrganizationInvitationExpired(
  invitation: Pick<OrganizationInvitationDoc, "expiresAt">,
  now = Date.now(),
) {
  return invitation.expiresAt <= now;
}

export async function getOrganizationInvitationByTokenHash(
  ctx: Context,
  tokenHash: string,
) {
  return await ctx.db
    .query("organizationInvitations")
    .withIndex("by_token_hash", (query) => query.eq("tokenHash", tokenHash))
    .unique();
}

export async function ensureNoActivePendingOrganizationInvitationForEmail(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    email: string;
    now?: number;
  },
) {
  const now = args.now ?? Date.now();

  while (true) {
    const pendingInvitations = await ctx.db
      .query("organizationInvitations")
      .withIndex("by_org_id_and_status_and_email", (query) =>
        query
          .eq("organizationId", args.organizationId)
          .eq("status", "pending")
          .eq("email", args.email),
      )
      .take(EXPIRED_PENDING_INVITATION_CLEANUP_BATCH_SIZE);

    if (pendingInvitations.length === 0) {
      return;
    }

    for (const invitation of pendingInvitations) {
      if (!isOrganizationInvitationExpired(invitation, now)) {
        throwAppError("ORGANIZATION_INVITATION_ALREADY_PENDING");
      }

      await ctx.db.patch("organizationInvitations", invitation._id, {
        status: "expired",
        updatedAt: now,
      });
    }

    if (
      pendingInvitations.length < EXPIRED_PENDING_INVITATION_CLEANUP_BATCH_SIZE
    ) {
      return;
    }
  }
}

export async function applyAcceptedOrganizationInvitation(
  ctx: MutationCtx,
  args: {
    invitation: OrganizationInvitationDoc;
    userId: Id<"users">;
  },
) {
  const user = await requireUserById(ctx, args.userId);

  const existingMembership = await getOrganizationMembership(
    ctx,
    user._id,
    args.invitation.organizationId,
  );
  const shouldApplyMembership =
    !existingMembership ||
    (existingMembership.role !== args.invitation.membershipRole &&
      hasOrganizationRole(
        args.invitation.membershipRole,
        existingMembership.role,
      ));

  if (shouldApplyMembership) {
    await upsertOrganizationMembership(ctx, {
      organizationId: args.invitation.organizationId,
      userId: user._id,
      role: args.invitation.membershipRole,
    });
  }
}

export async function createOrganizationInvitation(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    email: string;
    invitedByUserId: Id<"users">;
    tokenHash: string;
    expiresAt: number;
    membershipRole: Doc<"organizationMemberships">["role"];
  },
) {
  await requireOrganizationById(ctx, args.organizationId);
  await requireUserById(ctx, args.invitedByUserId);

  const now = Date.now();
  const email = normalizeOrganizationInvitationEmail(args.email);
  await ensureNoActivePendingOrganizationInvitationForEmail(ctx, {
    organizationId: args.organizationId,
    email,
    now,
  });

  const existingUser = await ctx.db
    .query("users")
    .withIndex("email", (query) => query.eq("email", email))
    .unique();

  if (existingUser) {
    const existingMembership = await getOrganizationMembership(
      ctx,
      existingUser._id,
      args.organizationId,
    );

    if (existingMembership) {
      if (hasOrganizationRole(existingMembership.role, args.membershipRole)) {
        throwAppError("ORGANIZATION_MEMBER_ALREADY_EXISTS");
      }
    }
  }

  const invitationId = await ctx.db.insert("organizationInvitations", {
    organizationId: args.organizationId,
    email,
    status: "pending",
    invitedByUserId: args.invitedByUserId,
    tokenHash: args.tokenHash,
    membershipRole: args.membershipRole,
    createdAt: now,
    updatedAt: now,
    expiresAt: args.expiresAt,
  });

  const invitation = await ctx.db.get("organizationInvitations", invitationId);
  if (!invitation) {
    throwAppError("ORGANIZATION_INVITATION_CREATE_FAILED");
  }

  return invitation;
}
