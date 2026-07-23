import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { buildPlatformAccessPatch, getEffectivePlatformRole } from "./lib/users";
import { appLocaleValidator, platformRoleValidator } from "./lib/validators";
import {
  buildPlatformInvitationAcceptUrlForBaseUrl,
  createPlatformInvitationToken,
  hashPlatformInvitationToken,
  normalizePlatformInvitationEmail,
  PLATFORM_INVITATION_TTL_MS,
} from "./lib/platformInvitations";
import { throwAppError } from "./lib/errors";

const devBootstrapInvitationResultValidator = v.object({
  email: v.string(),
  role: platformRoleValidator,
  acceptUrl: v.string(),
  expiresAt: v.number(),
});
const DEV_BOOTSTRAP_INVITER_EMAIL = "dev-bootstrap@local.invalid";

function requireDevBootstrapEnabled() {
  if (process.env.ENABLE_DEV_BOOTSTRAP !== "true") {
    throwAppError("DEV_BOOTSTRAP_DISABLED");
  }
}

async function ensureDevBootstrapInviter(
  ctx: MutationCtx,
): Promise<Id<"users">> {
  const existingUser = await ctx.db
    .query("users")
    .withIndex("email", (query) =>
      query.eq("email", DEV_BOOTSTRAP_INVITER_EMAIL),
    )
    .unique();

  if (existingUser) {
    if (getEffectivePlatformRole(existingUser) !== "superadmin") {
      await ctx.db.patch(
        "users",
        existingUser._id,
        buildPlatformAccessPatch("superadmin"),
      );
    }

    return existingUser._id;
  }

  return await ctx.db.insert("users", {
    email: DEV_BOOTSTRAP_INVITER_EMAIL,
    ...buildPlatformAccessPatch("superadmin"),
  });
}

export const createPlatformSuperadminInviteForDev = internalMutation({
  args: {
    email: v.string(),
    baseUrl: v.string(),
    locale: appLocaleValidator,
  },
  returns: devBootstrapInvitationResultValidator,
  handler: async (
    ctx,
    args,
  ): Promise<{
    email: string;
    role: "superadmin" | "viewer";
    acceptUrl: string;
    expiresAt: number;
  }> => {
    requireDevBootstrapEnabled();

    const email = normalizePlatformInvitationEmail(args.email);
    const token = createPlatformInvitationToken();
    const tokenHash = await hashPlatformInvitationToken(token);
    const acceptUrl = buildPlatformInvitationAcceptUrlForBaseUrl({
      baseUrl: args.baseUrl,
      locale: args.locale,
      token,
    });

    if (!acceptUrl) {
      throwAppError("INVITATION_BASE_URL_NOT_CONFIGURED");
    }

    const inviterUserId = await ensureDevBootstrapInviter(ctx);
    const invitation: {
      email: string;
      role: "superadmin" | "viewer";
      expiresAt: number;
    } = await ctx.runMutation(
      internal.platform.invitations.createPendingInternal,
      {
        email,
        role: "superadmin",
        invitedByUserId: inviterUserId,
        tokenHash,
        expiresAt: Date.now() + PLATFORM_INVITATION_TTL_MS,
      },
    );

    return {
      email: invitation.email,
      role: invitation.role,
      acceptUrl,
      expiresAt: invitation.expiresAt,
    };
  },
});
