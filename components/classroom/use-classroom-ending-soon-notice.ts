"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
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
  const hydrated = useHydrated();
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener("storage", notify);
    return () => window.removeEventListener("storage", notify);
  }, []);
  const getSnapshot = useCallback(
    () =>
      Boolean(
        noticeKey && persistDismissal && wasClassroomNoticeDismissed(noticeKey),
      ),
    [noticeKey, persistDismissal],
  );
  const storedDismissal = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => false,
  );

  const dismissNotice = () => {
    if (!noticeKey) return;
    if (persistDismissal) storeClassroomNoticeDismissal(noticeKey);
    setDismissedNoticeKey(noticeKey);
  };

  return {
    dismissNotice,
    shouldShowNotice:
      hydrated &&
      shouldShowClassroomEndingSoonNotice({
        isEndingSoon,
        noticeKey,
        dismissedNoticeKey: storedDismissal ? noticeKey : dismissedNoticeKey,
      }),
  };
}
