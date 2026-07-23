"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TenantInviteTeamMemberDialog } from "@/components/people/tenant-invite-team-member-dialog";
import { TenantOrganizationInvitationsTable } from "@/components/people/tenant-organization-invitations-table";
import { TenantTeamMembersTable } from "@/components/people/tenant-team-members-table";
import { TenantOrganizationActionsMenu } from "@/components/tenant/tenant-organization-actions-menu";
import { TenantOrganizationInformationCard } from "@/components/tenant/tenant-organization-information-card";
import type { TenantTeamRole } from "@/components/people/tenant-people.types";
import { getLoadedCountLabel } from "@/components/people/tenant-people-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TENANT_TEAM_INVITATIONS_PAGE_SIZE = 25;
const TENANT_TEAM_MEMBERS_PAGE_SIZE = 25;
type TenantWorkspace = NonNullable<
  FunctionReturnType<typeof api.platform.workspace.getCurrentTenantWorkspace>
>;

export function TenantTeamSettingsDashboard({
  slug,
  organization,
  canManage,
  canAssignOwner,
  canDeactivateOrganization,
}: {
  slug: string;
  organization: TenantWorkspace["organization"];
  canManage: boolean;
  canAssignOwner: boolean;
  canDeactivateOrganization: boolean;
}) {
  const t = useTranslations("TenantTeam");
  const setMemberRole = useMutation(
    api.platform.organizationTeam.setMemberRoleForOrganization,
  );
  const removeMember = useMutation(
    api.platform.organizationTeam.removeMemberForOrganization,
  );
  const setInviteRole = useMutation(
    api.platform.organizationInvitations.setMembershipRoleForOrganization,
  );
  const cancelInvitation = useMutation(
    api.platform.organizationInvitations.cancelForOrganization,
  );
  const {
    results: members,
    status: membersStatus,
    loadMore: loadMoreMembers,
  } = usePaginatedQuery(
    api.platform.organizationTeam.listMembersForOrganization,
    { slug },
    { initialNumItems: TENANT_TEAM_MEMBERS_PAGE_SIZE },
  );
  const {
    results: invitations,
    status: invitationsStatus,
    loadMore: loadMoreInvitations,
  } = usePaginatedQuery(
    api.platform.organizationInvitations.listMembershipForOrganization,
    { slug },
    { initialNumItems: TENANT_TEAM_INVITATIONS_PAGE_SIZE },
  );

  const membersCount = getLoadedCountLabel(members.length, membersStatus);
  const invitationsCount = getLoadedCountLabel(
    invitations.length,
    invitationsStatus,
  );

  async function handleMemberRoleChange(
    userId: Id<"users">,
    role: TenantTeamRole,
  ) {
    try {
      await setMemberRole({ slug, userId, role });
      toast.success(t("membersTable.roleUpdated"));
    } catch {
      toast.error(t("genericError"));
    }
  }

  async function handleRemoveMember(userId: Id<"users">) {
    try {
      await removeMember({ slug, userId });
      toast.success(t("membersTable.memberRemoved"));
    } catch {
      toast.error(t("genericError"));
    }
  }

  async function handleInviteRoleChange(
    invitationId: Id<"organizationInvitations">,
    role: TenantTeamRole,
  ) {
    try {
      await setInviteRole({ slug, invitationId, role });
      toast.success(t("invitesTable.roleUpdated"));
    } catch {
      toast.error(t("genericError"));
    }
  }

  async function handleCancelInvitation(
    invitationId: Id<"organizationInvitations">,
  ) {
    try {
      await cancelInvitation({ slug, invitationId });
      toast.success(t("invitesTable.inviteCancelled"));
    } catch {
      toast.error(t("genericError"));
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <TenantOrganizationActionsMenu
          slug={slug}
          isActive={organization.isActive}
          canDeactivate={canDeactivateOrganization}
        />
      </div>

      <TenantOrganizationInformationCard
        organization={organization}
        canEditImage={canManage}
        canEditName={canAssignOwner}
      />

      <Tabs defaultValue="members" className="gap-4">
        <div className="flex items-center justify-between gap-4">
          <TabsList className="border border-border/70 bg-card **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:px-1.5">
            <TabsTrigger value="members">
              {t("membersTab")}{" "}
              <Badge variant="secondary">{membersCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="invites">
              {t("invitesTab")}{" "}
              <Badge variant="secondary">{invitationsCount}</Badge>
            </TabsTrigger>
          </TabsList>

          <TenantInviteTeamMemberDialog
            slug={slug}
            canManage={canManage}
            allowOwner={canAssignOwner}
          />
        </div>

        <TabsContent value="members" className="mt-0">
          <TenantTeamMembersTable
            members={members}
            isLoading={membersStatus === "LoadingFirstPage"}
            canManage={canManage}
            allowOwner={canAssignOwner}
            onRoleChange={handleMemberRoleChange}
            onRemoveMember={handleRemoveMember}
          />
          {membersStatus === "CanLoadMore" ||
          membersStatus === "LoadingMore" ? (
            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                variant="outline"
                disabled={membersStatus === "LoadingMore"}
                onClick={() => loadMoreMembers(TENANT_TEAM_MEMBERS_PAGE_SIZE)}
              >
                {membersStatus === "LoadingMore"
                  ? t("loadingMore")
                  : t("loadMore")}
              </Button>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="invites" className="mt-0">
          <TenantOrganizationInvitationsTable
            invitations={invitations}
            isLoading={invitationsStatus === "LoadingFirstPage"}
            canManage={canManage}
            allowOwner={canAssignOwner}
            onRoleChange={handleInviteRoleChange}
            onCancelInvitation={handleCancelInvitation}
          />
          {invitationsStatus === "CanLoadMore" ||
          invitationsStatus === "LoadingMore" ? (
            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                variant="outline"
                disabled={invitationsStatus === "LoadingMore"}
                onClick={() =>
                  loadMoreInvitations(TENANT_TEAM_INVITATIONS_PAGE_SIZE)
                }
              >
                {invitationsStatus === "LoadingMore"
                  ? t("loadingMore")
                  : t("loadMore")}
              </Button>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </section>
  );
}
