"use client";

import { UserProfile } from "@clerk/nextjs";
import { useTranslations } from "next-intl";

const readOnlyAccountElements = {
  avatarImageActions: "hidden",
  profileSectionPrimaryButton__profile: "hidden",
  profileSectionPrimaryButton__username: "hidden",
  profileSectionPrimaryButton__emailAddresses: "hidden",
  profileSectionPrimaryButton__phoneNumbers: "hidden",
  profileSectionPrimaryButton__connectedAccounts: "hidden",
  profileSectionPrimaryButton__enterpriseAccounts: "hidden",
  profileSectionPrimaryButton__web3Wallets: "hidden",
  menuButton__emailAddresses: "hidden",
  menuButton__phoneNumbers: "hidden",
  menuButton__connectedAccounts: "hidden",
  menuButton__enterpriseAccounts: "hidden",
  menuButton__web3Wallets: "hidden",
  profileSection__danger: "hidden",
} as const;

export function UserProfileSettings({
  canEditProfile,
}: {
  canEditProfile: boolean;
}) {
  const t = useTranslations("settings.profileSettings");

  return (
    <section className="grid gap-3">
      <h2 className="border-b pb-3 text-xl font-semibold">{t("title")}</h2>
      <UserProfile
        appearance={{
          elements: {
            rootBox: "w-full",
            cardBox: "w-full",
            ...(!canEditProfile && readOnlyAccountElements),
          },
        }}
      >
        <UserProfile.Page label="account" />
        <UserProfile.Page label="security" />
      </UserProfile>
    </section>
  );
}
