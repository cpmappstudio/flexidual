"use client";

import { StudentIcon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TenantSelectionLayout } from "@/components/tenant/tenant-selection-layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { getErrorCode } from "@/lib/convex-errors";
import { getInitials, getOptionalImageSrc } from "@/lib/files/image";
import { TENANT_ACCOUNT_TYPE_SOLID_TONE_CLASS_NAMES } from "@/lib/people/account-type-theme";
import {
  PROFILE_PIN_INPUT_PROPS,
  isCompleteProfilePin,
} from "@/lib/people/profile-pin";
import {
  getChildProfileCookieValue,
  getGuardianProfileCookieValue,
  setActiveProfileCookieValue,
} from "@/lib/tenancy/profile-selection";
import type {
  TenantProfileSelection,
  TenantSelectableGuardianProfile,
  TenantSelectableProfile,
} from "@/lib/tenancy/profile-selection-types";
import { cn } from "@/lib/utils";

type TenantProfileSelectorOrganization = {
  imageUrl: string | null;
  name: string;
};

function getProfileCookieValue(profile: TenantSelectableProfile) {
  return profile.kind === "guardian"
    ? getGuardianProfileCookieValue()
    : getChildProfileCookieValue(profile.person._id);
}

function ProfileTile({
  label,
  profile,
  onSelect,
}: {
  label: string;
  profile: TenantSelectableProfile;
  onSelect: (profile: TenantSelectableProfile) => void;
}) {
  const accountType = profile.kind === "guardian" ? "guardian" : "self";
  const fallback = profile.kind === "guardian" ? "GU" : "ST";
  const Icon = profile.kind === "guardian" ? UserGroupIcon : StudentIcon;

  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "group flex min-w-0 flex-col items-center gap-4 rounded-3xl p-3",
        "transition-transform duration-200 hover:-translate-y-1 focus-visible:outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4",
        "focus-visible:ring-offset-background",
      )}
      onClick={() => onSelect(profile)}
    >
      <span className="relative block">
        <Avatar className="size-32 rounded-[2rem] border border-border/70 bg-card shadow-sm transition-[border-color,box-shadow] duration-200 group-hover:border-foreground/30 group-hover:shadow-xl md:size-40">
          <AvatarImage
            src={getOptionalImageSrc(profile.person.avatarUrl)}
            alt={profile.person.name}
            className="rounded-[2rem] object-cover"
          />
          <AvatarFallback className="rounded-[2rem] bg-gradient-to-br from-muted to-background text-3xl font-semibold text-foreground md:text-4xl">
            {getInitials(profile.person.name, fallback)}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "absolute -right-2 -bottom-2 grid size-10 place-items-center rounded-2xl border shadow-sm transition-transform duration-200 group-hover:scale-105",
            TENANT_ACCOUNT_TYPE_SOLID_TONE_CLASS_NAMES[accountType],
          )}
        >
          <HugeiconsIcon
            icon={Icon}
            strokeWidth={2}
            className="size-5"
            aria-hidden="true"
          />
        </span>
      </span>
      <span className="line-clamp-2 max-w-40 text-center text-lg font-semibold text-foreground">
        {profile.person.name}
      </span>
    </button>
  );
}

export function TenantProfileSelector({
  nextHref,
  organization,
  selection,
  slug,
}: {
  nextHref: string;
  organization: TenantProfileSelectorOrganization;
  selection: TenantProfileSelection;
  slug: string;
}) {
  const { replace } = useRouter();
  const t = useTranslations("TenantProfileSelection");
  const verifyGuardianPin = useMutation(
    api.platform.people.verifyCurrentGuardianProfilePin,
  );
  const [pinProfile, setPinProfile] =
    useState<TenantSelectableGuardianProfile | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const profiles = [
    ...(selection.guardian ? [selection.guardian] : []),
    ...selection.children,
  ];

  function getPinErrorMessage(error: unknown) {
    const code = getErrorCode(error);

    if (code === "PROFILE_PIN_INVALID") {
      return t("pinDialog.errors.invalid");
    }

    if (code === "PROFILE_PIN_LOCKED") {
      return t("pinDialog.errors.locked");
    }

    if (code === "PROFILE_PIN_INVALID_FORMAT") {
      return t("pinDialog.errors.invalidFormat");
    }

    return t("pinDialog.errors.generic");
  }

  function resetPinDialog() {
    setPinProfile(null);
    setPin("");
    setPinError(null);
    setIsVerifyingPin(false);
  }

  function completeSelection(profile: TenantSelectableProfile) {
    setActiveProfileCookieValue(getProfileCookieValue(profile));
    replace(nextHref);
  }

  function handleSelect(profile: TenantSelectableProfile) {
    if (profile.kind === "guardian" && profile.pinRequired) {
      setPinProfile(profile);
      setPin("");
      setPinError(null);
      return;
    }

    completeSelection(profile);
  }

  async function handlePinSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!pinProfile || isVerifyingPin) {
      return;
    }

    setIsVerifyingPin(true);
    setPinError(null);

    try {
      await verifyGuardianPin({
        slug,
        pin,
      });
      completeSelection(pinProfile);
    } catch (error) {
      setPinError(getPinErrorMessage(error));
      setIsVerifyingPin(false);
    }
  }

  return (
    <>
      <main className="relative isolate flex min-h-svh items-center justify-center overflow-hidden bg-background px-6 py-12 text-foreground">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent_32%),radial-gradient(circle_at_80%_10%,color-mix(in_oklch,var(--muted-foreground)_12%,transparent),transparent_28%),linear-gradient(180deg,var(--background),var(--muted))]"
        />
        <TenantSelectionLayout
          className="w-full max-w-6xl"
          organizationName={organization.name}
          organizationImageUrl={organization.imageUrl}
          title={t("title")}
          gridClassName="gap-6"
        >
          {profiles.map((profile) => (
            <ProfileTile
              key={profile.person._id}
              label={t("profileLabel", {
                name: profile.person.name,
                type:
                  profile.kind === "guardian"
                    ? t("profileTypes.guardian")
                    : t("profileTypes.student"),
              })}
              profile={profile}
              onSelect={handleSelect}
            />
          ))}
        </TenantSelectionLayout>
      </main>

      <Dialog
        open={pinProfile !== null}
        onOpenChange={(open) => {
          if (!open) {
            resetPinDialog();
          }
        }}
      >
        <DialogContent className="max-w-sm rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle>{t("pinDialog.title")}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handlePinSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="guardian-profile-pin">
                  {t("pinDialog.pinLabel")}
                </FieldLabel>
                <Input
                  {...PROFILE_PIN_INPUT_PROPS}
                  id="guardian-profile-pin"
                  value={pin}
                  onChange={(event) => {
                    setPin(event.target.value);
                    setPinError(null);
                  }}
                  disabled={isVerifyingPin}
                  required
                />
                <FieldDescription>{t("pinDialog.pinHint")}</FieldDescription>
                {pinError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {pinError}
                  </p>
                ) : null}
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type="submit"
                disabled={isVerifyingPin || !isCompleteProfilePin(pin)}
              >
                {isVerifyingPin
                  ? t("pinDialog.unlocking")
                  : t("pinDialog.unlock")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
