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
      <TabsList className="mx-2 mt-2 h-9 w-auto shrink-0 bg-sidebar-accent p-1 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:flex-col">
        <TabsTrigger
          value="navigation"
          aria-label={t("browse")}
          title={t("browse")}
          className="gap-2 data-[state=active]:bg-sidebar group-data-[collapsible=icon]:size-7 group-data-[collapsible=icon]:p-0"
        >
          <LayoutGrid />
          <span className="group-data-[collapsible=icon]:hidden">
            {t("browse")}
          </span>
        </TabsTrigger>
        <TabsTrigger
          value="chats"
          aria-label={t("chats")}
          title={t("chats")}
          className="gap-2 data-[state=active]:bg-sidebar group-data-[collapsible=icon]:size-7 group-data-[collapsible=icon]:p-0"
        >
          <MessageCircle />
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
