import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useUnreadNotificationCount } from "@/hooks/use-unread-notification-count";

const state = vi.hoisted(() => ({
  authenticated: true,
  results: [] as string[],
  status: "Exhausted",
  loadMore: vi.fn(),
  query: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: state.authenticated }),
  usePaginatedQuery: (...args: unknown[]) => {
    state.query(...args);
    return {
      results: state.results,
      status: state.status,
      loadMore: state.loadMore,
    };
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  state.authenticated = true;
  state.results = [];
  state.status = "Exhausted";
  state.loadMore.mockClear();
  state.query.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test("continues beyond empty filtered pages and stops at the display limit", () => {
  state.status = "CanLoadMore";
  const { result, rerender } = renderHook(useUnreadNotificationCount);
  expect(result.current).toBe(0);
  expect(state.loadMore).toHaveBeenCalledExactlyOnceWith(50);
  state.status = "LoadingMore";
  rerender();
  expect(state.loadMore).toHaveBeenCalledTimes(1);
  state.status = "CanLoadMore";
  rerender();
  expect(state.loadMore).toHaveBeenCalledTimes(2);
  state.results = Array.from({ length: 120 }, (_, i) => String(i));
  rerender();
  expect(result.current).toBe(100);
  expect(state.loadMore).toHaveBeenCalledTimes(2);
  // A reactive read/archive update can lower the count; resume if needed.
  state.results = state.results.slice(0, 20);
  rerender();
  expect(result.current).toBe(20);
  expect(state.loadMore).toHaveBeenCalledTimes(3);
});

test("does not poll, change time arguments, or subscribe when signed out", () => {
  state.results = ["notification"];
  const { result, rerender } = renderHook(useUnreadNotificationCount);
  const originalArgs = state.query.mock.calls[0];
  act(() => vi.advanceTimersByTime(10 * 60_000));
  expect(state.query).toHaveBeenCalledTimes(1);
  expect(state.loadMore).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  rerender();
  expect(state.query.mock.lastCall).toEqual(originalArgs);
  expect(originalArgs[1]).toEqual({});
  state.authenticated = false;
  state.status = "CanLoadMore";
  rerender();
  expect(state.query.mock.lastCall?.[1]).toBe("skip");
  expect(state.loadMore).not.toHaveBeenCalled();
  expect(result.current).toBe(0);
});
