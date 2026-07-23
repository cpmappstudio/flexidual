"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAction } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getErrorCode } from "@/lib/convex-errors";

export function ProfilePasswordForm() {
  const t = useTranslations("ProfileSettings");
  const changePassword = useAction(api.usersActions.changePassword);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const hasChanges =
    currentPassword.length > 0 ||
    newPassword.length > 0 ||
    confirmPassword.length > 0;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving || !hasChanges) {
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(t("passwordMismatch"));
      return;
    }

    setIsSaving(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(t("passwordUpdated"));
    } catch (changeError) {
      const errorCode = getErrorCode(changeError);
      const message =
        errorCode === "INVALID_CURRENT_PASSWORD"
          ? t("invalidCurrentPassword")
          : errorCode === "PASSWORD_TOO_SHORT"
            ? t("passwordTooShort")
            : errorCode === "PASSWORD_UNCHANGED"
              ? t("passwordUnchanged")
              : errorCode === "TOO_MANY_FAILED_ATTEMPTS"
                ? t("tooManyFailedAttempts")
                : t("genericError");
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-foreground">
          {t("securityTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("securityDescription")}</p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="current-password">
              {t("currentPasswordLabel")}
            </FieldLabel>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={isSaving}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-password">
              {t("newPasswordLabel")}
            </FieldLabel>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={isSaving}
              required
              minLength={8}
            />
            <FieldDescription>{t("passwordHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="confirm-password">
              {t("confirmPasswordLabel")}
            </FieldLabel>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={isSaving}
              required
              minLength={8}
            />
          </Field>
        </FieldGroup>

        <div className="flex pt-2 sm:justify-end">
          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? t("updatingPassword") : t("updatePassword")}
          </Button>
        </div>
      </form>
    </div>
  );
}
