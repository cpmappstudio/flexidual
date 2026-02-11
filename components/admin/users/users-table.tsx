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
import { ArrowUpDown, Edit, Search, ChevronLeft, ChevronRight } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [editingUser, setEditingUser] = React.useState<User | null>(null);
  
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
            <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0"
                onClick={(e) => {
                    e.stopPropagation();
                    setEditingUser(row.original);
                }}
            >
                <Edit className="h-4 w-4 text-muted-foreground" />
                <span className="sr-only">{t('common.edit')}</span>
            </Button>
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
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  if (!users) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-4">
      {editingUser && (
            <UserDialog 
                user={editingUser}
                allowedRoles={allowedRoles}
                open={true}
                onOpenChange={(open) => {
                    if (!open) setEditingUser(null);
                }}
                trigger={<span className="hidden" />} 
            />
        )}

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
                <TableRow 
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setEditingUser(row.original)}
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
      
      {/* Pagination Controls */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {t('common.rowsPerPage')}
          </p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value))
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-sm text-muted-foreground">
            {t('common.pageOfPages', {
              current: table.getState().pagination.pageIndex + 1,
              total: table.getPageCount()
            })}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
              {t('common.previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              {t('common.next')}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}