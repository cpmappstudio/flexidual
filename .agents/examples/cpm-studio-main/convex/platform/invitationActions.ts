"use node";

import { Resend } from "resend";
import { ConvexError, v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  buildPlatformInvitationAcceptUrl,
  createPlatformInvitationToken,
  hashPlatformInvitationToken,
  normalizePlatformInvitationEmail,
  PLATFORM_INVITATION_TTL_MS,
} from "../lib/platformInvitations";
import { appLocaleValidator, platformRoleValidator } from "../lib/validators";
import { throwAppError } from "../lib/errors";

function buildInvitationEmail(args: {
  appName: string;
  acceptUrl: string;
  locale: "en" | "es";
  roleLabel: string;
  invitedByName: string;
}) {
  if (args.locale === "es") {
    return {
      subject: `Te invitaron a unirte a ${args.appName}`,
      text: [
        `${args.invitedByName} te invitó a unirte a ${args.appName} como ${args.roleLabel}.`,
        "",
        `Abre este enlace para aceptar la invitación: ${args.acceptUrl}`,
        "",
        "Si ya tienes una cuenta, inicia sesión y continúa desde la página de invitación.",
      ].join("\n"),
    };
  }

  return {
    subject: `You're invited to join ${args.appName}`,
    text: [
      `${args.invitedByName} invited you to join ${args.appName} as ${args.roleLabel}.`,
      "",
      `Open this link to accept your invitation: ${args.acceptUrl}`,
      "",
      "If you already have an account, sign in and continue from the invitation page.",
    ].join("\n"),
  };
}

export const inviteForPlatform = action({
  args: {
    email: v.string(),
    role: platformRoleValidator,
    locale: appLocaleValidator,
    appName: v.string(),
    roleLabel: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const currentUser = await ctx.runQuery(
      internal.users.getCurrentActionUserInternal,
      {},
    );

    if (currentUser?.platformRole !== "superadmin") {
      throwAppError("UNAUTHORIZED");
    }

    const apiKey = process.env.AUTH_RESEND_KEY;
    if (!apiKey) {
      throwAppError("INVITATION_EMAIL_NOT_CONFIGURED");
    }

    const token = createPlatformInvitationToken();
    const tokenHash = await hashPlatformInvitationToken(token);
    const normalizedEmail = normalizePlatformInvitationEmail(args.email);
    const acceptUrl = buildPlatformInvitationAcceptUrl({
      locale: args.locale,
      token,
    });

    if (!acceptUrl) {
      throwAppError("INVITATION_BASE_URL_NOT_CONFIGURED");
    }

    const invitation = await ctx.runMutation(
      internal.platform.invitations.createPendingInternal,
      {
        email: normalizedEmail,
        role: args.role,
        invitedByUserId: currentUser._id,
        tokenHash,
        expiresAt: Date.now() + PLATFORM_INVITATION_TTL_MS,
      },
    );

    try {
      const resend = new Resend(apiKey);
      const email = buildInvitationEmail({
        appName: args.appName,
        acceptUrl,
        locale: args.locale,
        roleLabel: args.roleLabel,
        invitedByName:
          currentUser.email ??
          (args.locale === "es"
            ? "Un administrador de la plataforma"
            : "A platform admin"),
      });

      const { error } = await resend.emails.send({
        from: process.env.AUTH_EMAIL ?? "CPM Studio <onboarding@resend.dev>",
        to: [normalizedEmail],
        subject: email.subject,
        text: email.text,
      });

      if (error) {
        throwAppError("EMAIL_SEND_FAILED");
      }
    } catch (error) {
      await ctx.runMutation(internal.platform.invitations.revokeInternal, {
        invitationId: invitation._id,
      });

      if (error instanceof ConvexError) {
        throw error;
      }

      throwAppError("EMAIL_SEND_FAILED");
    }

    return null;
  },
});
