import { defineRouting } from "next-intl/routing";

export const locales = ["en", "es"] as const;
export type AppLocale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "en",
});
