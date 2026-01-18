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
import type { TableSortingState } from "@/lib/types/table";
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
import { UserDialog } from "./user-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslations } from "next-intl";
import { UserRole } from "@/convex/types";

// User type definition
export type User = {
  _id: Id<"users">;
  fullName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  avatarStorageId?: Id<"_storage">;
  role: string;
  isActive: boolean;
};

// Props to configure the table for different views (e.g. "Teachers Only" vs "Admins")
interface UsersTableProps {
  roleFilter?: UserRole;
  allowedRoles?: UserRole[]; // Passed to dialog to limit creation options
}

function UserAvatar({ user }: { user: User }) {
  const avatarUrl = useQuery(
    api.users.getAvatarUrl,
    user.avatarStorageId ? { storageId: user.avatarStorageId } : "skip",
  );

  return (
    <Avatar className="h-8 w-8">
      {avatarUrl && <AvatarImage src={avatarUrl} alt={user.fullName} />}
      <AvatarFallback>{user.fullName.substring(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

export function UsersTable({ roleFilter, allowedRoles }: UsersTableProps) {
  const t = useTranslations();
  
  // Fetch users (filtered by role if provided)
  const users = useQuery(api.users.getUsers, roleFilter ? { role: roleFilter } : {});
  const [sorting, setSorting] = React.useState<TableSortingState>([]);
  
  const columns: ColumnDef<User>[] = [
    {
      accessorKey: "fullName",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          {t('common.name')} <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <UserAvatar user={row.original} />
          <span className="font-medium">{row.getValue("fullName")}</span>
        </div>
      ),
    },
    {
      accessorKey: "email",
      header: t('teacher.email'),
    },
    {
      accessorKey: "role",
      header: t('teacher.role'),
      cell: ({ row }) => {
        const role = row.getValue("role") as string;
        // Map role to badge variant
        const variant = role === "admin" || role === "superadmin" ? "destructive" : 
                        role === "teacher" ? "default" : "secondary";
        return <Badge variant={variant}>{t(`navigation.${role}s`)}</Badge>;
      },
    },
    {
      accessorKey: "isActive",
      header: t('common.status'),
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "outline" : "secondary"}>
          {row.original.isActive ? t('common.active') : t('common.inactive')}
        </Badge>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        return (
          <div className="flex justify-end">
            <UserDialog 
                user={row.original} 
                allowedRoles={allowedRoles} // Pass constraints to edit dialog
            />
          </div>
        )
      },
    },
  ];

  const table = useReactTable({
    data: users || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    state: { sorting: sorting },
  });

  if (!users) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('common.search')}
            value={(table.getColumn("fullName")?.getFilterValue() as string) ?? ""}
            onChange={(event) => table.getColumn("fullName")?.setFilterValue(event.target.value)}
            className="pl-8"
          />
        </div>
        
        {/* Create Button with context-aware configuration */}
        <UserDialog 
            defaultRole={roleFilter} 
            allowedRoles={allowedRoles} 
        />
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
                  {t('common.noResults')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* Pagination Controls could go here */}
    </div>
  );
}