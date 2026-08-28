"use client";

import * as React from "react";
import { CourseChatsNav } from "@/components/chat/course-chats-nav";
import { NavMain } from "@/components/nav-main";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrgBasePath } from "@/hooks/use-org-base-path";
import { LayoutGrid, MessageCircle } from "lucide-react";
import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

type SidebarWorkspaceTab = "navigation" | "chats";

const workspaceTabTriggerClassName =
  "relative h-full min-w-0 rounded-none px-3 text-sm font-medium text-muted-foreground shadow-none hover:bg-muted/60 hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-transparent data-[state=active]:after:bg-secondary group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:data-[state=active]:text-sidebar-accent-foreground group-data-[collapsible=icon]:after:hidden group-data-[collapsible=icon]:before:pointer-events-none group-data-[collapsible=icon]:before:absolute group-data-[collapsible=icon]:before:inset-y-0 group-data-[collapsible=icon]:before:left-0 group-data-[collapsible=icon]:before:w-0.5 group-data-[collapsible=icon]:before:bg-transparent group-data-[collapsible=icon]:data-[state=active]:before:bg-secondary";

export function SidebarWorkspace() {
  const t = useTranslations("navigation");
  const pathname = usePathname();
  const basePath = useOrgBasePath();
  const isChatRoute = pathname.startsWith(`${basePath}/chats/`);
  const [activeTab, setActiveTab] = React.useState<SidebarWorkspaceTab>(
    isChatRoute ? "chats" : "navigation",
  );

  React.useEffect(() => {
    setActiveTab(isChatRoute ? "chats" : "navigation");
  }, [isChatRoute]);

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as SidebarWorkspaceTab)}
      className="h-full min-h-0 gap-0"
    >
      <TabsList className="h-12 w-auto shrink-0 justify-start rounded-none border-b border-sidebar-border bg-transparent p-0 text-sidebar-foreground group-data-[collapsible=icon]:mx-0 group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:flex-col">
        <TabsTrigger
          value="navigation"
          aria-label={t("browse")}
          title={t("browse")}
          className={workspaceTabTriggerClassName}
        >
          <LayoutGrid className="size-4 group-data-[collapsible=icon]:size-5" />
          <span className="group-data-[collapsible=icon]:hidden">
            {t("browse")}
          </span>
        </TabsTrigger>
        <TabsTrigger
          value="chats"
          aria-label={t("chats")}
          title={t("chats")}
          className={workspaceTabTriggerClassName}
        >
          <MessageCircle className="size-4 group-data-[collapsible=icon]:size-5" />
          <span className="group-data-[collapsible=icon]:hidden">
            {t("chats")}
          </span>
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="navigation"
        className="m-0 min-h-0 flex-1 overflow-y-auto data-[state=inactive]:hidden"
      >
        <NavMain />
      </TabsContent>
      <TabsContent
        value="chats"
        className="m-0 min-h-0 flex-1 overflow-y-auto data-[state=inactive]:hidden"
      >
        <CourseChatsNav />
      </TabsContent>
    </Tabs>
  );
}
