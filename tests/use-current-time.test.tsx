import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useCurrentTime } from "@/hooks/use-current-time";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test("starts with the exact time and refreshes just after the minute changes", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T10:15:30.500Z"));
  const { result } = renderHook(() => useCurrentTime());
  expect(result.current).toBe(Date.now());

  act(() => vi.advanceTimersByTime(29_525));
  expect(result.current).toBe(Date.now());
  expect(result.current).toBe(new Date("2026-10-01T10:16:00.025Z").getTime());
});
