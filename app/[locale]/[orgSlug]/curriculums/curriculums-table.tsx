"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CurriculumDialog } from "@/components/teaching/curriculums/curriculum-dialog";
import { Doc } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/table/data-table";
import {
  createSearchColumn,
  createSortableHeader,
} from "@/components/table/column-helpers";
import type { FilterConfig } from "@/lib/table/types";

export function CurriculumsTable() {
  const t = useTranslations();
  const data = useQuery(api.curriculums.list, { includeInactive: true });

  const [editingCurriculum, setEditingCurriculum] =
    useState<Doc<"curriculums"> | null>(null);

  const filterConfigs: FilterConfig[] = [
    {
      id: "isActive",
      label: t("common.status"),
      options: [
        { value: "true", label: t("common.active") },
        { value: "false", label: t("common.inactive") },
      ],
    },
  ];

  const curriculumHeader = (
    <>
      <span className="hidden lg:block">{t("common.title")}</span>
      <span className="lg:hidden">{t("curriculum.curriculum")}</span>
    </>
  );

  const columns: ColumnDef<Doc<"curriculums">, unknown>[] = [
    createSearchColumn<Doc<"curriculums">>(["title", "code"]),
    {
      accessorKey: "title",
      header: createSortableHeader(curriculumHeader),
      cell: ({ row }) => {
        const code = row.original.code as string;
        return (
          <div>
            <div className="font-medium">{row.getValue("title")}</div>
            {code && (
              <div className="lg:hidden">
                <span className="font-mono">{t("common.code")}:</span>
                <span className="text-muted-foreground">
                  {code || "-"}
                </span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "code",
      header: createSortableHeader(t("common.code")),
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }) => {
        const code = row.getValue("code") as string;
        return code ? <span>{code}</span> : <span>-</span>;
      },
    },
    {
      accessorKey: "isActive",
      header: createSortableHeader(t("common.status")),
      filterFn: (row, id, filterValues: string[]) => {
        return filterValues.includes(String(row.getValue(id)));
      },
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "active" : "inactive"}>
          {row.original.isActive ? t("common.active") : t("common.inactive")}
        </Badge>
      ),
    },
  ];

  if (!data) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-4">
      {editingCurriculum && (
        <CurriculumDialog
          curriculum={editingCurriculum}
          open={true}
          onOpenChange={(open) => !open && setEditingCurriculum(null)}
          trigger={<span className="hidden" />}
        />
      )}

      <DataTable
        data={data}
        columns={columns}
        filterColumn="search"
        filterPlaceholder={t("common.searchByName")}
        emptyMessage={t("common.noResults")}
        filterConfigs={filterConfigs}
        createAction={<CurriculumDialog />}
        pageSize={10}
        onRowClick={(curriculum) => setEditingCurriculum(curriculum)}
      />
    </div>
  );
}
