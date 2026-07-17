"use client";

import { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useAction, useQuery } from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import {
  createSearchColumn,
  createSortableHeader,
} from "@/components/table/column-helpers";
import { DataTable } from "@/components/table/data-table";
import { TableSkeleton } from "@/components/skeletons/table-skeleton";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AspectRatio } from "@/components/ui/aspect-ratio";

type MemberRole = "superadmin" | "admin" | "member";
type EditableRole = Exclude<MemberRole, "superadmin">;

type OrganizationMemberRow = {
  userId: Id<"users">;
  clerkUserId: string;
  firstName: string;
  lastName: string;
  email: string;
  imageUrl?: string;
  role: MemberRole;
  createdAt: number;
};

function getUserDisplayName(
  user: Pick<OrganizationMemberRow, "firstName" | "lastName" | "email">,
) {
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  return fullName || user.email || "-";
}

function getUserInitials(
  user: Pick<OrganizationMemberRow, "firstName" | "lastName" | "email">,
) {
  const fromName =
    `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
  return fromName || user.email.charAt(0).toUpperCase() || "U";
}

interface OrganizationMembersTableProps {
  organizationSlug: string;
}

export function OrganizationMembersTable({
  organizationSlug,
}: OrganizationMembersTableProps) {
  const t = useTranslations("Settings.general.members.table");
  const tTable = useTranslations("Common.table");
  const tActions = useTranslations("Common.actions");
  const { userId: currentClerkUserId } = useAuth();

  const [deleteTarget, setDeleteTarget] =
    useState<OrganizationMemberRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [roleUpdatingClerkUserId, setRoleUpdatingClerkUserId] = useState<
    string | null
  >(null);

  const organization = useQuery(api.organizations.getBySlug, {
    slug: organizationSlug,
  });
  const members = useQuery(
    api.members.listByOrganization,
    organization?._id ? { organizationId: organization._id } : "skip",
  );

  const setSingleTenantRole = useAction(api.users.setSingleTenantRole);
  const deleteSingleTenantUser = useAction(api.users.deleteSingleTenantUser);

  const handleRoleUpdate = useCallback(
    async (member: OrganizationMemberRow, role: EditableRole) => {
      setRoleUpdatingClerkUserId(member.clerkUserId);
      try {
        await setSingleTenantRole({
          organizationSlug,
          clerkUserId: member.clerkUserId,
          role,
        });
        toast.success(t("toasts.roleUpdated"));
      } catch (error) {
        console.error("Failed to update member role:", error);
        toast.error(t("toasts.roleUpdateError"));
      } finally {
        setRoleUpdatingClerkUserId(null);
      }
    },
    [organizationSlug, setSingleTenantRole, t],
  );

  const rows = useMemo<OrganizationMemberRow[]>(() => {
    if (!members) {
      return [];
    }

    return members.map(({ membership, user }) => ({
      userId: user._id,
      clerkUserId: user.clerkId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      imageUrl: user.imageUrl,
      role: user.isSuperAdmin ? "superadmin" : membership.role,
      createdAt: membership.createdAt ?? membership._creationTime,
    }));
  }, [members]);

  const columns = useMemo<ColumnDef<OrganizationMemberRow>[]>(() => {
    return [
      createSearchColumn<OrganizationMemberRow>([
        "firstName",
        "lastName",
        "email",
        "role",
      ]),
      {
        accessorKey: "createdAt",
        header: createSortableHeader(t("columns.createdAt")),
        meta: { className: "hidden md:table-cell" },
        cell: ({ row }) => {
          const createdAt = row.getValue("createdAt") as number;
          return new Date(createdAt).toLocaleDateString();
        },
      },
      {
        id: "user",
        header: createSortableHeader(t("columns.user")),
        accessorFn: (row) => getUserDisplayName(row).toLowerCase(),
        cell: ({ row }) => {
          const user = row.original;
          const displayName = getUserDisplayName(user);

          return (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-10 h-10 rounded-full overflow-hidden">
                <AspectRatio ratio={1} className="w-full h-full">
                  <Avatar
                    src={user.imageUrl}
                    initials={getUserInitials(user)}
                    alt={displayName}
                    className="bg-muted text-muted-foreground object-cover object-center"
                  />
                </AspectRatio>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" title={displayName}>
                  {displayName}
                </p>
                <p
                  className="truncate text-xs text-muted-foreground"
                  title={user.email}
                >
                  {user.email}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "role",
        header: createSortableHeader(t("columns.role")),
        cell: ({ row }) => {
          const member = row.original;
          const isSelf = member.clerkUserId === currentClerkUserId;
          const isSuper = member.role === "superadmin";
          const isUpdating = roleUpdatingClerkUserId === member.clerkUserId;
          const canEdit = !isSuper && !isSelf && !isUpdating;

          if (isSuper) {
            return <Badge variant="secondary">{t("roles.superadmin")}</Badge>;
          }

          return (
            <Select
              value={member.role}
              onValueChange={(value) =>
                void handleRoleUpdate(member, value as EditableRole)
              }
              disabled={!canEdit}
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">{t("roles.member")}</SelectItem>
                <SelectItem value="admin">{t("roles.admin")}</SelectItem>
              </SelectContent>
            </Select>
          );
        },
      },
      {
        id: "actions",
        header: t("columns.actions"),
        meta: { className: "w-[1%] whitespace-nowrap" },
        cell: ({ row }) => {
          const member = row.original;
          const isSelf = member.clerkUserId === currentClerkUserId;
          const isSuper = member.role === "superadmin";
          const canDelete = !isSelf && !isSuper;

          return (
            <Button
              variant="ghost"
              size="icon"
              disabled={!canDelete}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!canDelete) {
                  toast.error(t("toasts.cannotDelete"));
                  return;
                }
                setDeleteTarget(member);
              }}
              title={t("actions.delete")}
            >
              <Trash2 className="size-4" />
            </Button>
          );
        },
      },
    ];
  }, [currentClerkUserId, handleRoleUpdate, roleUpdatingClerkUserId, t]);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteSingleTenantUser({
        organizationSlug,
        clerkUserId: deleteTarget.clerkUserId,
      });
      toast.success(t("toasts.userDeleted"));
      setDeleteTarget(null);
    } catch (error) {
      console.error("Failed to delete user:", error);
      toast.error(t("toasts.userDeleteError"));
    } finally {
      setIsDeleting(false);
    }
  };

  if (organization === undefined) {
    return <TableSkeleton rows={8} />;
  }

  if (organization && members === undefined) {
    return <TableSkeleton rows={8} />;
  }

  return (
    <>
      <div className="mt-2 text-xs text-muted-foreground">
        {t("summary", { count: rows.length })}
      </div>
      <DataTable
        data={rows}
        columns={columns}
        filterColumn="search"
        filterPlaceholder={t("searchPlaceholder")}
        emptyMessage={t("emptyMessage")}
        columnsMenuLabel={tTable("columns")}
        filtersMenuLabel={tTable("filters")}
        exportButtonLabel={tActions("export")}
        initialSorting={[{ id: "createdAt", desc: true }]}
        pageSize={10}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>{t("deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDialog.description", {
                email: deleteTarget?.email ?? "-",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {tActions("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? t("actions.deleting") : tActions("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
