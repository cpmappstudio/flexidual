"use client";

import * as React from "react";
import { Doc } from "@/convex/_generated/dataModel";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClassDialog } from "./class-dialog";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { getRoleForOrg } from "@/lib/rbac";
import { DataTable } from "@/components/table/data-table";
import { createSearchColumn, createSortableHeader } from "@/components/table/column-helpers";
import { useRouter } from "@/i18n/navigation";
import { Edit } from "lucide-react";

interface ClassesTableProps {
  data: Doc<"classes">[];
  curriculums?: Doc<"curriculums">[];
  customFilter?: React.ReactNode;
}

export function ClassesTable({ data, curriculums, customFilter }: ClassesTableProps) {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params.orgSlug as string) || "system";
  const { sessionClaims } = useAuth();
  const role = getRoleForOrg(sessionClaims, orgSlug);
  const isAdmin = role === "admin" || role === "principal" || role === "superadmin";

  const [editingClass, setEditingClass] = React.useState<Doc<"classes"> | null>(null);

  const getCurriculumName = (id: string) => {
    return curriculums?.find((c) => c._id === id)?.title || "Unknown Curriculum";
  };

  const classHeader = (
    <>
      <span className="hidden lg:block">{t("common.name")}</span>
      <span className="lg:hidden">{t("class.class")}</span>
    </>
  );

  const columns: ColumnDef<Doc<"classes">, unknown>[] = [
    createSearchColumn<Doc<"classes">>(["name", "description"]),
    {
      accessorKey: "name",
      header: createSortableHeader(classHeader),
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.getValue("name")}</div>
          <div className="text-xs text-muted-foreground line-clamp-1">
            {row.original.description}
          </div>
          <div className="lg:hidden flex flex-col gap-0.5 mt-1">
            <div className="inline-flex items-center text-xs">
              <span className="font-mono">{t("navigation.curriculum")}:</span>
              <span className="text-muted-foreground">
                {getCurriculumName(row.original.curriculumId)}
              </span>
            </div>
            <div className="inline-flex items-center text-xs">
              <span className="font-mono">{t("class.academicYear")}:</span>
              <span className="text-muted-foreground">
                {row.original.academicYear || "-"}
              </span>
            </div>
            <div className="inline-flex items-center text-xs">
              <span className="font-mono">{t("navigation.students")}:</span>
              <span className="text-muted-foreground">
                {row.original.students?.length || 0}
              </span>
            </div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "curriculumId",
      header: createSortableHeader(t("class.curriculum")),
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }) => (
        <span>{getCurriculumName(row.getValue("curriculumId"))}</span>
      ),
    },
    {
      accessorKey: "academicYear",
      header: createSortableHeader(t("class.academicYear")),
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }) => (
        <div className="flex items-center gap-2 text-sm">
          {row.original.academicYear || "-"}
        </div>
      ),
    },
    {
      id: "students",
      accessorFn: (row) => row.students?.length || 0,
      header: createSortableHeader(t("navigation.students")),
      meta: { className: "hidden lg:table-cell" },
      cell: ({ row }) => (
        <div className="flex items-center gap-2 text-sm">
          {row.original.students?.length || 0}
        </div>
      ),
    },
    {
      accessorKey: "isActive",
      header: createSortableHeader(t("common.status")),
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "active" : "inactive"}>
          {row.original.isActive ? t("common.active") : t("common.archived")}
        </Badge>
      ),
    },
    // Edit action column — admins only
    ...(isAdmin ? [{
      id: "actions",
      cell: ({ row }: { row: { original: Doc<"classes"> } }) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            title={t("class.edit")}
            onClick={(e) => {
              e.stopPropagation(); // prevent row click from also firing
              setEditingClass(row.original);
            }}
          >
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      ),
    }] as ColumnDef<Doc<"classes">, unknown>[] : []),
  ];

  return (
    <div className="space-y-4">
      {editingClass && (
        <ClassDialog
          classDoc={editingClass}
          open={true}
          onOpenChange={(open) => !open && setEditingClass(null)}
          trigger={<span className="hidden" />}
        />
      )}

      <DataTable
        data={data}
        columns={columns}
        filterColumn="search"
        filterPlaceholder={t("common.searchByName")}
        emptyMessage={t("common.noResults")}
        customFilter={customFilter}
        createAction={isAdmin ? <ClassDialog /> : undefined}
        pageSize={10}
        onRowClick={(cls) => router.push(`/${orgSlug}/classes/${cls._id}`)}
      />
    </div>
  );
}