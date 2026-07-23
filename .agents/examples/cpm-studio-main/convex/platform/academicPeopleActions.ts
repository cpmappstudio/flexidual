"use node";

import { createAccount } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { normalizeOrganizationInvitationEmail } from "../lib/organizationInvitations";
import { assertProfilePinFormat } from "../lib/profilePins";
import { throwAppError } from "../lib/errors";
import { academicAccountKindValidator } from "./academicPeopleValidators";

const MIN_PASSWORD_LENGTH = 8;

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

function getAcademicAccountProfileImageStorageIds(accountKind: {
  kind: string;
  profile?: { imageStorageId?: Id<"_storage"> };
  students?: readonly { imageStorageId?: Id<"_storage"> }[];
}) {
  if (accountKind.kind === "guardianStudents") {
    return (accountKind.students ?? []).flatMap((student) =>
      student.imageStorageId ? [student.imageStorageId] : [],
    );
  }

  const profileImageStorageId = accountKind.profile?.imageStorageId;
  return profileImageStorageId ? [profileImageStorageId] : [];
}

export const provisionAcademicAccountProfiles = action({
  args: {
    slug: v.string(),
    email: v.string(),
    password: v.string(),
    accountKind: academicAccountKindValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const imageStorageIds = getAcademicAccountProfileImageStorageIds(
      args.accountKind,
    );
    async function discardUploadedProfileImages() {
      try {
        await ctx.runMutation(
          internal.platform.academicPeople
            .discardAcademicProfileImageUploadsInternal,
          {
            storageIds: imageStorageIds,
          },
        );
      } catch {
        // Preserve the original validation/provisioning error.
      }
    }

    const currentUser = await ctx.runQuery(
      internal.users.getCurrentActionUserInternal,
      {},
    );

    if (!currentUser) {
      await discardUploadedProfileImages();
      throwAppError("UNAUTHORIZED");
    }

    const email = normalizeOrganizationInvitationEmail(args.email);
    if (!email || !email.includes("@")) {
      await discardUploadedProfileImages();
      throwAppError("ACCOUNT_EMAIL_REQUIRED");
    }

    if (args.password.length < MIN_PASSWORD_LENGTH) {
      await discardUploadedProfileImages();
      throwAppError("PASSWORD_TOO_SHORT");
    }

    if (args.accountKind.kind === "guardianStudents") {
      try {
        assertProfilePinFormat(args.accountKind.guardianPin);
      } catch (error) {
        await discardUploadedProfileImages();
        throw error;
      }
    }

    const provisioning = await (async () => {
      try {
        return await ctx.runMutation(
          internal.platform.academicPeople
            .provisionAcademicAccountProfilesInternal,
          {
            slug: args.slug,
            email,
            provisionedByUserId: currentUser._id,
            accountKind: args.accountKind,
          },
        );
      } catch (error) {
        await discardUploadedProfileImages();
        throw error;
      }
    })();

    try {
      await createAccount(ctx, {
        provider: "password",
        account: {
          id: email,
          secret: args.password,
        },
        profile: {
          email,
          personId: provisioning.targetPersonId,
          defaultOrganizationId: provisioning.organizationId,
        },
      });
    } catch (error) {
      try {
        await ctx.runMutation(
          internal.platform.academicPeople
            .cleanupProvisionedAcademicAccountProfilesInternal,
          {
            organizationId: provisioning.organizationId,
            createdPeople: provisioning.createdPeople,
          },
        );
      } catch {
        // Preserve the account creation error; cleanup is best-effort.
      }

      if (isExistingPasswordAccountError(error, email)) {
        throwAppError("ORGANIZATION_PERSON_ACCOUNT_ALREADY_EXISTS");
      }

      const code = getAppErrorCode(error);
      if (code) {
        throw error;
      }

      throwAppError("ACCOUNT_CREATE_FAILED");
    }

    return null;
  },
});
