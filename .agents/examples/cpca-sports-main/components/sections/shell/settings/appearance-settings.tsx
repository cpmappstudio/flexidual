"use client";

import { useTranslations } from "next-intl";
import SettingsItem from "./settings-item";
import { ThemeSelector } from "./theme-selector";
import { LangToggle } from "@/components/ui/lang-toggle";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";

export function AppearanceSettings() {
  const t = useTranslations("Settings.appearance");

  return (
    <div className="flex flex-col gap-8">
      <SettingsItem
        title={t("theme.title")}
        description={t("theme.description")}
      >
        {/*<ModeToggle />*/}
        <ThemeSwitcher />
      </SettingsItem>
      <SettingsItem
        title={t("colorScheme.title")}
        description={t("colorScheme.description")}
      >
        <ThemeSelector />
      </SettingsItem>
      <SettingsItem
        title={t("language.title")}
        description={t("language.description")}
      >
        <LangToggle showText />
      </SettingsItem>
    </div>
  );
}
