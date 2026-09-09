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
  const { results, status, loadMore } = usePaginatedQuery(
    api.courseChatNotifications.listUnread,
    isAuthenticated ? {} : "skip",
    { initialNumItems: 50 },
  );
  useEffect(() => {
    if (status === "CanLoadMore") loadMore(50);
  }, [status, loadMore]);
  return new Map(
    results
      .filter(
        (item) =>
          context &&
          (context.type === "campus"
            ? item.campusId === context._id
            : context.type === "school"
              ? item.schoolId === context._id
              : true),
      )
      .map((item) => [item.classId, item.count]),
  );
}
