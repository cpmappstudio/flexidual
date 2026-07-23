import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { throwAppError } from "./errors";
import {
  buildInvitationAcceptUrl,
  buildInvitationAcceptUrlForBaseUrl,
  createInvitationToken,
  hashInvitationToken,
  INVITATION_TTL_MS,
  normalizeInvitationBaseUrl,
  normalizeInvitationEmail,
} from "./invitationTokens";

type PlatformInvitationDoc = Doc<"platformInvitations">;

export const PLATFORM_INVITATION_TTL_MS = INVITATION_TTL_MS;
const EXPIRED_PENDING_INVITATION_CLEANUP_BATCH_SIZE = 32;

export function normalizePlatformInvitationEmail(email: string) {
  return normalizeInvitationEmail(email);
}

export function createPlatformInvitationToken() {
  return createInvitationToken();
}

export async function hashPlatformInvitationToken(token: string) {
  return await hashInvitationToken(token);
}

export function isPlatformInvitationExpired(
  invitation: Pick<PlatformInvitationDoc, "expiresAt">,
  now = Date.now(),
) {
  return invitation.expiresAt <= now;
}

export function normalizePlatformInvitationBaseUrl(baseUrlOrRootDomain: string) {
  return normalizeInvitationBaseUrl(baseUrlOrRootDomain);
}

export function buildPlatformInvitationAcceptUrlForBaseUrl(args: {
  baseUrl: string;
  locale: "en" | "es";
  token: string;
}) {
  return buildInvitationAcceptUrlForBaseUrl(args);
}

export function buildPlatformInvitationAcceptUrl(args: {
  locale: "en" | "es";
  token: string;
}) {
  return buildInvitationAcceptUrl(args);
}

export async function ensureNoActivePendingInvitationForEmail(
  ctx: MutationCtx,
  email: string,
  now = Date.now(),
) {
  while (true) {
    const pendingInvitations = await ctx.db
      .query("platformInvitations")
      .withIndex("by_status_and_email", (query) =>
        query.eq("status", "pending").eq("email", email),
      )
      .take(EXPIRED_PENDING_INVITATION_CLEANUP_BATCH_SIZE);

    if (pendingInvitations.length === 0) {
      return;
    }

    for (const invitation of pendingInvitations) {
      if (!isPlatformInvitationExpired(invitation, now)) {
        throwAppError("INVITATION_ALREADY_PENDING");
      }

      await ctx.db.patch("platformInvitations", invitation._id, {
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
