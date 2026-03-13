"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { UserDialog } from "./user-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { UserRole } from "@/convex/types";
import { useParams } from "next/navigation";
import { DataTable } from "@/components/table/data-table";
import { createSortableHeader, createSearchColumn } from "@/components/table/column-helpers";
import type { FilterConfig } from "@/lib/table/types";

export type User = Doc<"users"> & { 
  role?: string; 
  orgId?: string; 
  orgType?: string 
};

interface UsersTableProps {
  roleFilter?: UserRole;
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
      <AvatarFallback>
        {user.fullName.substring(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

const ROLE_OPTIONS = [
  "superadmin",
  "admin",
  "principal",
  "teacher",
  "tutor",
  "student",
] as const;

export function UsersTable({ roleFilter, allowedRoles }: UsersTableProps) {
  const t = useTranslations();

  const params = useParams();
  const orgSlug = (params.orgSlug as string) || "system";
  const orgContext = useQuery(api.organizations.resolveSlug, { slug: orgSlug });
  const isSystemDashboard = orgContext?.type === "system";

  // Superadmin filtering state
  const [selectedSchoolId, setSelectedSchoolId] = React.useState<string>("all");
  const [selectedCampusId, setSelectedCampusId] = React.useState<string>("all");

  const schools = useQuery(api.schools.list, isSystemDashboard ? {} : "skip");
  const campuses = useQuery(
    api.campuses.list,
    isSystemDashboard && selectedSchoolId !== "all"
      ? { schoolId: selectedSchoolId as Id<"schools"> }
      : "skip"
  );

  // Compute effective scope for the users query
  let queryOrgType = orgContext?.type;
  let queryOrgId = orgContext?._id;

  if (isSystemDashboard) {
    if (selectedCampusId !== "all") {
      queryOrgType = "campus";
      queryOrgId = selectedCampusId as Id<"campuses">;
    } else if (selectedSchoolId !== "all") {
      queryOrgType = "school";
      queryOrgId = selectedSchoolId as Id<"schools">;
    }
  }

  const users = useQuery(api.users.getUsers, orgContext ? { 
    role: roleFilter,
    orgType: queryOrgType,
    orgId: queryOrgId
  } : "skip");

  const [editingUser, setEditingUser] = React.useState<User | null>(null);

  const filterConfigs: FilterConfig[] = [
    {
      id: "role",
      label: t("teacher.role"),
      options: ROLE_OPTIONS.map((role) => ({
        value: role,
        label: t(`navigation.${role}s`),
      })),
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
                <Badge variant="role" className="ml-2 lg:hidden">
                  {row.getValue("role")}
                </Badge>
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
    {
      accessorKey: "role",
      header: createSortableHeader(t("teacher.role")),
      meta: { className: "hidden lg:table-cell" },
      filterFn: (row, id, filterValues: string[]) => {
        return filterValues.includes(row.getValue(id) as string);
      },
      cell: ({ row }) => <Badge variant="role">{row.getValue("role")}</Badge>,
    },
    {
      accessorKey: "isActive",
      header: createSortableHeader(t("common.status")),
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "active" : "inactive"}>
          {row.original.isActive ? t("common.active") : t("common.inactive")}
        </Badge>
      ),
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

      {isSystemDashboard && (
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <Select
            value={selectedSchoolId}
            onValueChange={(val) => {
                setSelectedSchoolId(val);
                setSelectedCampusId("all");
            }}
            >
            <SelectTrigger className="w-full sm:w-auto min-w-[200px] max-w-[350px]">
                <div className="flex items-center gap-2 truncate">
                <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="truncate"><SelectValue placeholder="All Schools" /></span>
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

            <Select
            value={selectedCampusId}
            onValueChange={setSelectedCampusId}
            disabled={selectedSchoolId === "all"}
            >
            <SelectTrigger className="w-full sm:w-auto min-w-[200px] max-w-[350px]">
                <div className="flex items-center gap-2 truncate">
                <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="truncate"><SelectValue placeholder="All Campuses" /></span>
                </div>
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All Campuses</SelectItem>
                {campuses?.map((campus) => (
                <SelectItem key={campus._id} value={campus._id}>
                    {campus.name}
                </SelectItem>
                ))}
            </SelectContent>
            </Select>
        </div>
      )}

      <DataTable
        data={users}
        columns={columns}
        filterColumn="search"
        filterPlaceholder={t("common.searchByName")}
        emptyMessage={t("common.noResults")}
        filterConfigs={filterConfigs}
        createAction={
          <UserDialog defaultRole={roleFilter} allowedRoles={allowedRoles} />
        }
        pageSize={10}
        onRowClick={(user) => setEditingUser(user)}
      />
    </div>
  );
}