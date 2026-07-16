import { SettingsLayout } from "@/components/layouts/settings-layout";

export default async function TenantSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;

  return (
    <SettingsLayout context="org" orgSlug={tenant}>
      {children}
    </SettingsLayout>
  );
}
