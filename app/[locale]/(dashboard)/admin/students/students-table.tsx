"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StudentDialog } from "@/components/admin/students/student-dialog";
import { useTranslations } from "next-intl";

export type Student = {
  _id: Id<"users">;
  fullName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  avatarStorageId?: Id<"_storage">;
  role: "student";
  isActive: boolean;
};

function StudentAvatar({ student }: { student: Student }) {
  const avatarUrl = useQuery(
    api.users.getAvatarUrl,
    student.avatarStorageId ? { storageId: student.avatarStorageId } : "skip",
  );

  return (
    <Avatar className="h-8 w-8">
      {avatarUrl && <AvatarImage src={avatarUrl} alt={student.fullName} />}
      <AvatarFallback>{student.fullName.substring(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

// KEEP AS IS - columns defined outside component
export const columns: ColumnDef<Student>[] = [
  {
    accessorKey: "fullName",
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        Name <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <StudentAvatar student={row.original} />
        <div className="flex flex-col">
            <span className="font-medium">{row.getValue("fullName")}</span>
        </div>
      </div>
    ),
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "isActive",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={row.original.isActive ? "default" : "secondary"}>
        {row.original.isActive ? "Active" : "Inactive"}
      </Badge>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => {
      return (
        <div className="flex justify-end">
          <StudentDialog student={row.original} />
        </div>
      )
    },
  },
];

export function StudentsTable() {
  const t = useTranslations(); // ADD THIS
  const users = useQuery(api.users.getUsers, { role: "student" });
  const [sorting, setSorting] = React.useState([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  
  const data = React.useMemo(() => {
    if (!users) return [];
    return users.map(u => ({
        ...u,
        role: "student" as const
    }));
  }, [users]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting as any,
    state: { 
        sorting: sorting as any,
        globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, columnId, filterValue) => {
        const value = row.getValue(columnId) as string;
        return value?.toLowerCase().includes(filterValue.toLowerCase());
    }
  });

  if (!users) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('student.searchPlaceholder')} // CHANGE HERE
            value={globalFilter ?? ""}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="pl-8"
          />
        </div>
        <StudentDialog />
      </div>

      <div className="rounded-md border">
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
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {t('common.noResults')} {/* CHANGE HERE */}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          {t('common.previous')} {/* CHANGE HERE */}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          {t('common.next')} {/* CHANGE HERE */}
        </Button>
      </div>
    </div>
  );
}