"use client";

import { FormEvent, useState } from "react";
import { useAction } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { PlatformTeamRoleSelect } from "@/components/platform/platform-team-role-select";
import type { PlatformTeamRole } from "@/components/platform/platform-team.types";
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
  messageKey: ReturnType<typeof useTranslations<"PlatformTeam">>,
  error: unknown,
) {
  const code = getErrorCode(error);
  if (!code) {
    return messageKey("genericError");
  }

  if (code === "INVITATION_ALREADY_PENDING") {
    return messageKey("inviteDialog.errors.alreadyPending");
  }

  if (code === "PLATFORM_MEMBER_ALREADY_EXISTS") {
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

export function PlatformInviteUserDialog({
  canManage,
}: {
  canManage: boolean;
}) {
  const t = useTranslations("PlatformTeam");
  const locale = useLocale();
  const inviteForPlatform = useAction(api.platform.invitationActions.inviteForPlatform);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PlatformTeamRole>("viewer");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inviteLocale = locale === "es" ? "es" : "en";

  function resetForm() {
    setEmail("");
    setRole("viewer");
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
      await inviteForPlatform({
        email,
        role,
        locale: inviteLocale,
        appName: t("appName"),
        roleLabel: role === "superadmin" ? t("roles.superadmin") : t("roles.viewer"),
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
          {t("inviteUser")}
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
              <FieldLabel htmlFor="platform-invite-email">
                {t("inviteDialog.emailLabel")}
              </FieldLabel>
              <Input
                id="platform-invite-email"
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
              <FieldLabel htmlFor="platform-invite-role">
                {t("inviteDialog.roleLabel")}
              </FieldLabel>
              <PlatformTeamRoleSelect
                value={role}
                onValueChange={setRole}
                disabled={isSubmitting}
                className="w-full"
                triggerId="platform-invite-role"
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
