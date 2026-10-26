"use client";

import { useEffect } from "react";
import { useConvexAuth, usePaginatedQuery, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { api } from "@/convex/_generated/api";

export function useUnreadCourseChats() {
  const { isAuthenticated } = useConvexAuth();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const context = useQuery(
    api.organizations.resolveSlug,
    isAuthenticated ? { slug: orgSlug } : "skip",
  );
  const broadcastScope = useQuery(
    api.broadcasts.scope,
    isAuthenticated ? { orgSlug } : "skip",
  );
  const { results, status, loadMore } = usePaginatedQuery(
    api.courseChatNotifications.listUnread,
    isAuthenticated ? {} : "skip",
    { initialNumItems: 50 },
  );
  useEffect(() => {
    if (status === "CanLoadMore") loadMore(50);
  }, [status, loadMore]);
  const counts = new Map<string, number>();
  for (const item of results.filter(
    (item) =>
      context &&
      (context.type === "campus"
        ? item.campusId === context._id ||
          Boolean(
            item.broadcastId &&
              !item.campusId &&
              item.schoolId === broadcastScope?.schoolId,
          )
        : context.type === "school"
          ? item.schoolId === context._id
          : true),
  )) {
    const id = item.classId ?? item.broadcastId;
    if (id) counts.set(id, (counts.get(id) ?? 0) + item.count);
  }
  return counts;
}
