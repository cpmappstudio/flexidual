import { auth } from "@clerk/nextjs/server";
import {
  SidebarAppSidebar,
  NavbarAppSidebar,
} from "@/components/sections/shell/organizations/app-sidebar";
import { SidebarLayout } from "@/components/layouts/sidebar-layout";
import { OrgMismatchError } from "@/components/sections/shell/organizations/org-mismatch-error";
import { getTenantAccess } from "@/lib/auth/tenant-access";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}

export default async function OrgLayout({ children, params }: LayoutProps) {
  const { tenant } = await params;
  const { orgSlug } = await auth();
  const tenantAccess = await getTenantAccess(tenant);

  // Handle active-org lag after sign-in by falling back to membership check.
  // If user still has no access to this tenant, show the mismatch resolver.
  if (orgSlug !== tenant) {
    if (!tenantAccess.hasAccess) {
      return <OrgMismatchError urlSlug={tenant} />;
    }
  }

  return (
    <SidebarLayout
      fullWidth
      navbar={<NavbarAppSidebar />}
      sidebar={<SidebarAppSidebar isTenantAdmin={tenantAccess.isAdmin} />}
    >
      <main className="flex-1">{children}</main>
    </SidebarLayout>
  );
}
