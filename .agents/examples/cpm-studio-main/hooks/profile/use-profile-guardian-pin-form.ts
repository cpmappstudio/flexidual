"use client";

import { type FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { getErrorCode } from "@/lib/convex-errors";

type ProfileGuardianPinErrorField =
  | "currentPin"
  | "newPin"
  | "confirmPin"
  | "form";

type ProfileGuardianPinError = {
  field: ProfileGuardianPinErrorField;
  message: string;
};

function getPinError({
  error,
  hasPin,
  t,
}: {
  error: unknown;
  hasPin: boolean;
  t: ReturnType<typeof useTranslations<"ProfileSettings">>;
}): ProfileGuardianPinError {
  const code = getErrorCode(error);

  if (code === "PROFILE_PIN_INVALID") {
    return {
      field: hasPin ? "currentPin" : "form",
      message: t("pinInvalid"),
    };
  }

  if (code === "PROFILE_PIN_LOCKED") {
    return {
      field: hasPin ? "currentPin" : "form",
      message: t("pinLocked"),
    };
  }

  if (code === "PROFILE_PIN_INVALID_FORMAT") {
    return {
      field: "newPin",
      message: t("pinInvalidFormat"),
    };
  }

  return {
    field: "form",
    message: t("genericError"),
  };
}

export function useProfileGuardianPinForm({
  tenantSlug,
}: {
  tenantSlug?: string;
}) {
  const t = useTranslations("ProfileSettings");
  const pinStatus = useQuery(
    api.platform.people.getCurrentGuardianPinStatus,
    tenantSlug ? { slug: tenantSlug } : "skip",
  );
  const changePin = useMutation(
    api.platform.people.changeCurrentGuardianProfilePin,
  );
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<ProfileGuardianPinError | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const hasChanges =
    currentPin.length > 0 || newPin.length > 0 || confirmPin.length > 0;
  const hasPin = pinStatus?.hasPin ?? false;
  const canManagePin = Boolean(tenantSlug && pinStatus?.canManagePin);

  function resetForm() {
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setError(null);
  }

  function updateCurrentPin(value: string) {
    setCurrentPin(value);
    setError(null);
  }

  function updateNewPin(value: string) {
    setNewPin(value);
    setError(null);
  }

  function updateConfirmPin(value: string) {
    setConfirmPin(value);
    setError(null);
  }

  function getFieldError(field: ProfileGuardianPinErrorField) {
    return error?.field === field ? error.message : null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!tenantSlug || isSaving || !hasChanges) {
      return;
    }

    if (newPin !== confirmPin) {
      setError({
        field: "confirmPin",
        message: t("pinMismatch"),
      });
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await changePin({
        slug: tenantSlug,
        currentPin,
        newPin,
      });
      resetForm();
      toast.success(t("pinUpdated"));
    } catch (changeError) {
      setError(
        getPinError({
          error: changeError,
          hasPin,
          t,
        }),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return {
    canManagePin,
    confirmPin,
    confirmPinError: getFieldError("confirmPin"),
    currentPin,
    currentPinError: getFieldError("currentPin"),
    formError: getFieldError("form"),
    handleSubmit,
    hasChanges,
    hasPin,
    isSaving,
    newPin,
    newPinError: getFieldError("newPin"),
    updateConfirmPin,
    updateCurrentPin,
    updateNewPin,
  };
}
