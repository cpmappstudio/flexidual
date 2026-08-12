import { auth } from "@clerk/nextjs/server";
import { UserProfileSettings } from "@/components/settings/user-profile-settings";
import { getProfileSettingsAccess } from "@/lib/profile-settings-access";
import { getRouteRole, isSuperAdmin } from "@/lib/rbac";

export default async function UserProfileSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { sessionClaims } = await auth();
  const role = getRouteRole(sessionClaims, orgSlug);
  const access = getProfileSettingsAccess(role, isSuperAdmin(sessionClaims));

  return <UserProfileSettings access={access} />;
}
