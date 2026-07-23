"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useProfileGuardianPinForm } from "@/hooks/profile/use-profile-guardian-pin-form";
import { PROFILE_PIN_INPUT_PROPS } from "@/lib/people/profile-pin";

function ProfileGuardianPinFormContent({
  form,
}: {
  form: ReturnType<typeof useProfileGuardianPinForm>;
}) {
  const t = useTranslations("ProfileSettings");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-foreground">
          {t("pinTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("pinDescription")}</p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={form.handleSubmit}>
        <FieldGroup>
          {form.hasPin ? (
            <Field data-invalid={form.currentPinError ? true : undefined}>
              <FieldLabel htmlFor="guardian-current-pin">
                {t("currentPinLabel")}
              </FieldLabel>
              <Input
                {...PROFILE_PIN_INPUT_PROPS}
                id="guardian-current-pin"
                value={form.currentPin}
                onChange={(event) => form.updateCurrentPin(event.target.value)}
                disabled={form.isSaving}
                aria-invalid={form.currentPinError ? true : undefined}
                required
              />
              {form.currentPinError ? (
                <FieldError>{form.currentPinError}</FieldError>
              ) : null}
            </Field>
          ) : null}
          <Field data-invalid={form.newPinError ? true : undefined}>
            <FieldLabel htmlFor="guardian-new-pin">
              {t("newPinLabel")}
            </FieldLabel>
            <Input
              {...PROFILE_PIN_INPUT_PROPS}
              id="guardian-new-pin"
              value={form.newPin}
              onChange={(event) => form.updateNewPin(event.target.value)}
              disabled={form.isSaving}
              aria-invalid={form.newPinError ? true : undefined}
              required
            />
            <FieldDescription>{t("pinHint")}</FieldDescription>
            {form.newPinError ? (
              <FieldError>{form.newPinError}</FieldError>
            ) : null}
          </Field>
          <Field data-invalid={form.confirmPinError ? true : undefined}>
            <FieldLabel htmlFor="guardian-confirm-pin">
              {t("confirmPinLabel")}
            </FieldLabel>
            <Input
              {...PROFILE_PIN_INPUT_PROPS}
              id="guardian-confirm-pin"
              value={form.confirmPin}
              onChange={(event) => form.updateConfirmPin(event.target.value)}
              disabled={form.isSaving}
              aria-invalid={form.confirmPinError ? true : undefined}
              required
            />
            {form.confirmPinError ? (
              <FieldError>{form.confirmPinError}</FieldError>
            ) : null}
          </Field>
        </FieldGroup>
        {form.formError ? <FieldError>{form.formError}</FieldError> : null}

        <div className="flex pt-2 sm:justify-end">
          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={form.isSaving || !form.hasChanges}
          >
            {form.isSaving ? t("updatingPin") : t("updatePin")}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function ProfileGuardianPinForm({
  tenantSlug,
}: {
  tenantSlug?: string;
}) {
  const form = useProfileGuardianPinForm({ tenantSlug });

  if (!form.canManagePin) {
    return null;
  }

  return <ProfileGuardianPinFormContent form={form} />;
}
