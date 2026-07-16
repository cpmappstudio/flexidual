"use client";

import { useTranslations } from "next-intl";
import SettingsItem from "./settings-item";

export function NotificationSettings() {
  const t = useTranslations("Settings.notifications");

  return (
    <div className="flex flex-col gap-8">
      <SettingsItem
        title={t("email.title")}
        description={t("email.description")}
      >
        {/* TODO: Add email notification toggle */}
        <div className="text-sm text-muted-foreground">Coming soon</div>
      </SettingsItem>
      <SettingsItem
        title={t("push.title")}
        description={t("push.description")}
      >
        {/* TODO: Add push notification toggle */}
        <div className="text-sm text-muted-foreground">Coming soon</div>
      </SettingsItem>
    </div>
  );
}
