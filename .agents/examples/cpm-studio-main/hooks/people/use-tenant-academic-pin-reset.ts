"use client";

import { type FormEvent, useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getErrorCode } from "@/lib/convex-errors";

function getResetPinErrorMessage(
  t: ReturnType<typeof useTranslations<"TenantPeople">>,
  error: unknown,
) {
  const code = getErrorCode(error);

  if (code === "PROFILE_PIN_INVALID_FORMAT") {
    return t("profile.pinInvalidFormat");
  }

  return t("genericError");
}

export function useTenantAcademicPinReset({
  fieldPrefix = "student-profile",
  organizationPersonId,
  slug,
}: {
  fieldPrefix?: string;
  organizationPersonId: Id<"organizationPeople">;
  slug: string;
}) {
  const t = useTranslations("TenantPeople");
  const resetPin = useMutation(api.platform.people.resetGuardianProfilePin);
  const [open, setOpen] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const hasChanges = newPin.length > 0 || confirmPin.length > 0;

  function resetForm() {
    setNewPin("");
    setConfirmPin("");
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

    if (newPin !== confirmPin) {
      toast.error(t("profile.pinMismatch"));
      return;
    }

    setIsSaving(true);

    try {
      await resetPin({
        slug,
        organizationPersonId,
        newPin,
      });
      toast.success(t("profile.pinUpdated"));
      resetForm();
      setOpen(false);
    } catch (error) {
      toast.error(getResetPinErrorMessage(t, error));
      setIsSaving(false);
    }
  }

  return {
    confirmPin,
    fieldPrefix,
    handleOpenChange,
    handleSubmit,
    hasChanges,
    isSaving,
    newPin,
    open,
    setConfirmPin,
    setNewPin,
    setOpen,
  };
}
