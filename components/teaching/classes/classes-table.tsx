"use client";

import * as React from "react";
import { Doc } from "@/convex/_generated/dataModel";
import { ColumnDef } from "@tanstack/react-table";
import { Edit, Users, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClassDialog } from "./class-dialog";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
import { getRoleForOrg } from "@/lib/rbac"
import { DataTable } from "@/components/table/data-table"
import { createSearchColumn, createSortableHeader } from "@/components/table/column-helpers"

interface ClassesTableProps {
  data: Doc<"classes">[];
  curriculums?: Doc<"curriculums">[];
  customFilter?: React.ReactNode;
}

export function ClassesTable({ data, curriculums, customFilter }: ClassesTableProps) {
  const t = useTranslations();
  const params = useParams()
  const orgSlug = (params.orgSlug as string) || "system"
  const { sessionClaims } = useAuth()
  const role = getRoleForOrg(sessionClaims, orgSlug)
  const isAdmin = role === "admin" || role === "principal" || role === "superadmin"

  const [editingClass, setEditingClass] = React.useState<Doc<"classes"> | null>(null);

  const getCurriculumName = (id: string) => {
    return curriculums?.find(c => c._id === id)?.title || "Unknown Curriculum";
  };

  const columns: ColumnDef<Doc<"classes">, unknown>[] = [
    createSearchColumn<Doc<"classes">>(["name", "description"]),
    {
      accessorKey: "name",
      header: createSortableHeader(t('class.name')),
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-base">{row.getValue("name")}</div>
          <div className="text-xs text-muted-foreground line-clamp-1">
             {row.original.description}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "curriculumId",
      header: createSortableHeader(t('class.curriculum')),
      cell: ({ row }) => (
        <Badge variant="outline" className="font-normal">
          {getCurriculumName(row.getValue("curriculumId"))}
        </Badge>
      ),
    },
    {
      accessorKey: "academicYear",
      header: createSortableHeader("Year"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2 text-sm">
           <Calendar className="h-3 w-3 text-muted-foreground" />
           {row.original.academicYear || "-"}
        </div>
      )
    },
    {
      id: "students",
      accessorFn: (row) => row.students?.length || 0,
      header: createSortableHeader(t('navigation.students')),
      cell: ({ row }) => (
        <div className="flex items-center gap-2 text-sm">
            <Users className="h-3 w-3 text-muted-foreground" />
            {row.original.students?.length || 0}
        </div>
      ),
    },
    {
      accessorKey: "isActive",
      header: createSortableHeader(t('common.status')),
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "default" : "secondary"}>
          {row.original.isActive ? t('common.active') : t('common.archived')}
        </Badge>
      ),
    },
    {
      id: "actions",
      enableSorting: false,
      cell: ({ row }) => {
        return (
          <div className="flex justify-end items-center gap-2">
            <Button variant="secondary" size="sm" asChild>
                <Link href={`/teaching/classes/${row.original._id}`} onClick={(e) => e.stopPropagation()}>
                    {isAdmin ? t('class.manageClass') : t('class.manageSchedule')}
                </Link>
            </Button>
            {isAdmin && (
                <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0"
                    onClick={(e) => {
                        e.stopPropagation();
                        setEditingClass(row.original);
                    }}
                >
                    <Edit className="h-4 w-4 text-muted-foreground" />
                    <span className="sr-only">{t('common.edit')}</span>
                </Button>
            )}
          </div>
        )
      },
    },
  ];

  return (
    <div className="space-y-4">
      {/* Shared Dialog for Editing */}
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
        filterPlaceholder={t('common.search')}
        emptyMessage={t('common.noResults')}
        customFilter={customFilter}
        createAction={isAdmin ? <ClassDialog /> : undefined}
        pageSize={10}
        onRowClick={isAdmin ? (cls) => setEditingClass(cls) : undefined}
      />
    </div>
  );
}