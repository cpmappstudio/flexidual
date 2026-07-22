import { auth } from "@clerk/nextjs/server";
import { AccountMenu } from "@/components/account-menu";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { FlexidualLogo } from "@/components/ui/flexidual-logo";
import { getRoleForOrg } from "@/lib/rbac";

export default async function OrgSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { sessionClaims } = await auth();
  const content = <SettingsLayout>{children}</SettingsLayout>;

  if (getRoleForOrg(sessionClaims, orgSlug) !== "student") return content;

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-16 items-center border-b px-4 sm:px-6">
        <FlexidualLogo className="h-10" />
        <div className="ml-auto">
          <AccountMenu />
        </div>
      </header>
      <main className="p-4 sm:p-6">{content}</main>
    </div>
  );
}
