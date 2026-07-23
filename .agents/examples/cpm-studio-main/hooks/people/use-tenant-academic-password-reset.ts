"use client";

import { type FormEvent, useState } from "react";
import { useAction } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getErrorCode } from "@/lib/convex-errors";

function getResetPasswordErrorMessage(
  t: ReturnType<typeof useTranslations<"TenantPeople">>,
  error: unknown,
) {
  const code = getErrorCode(error);

  if (code === "PASSWORD_TOO_SHORT") {
    return t("profile.passwordTooShort");
  }

  if (
    code === "ORGANIZATION_PERSON_ACCOUNT_NOT_FOUND" ||
    code === "ORGANIZATION_PERSON_PASSWORD_ACCOUNT_NOT_FOUND"
  ) {
    return t("profile.passwordAccountNotFound");
  }

  return t("genericError");
}

export function useTenantAcademicPasswordReset({
  accountScope = "withGuardianFallback",
  fieldPrefix = "student-profile",
  organizationPersonId,
  slug,
}: {
  accountScope?: "self" | "withGuardianFallback";
  fieldPrefix?: string;
  organizationPersonId: Id<"organizationPeople">;
  slug: string;
}) {
  const t = useTranslations("TenantPeople");
  const resetPassword = useAction(
    api.usersActions.resetOrganizationPersonPassword,
  );
  const [open, setOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signOutAllSessions, setSignOutAllSessions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const hasChanges = newPassword.length > 0 || confirmPassword.length > 0;

  function resetForm() {
    setNewPassword("");
    setConfirmPassword("");
    setSignOutAllSessions(false);
    setIsSaving(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (!nextOpen) {
      resetForm();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving || !hasChanges) {
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(t("profile.passwordMismatch"));
      return;
    }

    setIsSaving(true);

    try {
      await resetPassword({
        accountScope,
        slug,
        organizationPersonId,
        newPassword,
        signOutAllSessions,
      });
      toast.success(t("profile.passwordUpdated"));
      resetForm();
      setOpen(false);
    } catch (error) {
      toast.error(getResetPasswordErrorMessage(t, error));
      setIsSaving(false);
    }
  }

  return {
    confirmPassword,
    fieldPrefix,
    handleOpenChange,
    handleSubmit,
    hasChanges,
    isSaving,
    newPassword,
    open,
    setConfirmPassword,
    setNewPassword,
    setOpen,
    setSignOutAllSessions,
    signOutAllSessions,
  };
}
