import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getRouteRole, isSuperAdmin } from "@/lib/rbac";
import { setupLocale } from "@/lib/locale-setup";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ConvexAuthBoundary } from "@/components/convex-auth-boundary";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; orgSlug: string }>;
}) {
  const { locale, orgSlug } = await params;
  await setupLocale(params);

  const { sessionClaims, userId } = await auth();
  if (!userId) redirect(`/${locale}/sign-in`);

  const role = getRouteRole(sessionClaims, orgSlug);
  const superAdmin = isSuperAdmin(sessionClaims);

  if (!role && !superAdmin) {
    redirect(`/${locale}`);
  }

  return (
    <ConvexAuthBoundary>
      <SidebarProvider open className="flex-col [--header-height:4rem]">
        <SiteHeader />
        <div className="flex min-h-0 flex-1">
          <AppSidebar />
          <SidebarInset>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-4 has-[[data-classroom-layout]]:gap-0 has-[[data-classroom-layout]]:p-0">
              {children}
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </ConvexAuthBoundary>
  );
}
