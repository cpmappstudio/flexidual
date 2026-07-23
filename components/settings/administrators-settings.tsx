"use client";

import { useTranslations } from "next-intl";
import { UsersTable } from "@/components/admin/users/users-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettingsContext } from "@/hooks/use-settings-context";

export function AdministratorsSettings() {
  const t = useTranslations("settings.administrators");
  const { context, isLoading } = useSettingsContext();

  if (isLoading) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }

  if (!context?.canViewInstitutionSettings) {
    return (
      <section>
        <h2 className="border-b pb-3 text-xl font-semibold">
          {t("unavailable")}
        </h2>
      </section>
    );
  }

  const institutionScope = {
    orgType: "school" as const,
    orgId: context.institution._id,
  };

  return (
    <section className="grid gap-3">
      <h2 className="border-b pb-3 text-xl font-semibold">
        {t("title")} — {context.institution.name}
      </h2>
      <Tabs defaultValue="principals">
        <TabsList>
          <TabsTrigger value="principals">{t("principals")}</TabsTrigger>
          <TabsTrigger value="admins">{t("admins")}</TabsTrigger>
        </TabsList>
        <TabsContent value="principals" className="mt-4">
          <UsersTable
            roleFilter="principal"
            allowedRoles={["principal"]}
            scope={institutionScope}
            requireCampusSelection
            hideRole
            readOnly={!context.canManageInstitution}
          />
        </TabsContent>
        <TabsContent value="admins" className="mt-4">
          <UsersTable
            roleFilter="admin"
            allowedRoles={["admin"]}
            scope={institutionScope}
            hideRole
            readOnly={!context.canManageInstitution}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
