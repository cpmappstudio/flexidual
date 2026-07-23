"use client";

import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLocale, useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { useDateTimeFormatter } from "@/hooks/use-date-time-formatter";
import type {
  TenantTeamInvitation,
  TenantTeamRole,
} from "@/components/people/tenant-people.types";
import { TenantTeamRoleSelect } from "@/components/people/tenant-team-role-select";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function TenantOrganizationInvitationsTable({
  invitations,
  isLoading,
  canManage,
  allowOwner,
  onRoleChange,
  onCancelInvitation,
}: {
  invitations: TenantTeamInvitation[];
  isLoading: boolean;
  canManage: boolean;
  allowOwner: boolean;
  onRoleChange: (
    invitationId: Id<"organizationInvitations">,
    role: TenantTeamRole,
  ) => void;
  onCancelInvitation: (invitationId: Id<"organizationInvitations">) => void;
}) {
  const t = useTranslations("TenantTeam");
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
          ) : invitations.length ? (
            invitations.map((invitation) => {
              const isOwnerLocked = invitation.role === "owner" && !allowOwner;

              return (
                <TableRow
                  key={invitation._id}
                  className="bg-card hover:bg-card"
                >
                  <TableCell className="font-medium text-foreground">
                    {invitation.email}
                  </TableCell>
                  <TableCell>
                    <TenantTeamRoleSelect
                      value={invitation.role}
                      allowOwner={allowOwner || invitation.role === "owner"}
                      disabled={!canManage || isOwnerLocked}
                      onValueChange={(role) =>
                        onRoleChange(invitation._id, role)
                      }
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {invitation.invitedBy}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatter.format(invitation.sentAt)}
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
                          disabled={!canManage || isOwnerLocked}
                          variant="destructive"
                          className="justify-between"
                          onClick={() => onCancelInvitation(invitation._id)}
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
              );
            })
          ) : (
            <TableStateRow colSpan={5}>{t("invitesTable.empty")}</TableStateRow>
          )}
        </TableBody>
      </Table>
    </TableSurface>
  );
}
