import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getRouteRole } from "@/lib/rbac";
import StudentHubPage from "@/components/dashboards/student-hub-page";

export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ locale: string; orgSlug: string }>;
}) {
  const { locale, orgSlug } = await params;
  const { sessionClaims, userId } = await auth();
  if (!userId) redirect(`/${locale}/sign-in`);
  if (getRouteRole(sessionClaims, orgSlug) === "student") {
    return <StudentHubPage />;
  }
  redirect(`/${locale}/${orgSlug}/catalog`);
}
