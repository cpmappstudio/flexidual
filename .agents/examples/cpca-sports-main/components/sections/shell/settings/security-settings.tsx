"use client";

import { useTranslations } from "next-intl";
import { UserProfile } from "@clerk/nextjs";
import SettingsItem from "./settings-item";

export function SecuritySettings() {
  const tProfile = useTranslations("Settings.profile");
  const tSecurity = useTranslations("Settings.security");

  return (
    <div className="flex flex-col gap-4">
      <SettingsItem
        title={tProfile("title")}
        description={tProfile("description")}
      >
        <UserProfile />
      </SettingsItem>
      <SettingsItem
        title={tSecurity("title")}
        description={tSecurity("description")}
      >
        <UserProfile>
          <UserProfile.Page label="security" />
          <UserProfile.Page label="account" />
        </UserProfile>
      </SettingsItem>
    </div>
  );
}
