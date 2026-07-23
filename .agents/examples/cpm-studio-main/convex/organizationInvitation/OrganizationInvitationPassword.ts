import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { createAccount } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { hashOrganizationInvitationToken } from "../lib/organizationInvitations";
import {
  INVITATION_AUTH_ERROR_CODES,
  throwInvitationAuthError,
} from "../../lib/auth/invitation-auth-errors";

function requireString(
  credentials: Partial<Record<string, unknown>>,
  key: string,
) {
  const value = credentials[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing ${key}`);
  }

  return value;
}

function validatePassword(password: string) {
  if (password.length < 8) {
    throwInvitationAuthError(INVITATION_AUTH_ERROR_CODES.passwordTooShort);
  }
}

function getAppErrorCode(error: unknown) {
  if (!(error instanceof ConvexError) || typeof error.data !== "object") {
    return null;
  }

  const code = (error.data as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function isExistingPasswordAccountError(error: unknown, email: string) {
  return (
    error instanceof Error &&
    error.message === `Account ${email} already exists`
  );
}

export const OrganizationInvitationPassword: ReturnType<typeof ConvexCredentials> =
  ConvexCredentials({
    id: "organization-invitation",
    authorize: async (
      credentials,
      ctx,
    ): Promise<{ userId: Id<"users"> } | null> => {
      const email = requireString(credentials, "email");
      const password = requireString(credentials, "password");
      const inviteToken = requireString(credentials, "inviteToken");
      const tokenHash = await hashOrganizationInvitationToken(inviteToken);

      validatePassword(password);

      const invitation: {
        email: string;
        organizationId: Id<"organizations">;
      } | null = await ctx.runMutation(
        internal.platform.organizationInvitations.prepareForPasswordSignUpInternal,
        {
          tokenHash,
          email,
        },
      );

      if (!invitation) {
        throwInvitationAuthError(INVITATION_AUTH_ERROR_CODES.invalidOrExpired);
      }

      let created: { user: { _id: Id<"users"> } };
      try {
        created = await createAccount(ctx, {
          provider: "password",
          account: {
            id: invitation.email,
            secret: password,
          },
          profile: {
            email: invitation.email,
          },
        });
      } catch (error) {
        if (isExistingPasswordAccountError(error, invitation.email)) {
          throwInvitationAuthError(INVITATION_AUTH_ERROR_CODES.invalidOrExpired);
        }

        throw error;
      }

      try {
        await ctx.runMutation(
          internal.platform.organizationInvitations.acceptAfterSignUpInternal,
          {
            tokenHash,
            email: invitation.email,
            userId: created.user._id,
          },
        );
      } catch (error) {
        const code = getAppErrorCode(error);
        if (
          code === "ORGANIZATION_INVITATION_NOT_FOUND" ||
          code === "ORGANIZATION_INVITATION_NOT_PENDING" ||
          code === "ORGANIZATION_INVITATION_EMAIL_MISMATCH" ||
          code === "ORGANIZATION_INVITATION_EXPIRED"
        ) {
          throwInvitationAuthError(INVITATION_AUTH_ERROR_CODES.invalidOrExpired);
        }

        throw error;
      }

      return {
        userId: created.user._id,
      };
    },
  });
