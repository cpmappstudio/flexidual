"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { CurriculumsTable } from "@/components/teaching/curriculums/curriculums-table";
import { useSettingsContext } from "@/hooks/use-settings-context";
import { TableResultCount } from "@/components/table/table-result-count";

export function CurriculumsSettings() {
  const t = useTranslations("settings.curriculums");
  const { context, isLoading } = useSettingsContext();
  const [visibleCount, setVisibleCount] = React.useState<number | null>(null);

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

  return (
    <section className="grid gap-3">
      <h2 className="border-b pb-3 text-xl font-semibold">
        {t("title")} — {context.institution.name}
        <TableResultCount count={visibleCount} />
      </h2>
      <CurriculumsTable
        schoolId={context.institution._id}
        readOnly={!context.canManageInstitution}
        onFilteredRowCountChange={setVisibleCount}
      />
    </section>
  );
}
