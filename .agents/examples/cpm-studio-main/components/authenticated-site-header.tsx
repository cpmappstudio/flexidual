import { getTranslations } from "next-intl/server";
import type { Preloaded } from "convex/react";
import type { ReactNode } from "react";
import IntlMessagesProvider from "@/components/i18n/intl-messages-provider";
import { api } from "@/convex/_generated/api";
import { SiteHeader } from "@/components/site-header";

type AuthenticatedSiteHeaderProps = {
  brandLabelMode?: "expanded" | "collapsed";
  logoHref: string;
  navigation?: Array<{
    label: string;
    href: string;
  }>;
  preloadedCurrentUser: Preloaded<typeof api.users.current>;
  tenantSlug?: string;
  workspaceLink?: {
    href: string;
    label: string;
    detail?: string;
  };
  signOutRedirectHref: string;
  showSidebarTrigger?: boolean;
  useLogoAsMobileSidebarTrigger?: boolean;
  switcher?: ReactNode;
};

export async function AuthenticatedSiteHeader({
  brandLabelMode,
  logoHref,
  navigation,
  preloadedCurrentUser,
  tenantSlug,
  workspaceLink,
  signOutRedirectHref,
  showSidebarTrigger,
  useLogoAsMobileSidebarTrigger,
  switcher,
}: AuthenticatedSiteHeaderProps) {
  const t = await getTranslations("Common");

  return (
    <IntlMessagesProvider namespaces={["Common", "ProfileSettings"]}>
      <SiteHeader
        brandLabelMode={brandLabelMode}
        appName={t("appName")}
        logoHref={logoHref}
        navigation={navigation}
        preloadedCurrentUser={preloadedCurrentUser}
        tenantSlug={tenantSlug}
        workspaceLink={workspaceLink}
        signOutRedirectHref={signOutRedirectHref}
        showSidebarTrigger={showSidebarTrigger}
        useLogoAsMobileSidebarTrigger={useLogoAsMobileSidebarTrigger}
        switcher={switcher}
      />
    </IntlMessagesProvider>
  );
}
