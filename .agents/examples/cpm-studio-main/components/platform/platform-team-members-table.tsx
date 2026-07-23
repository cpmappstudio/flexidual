"use client";

import { useTranslations } from "next-intl";
import {
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  TableActionsCell,
  TableActionsMenuButton,
  TableStateRow,
  TableSurface,
} from "@/components/tables/table-primitives";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PlatformTeamRoleSelect } from "@/components/platform/platform-team-role-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  PlatformTeamMember,
  PlatformTeamRole,
} from "@/components/platform/platform-team.types";
import { getInitials, getOptionalImageSrc } from "@/lib/files/image";

export function PlatformTeamMembersTable({
  members,
  isLoading,
  currentUserId,
  canManage,
  onRoleChange,
  onRemoveMember,
}: {
  members: PlatformTeamMember[];
  isLoading: boolean;
  currentUserId: Id<"users"> | null;
  canManage: boolean;
  onRoleChange: (memberId: Id<"users">, role: PlatformTeamRole) => void;
  onRemoveMember: (memberId: Id<"users">) => void;
}) {
  const t = useTranslations("PlatformTeam");

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
              const isCurrentUser = currentUserId === member._id;
              const isRoleLocked = !canManage || isCurrentUser;

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
                    <PlatformTeamRoleSelect
                      value={member.role}
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
                          disabled={!canManage || isCurrentUser}
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
