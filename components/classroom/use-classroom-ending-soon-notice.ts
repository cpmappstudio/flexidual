"use client";

import { useEffect, useState } from "react";
import {
  getClassroomEndingSoonStorageKey,
  shouldShowClassroomEndingSoonNotice,
  type ClassroomEndingSoonNoticeKey,
} from "./classroom-ending-soon";

function wasClassroomNoticeDismissed(noticeKey: ClassroomEndingSoonNoticeKey) {
  try {
    return (
      window.sessionStorage.getItem(
        getClassroomEndingSoonStorageKey(noticeKey),
      ) === "dismissed"
    );
  } catch {
    return false;
  }
}

function storeClassroomNoticeDismissal(
  noticeKey: ClassroomEndingSoonNoticeKey,
) {
  try {
    window.sessionStorage.setItem(
      getClassroomEndingSoonStorageKey(noticeKey),
      "dismissed",
    );
  } catch {
    // The in-memory dismissal still applies when browser storage is unavailable.
  }
}

export function useClassroomEndingSoonNotice({
  isEndingSoon,
  noticeKey,
  persistDismissal = true,
}: {
  isEndingSoon: boolean;
  noticeKey: ClassroomEndingSoonNoticeKey | null;
  persistDismissal?: boolean;
}) {
  const [dismissedNoticeKey, setDismissedNoticeKey] =
    useState<ClassroomEndingSoonNoticeKey | null>(null);
  const [restoredNoticeKey, setRestoredNoticeKey] =
    useState<ClassroomEndingSoonNoticeKey | null>(null);

  useEffect(() => {
    if (!noticeKey) {
      setDismissedNoticeKey(null);
      setRestoredNoticeKey(null);
      return;
    }

    const wasDismissed =
      persistDismissal && wasClassroomNoticeDismissed(noticeKey);
    setDismissedNoticeKey(wasDismissed ? noticeKey : null);
    setRestoredNoticeKey(noticeKey);
  }, [noticeKey, persistDismissal]);

  const dismissNotice = () => {
    if (!noticeKey) return;
    if (persistDismissal) storeClassroomNoticeDismissal(noticeKey);
    setDismissedNoticeKey(noticeKey);
  };

  return {
    dismissNotice,
    shouldShowNotice:
      restoredNoticeKey === noticeKey &&
      shouldShowClassroomEndingSoonNotice({
        isEndingSoon,
        noticeKey,
        dismissedNoticeKey,
      }),
  };
}
