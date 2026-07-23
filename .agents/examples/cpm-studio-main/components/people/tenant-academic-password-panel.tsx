"use client";

import type { ComponentProps } from "react";
import {
  MoreHorizontalCircle01Icon,
  SecurityPasswordIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { KeyRound, LockKeyhole } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { useTenantAcademicPasswordReset } from "@/hooks/people/use-tenant-academic-password-reset";
import { useTenantAcademicPinReset } from "@/hooks/people/use-tenant-academic-pin-reset";
import { PROFILE_PIN_INPUT_PROPS } from "@/lib/people/profile-pin";

type PasswordCredentialState = {
  canManage: boolean;
  hasLinkedAccount: boolean;
};

type PinCredentialState = {
  canManage: boolean;
  hasPin: boolean;
};

type PasswordResetState = ReturnType<typeof useTenantAcademicPasswordReset>;
type PinResetState = ReturnType<typeof useTenantAcademicPinReset>;
type PasswordResetAccountScope = "self" | "withGuardianFallback";

function CredentialActionsButton({
  label,
  ...props
}: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Button {...props} type="button" variant="ghost" size="icon-sm">
      <HugeiconsIcon
        icon={MoreHorizontalCircle01Icon}
        strokeWidth={2}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </Button>
  );
}

function PasswordCredentialItem({
  credential,
  onChangePassword,
}: {
  credential: PasswordCredentialState;
  onChangePassword: () => void;
}) {
  const t = useTranslations("TenantPeople");

  return (
    <Item variant="outline" className="h-[42px] flex-nowrap">
      <ItemMedia variant="icon">
        <LockKeyhole
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="max-w-full truncate text-sm text-muted-foreground">
          {credential.hasLinkedAccount
            ? "••••••••••"
            : t("profile.passwordNoAccount")}
        </ItemTitle>
      </ItemContent>

      {credential.hasLinkedAccount && credential.canManage ? (
        <ItemActions>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <CredentialActionsButton
                label={t("profile.passwordActionsMenu")}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                className="justify-between"
                onSelect={onChangePassword}
              >
                <span>{t("profile.changePassword")}</span>
                <HugeiconsIcon
                  icon={SecurityPasswordIcon}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ItemActions>
      ) : null}
    </Item>
  );
}

function PinCredentialItem({
  credential,
  onChangePin,
}: {
  credential: PinCredentialState;
  onChangePin: () => void;
}) {
  const t = useTranslations("TenantPeople");

  if (!credential.canManage) {
    return null;
  }

  return (
    <Item variant="outline" className="h-[42px] flex-nowrap">
      <ItemMedia variant="icon">
        <KeyRound
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="max-w-full truncate text-sm text-muted-foreground">
          {credential.hasPin ? "••••" : t("profile.pinNotConfigured")}
        </ItemTitle>
      </ItemContent>
      <ItemActions>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <CredentialActionsButton label={t("profile.pinActionsMenu")} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              className="justify-between"
              onSelect={onChangePin}
            >
              <span>{t("profile.changePin")}</span>
              <KeyRound aria-hidden="true" className="size-4" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ItemActions>
    </Item>
  );
}

function ChangePasswordDialog({ reset }: { reset: PasswordResetState }) {
  const t = useTranslations("TenantPeople");
  const newPasswordId = `${reset.fieldPrefix}-new-password`;
  const confirmPasswordId = `${reset.fieldPrefix}-confirm-password`;
  const signOutSessionsId = `${reset.fieldPrefix}-sign-out-sessions`;

  return (
    <Dialog open={reset.open} onOpenChange={reset.handleOpenChange}>
      <DialogContent className="max-w-md rounded-3xl p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("profile.changePassword")}</DialogTitle>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={reset.handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={newPasswordId}>
                {t("profile.newPasswordLabel")}
              </FieldLabel>
              <Input
                id={newPasswordId}
                type="password"
                autoComplete="new-password"
                value={reset.newPassword}
                onChange={(event) => reset.setNewPassword(event.target.value)}
                disabled={reset.isSaving}
                required
                minLength={8}
              />
              <FieldDescription>{t("profile.passwordHint")}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor={confirmPasswordId}>
                {t("profile.confirmPasswordLabel")}
              </FieldLabel>
              <Input
                id={confirmPasswordId}
                type="password"
                autoComplete="new-password"
                value={reset.confirmPassword}
                onChange={(event) =>
                  reset.setConfirmPassword(event.target.value)
                }
                disabled={reset.isSaving}
                required
                minLength={8}
              />
            </Field>

            <Field
              orientation="horizontal"
              className="rounded-xl border border-border/70 px-3 py-2"
            >
              <Checkbox
                id={signOutSessionsId}
                checked={reset.signOutAllSessions}
                onCheckedChange={(nextChecked) =>
                  reset.setSignOutAllSessions(nextChecked === true)
                }
                disabled={reset.isSaving}
              />
              <FieldContent>
                <FieldLabel htmlFor={signOutSessionsId}>
                  {t("profile.signOutAllSessions")}
                </FieldLabel>
              </FieldContent>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={reset.isSaving || !reset.hasChanges}
            >
              {reset.isSaving
                ? t("profile.updatingPassword")
                : t("profile.changePassword")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChangePinDialog({ reset }: { reset: PinResetState }) {
  const t = useTranslations("TenantPeople");
  const newPinId = `${reset.fieldPrefix}-new-pin`;
  const confirmPinId = `${reset.fieldPrefix}-confirm-pin`;

  return (
    <Dialog open={reset.open} onOpenChange={reset.handleOpenChange}>
      <DialogContent className="max-w-md rounded-3xl p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("profile.changePin")}</DialogTitle>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={reset.handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={newPinId}>
                {t("profile.newPinLabel")}
              </FieldLabel>
              <Input
                {...PROFILE_PIN_INPUT_PROPS}
                id={newPinId}
                value={reset.newPin}
                onChange={(event) => reset.setNewPin(event.target.value)}
                disabled={reset.isSaving}
                required
              />
              <FieldDescription>{t("profile.pinHint")}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor={confirmPinId}>
                {t("profile.confirmPinLabel")}
              </FieldLabel>
              <Input
                {...PROFILE_PIN_INPUT_PROPS}
                id={confirmPinId}
                value={reset.confirmPin}
                onChange={(event) => reset.setConfirmPin(event.target.value)}
                disabled={reset.isSaving}
                required
              />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={reset.isSaving || !reset.hasChanges}
            >
              {reset.isSaving
                ? t("profile.updatingPin")
                : t("profile.changePin")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TenantAcademicPasswordPanel({
  fieldPrefix = "student-profile",
  organizationPersonId,
  password,
  passwordResetAccountScope = "withGuardianFallback",
  pin,
  slug,
}: {
  fieldPrefix?: string;
  organizationPersonId: Id<"organizationPeople">;
  password: PasswordCredentialState;
  passwordResetAccountScope?: PasswordResetAccountScope;
  pin: PinCredentialState;
  slug: string;
}) {
  const passwordReset = useTenantAcademicPasswordReset({
    accountScope: passwordResetAccountScope,
    fieldPrefix,
    organizationPersonId,
    slug,
  });
  const pinReset = useTenantAcademicPinReset({
    fieldPrefix,
    organizationPersonId,
    slug,
  });

  return (
    <>
      <div className="grid gap-3">
        <PasswordCredentialItem
          credential={password}
          onChangePassword={() => passwordReset.setOpen(true)}
        />
        <PinCredentialItem
          credential={pin}
          onChangePin={() => pinReset.setOpen(true)}
        />
      </div>

      <ChangePasswordDialog reset={passwordReset} />
      <ChangePinDialog reset={pinReset} />
    </>
  );
}
