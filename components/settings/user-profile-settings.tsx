"use client";

import { UserProfile } from "@clerk/nextjs";
import { useTranslations } from "next-intl";

export function UserProfileSettings() {
  const t = useTranslations("settings.profileSettings");

  return (
    <section className="grid gap-3">
      <h2 className="border-b pb-3 text-xl font-semibold">{t("title")}</h2>
      <UserProfile
        appearance={{
          elements: {
            rootBox: "w-full",
            cardBox: "w-full",
          },
        }}
      >
        <UserProfile.Page label="account" />
        <UserProfile.Page label="security" />
      </UserProfile>
    </section>
  );
}
