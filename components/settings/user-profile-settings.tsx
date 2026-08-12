"use client";

import { UserProfile } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import type { ProfileSettingsAccess } from "@/lib/profile-settings-access";

const emailReadOnlyElements = {
  profileSectionPrimaryButton__emailAddresses: "hidden",
  profileSectionPrimaryButton__connectedAccounts: "hidden",
  menuButton__emailAddresses: "hidden",
  menuButton__connectedAccounts: "hidden",
  profileSection__danger: "hidden",
} as const;

const readOnlyProfileElements = {
  avatarImageActions: "hidden",
  profileSectionPrimaryButton__profile: "hidden",
  profileSectionPrimaryButton__username: "hidden",
  profileSectionPrimaryButton__phoneNumbers: "hidden",
  profileSectionPrimaryButton__enterpriseAccounts: "hidden",
  profileSectionPrimaryButton__web3Wallets: "hidden",
  menuButton__phoneNumbers: "hidden",
  menuButton__enterpriseAccounts: "hidden",
  menuButton__web3Wallets: "hidden",
  ...emailReadOnlyElements,
} as const;

const passwordOnlySecurityElements = {
  profileSection__passkeys: "hidden",
  profileSection__mfa: "hidden",
  profileSection__activeDevices: "hidden",
} as const;

function getRestrictedElements(access: ProfileSettingsAccess) {
  if (access === "full") return {};
  if (access === "profile-without-email") return emailReadOnlyElements;
  if (access === "security-only") return readOnlyProfileElements;

  return {
    ...readOnlyProfileElements,
    ...passwordOnlySecurityElements,
  };
}

export function UserProfileSettings({
  access,
}: {
  access: ProfileSettingsAccess;
}) {
  const t = useTranslations("settings.profileSettings");
  const appearance = {
    elements: {
      rootBox: "w-full",
      cardBox: "w-full",
      ...getRestrictedElements(access),
    },
  } as const;

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-3">
        <h2 className="border-b pb-3 text-xl font-semibold">
          {t("profileTitle")}
        </h2>
        <UserProfile appearance={appearance} />
      </section>

      <section className="grid gap-3">
        <h2 className="border-b pb-3 text-xl font-semibold">
          {t("securityTitle")}
        </h2>
        <UserProfile appearance={appearance}>
          <UserProfile.Page label="security" />
          <UserProfile.Page label="account" />
        </UserProfile>
      </section>
    </div>
  );
}
