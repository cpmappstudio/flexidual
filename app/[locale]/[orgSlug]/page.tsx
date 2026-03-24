import { auth } from "@clerk/nextjs/server";
import { getRoleForOrg, isSuperAdmin } from "@/lib/rbac";
import StudentHubPage from "@/components/dashboards/student-hub-page";
import TeachingDashboard from "@/components/dashboards/teaching-dashboard";
import AdminDashboard from "@/components/dashboards/admin-dashboard";

export default async function OrgDashboardPage({
  params,
}: {
  params: Promise<{ locale: string; orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { sessionClaims } = await auth();
  
  const effectiveOrgSlug = orgSlug === "admin" ? "system" : orgSlug;
  
  const role = getRoleForOrg(sessionClaims, effectiveOrgSlug);
  const superAdmin = isSuperAdmin(sessionClaims);

  // Serve the exact UI based on their context
  if (role === "student") {
    return <StudentHubPage />;
  }
  
  if (role === "teacher" || role === "tutor") {
    return <TeachingDashboard />;
  }

  if (role === "admin" || role === "superadmin" || role === "principal" || superAdmin) {
    return <AdminDashboard />;
  }

  return <div>Role pending or unauthorized.</div>;
}