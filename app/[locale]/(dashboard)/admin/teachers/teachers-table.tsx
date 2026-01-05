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
import { TeacherDialog } from "@/components/admin/teachers/teacher-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslations } from "next-intl";

export type Teacher = {
  _id: Id<"users">;
  fullName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  avatarStorageId?: Id<"_storage">;
  role: "teacher" | "admin";
  isActive: boolean;
};

function TeacherAvatar({ teacher }: { teacher: Teacher }) {
  const avatarUrl = useQuery(
    api.users.getAvatarUrl,
    teacher.avatarStorageId ? { storageId: teacher.avatarStorageId } : "skip",
  );

  return (
    <Avatar className="h-8 w-8">
      {avatarUrl && <AvatarImage src={avatarUrl} alt={teacher.fullName} />}
      <AvatarFallback>{teacher.fullName.substring(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

export const columns: ColumnDef<Teacher>[] = [
  {
    accessorKey: "fullName",
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        Name <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <TeacherAvatar teacher={row.original} />
        <span className="font-medium">{row.getValue("fullName")}</span>
      </div>
    ),
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => <Badge variant="outline">{row.getValue("role")}</Badge>,
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
          <TeacherDialog teacher={row.original} />
        </div>
      )
    },
  },
];

export function TeachersTable() {
  const t = useTranslations(); // ADD THIS
  const users = useQuery(api.users.getUsers, { role: "teacher" });
  const [sorting, setSorting] = React.useState([]);
  
  const data = React.useMemo(() => {
    if (!users) return [];
    return users.map(u => ({
        ...u,
        role: u.role as "teacher" | "admin"
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
    state: { sorting: sorting as any },
  });

  if (!users) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('teacher.searchPlaceholder')} // CHANGE HERE
            value={(table.getColumn("fullName")?.getFilterValue() as string) ?? ""}
            onChange={(event) => table.getColumn("fullName")?.setFilterValue(event.target.value)}
            className="pl-8"
          />
        </div>
        <TeacherDialog />
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
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {t('common.noResults')} {/* CHANGE HERE */}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}