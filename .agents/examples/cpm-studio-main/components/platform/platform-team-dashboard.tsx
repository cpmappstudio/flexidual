"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { PlatformInviteUserDialog } from "@/components/platform/platform-invite-user-dialog";
import { PlatformTeamInvitesTable } from "@/components/platform/platform-team-invites-table";
import { PlatformTeamMembersTable } from "@/components/platform/platform-team-members-table";
import type { PlatformTeamRole } from "@/components/platform/platform-team.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PLATFORM_TEAM_PAGE_SIZE = 25;
const EMPTY_PAGINATION_ARGS = {};

function getLoadedCountLabel(count: number, status: string) {
  if (status === "LoadingFirstPage") {
    return "…";
  }

  if (count === 0 || status === "Exhausted") {
    return `${count}`;
  }

  return `${count}+`;
}

export function PlatformTeamDashboard({
  currentUserId,
  canManage,
}: {
  currentUserId: Id<"users"> | null;
  canManage: boolean;
}) {
  const t = useTranslations("PlatformTeam");
  const setMemberRole = useMutation(api.platform.team.setMemberRoleForPlatform);
  const removeMember = useMutation(api.platform.team.removeMemberForPlatform);
  const setInviteRole = useMutation(api.platform.invitations.setRoleForPlatform);
  const cancelInvite = useMutation(api.platform.invitations.cancelForPlatform);
  const {
    results: members,
    status: membersStatus,
    loadMore: loadMoreMembers,
  } = usePaginatedQuery(
    api.platform.team.listMembersForPlatform,
    EMPTY_PAGINATION_ARGS,
    { initialNumItems: PLATFORM_TEAM_PAGE_SIZE },
  );
  const {
    results: invites,
    status: invitesStatus,
    loadMore: loadMoreInvites,
  } = usePaginatedQuery(
    api.platform.invitations.listForPlatform,
    EMPTY_PAGINATION_ARGS,
    { initialNumItems: PLATFORM_TEAM_PAGE_SIZE },
  );

  const membersCount = getLoadedCountLabel(members.length, membersStatus);
  const invitesCount = getLoadedCountLabel(invites.length, invitesStatus);

  async function handleMemberRoleChange(userId: Id<"users">, role: PlatformTeamRole) {
    try {
      await setMemberRole({ userId, role });
      toast.success(t("membersTable.roleUpdated"));
    } catch {
      toast.error(t("genericError"));
    }
  }

  async function handleRemoveMember(userId: Id<"users">) {
    try {
      await removeMember({ userId });
      toast.success(t("membersTable.memberRemoved"));
    } catch {
      toast.error(t("genericError"));
    }
  }

  async function handleInviteRoleChange(
    invitationId: Id<"platformInvitations">,
    role: PlatformTeamRole,
  ) {
    try {
      await setInviteRole({ invitationId, role });
      toast.success(t("invitesTable.roleUpdated"));
    } catch {
      toast.error(t("genericError"));
    }
  }

  async function handleCancelInvite(invitationId: Id<"platformInvitations">) {
    try {
      await cancelInvite({ invitationId });
      toast.success(t("invitesTable.inviteCancelled"));
    } catch {
      toast.error(t("genericError"));
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <Tabs defaultValue="members" className="gap-4">
        <div className="flex items-center justify-between gap-4">
          <TabsList className="border border-border/70 bg-card **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:px-1.5">
            <TabsTrigger value="members">
              {t("membersTab")} <Badge variant="secondary">{membersCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="invites">
              {t("invitesTab")} <Badge variant="secondary">{invitesCount}</Badge>
            </TabsTrigger>
          </TabsList>

          <PlatformInviteUserDialog canManage={canManage} />
        </div>

        <TabsContent value="members" className="mt-0">
          <PlatformTeamMembersTable
            members={members}
            isLoading={membersStatus === "LoadingFirstPage"}
            currentUserId={currentUserId}
            canManage={canManage}
            onRoleChange={handleMemberRoleChange}
            onRemoveMember={handleRemoveMember}
          />
          {membersStatus === "CanLoadMore" || membersStatus === "LoadingMore" ? (
            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                variant="outline"
                disabled={membersStatus === "LoadingMore"}
                onClick={() => loadMoreMembers(PLATFORM_TEAM_PAGE_SIZE)}
              >
                {membersStatus === "LoadingMore" ? t("loadingMore") : t("loadMore")}
              </Button>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="invites" className="mt-0">
          <PlatformTeamInvitesTable
            invites={invites}
            isLoading={invitesStatus === "LoadingFirstPage"}
            canManage={canManage}
            onRoleChange={handleInviteRoleChange}
            onCancelInvite={handleCancelInvite}
          />
          {invitesStatus === "CanLoadMore" || invitesStatus === "LoadingMore" ? (
            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                variant="outline"
                disabled={invitesStatus === "LoadingMore"}
                onClick={() => loadMoreInvites(PLATFORM_TEAM_PAGE_SIZE)}
              >
                {invitesStatus === "LoadingMore" ? t("loadingMore") : t("loadMore")}
              </Button>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </section>
  );
}
