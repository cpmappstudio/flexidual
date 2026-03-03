import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getRoleForOrg, isSuperAdmin } from "@/lib/rbac";
import { setupLocale } from '@/lib/locale-setup';
import { AppSidebar } from "@/components/app-sidebar";
import { DynamicBreadcrumb } from "@/components/dynamic-breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

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

  const role = getRoleForOrg(sessionClaims, orgSlug);
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
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <DynamicBreadcrumb />
          </div>
        </header>
        <div className="flex flex-1 flex-col px-2 gap-4 md:p-4 md:px-12 pt-0">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}