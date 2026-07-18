import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getRoleForOrg, isSuperAdmin } from "@/lib/rbac";
import { setupLocale } from '@/lib/locale-setup';
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AdminSchoolFilterProvider } from "@/components/providers/admin-school-filter-provider";

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

  const effectiveOrgSlug = orgSlug === "admin" ? "system" : orgSlug;

  const role = getRoleForOrg(sessionClaims, effectiveOrgSlug);
  const superAdmin = isSuperAdmin(sessionClaims);

  if (!role && !superAdmin) {
    redirect(`/${locale}`);
  }

  // THE ADAPTIVE SHELL:
  // Students get a raw container because their page component handles its own UI
  if (role === "student") {
    return <div className="student-app-wrapper">{children}</div>;
  }

  // Teachers, Admins, and Principals get the standard dashboard shell
  return (
    <AdminSchoolFilterProvider>
      <SidebarProvider open className="flex-col [--header-height:4rem]">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset>
            <div className="flex flex-1 flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
              {children}
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AdminSchoolFilterProvider>
  );
}
