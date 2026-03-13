"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParams } from "next/navigation";
import { Building2 } from "lucide-react";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CurriculumDialog } from "@/components/teaching/curriculums/curriculum-dialog";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/table/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createSearchColumn, createSortableHeader } from "@/components/table/column-helpers";
import type { FilterConfig } from "@/lib/table/types";

export function CurriculumsTable() {
  const t = useTranslations();
  const params = useParams();
  
  const orgSlug = (params.orgSlug as string) || "system";
  const orgContext = useQuery(api.organizations.resolveSlug, { slug: orgSlug });
  const isSystemDashboard = orgContext?.type === "system";

  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("all");
  const schools = useQuery(api.schools.list, isSystemDashboard ? {} : "skip");

  // Determine effective school ID for the query
  let querySchoolId = undefined;
  if (isSystemDashboard && selectedSchoolId !== "all") {
    querySchoolId = selectedSchoolId as Id<"schools">;
  } else if (orgContext?.type === "school") {
    querySchoolId = orgContext._id as Id<"schools">;
  }

  // The DataTable now handles the active/inactive filtering via filterConfigs
  const data = useQuery(api.curriculums.list, { 
    includeInactive: true,
    schoolId: querySchoolId 
  });

  const [editingCurriculum, setEditingCurriculum] = useState<Doc<"curriculums"> | null>(null);

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

      {isSystemDashboard && (
        <div className="flex mb-4">
            <Select value={selectedSchoolId} onValueChange={setSelectedSchoolId}>
              <SelectTrigger className="w-full sm:w-auto min-w-[200px] max-w-[350px]">
                <div className="flex items-center gap-2 truncate">
                  <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="truncate">
                    {selectedSchoolId === "all" ? "All Schools" : schools?.find(s => s._id === selectedSchoolId)?.name || "Select School"}
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Schools</SelectItem>
                {schools?.map((school) => (
                  <SelectItem key={school._id} value={school._id}>
                    {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
        </div>
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