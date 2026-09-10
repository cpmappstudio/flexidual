"use client";

import { useEffect } from "react";
import { useConvexAuth, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const DISPLAY_LIMIT = 100;
const PAGE_SIZE = 50;

export function useUnreadNotificationCount() {
  const { isAuthenticated } = useConvexAuth();
  const { results, status, loadMore } = usePaginatedQuery(
    api.systemNotifications.listUnread,
    isAuthenticated ? {} : "skip",
    { initialNumItems: PAGE_SIZE },
  );
  const count = Math.min(results.length, DISPLAY_LIMIT);
  useEffect(() => {
    if (isAuthenticated && count < DISPLAY_LIMIT && status === "CanLoadMore") {
      loadMore(PAGE_SIZE);
    }
  }, [isAuthenticated, count, status, loadMore]);
  return isAuthenticated ? count : 0;
}
