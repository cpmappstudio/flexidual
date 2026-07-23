"use client";

import { type FormEvent, useState } from "react";
import { useAction } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { TenantTeamRoleSelect } from "@/components/people/tenant-team-role-select";
import type { TenantTeamRole } from "@/components/people/tenant-people.types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getErrorCode } from "@/lib/convex-errors";

function getInviteErrorMessage(
  messageKey: ReturnType<typeof useTranslations<"TenantTeam">>,
  error: unknown,
) {
  const code = getErrorCode(error);
  if (!code) {
    return messageKey("genericError");
  }

  if (code === "ORGANIZATION_INVITATION_ALREADY_PENDING") {
    return messageKey("inviteDialog.errors.alreadyPending");
  }

  if (code === "ORGANIZATION_MEMBER_ALREADY_EXISTS") {
    return messageKey("inviteDialog.errors.alreadyMember");
  }

  if (code === "INVITATION_EMAIL_NOT_CONFIGURED") {
    return messageKey("inviteDialog.errors.emailNotConfigured");
  }

  if (code === "INVITATION_BASE_URL_NOT_CONFIGURED") {
    return messageKey("inviteDialog.errors.baseUrlNotConfigured");
  }

  if (code === "EMAIL_SEND_FAILED") {
    return messageKey("inviteDialog.errors.emailSendFailed");
  }

  return messageKey("genericError");
}

export function TenantInviteTeamMemberDialog({
  slug,
  canManage,
  allowOwner,
}: {
  slug: string;
  canManage: boolean;
  allowOwner: boolean;
}) {
  const t = useTranslations("TenantTeam");
  const locale = useLocale();
  const inviteForOrganization = useAction(
    api.platform.organizationInvitationActions.inviteForOrganization,
  );
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TenantTeamRole>("member");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inviteLocale = locale === "es" ? "es" : "en";

  function resetForm() {
    setEmail("");
    setRole("member");
    setError(null);
    setIsSubmitting(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || isSubmitting) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await inviteForOrganization({
        slug,
        email,
        locale: inviteLocale,
        appName: t("appName"),
        membershipRole: role,
      });

      toast.success(t("inviteDialog.success"));
      resetForm();
      setOpen(false);
    } catch (inviteError) {
      setError(getInviteErrorMessage(t, inviteError));
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          resetForm();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" disabled={!canManage}>
          {t("inviteMember")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-3xl p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("inviteDialog.title")}</DialogTitle>
          <DialogDescription>{t("inviteDialog.description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="tenant-team-invite-email">
                {t("inviteDialog.emailLabel")}
              </FieldLabel>
              <Input
                id="tenant-team-invite-email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t("inviteDialog.emailPlaceholder")}
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tenant-team-invite-role">
                {t("inviteDialog.roleLabel")}
              </FieldLabel>
              <TenantTeamRoleSelect
                value={role}
                allowOwner={allowOwner}
                onValueChange={setRole}
                disabled={isSubmitting}
                className="w-full"
                triggerId="tenant-team-invite-role"
                ariaLabel={t("inviteDialog.roleLabel")}
              />
            </Field>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("inviteDialog.inviting") : t("inviteDialog.submit")}
            </Button>

            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
