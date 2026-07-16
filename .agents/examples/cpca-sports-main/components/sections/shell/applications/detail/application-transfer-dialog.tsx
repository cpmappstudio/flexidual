"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery } from "convex/react";
import { ArrowRightLeft, Search } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { MemberInviteForm } from "../../settings/member-invite-form";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { InputGroupAddon } from "@/components/ui/input-group";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export type TransferUser = {
  _id: Id<"users">;
  firstName: string;
  lastName: string;
  email: string;
  imageUrl?: string;
};

export function getTransferUserDisplayName(
  user: Pick<TransferUser, "firstName" | "lastName" | "email"> | null,
): string {
  if (!user) {
    return "-";
  }
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  return fullName || user.email || "-";
}

export function getTransferUserInitials(
  user: Pick<TransferUser, "firstName" | "lastName" | "email"> | null,
): string {
  if (!user) {
    return "NA";
  }
  const fromName = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`
    .trim()
    .toUpperCase();
  return fromName || user.email.charAt(0).toUpperCase() || "NA";
}

interface TransferUserRowProps {
  label: string;
  user: TransferUser | null;
}

function TransferUserRow({ label, user }: TransferUserRowProps) {
  const displayName = getTransferUserDisplayName(user);
  const email = user?.email ?? "-";

  return (
    <div className="min-w-0 rounded-md border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 flex min-w-0 items-center gap-2">
        <Avatar
          src={user?.imageUrl}
          initials={getTransferUserInitials(user)}
          alt={displayName}
          className="size-7 bg-muted text-muted-foreground"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={displayName}>
            {displayName}
          </p>
          <p className="truncate text-xs text-muted-foreground" title={email}>
            {email}
          </p>
        </div>
      </div>
    </div>
  );
}

interface ApplicationTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: Id<"applications">;
  organizationId: Id<"organizations">;
  organizationSlug: string;
  sourceUser: TransferUser;
}

type TransferUserGroup = {
  value: string;
  items: TransferUser[];
};

export function ApplicationTransferDialog({
  open,
  onOpenChange,
  applicationId,
  organizationId,
  organizationSlug,
  sourceUser,
}: ApplicationTransferDialogProps) {
  const t = useTranslations("Applications.detail");
  const transferOwnership = useMutation(api.applications.transferOwnership);
  const organizationMembers = useQuery(api.members.listByOrganization, {
    organizationId,
  });

  const [selectedTargetUserId, setSelectedTargetUserId] =
    useState<Id<"users"> | null>(null);
  const [isTransferConfirmOpen, setIsTransferConfirmOpen] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);

  const transferCandidates = useMemo<TransferUser[]>(
    () =>
      (organizationMembers ?? [])
        .map(({ user }) => ({
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          imageUrl: user.imageUrl,
        }))
        .filter((user) => user._id !== sourceUser._id),
    [organizationMembers, sourceUser._id],
  );

  const transferCandidateGroups = useMemo<TransferUserGroup[]>(
    () => [
      {
        value: t("transfer.selectDestination"),
        items: transferCandidates,
      },
    ],
    [t, transferCandidates],
  );

  const selectedTargetUser =
    transferCandidates.find((user) => user._id === selectedTargetUserId) ??
    null;

  const resetTransferState = () => {
    setSelectedTargetUserId(null);
    setIsTransferConfirmOpen(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      resetTransferState();
    }
  };

  const handleTransferActionClick = () => {
    if (!selectedTargetUserId) {
      toast.error(t("transfer.errors.selectDestination"));
      return;
    }
    setIsTransferConfirmOpen(true);
  };

  const handleConfirmTransfer = async () => {
    if (!selectedTargetUserId) {
      toast.error(t("transfer.errors.selectDestination"));
      return;
    }

    setIsTransferring(true);
    try {
      await transferOwnership({
        applicationId,
        targetUserId: selectedTargetUserId,
      });
      toast.success(t("transfer.success"));
      handleOpenChange(false);
    } catch (error) {
      console.error("Failed to transfer application ownership:", error);
      toast.error(t("transfer.errors.generic"));
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <>
      {open && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-40 bg-black/50"
        />
      )}
      <Dialog open={open} onOpenChange={handleOpenChange} modal={false}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-2xl max-h-[85vh] overflow-y-auto"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{t("transfer.title")}</DialogTitle>
            <DialogDescription>{t("transfer.description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
              <TransferUserRow label={t("transfer.source")} user={sourceUser} />
              <div className="hidden justify-center sm:flex">
                <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
              </div>
              <TransferUserRow
                label={t("transfer.destination")}
                user={selectedTargetUser}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">
                {t("transfer.selectDestination")}
              </p>
              <Combobox<TransferUser>
                items={transferCandidateGroups}
                onValueChange={(candidate) =>
                  setSelectedTargetUserId(candidate ? candidate._id : null)
                }
                itemToStringLabel={(candidate) =>
                  candidate ? getTransferUserDisplayName(candidate) : ""
                }
                itemToStringValue={(candidate) =>
                  candidate
                    ? `${candidate.firstName} ${candidate.lastName} ${candidate.email}`
                    : ""
                }
              >
                <ComboboxInput
                  placeholder={t("transfer.destinationPlaceholder")}
                  aria-label={t("transfer.selectDestination")}
                >
                  <InputGroupAddon>
                    <Search />
                  </InputGroupAddon>
                </ComboboxInput>
                <ComboboxContent alignOffset={-28}>
                  <ComboboxEmpty>{t("transfer.noResults")}</ComboboxEmpty>
                  <ComboboxList>
                    {(group: TransferUserGroup) => (
                      <ComboboxGroup key={group.value} items={group.items}>
                        <ComboboxLabel>{group.value}</ComboboxLabel>
                        <ComboboxCollection>
                          {(candidate: TransferUser) => (
                            <ComboboxItem key={candidate._id} value={candidate}>
                              <Avatar
                                src={candidate.imageUrl}
                                initials={getTransferUserInitials(candidate)}
                                alt={getTransferUserDisplayName(candidate)}
                                className="size-6 bg-muted text-muted-foreground"
                              />
                              <span className="min-w-0 flex flex-col">
                                <span
                                  className="truncate text-sm font-medium"
                                  title={getTransferUserDisplayName(candidate)}
                                >
                                  {getTransferUserDisplayName(candidate)}
                                </span>
                                <span
                                  className="truncate text-xs text-muted-foreground"
                                  title={candidate.email}
                                >
                                  {candidate.email}
                                </span>
                              </span>
                            </ComboboxItem>
                          )}
                        </ComboboxCollection>
                      </ComboboxGroup>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>

            <div className="min-w-0 rounded-md border border-dashed p-3">
              <p className="text-sm font-medium">{t("transfer.inviteTitle")}</p>
              <p className="mb-2 text-xs text-muted-foreground">
                {t("transfer.inviteDescription")}
              </p>
              <MemberInviteForm tenant={organizationSlug} />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isTransferring}
            >
              {t("transfer.cancel")}
            </Button>
            <Button
              onClick={handleTransferActionClick}
              disabled={!selectedTargetUserId || isTransferring}
            >
              {isTransferring
                ? t("transfer.transferring")
                : t("transfer.action")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isTransferConfirmOpen}
        onOpenChange={setIsTransferConfirmOpen}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary">
              <ArrowRightLeft />
            </AlertDialogMedia>
            <AlertDialogTitle>{t("transfer.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("transfer.confirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-2">
            <TransferUserRow label={t("transfer.source")} user={sourceUser} />
            <TransferUserRow
              label={t("transfer.destination")}
              user={selectedTargetUser}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" disabled={isTransferring}>
              {t("transfer.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmTransfer}
              disabled={isTransferring || !selectedTargetUser}
            >
              {isTransferring
                ? t("transfer.transferring")
                : t("transfer.confirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
