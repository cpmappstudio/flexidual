import type { ReactNode } from "react";
import type { Preloaded } from "convex/react";
import { AuthenticatedSiteHeader } from "@/components/authenticated-site-header";
import { PAGE_CONTENT_CONTAINER_CLASS_NAME } from "@/components/layout/page-content-container";
import { SidebarProvider } from "@/components/ui/sidebar";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

const DEFAULT_CONTENT_CLASS_NAME = PAGE_CONTENT_CONTAINER_CLASS_NAME;

type TenantShellFrameProps = {
  children: ReactNode;
  contentClassName?: string;
  header: {
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
    switcher?: ReactNode;
    useLogoAsMobileSidebarTrigger?: boolean;
  };
  sidebar?: ReactNode;
};

export function TenantShellFrame({
  children,
  contentClassName = DEFAULT_CONTENT_CLASS_NAME,
  header,
  sidebar,
}: TenantShellFrameProps) {
  const content = (
    <>
      <AuthenticatedSiteHeader
        {...header}
        useLogoAsMobileSidebarTrigger={
          header.useLogoAsMobileSidebarTrigger ?? Boolean(sidebar)
        }
      />
      <main className={cn("w-full", contentClassName)}>
        {sidebar}
        {children}
      </main>
    </>
  );

  if (!sidebar && !header.useLogoAsMobileSidebarTrigger) {
    return content;
  }

  return <SidebarProvider className="flex-col">{content}</SidebarProvider>;
}
