"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { ColumnDef } from "@tanstack/react-table";
import { Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserDialog } from "./user-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslations } from "next-intl";
import { UserRole } from "@/convex/types";
import { useParams } from "next/navigation"
import { useAction } from "convex/react";
import { toast } from "sonner";
import { useAlert } from "@/components/providers/alert-provider";
import { DataTable } from "@/components/table/data-table";
import { createSortableHeader, createSearchColumn } from "@/components/table/column-helpers";
import type { FilterConfig } from "@/lib/table/types";

export type User = Doc<"users">;

// Props to configure the table for different views (e.g. "Teachers Only" vs "Admins")
interface UsersTableProps {
  allowedRoles?: UserRole[];
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

const ROLE_OPTIONS = ["superadmin", "admin", "principal", "teacher", "tutor", "student"] as const;

export function UsersTable({ allowedRoles }: UsersTableProps) {
  const t = useTranslations();

  const params = useParams()
  const orgSlug = (params.orgSlug as string) || "system"
  const orgContext = useQuery(api.organizations.resolveSlug, { slug: orgSlug })

  const [roleFilter, setRoleFilter] = React.useState<UserRole | undefined>(undefined);

  const users = useQuery(api.users.getUsers, orgContext ? {
    role: roleFilter,
    orgType: orgContext.type,
    orgId: orgContext._id
  } : "skip");

  const [editingUser, setEditingUser] = React.useState<User | null>(null);

  const deleteUser = useAction(api.users.deleteUserWithClerk);
  const { showAlert } = useAlert();

  const handleDelete = (user: User) => {
    showAlert({
      title: t("user.deleteTitle"),
      description: t("user.deleteDescription", { name: user.fullName }),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      variant: "destructive",
      onConfirm: async () => {
        try {
          await deleteUser({ userId: user._id });
          toast.success(t("user.deleted"));
        } catch {
          toast.error(t("errors.operationFailed"));
        }
      },
    });
  };
  
  const filterConfigs: FilterConfig[] = [
    {
      id: "role",
      label: t('teacher.role'),
      options: ROLE_OPTIONS.map(role => ({
        value: role,
        label: t(`navigation.${role}s`)
      }))
    }
  ];

  const columns: ColumnDef<User, unknown>[] = [
    createSearchColumn<User>(["fullName", "email"]),
    {
      accessorKey: "fullName",
      header: createSortableHeader(t('common.name')),
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <UserAvatar user={row.original} />
          <span className="font-medium">{row.getValue("fullName")}</span>
        </div>
      ),
    },
    {
      accessorKey: "email",
      header: createSortableHeader(t('teacher.email')),
    },
    {
      accessorKey: "role",
      header: createSortableHeader(t('teacher.role')),
      filterFn: (row, id, filterValues: string[]) => {
        return filterValues.includes(row.getValue(id) as string);
      },
      cell: ({ row }) => {
        const role = row.getValue("role") as string;
        // Map role to badge variant
        const variant = role === "superadmin" ? "destructive" :
                        role === "admin" || role === "principal" ? "default" :
                        role === "teacher" || role === "tutor" ? "secondary" : "outline";
        return <Badge variant={variant}>{t(`navigation.${role}s`)}</Badge>;
      },
    },
    {
      accessorKey: "isActive",
      header: createSortableHeader(t('common.status')),
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "outline" : "secondary"}>
          {row.original.isActive ? t('common.active') : t('common.inactive')}
        </Badge>
      ),
    },
    {
      id: "actions",
      enableSorting: false,
      cell: ({ row }) => {
        return (
          <div className="flex justify-end gap-1">
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
            <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(row.original);
                }}
            >
                <Trash2 className="h-4 w-4 text-destructive" />
                <span className="sr-only">{t('common.delete')}</span>
            </Button>
          </div>
        )
      },
    },
  ];

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

      <DataTable
        data={users}
        columns={columns}
        filterColumn="search"
        filterPlaceholder={t('common.searchUser')}
        emptyMessage={t('common.noResults')}
        filterConfigs={filterConfigs}
        createAction={
          <UserDialog
            defaultRole={roleFilter}
            allowedRoles={allowedRoles}
          />
        }
        pageSize={10}
        onRowClick={(user) => setEditingUser(user)}
      />
    </div>
  );
}