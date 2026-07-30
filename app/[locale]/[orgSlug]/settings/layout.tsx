import { SettingsLayout } from "@/components/settings/settings-layout";

export default function OrgSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SettingsLayout>{children}</SettingsLayout>;
}
