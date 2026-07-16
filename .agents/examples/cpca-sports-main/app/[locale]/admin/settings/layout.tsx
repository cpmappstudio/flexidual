import { SettingsLayout } from "@/components/layouts/settings-layout";

export default function AdminSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SettingsLayout context="admin">{children}</SettingsLayout>;
}
