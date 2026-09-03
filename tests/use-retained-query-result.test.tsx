import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRetainedQueryResult } from "@/hooks/use-retained-query-result";

describe("useRetainedQueryResult", () => {
  it("returns undefined until the first result arrives", () => {
    const { result } = renderHook(() =>
      useRetainedQueryResult<string>(undefined, "room-1"),
    );

    expect(result.current).toBeUndefined();
  });

  it("retains the last result during a same-scope refresh", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useRetainedQueryResult(value, "room-1"),
      { initialProps: { value: "ready" as string | undefined } },
    );

    act(() => rerender({ value: undefined }));

    expect(result.current).toBe("ready");
  });

  it("treats null as an authoritative result", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useRetainedQueryResult(value, "room-1"),
      { initialProps: { value: "ready" as string | null | undefined } },
    );

    act(() => rerender({ value: null }));

    expect(result.current).toBeNull();
  });

  it("does not retain a result after the scope changes", () => {
    const { result, rerender } = renderHook(
      ({ value, scopeKey }) => useRetainedQueryResult(value, scopeKey),
      {
        initialProps: {
          value: "room-1-data" as string | undefined,
          scopeKey: "room-1",
        },
      },
    );

    act(() => rerender({ value: undefined, scopeKey: "room-2" }));

    expect(result.current).toBeUndefined();
  });
});
