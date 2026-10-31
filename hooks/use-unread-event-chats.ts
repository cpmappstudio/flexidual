"use client";

import { useEffect } from "react";
import { useConvexAuth, usePaginatedQuery, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { api } from "@/convex/_generated/api";

export function useUnreadEventChats() {
  const { isAuthenticated } = useConvexAuth();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const context = useQuery(
    api.organizations.resolveSlug,
    isAuthenticated ? { slug: orgSlug } : "skip",
  );
  const campus = useQuery(
    api.campuses.get,
    context?.type === "campus" ? { id: context._id } : "skip",
  );
  const { results, status, loadMore } = usePaginatedQuery(
    api.eventChatNotifications.listUnread,
    isAuthenticated ? {} : "skip",
    { initialNumItems: 50 },
  );
  useEffect(() => {
    if (status === "CanLoadMore") loadMore(50);
  }, [status, loadMore]);
  const counts = new Map<(typeof results)[number]["eventId"], number>();
  for (const item of results) {
    if (
      !context ||
      (context.type === "campus"
        ? item.campusId !== context._id &&
          !(item.campusId === undefined && item.schoolId === campus?.schoolId)
        : context.type === "school" && item.schoolId !== context._id)
    )
      continue;
    counts.set(item.eventId, (counts.get(item.eventId) ?? 0) + item.count);
  }
  return counts;
}
