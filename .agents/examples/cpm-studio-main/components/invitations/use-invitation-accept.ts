"use client";

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import {
  getInvitationAuthErrorCode,
  INVITATION_AUTH_ERROR_CODES,
} from "@/lib/auth/invitation-auth-errors";
import { getErrorCode } from "@/lib/convex-errors";
import { getImageUploadErrorMessage } from "@/lib/files/image";
import { navigateToInvitationSuccess } from "@/components/invitations/invitation-navigation";
import { useInvitationProfileSubmit } from "@/components/invitations/use-invitation-profile-submit";

export type InvitationAuthProviderId =
  | "platform-invitation"
  | "organization-invitation";

function getCreateAccountErrorMessage(
  t: ReturnType<typeof useTranslations<"Invite">>,
  error: unknown,
) {
  const code = getInvitationAuthErrorCode(error);

  if (code === INVITATION_AUTH_ERROR_CODES.invalidOrExpired) {
    return t("inviteExpired");
  }

  if (code === INVITATION_AUTH_ERROR_CODES.passwordTooShort) {
    return t("passwordHint");
  }

  return t("createAccountError");
}

function getInviteProfileErrorMessage({
  commonT,
  error,
  t,
}: {
  commonT: ReturnType<typeof useTranslations<"Common">>;
  error: unknown;
  t: ReturnType<typeof useTranslations<"Invite">>;
}) {
  const errorCode = getErrorCode(error);

  if (errorCode === "PROFILE_NAME_REQUIRED") {
    return commonT("identity.nameRequired");
  }

  return getImageUploadErrorMessage({
    errorCode,
    invalidTypeMessage: commonT("imageUpload.errors.invalidType"),
    tooLargeMessage: commonT("imageUpload.errors.tooLarge"),
    uploadFailedMessage: commonT("imageUpload.errors.uploadFailed"),
    fallbackMessage: t("inviteClaimError"),
  });
}

export function useInvitationAccept({
  authProviderId,
  clearAvatarDraft,
  email,
  inviteToken,
  successHref,
}: {
  authProviderId: InvitationAuthProviderId;
  clearAvatarDraft: () => void;
  email: string;
  inviteToken: string;
  successHref: string;
}) {
  const { signIn } = useAuthActions();
  const submitInviteProfile = useInvitationProfileSubmit();
  const router = useRouter();
  const t = useTranslations("Invite");
  const commonT = useTranslations("Common");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function acceptInvitation(args: {
    firstName: string;
    lastName: string;
    password: string;
    selectedAvatarFile: File | null;
    shouldRemoveAvatar: boolean;
  }) {
    const normalizedFirstName = args.firstName.trim();
    const normalizedLastName = args.lastName.trim();

    if (isSubmitting) {
      return;
    }

    if (!normalizedFirstName && !normalizedLastName) {
      setError(commonT("identity.nameRequired"));
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.set("email", email);
    formData.set("password", args.password);
    formData.set("inviteToken", inviteToken);

    try {
      await signIn(authProviderId, formData);

      await submitInviteProfile({
        firstName: args.firstName,
        lastName: args.lastName,
        selectedAvatarFile: args.selectedAvatarFile,
        shouldRemoveAvatar: args.shouldRemoveAvatar,
      });

      clearAvatarDraft();
      toast.success(t("profileCompleted"));
      navigateToInvitationSuccess(router, successHref);
    } catch (submitError) {
      const message = getInvitationAuthErrorCode(submitError)
        ? getCreateAccountErrorMessage(t, submitError)
        : getInviteProfileErrorMessage({ commonT, error: submitError, t });
      setError(message);
      setIsSubmitting(false);
    }
  }

  return {
    acceptInvitation,
    error,
    isSubmitting,
  };
}
