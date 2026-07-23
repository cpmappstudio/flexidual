import type { AppLocale } from "@/i18n/routing";
import type { IntlMessagesSchema } from "@/i18n/messages.generated";

declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: IntlMessagesSchema;
  }
}
