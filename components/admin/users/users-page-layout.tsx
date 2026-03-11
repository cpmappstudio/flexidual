"use client";

import { useTranslations } from "next-intl";
import { UsersTable } from "@/components/admin/users/users-table";
import FlexidualHeader from "@/components/flexidual-header";

export default function UsersPageLayout() {
  const t = useTranslations();

  return (
    <>
      <FlexidualHeader
        title={t("navigation.users")}
        subtitle={t("dashboard.usersSummary")}
      />
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        <UsersTable />
      </div>
    </>
  );
}
