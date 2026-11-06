import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useUnreadCourseChats } from "@/hooks/use-unread-course-chats";

type Badge = {
  notificationId: string;
  classId?: string;
  broadcastId?: string;
  count: number;
};
const state = vi.hoisted(() => ({
  authenticated: true,
  slug: "campus",
  indexed: [] as Badge[],
  legacy: [] as Badge[],
  indexedStatus: "Exhausted",
  legacyStatus: "Exhausted",
  loadIndexed: vi.fn(),
  loadLegacy: vi.fn(),
  args: [] as unknown[],
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: state.slug }),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: state.authenticated }),
  usePaginatedQuery: (_query: unknown, args: "skip" | { legacy: boolean }) => {
    state.args.push(args);
    const legacy = args !== "skip" && args.legacy;
    return {
      results: args === "skip" ? [] : legacy ? state.legacy : state.indexed,
      status: legacy ? state.legacyStatus : state.indexedStatus,
      loadMore: legacy ? state.loadLegacy : state.loadIndexed,
    };
  },
}));
beforeEach(() => {
  state.authenticated = true;
  state.slug = "campus";
  state.indexed = [];
  state.legacy = [];
  state.indexedStatus = "Exhausted";
  state.legacyStatus = "Exhausted";
  state.args = [];
  state.loadIndexed.mockClear();
  state.loadLegacy.mockClear();
});
afterEach(cleanup);

test("exhausts both lanes and counts a backfilled snapshot once without merging independent task notices", () => {
  state.indexed = [
    { notificationId: "chat", classId: "course", count: 4 },
    { notificationId: "task", classId: "course", count: 1 },
  ];
  state.legacy = [
    { notificationId: "chat", classId: "course", count: 4 },
    { notificationId: "reminder", classId: "course", count: 1 },
    { notificationId: "broadcast", broadcastId: "broadcast", count: 2 },
  ];
  state.indexedStatus = state.legacyStatus = "CanLoadMore";
  const { result, rerender } = renderHook(() => useUnreadCourseChats());
  expect(result.current.get("course")).toBe(6);
  expect(result.current.get("broadcast")).toBe(2);
  expect(state.args).toEqual([
    { orgSlug: "campus", legacy: false },
    { orgSlug: "campus", legacy: true },
  ]);
  expect(state.loadIndexed).toHaveBeenCalledWith(50);
  expect(state.loadLegacy).toHaveBeenCalledWith(50);
  state.indexedStatus = state.legacyStatus = "Exhausted";
  state.indexed.push({
    notificationId: "later-page",
    classId: "course",
    count: 3,
  });
  rerender();
  expect(result.current.get("course")).toBe(9);
});

test("passes changed organization scope to both lanes and skips all reads without auth", () => {
  const { result, rerender } = renderHook(() => useUnreadCourseChats());
  state.slug = "other-campus";
  rerender();
  expect(state.args.slice(-2)).toEqual([
    { orgSlug: "other-campus", legacy: false },
    { orgSlug: "other-campus", legacy: true },
  ]);
  state.authenticated = false;
  rerender();
  expect(state.args.slice(-2)).toEqual(["skip", "skip"]);
  expect(result.current.size).toBe(0);
});
