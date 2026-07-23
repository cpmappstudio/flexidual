import { auth } from "@clerk/nextjs/server";
import { getRouteRole, isSuperAdmin } from "@/lib/rbac";
import { RoleDashboard } from "@/components/dashboards/role-dashboard";

export default async function OrgDashboardPage({
  params,
}: {
  params: Promise<{ locale: string; orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { sessionClaims } = await auth();

  const role = getRouteRole(sessionClaims, orgSlug);
  const superAdmin = isSuperAdmin(sessionClaims);

  // Serve the exact UI based on their context
  if (role === "student") {
    return <RoleDashboard student />;
  }

  if (
    role === "admin" ||
    role === "superadmin" ||
    role === "principal" ||
    role === "teacher" ||
    role === "tutor" ||
    superAdmin
  ) {
    return <RoleDashboard student={false} />;
  }

  return <div>Role pending or unauthorized.</div>;
}
