// ################################################################################
// # Check: 12/14/2025                                                            #
// ################################################################################

import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

import deepmerge from "deepmerge";

async function loadMessages(locale: string) {
  const modules = await Promise.all([
    import(`../messages/${locale}/common.json`),
    import(`../messages/${locale}/navigation.json`),
    import(`../messages/${locale}/settings.json`),
    import(`../messages/${locale}/forms.json`),
    import(`../messages/${locale}/admin.json`),
    import(`../messages/${locale}/preadmission.json`),
    import(`../messages/${locale}/applications.json`),
    import(`../messages/${locale}/programs.json`),
  ]);

  return deepmerge.all([
    { Common: modules[0].default },
    { Navigation: modules[1].default },
    { Settings: modules[2].default },
    { Forms: modules[3].default },
    { Admin: modules[4].default },
    { preadmission: modules[5].default },
    { Applications: modules[6].default },
    { Programs: modules[7].default },
  ]) as Record<string, unknown>;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
