"use client";

import {
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import type {
  TenantTeamMember,
  TenantTeamRole,
} from "@/components/people/tenant-people.types";
import { TenantTeamRoleSelect } from "@/components/people/tenant-team-role-select";
import {
  TableActionsCell,
  TableActionsMenuButton,
  TableStateRow,
  TableSurface,
} from "@/components/tables/table-primitives";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getInitials, getOptionalImageSrc } from "@/lib/files/image";

export function TenantTeamMembersTable({
  members,
  isLoading,
  canManage,
  allowOwner,
  onRoleChange,
  onRemoveMember,
}: {
  members: TenantTeamMember[];
  isLoading: boolean;
  canManage: boolean;
  allowOwner: boolean;
  onRoleChange: (memberId: Id<"users">, role: TenantTeamRole) => void;
  onRemoveMember: (memberId: Id<"users">) => void;
}) {
  const t = useTranslations("TenantTeam");

  return (
    <TableSurface>
      <Table>
        <TableHeader className="bg-card">
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("membersTable.member")}</TableHead>
            <TableHead>{t("membersTable.role")}</TableHead>
            <TableHead className="w-12 pr-5 text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableStateRow colSpan={3}>
              {t("membersTable.loading")}
            </TableStateRow>
          ) : members.length ? (
            members.map((member) => {
              const isOwnerLocked = member.role === "owner" && !allowOwner;
              const isRoleLocked =
                !canManage || member.isCurrentUser || isOwnerLocked;

              return (
                <TableRow key={member._id} className="bg-card hover:bg-card">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-9 rounded-lg">
                        <AvatarImage
                          src={getOptionalImageSrc(member.avatarUrl)}
                          alt={member.name}
                        />
                        <AvatarFallback className="rounded-lg text-xs font-semibold">
                          {getInitials(member.name, "TM")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-foreground">
                          {member.name}
                        </span>
                        <span className="text-muted-foreground">
                          {member.email}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <TenantTeamRoleSelect
                      value={member.role}
                      allowOwner={allowOwner || member.role === "owner"}
                      disabled={isRoleLocked}
                      onValueChange={(role) => onRoleChange(member._id, role)}
                    />
                  </TableCell>
                  <TableActionsCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <TableActionsMenuButton
                          label={t("membersTable.actionsMenu")}
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          disabled={
                            !canManage || member.isCurrentUser || isOwnerLocked
                          }
                          variant="destructive"
                          className="justify-between"
                          onClick={() => onRemoveMember(member._id)}
                        >
                          <span>{t("membersTable.removeMember")}</span>
                          <HugeiconsIcon
                            icon={Delete02Icon}
                            strokeWidth={2}
                            aria-hidden="true"
                          />
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableActionsCell>
                </TableRow>
              );
            })
          ) : (
            <TableStateRow colSpan={3}>
              {t("membersTable.empty")}
            </TableStateRow>
          )}
        </TableBody>
      </Table>
    </TableSurface>
  );
}
