"use client";

import { useState } from "react";
import { toast } from "sonner";

type ActiveStatusToggleMessages = {
  activated: string;
  deactivated: string;
  error: string;
};

export function useActiveStatusToggle({
  canManage,
  messages,
  onStatusChanged,
  setActive,
}: {
  canManage: boolean;
  messages: ActiveStatusToggleMessages;
  onStatusChanged?: (nextIsActive: boolean) => void;
  setActive: (nextIsActive: boolean) => Promise<void>;
}) {
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  async function updateStatus(nextIsActive: boolean) {
    if (!canManage || isPending) {
      return;
    }

    setIsPending(true);

    try {
      await setActive(nextIsActive);
      toast.success(
        nextIsActive ? messages.activated : messages.deactivated,
      );
      if (!nextIsActive) {
        setIsDeactivateDialogOpen(false);
      }
      onStatusChanged?.(nextIsActive);
    } catch {
      toast.error(messages.error);
    } finally {
      setIsPending(false);
    }
  }

  function handleStatusChange(nextIsActive: boolean) {
    if (!canManage || isPending) {
      return;
    }

    if (!nextIsActive) {
      setIsDeactivateDialogOpen(true);
      return;
    }

    void updateStatus(nextIsActive);
  }

  return {
    confirmDeactivate: () => updateStatus(false),
    handleStatusChange,
    isDeactivateDialogOpen,
    isPending,
    setIsDeactivateDialogOpen,
  };
}
