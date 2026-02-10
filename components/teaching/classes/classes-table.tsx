"use client";

import * as React from "react";
import { Doc } from "@/convex/_generated/dataModel";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, Edit, Users, Calendar, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input"; // Import Input
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ClassDialog } from "./class-dialog";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCurrentUser } from "@/hooks/use-current-user"; // To check admin status

interface ClassesTableProps {
  data: Doc<"classes">[];
  curriculums?: Doc<"curriculums">[];
}

export function ClassesTable({ data, curriculums }: ClassesTableProps) {
  const t = useTranslations();
  const { user } = useCurrentUser();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [filter, setFilter] = React.useState(""); // Search state
  const [editingClass, setEditingClass] = React.useState<Doc<"classes"> | null>(null);

  const getCurriculumName = (id: string) => {
    return curriculums?.find(c => c._id === id)?.title || "Unknown Curriculum";
  };

  const columns: ColumnDef<Doc<"classes">>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          {t('class.name')} <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
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
      header: t('class.curriculum'),
      cell: ({ row }) => (
        <Badge variant="outline" className="font-normal">
          {getCurriculumName(row.getValue("curriculumId"))}
        </Badge>
      ),
    },
    {
      accessorKey: "academicYear",
      header: "Year",
      cell: ({ row }) => (
        <div className="flex items-center gap-2 text-sm">
           <Calendar className="h-3 w-3 text-muted-foreground" />
           {row.original.academicYear || "-"}
        </div>
      )
    },
    {
      id: "students",
      header: t('navigation.students'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2 text-sm">
            <Users className="h-3 w-3 text-muted-foreground" />
            {row.original.students?.length || 0}
        </div>
      ),
    },
    {
      accessorKey: "isActive",
      header: t('common.status'),
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "default" : "secondary"}>
          {row.original.isActive ? t('common.active') : t('common.archived')}
        </Badge>
      ),
    },
    {
      id: "actions",
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

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(), // Enable filtering
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter, // Bind filter state
    state: { 
        sorting,
        globalFilter: filter 
    },
  });

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

      {/* 1. Header with Search and Create Button */}
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('common.search') || "Search classes..."}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-8"
          />
        </div>
        
        {/* Create Button - Only visible in List View (Table) */}
        {isAdmin && <ClassDialog />}
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow 
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => isAdmin && setEditingClass(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {t('common.noResults')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}