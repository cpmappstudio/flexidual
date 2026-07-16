import {
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarSection,
  SidebarSpacer,
} from "@/components/ui/sidebar";
import { OrganizationSwitcherSkeleton } from "./organization-switcher-skeleton";
import { UserButtonSkeleton } from "./user-button-skeleton";
import { SidebarItemSkeleton } from "./sidebar-item-skeleton";

export function SidebarSkeleton() {
  return (
    <Sidebar>
      <SidebarHeader>
        <OrganizationSwitcherSkeleton />
      </SidebarHeader>
      <SidebarBody>
        <SidebarSection>
          {Array.from({ length: 4 }).map((_, i) => (
            <SidebarItemSkeleton key={i} />
          ))}
        </SidebarSection>
        <SidebarSpacer />

        <SidebarSection>
          <SidebarItemSkeleton />
        </SidebarSection>
      </SidebarBody>
      <SidebarFooter className="max-lg:hidden">
        <UserButtonSkeleton />
      </SidebarFooter>
    </Sidebar>
  );
}
