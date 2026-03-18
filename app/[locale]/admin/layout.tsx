import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/rbac";
import { setupLocale } from '@/lib/locale-setup';
import { AppSidebar } from "@/components/app-sidebar";
import { DynamicBreadcrumb } from "@/components/dynamic-breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSchoolFilterProvider } from "@/components/providers/admin-school-filter-provider";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await setupLocale(params);

  const { sessionClaims, userId } = await auth();
  if (!userId) redirect(`/${locale}/sign-in`);

  // STRICTLY SUPERADMIN ONLY
  if (!isSuperAdmin(sessionClaims)) {
    redirect(`/${locale}`);
  }

  return (
    <AdminSchoolFilterProvider>
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
    </AdminSchoolFilterProvider>
  );
}