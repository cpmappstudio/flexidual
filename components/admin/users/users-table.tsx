"use client";

import * as React from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { UserDialog } from "./user-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslations } from "next-intl";
import { UserRole } from "@/convex/types";
import { useParams } from "next/navigation";
import { DataTable } from "@/components/table/data-table";
import {
  createSortableHeader,
  createSearchColumn,
} from "@/components/table/column-helpers";
import type { FilterConfig } from "@/lib/table/types";

export type User = FunctionReturnType<typeof api.users.getUsers>[number];

interface UsersTableProps {
  roleFilter?: UserRole;
  allowedRoles?: UserRole[];
  scope?: {
    orgType: "school" | "campus";
    orgId: string;
  };
  requireCampusSelection?: boolean;
  hideRole?: boolean;
  readOnly?: boolean;
}

function UserAvatar({ user }: { user: User }) {
  const avatarUrl = useQuery(
    api.users.getAvatarUrl,
    user.avatarStorageId ? { storageId: user.avatarStorageId } : "skip",
  );

  const finalSrc = avatarUrl || user.imageUrl;

  return (
    <Avatar className="h-8 w-8">
      {finalSrc && (
        <AvatarImage
          className="object-cover"
          src={finalSrc}
          alt={user.fullName}
        />
      )}
      <AvatarFallback>
        {user.fullName?.substring(0, 2).toUpperCase() || "U"}
      </AvatarFallback>
    </Avatar>
  );
}

export function UsersTable({
  roleFilter,
  allowedRoles,
  scope,
  requireCampusSelection = false,
  hideRole = false,
  readOnly = false,
}: UsersTableProps) {
  const t = useTranslations();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();

  const params = useParams();
  const orgSlug = (params.orgSlug as string) || "system";
  const orgContext = useQuery(
    api.organizations.resolveSlug,
    isAuthenticated ? { slug: orgSlug } : "skip",
  );
  const queryOrgType =
    orgContext?.type === "school" || orgContext?.type === "campus"
      ? orgContext.type
      : undefined;
  const queryOrgId = queryOrgType ? orgContext?._id : undefined;

  const effectiveScope =
    scope ??
    (queryOrgType && queryOrgId
      ? { orgType: queryOrgType, orgId: queryOrgId }
      : undefined);
  const campusSelectionSchoolId =
    requireCampusSelection && effectiveScope?.orgType === "school"
      ? (effectiveScope.orgId as Id<"schools">)
      : undefined;
  const campus = useQuery(
    api.campuses.get,
    isAuthenticated && effectiveScope?.orgType === "campus"
      ? { id: effectiveScope.orgId as Id<"campuses"> }
      : "skip",
  );
  const gradeSchoolId =
    effectiveScope?.orgType === "school"
      ? (effectiveScope.orgId as Id<"schools">)
      : campus?.schoolId;
  const grades = useQuery(
    api.grades.list,
    isAuthenticated && roleFilter === "student" && gradeSchoolId
      ? { schoolId: gradeSchoolId }
      : "skip",
  );
  const users = useQuery(
    api.users.getUsers,
    isAuthenticated && (orgContext || scope)
      ? {
          role: roleFilter,
          roles: allowedRoles,
          orgType: effectiveScope?.orgType,
          orgId: effectiveScope?.orgId,
        }
      : "skip",
  );

  const [editingUser, setEditingUser] = React.useState<User | null>(null);
  const isStudentTable = roleFilter === "student";

  const filterConfigs: FilterConfig[] = isStudentTable
    ? [
        {
          id: "grade",
          label: t("student.grade"),
          options: (grades ?? []).map((grade) => ({
            value: grade.code,
            label: grade.name,
          })),
        },
      ]
    : [
        {
          id: "isActive",
          label: t("common.status"),
          options: [
            { value: "active", label: t("common.active") },
            { value: "inactive", label: t("common.inactive") },
          ],
        },
      ];

  const userHeader = (
    <>
      <span className="hidden lg:block">{t("common.name")}</span>
      <span className="lg:hidden">{t("common.user")}</span>
    </>
  );

  const columns: ColumnDef<User, unknown>[] = [
    createSearchColumn<User>(["fullName", "email"]),
    {
      accessorKey: "fullName",
      header: createSortableHeader(userHeader),
      cell: ({ row }) => {
        return (
          <div className="flex items-center gap-3">
            <div className="hidden lg:block">
              <UserAvatar user={row.original} />
            </div>
            <div className="flex flex-col">
              <div className="flex">
                <span className="font-medium">{row.getValue("fullName")}</span>
              </div>
              <div className="lg:hidden">
                <span className="font-mono">{t("teacher.email")}:</span>
                <span className="text-muted-foreground">
                  {row.original.email || "-"}
                </span>
              </div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "email",
      header: createSortableHeader(t("teacher.email")),
      meta: { className: "hidden lg:table-cell" },
    },
    ...(isStudentTable
      ? [
          {
            accessorKey: "grade",
            header: createSortableHeader(t("student.grade")),
            filterFn: (row, id, filterValues: string[]) =>
              filterValues.includes((row.getValue(id) as string) ?? ""),
            cell: ({ row }) => {
              const gradeCode = row.original.grade;
              const gradeName = grades?.find(
                (grade) => grade.code === gradeCode,
              )?.name;
              return gradeName ?? gradeCode ?? "-";
            },
          } satisfies ColumnDef<User, unknown>,
        ]
      : []),
    {
      accessorKey: "isActive",
      header: createSortableHeader(t("common.status")),
      filterFn: (row, _id, filterValues: string[]) =>
        filterValues.includes(row.original.isActive ? "active" : "inactive"),
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "active" : "inactive"}>
          {row.original.isActive ? t("common.active") : t("common.inactive")}
        </Badge>
      ),
    },
  ];

  if (isAuthLoading || !isAuthenticated || !users) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="space-y-4">
      {!readOnly && editingUser && (
        <UserDialog
          user={editingUser}
          allowedRoles={allowedRoles}
          scope={effectiveScope}
          campusSelectionSchoolId={campusSelectionSchoolId}
          hideRole={hideRole}
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
        filterPlaceholder={t("common.searchByName")}
        emptyMessage={t("common.noResults")}
        filterConfigs={filterConfigs}
        filterVariant="select"
        filterAllLabel={
          isStudentTable ? t("student.allGrades") : t("common.allStatuses")
        }
        createAction={readOnly ? undefined :
          <UserDialog
            defaultRole={roleFilter}
            allowedRoles={allowedRoles}
            scope={effectiveScope}
            campusSelectionSchoolId={campusSelectionSchoolId}
            hideRole={hideRole}
          />
        }
        pageSize={10}
        onRowClick={readOnly ? undefined : (user) => setEditingUser(user)}
      />
    </div>
  );
}
