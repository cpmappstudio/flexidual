"use client";

import { useEffect } from "react";
import { useConvexAuth, usePaginatedQuery } from "convex/react";
import { useParams } from "next/navigation";
import { api } from "@/convex/_generated/api";

export function useUnreadCourseChats() {
  const { isAuthenticated } = useConvexAuth();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const indexed = usePaginatedQuery(
    api.courseChatNotifications.listUnreadForBadges,
    isAuthenticated && orgSlug ? { orgSlug, legacy: false } : "skip",
    { initialNumItems: 50 },
  );
  const legacy = usePaginatedQuery(
    api.courseChatNotifications.listUnreadForBadges,
    isAuthenticated && orgSlug ? { orgSlug, legacy: true } : "skip",
    { initialNumItems: 50 },
  );
  const { status, loadMore } = indexed;
  const { status: legacyStatus, loadMore: loadMoreLegacy } = legacy;
  useEffect(() => {
    if (status === "CanLoadMore") loadMore(50);
  }, [status, loadMore]);
  useEffect(() => {
    if (legacyStatus === "CanLoadMore") loadMoreLegacy(50);
  }, [legacyStatus, loadMoreLegacy]);
  const counts = new Map<string, number>();
  // A backfilled row can briefly appear in both reactive snapshots. Count its
  // source notification once, while retaining independent task notices.
  const seen = new Set<string>();
  for (const item of [...indexed.results, ...legacy.results]) {
    if (seen.has(item.notificationId)) continue;
    seen.add(item.notificationId);
    const id = item.classId ?? item.broadcastId;
    if (id) counts.set(id, (counts.get(id) ?? 0) + item.count);
  }
  return counts;
}
