"use node";

import { Resend } from "resend";
import { ConvexError, v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  buildOrganizationInvitationAcceptUrl,
  createOrganizationInvitationToken,
  hashOrganizationInvitationToken,
  normalizeOrganizationInvitationEmail,
  ORGANIZATION_INVITATION_TTL_MS,
} from "../lib/organizationInvitations";
import {
  appLocaleValidator,
  organizationRoleValidator,
} from "../lib/validators";
import { throwAppError } from "../lib/errors";

function buildOrganizationInvitationEmail(args: {
  appName: string;
  acceptUrl: string;
  locale: "en" | "es";
  organizationName: string;
  invitedByName: string;
}) {
  if (args.locale === "es") {
    return {
      subject: `Te invitaron a unirte a ${args.organizationName}`,
      text: [
        `${args.invitedByName} te invitó a unirte a ${args.organizationName} en ${args.appName}.`,
        "",
        `Abre este enlace para aceptar la invitación: ${args.acceptUrl}`,
        "",
        "Si ya tienes una cuenta, inicia sesión y continúa desde la página de invitación.",
      ].join("\n"),
    };
  }

  return {
    subject: `You're invited to join ${args.organizationName}`,
    text: [
      `${args.invitedByName} invited you to join ${args.organizationName} on ${args.appName}.`,
      "",
      `Open this link to accept your invitation: ${args.acceptUrl}`,
      "",
      "If you already have an account, sign in and continue from the invitation page.",
    ].join("\n"),
  };
}

export const inviteForOrganization = action({
  args: {
    slug: v.string(),
    email: v.string(),
    locale: appLocaleValidator,
    appName: v.string(),
    membershipRole: organizationRoleValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const currentUser = await ctx.runQuery(
      internal.users.getCurrentActionUserInternal,
      {},
    );

    if (!currentUser) {
      throwAppError("UNAUTHORIZED");
    }

    const apiKey = process.env.AUTH_RESEND_KEY;
    if (!apiKey) {
      throwAppError("INVITATION_EMAIL_NOT_CONFIGURED");
    }

    const token = createOrganizationInvitationToken();
    const tokenHash = await hashOrganizationInvitationToken(token);
    const normalizedEmail = normalizeOrganizationInvitationEmail(args.email);
    const acceptUrl = buildOrganizationInvitationAcceptUrl({
      locale: args.locale,
      token,
    });

    if (!acceptUrl) {
      throwAppError("INVITATION_BASE_URL_NOT_CONFIGURED");
    }

    const result = await ctx.runMutation(
      internal.platform.organizationInvitations
        .createPendingForOrganizationSlugInternal,
      {
        slug: args.slug,
        email: normalizedEmail,
        invitedByUserId: currentUser._id,
        tokenHash,
        expiresAt: Date.now() + ORGANIZATION_INVITATION_TTL_MS,
        membershipRole: args.membershipRole,
      },
    );

    try {
      const resend = new Resend(apiKey);
      const email = buildOrganizationInvitationEmail({
        appName: args.appName,
        acceptUrl,
        locale: args.locale,
        organizationName: result.organizationName,
        invitedByName:
          currentUser.email ??
          (args.locale === "es"
            ? "Un administrador de la institución"
            : "An organization admin"),
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
      await ctx.runMutation(
        internal.platform.organizationInvitations.revokeInternal,
        {
          invitationId: result.invitation._id,
        },
      );

      if (error instanceof ConvexError) {
        throw error;
      }

      throwAppError("EMAIL_SEND_FAILED");
    }

    return null;
  },
});
