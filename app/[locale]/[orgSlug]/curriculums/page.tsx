"use client";

import { useTranslations } from "next-intl";
import { CurriculumsTable } from "@/components/teaching/curriculums/curriculums-table";
import FlexidualHeader from "@/components/flexidual-header";

export default function CurriculumsPage() {
  const t = useTranslations();

  return (
    <>
      <FlexidualHeader
        title={t("navigation.curriculums")}
        subtitle={t("navigation.curriculumsDescription")}
      />
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        <CurriculumsTable />
      </div>
    </>
  );
}