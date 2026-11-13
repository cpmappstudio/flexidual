import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import AdminDashboard from "@/components/dashboards/admin-dashboard";
import { api } from "@/convex/_generated/api";
import { isValidTimeZone, todayInTimeZone } from "@/lib/time-zone";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string; orgSlug: string }>;
}) {
  const { locale, orgSlug } = await params;
  const home = `/${locale}/${orgSlug}`;
  const { userId, getToken } = await auth();
  if (!userId) redirect(`/${locale}/sign-in`);
  if (orgSlug === "system" || orgSlug === "admin") redirect(home);

  const token = await getToken({ template: "convex" });
  if (!token) redirect(home);
  const options = { token };
  const access = await fetchQuery(
    api.organizations.getStaffContext,
    { orgSlug },
    options,
  );
  if (!access?.canViewPeople) redirect(home);

  const [settings, scope] = await Promise.all([
    fetchQuery(api.organizations.getSettingsContext, { orgSlug }, options),
    fetchQuery(api.organizations.resolveSlug, { slug: orgSlug }, options),
  ]);
  if (!settings || !scope || scope.type === "system") redirect(home);

  const { timeZone, _id: schoolId } = settings.institution;
  const institutionTimeZone =
    timeZone && isValidTimeZone(timeZone) ? timeZone : null;
  return (
    <AdminDashboard
      key={orgSlug}
      schoolId={schoolId}
      campusId={scope.type === "campus" ? scope._id : undefined}
      today={institutionTimeZone ? todayInTimeZone(institutionTimeZone) : null}
      timeZone={institutionTimeZone}
    />
  );
}
