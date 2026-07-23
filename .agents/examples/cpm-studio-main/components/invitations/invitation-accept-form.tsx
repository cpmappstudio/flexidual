"use client";

import { FormEvent, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ImageCropDialog } from "@/components/files/image-crop-dialog";
import type { InvitationAuthProviderId } from "@/components/invitations/use-invitation-accept";
import { useInvitationAccept } from "@/components/invitations/use-invitation-accept";
import { ProfileIdentityFields } from "@/components/profile/profile-identity-fields";
import type { ProfileAvatarDraftSubject } from "@/components/profile/types";
import { useProfileAvatarDraft } from "@/components/profile/use-profile-avatar-draft";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getImageFallbackLabel } from "@/lib/files/image";

export function InvitationAcceptForm({
  authProviderId,
  description,
  email,
  inviteToken,
  signInHref,
  successHref,
}: {
  authProviderId: InvitationAuthProviderId;
  description: string;
  email: string;
  inviteToken: string;
  signInHref: string;
  successHref: string;
}) {
  const t = useTranslations("Invite");
  const commonT = useTranslations("Common");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const avatarDraftSubject: ProfileAvatarDraftSubject = {
    firstName,
    lastName,
    name: [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || undefined,
    email,
    image: undefined,
    avatarUrl: null,
    hasUploadedAvatar: false,
  };
  const {
    selectedAvatarFile,
    avatarCropSourceUrl,
    avatarCropFileName,
    shouldRemoveAvatar,
    displayedAvatarUrl,
    canRemoveAvatar,
    handleSelectAvatarFile,
    handleCancelAvatarCrop,
    handleConfirmAvatarCrop,
    handleRemoveAvatar,
    clearAvatarDraft,
  } = useProfileAvatarDraft(avatarDraftSubject);
  const { acceptInvitation, error, isSubmitting } = useInvitationAccept({
    authProviderId,
    clearAvatarDraft,
    email,
    inviteToken,
    successHref,
  });
  const normalizedFirstName = firstName.trim();
  const normalizedLastName = lastName.trim();
  const avatarAlt =
    [normalizedFirstName, normalizedLastName].filter(Boolean).join(" ") ||
    email ||
    "User";
  const avatarFallback = getImageFallbackLabel({
    firstName,
    lastName,
    email,
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await acceptInvitation({
      firstName,
      lastName,
      password,
      selectedAvatarFile,
      shouldRemoveAvatar,
    });
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t("acceptInviteTitle")}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <ProfileIdentityFields
              avatarUrl={displayedAvatarUrl}
              avatarAlt={avatarAlt}
              avatarFallback={avatarFallback}
              isSaving={isSubmitting || !!avatarCropSourceUrl}
              canRemoveAvatar={canRemoveAvatar}
              onSelectAvatarFile={handleSelectAvatarFile}
              onRemoveAvatar={handleRemoveAvatar}
              firstName={firstName}
              lastName={lastName}
              onFirstNameChange={setFirstName}
              onLastNameChange={setLastName}
              firstNameId="invite-first-name"
              lastNameId="invite-last-name"
              firstNameLabel={commonT("identity.firstNameLabel")}
              lastNameLabel={commonT("identity.lastNameLabel")}
              firstNamePlaceholder={commonT("identity.firstNamePlaceholder")}
              lastNamePlaceholder={commonT("identity.lastNamePlaceholder")}
            />
            <Field data-disabled>
              <FieldLabel htmlFor="invite-email">{t("emailLabel")}</FieldLabel>
              <Input
                id="invite-email"
                name="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                disabled
                readOnly
              />
              <FieldDescription>{t("emailDescription")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-password">{t("passwordLabel")}</FieldLabel>
              <Input
                id="invite-password"
                name="password"
                type="password"
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("passwordPlaceholder")}
                required
                minLength={8}
                disabled={isSubmitting}
              />
              <FieldDescription>{t("passwordHint")}</FieldDescription>
            </Field>
            <Field>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? t("acceptInviteSubmitting") : t("acceptInviteSubmit")}
              </Button>
            </Field>
          </FieldGroup>
        </form>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          {t("alreadyHaveAccount")}{" "}
          <Link href={signInHref} className="font-medium text-foreground underline">
            {t("signInInstead")}
          </Link>
        </div>

        {error ? (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>

      <ImageCropDialog
        open={!!avatarCropSourceUrl}
        src={avatarCropSourceUrl}
        fileName={avatarCropFileName}
        onCancel={handleCancelAvatarCrop}
        onConfirm={handleConfirmAvatarCrop}
      />
    </Card>
  );
}
