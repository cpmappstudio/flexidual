"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { useRouter } from "@/i18n/navigation";
import { getErrorCode } from "@/lib/convex-errors";
import { Button } from "@/components/ui/button";
import { navigateToInvitationSuccess } from "@/components/invitations/invitation-navigation";

export type InvitationScope = "platform" | "organization";

function getInvitationAcceptErrorMessage(
  t: ReturnType<typeof useTranslations<"Invite">>,
  error: unknown,
) {
  const code = getErrorCode(error);

  if (
    code === "INVITATION_EXPIRED" ||
    code === "ORGANIZATION_INVITATION_EXPIRED"
  ) {
    return t("inviteExpired");
  }

  if (
    code === "INVITATION_EMAIL_MISMATCH" ||
    code === "ORGANIZATION_INVITATION_EMAIL_MISMATCH"
  ) {
    return t("emailMismatch");
  }

  if (
    code === "INVITATION_NOT_FOUND" ||
    code === "INVITATION_NOT_PENDING" ||
    code === "ORGANIZATION_INVITATION_NOT_FOUND" ||
    code === "ORGANIZATION_INVITATION_NOT_PENDING"
  ) {
    return t("inviteInvalid");
  }

  return t("inviteClaimError");
}

export function InvitationAcceptExistingAccountForm({
  inviteToken,
  scope,
  successHref,
}: {
  inviteToken: string;
  scope: InvitationScope;
  successHref: string;
}) {
  const t = useTranslations("Invite");
  const router = useRouter();
  const acceptForPlatform = useMutation(api.platform.invitations.acceptForCurrentUser);
  const acceptForOrganization = useMutation(
    api.platform.organizationInvitations.acceptForCurrentUser,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleAccept() {
    setIsSubmitting(true);

    try {
      if (scope === "platform") {
        await acceptForPlatform({ token: inviteToken });
      } else {
        await acceptForOrganization({ token: inviteToken });
      }

      navigateToInvitationSuccess(router, successHref);
    } catch (error) {
      toast.error(getInvitationAcceptErrorMessage(t, error));
      setIsSubmitting(false);
    }
  }

  return (
    <Button
      type="button"
      className="w-full"
      disabled={isSubmitting}
      onClick={() => void handleAccept()}
    >
      {isSubmitting ? t("acceptExistingInviteSubmitting") : t("acceptExistingInvite")}
    </Button>
  );
}
