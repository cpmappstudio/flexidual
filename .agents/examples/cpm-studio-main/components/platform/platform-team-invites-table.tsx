"use client";

import { useLocale, useTranslations } from "next-intl";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Id } from "@/convex/_generated/dataModel";
import { useDateTimeFormatter } from "@/hooks/use-date-time-formatter";
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
  PlatformTeamInvite,
  PlatformTeamRole,
} from "@/components/platform/platform-team.types";

export function PlatformTeamInvitesTable({
  invites,
  isLoading,
  canManage,
  onRoleChange,
  onCancelInvite,
}: {
  invites: PlatformTeamInvite[];
  isLoading: boolean;
  canManage: boolean;
  onRoleChange: (
    inviteId: Id<"platformInvitations">,
    role: PlatformTeamRole,
  ) => void;
  onCancelInvite: (inviteId: Id<"platformInvitations">) => void;
}) {
  const t = useTranslations("PlatformTeam");
  const locale = useLocale();
  const formatter = useDateTimeFormatter(locale);

  return (
    <TableSurface>
      <Table>
        <TableHeader className="bg-card">
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("invitesTable.email")}</TableHead>
            <TableHead>{t("invitesTable.role")}</TableHead>
            <TableHead>{t("invitesTable.invitedBy")}</TableHead>
            <TableHead>{t("invitesTable.sent")}</TableHead>
            <TableHead className="w-12 pr-5 text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableStateRow colSpan={5}>
              {t("invitesTable.loading")}
            </TableStateRow>
          ) : invites.length ? (
            invites.map((invite) => (
              <TableRow key={invite._id} className="bg-card hover:bg-card">
                <TableCell className="font-medium text-foreground">
                  {invite.email}
                </TableCell>
                <TableCell>
                  <PlatformTeamRoleSelect
                    value={invite.role}
                    disabled={!canManage}
                    onValueChange={(role) => onRoleChange(invite._id, role)}
                  />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {invite.invitedBy}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatter.format(invite.sentAt)}
                </TableCell>
                <TableActionsCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <TableActionsMenuButton
                        label={t("invitesTable.actionsMenu")}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        disabled={!canManage}
                        variant="destructive"
                        className="justify-between"
                        onClick={() => onCancelInvite(invite._id)}
                      >
                        <span>{t("invitesTable.cancelInvite")}</span>
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
            ))
          ) : (
            <TableStateRow colSpan={5}>
              {t("invitesTable.empty")}
            </TableStateRow>
          )}
        </TableBody>
      </Table>
    </TableSurface>
  );
}
