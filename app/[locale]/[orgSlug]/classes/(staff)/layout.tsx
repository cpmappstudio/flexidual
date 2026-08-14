import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getRouteRole, isStaffRole } from "@/lib/rbac";

export default async function ClassesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; orgSlug: string }>;
}) {
  const { locale, orgSlug } = await params;
  const { sessionClaims } = await auth();

  if (!isStaffRole(getRouteRole(sessionClaims, orgSlug))) {
    redirect(`/${locale}/${orgSlug}`);
  }

  return children;
}
