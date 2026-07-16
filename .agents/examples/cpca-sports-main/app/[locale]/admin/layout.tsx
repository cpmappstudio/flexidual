import { StackedLayout } from "@/components/layouts/stacked-layout";
import {
  NavbarAdminNavbar,
  SidebarAdminNavbar,
} from "@/components/sections/shell/admin/admin-navbar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StackedLayout
      fullWidth={false}
      navbar={<NavbarAdminNavbar />}
      sidebar={<SidebarAdminNavbar />}
    >
      {children}
    </StackedLayout>
  );
}
