import { act, cleanup, renderHook } from "@testing-library/react";
import usePresence from "@convex-dev/presence/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "@/convex/_generated/api";

const mocks = vi.hoisted(() => ({
  heartbeat: vi.fn(),
  disconnect: vi.fn(),
  query: vi.fn(),
  client: { url: "https://presence-test.convex.cloud" },
}));

vi.mock("convex/react", () => ({
  useConvex: () => mocks.client,
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref) === "presence:heartbeat"
      ? mocks.heartbeat
      : mocks.disconnect,
  useQuery: mocks.query,
}));

const tokens = { roomToken: "room-token", sessionToken: "session-token" };
const connect = () =>
  renderHook(() => usePresence(api.presence, "user", "user", 30_000));

beforeEach(() => {
  vi.useFakeTimers();
  mocks.heartbeat.mockReset().mockResolvedValue(tokens);
  mocks.disconnect.mockReset().mockResolvedValue(null);
  mocks.query.mockReset().mockReturnValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  cleanup();
  await act(async () => {});
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Exercise the installed package, not a copy of its hook: losing the pnpm patch
// must fail this regression test. Upstream: get-convex/presence#54.
test.each(["rejection", "synchronous throw"])(
  "presence recovers from an initial %s on the next regular heartbeat",
  async (failure) => {
    const error = new Error("heartbeat unavailable");
    mocks.heartbeat.mockImplementationOnce(() => {
      if (failure === "synchronous throw") throw error;
      return Promise.reject(error);
    });
    const view = connect();
    await act(async () => {});
    expect(mocks.heartbeat).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      "Presence heartbeat failed",
      error,
    );

    await act(() => vi.advanceTimersByTimeAsync(29_999));
    expect(mocks.heartbeat).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(mocks.heartbeat).toHaveBeenCalledTimes(2);
    expect(mocks.query).toHaveBeenLastCalledWith(api.presence.list, {
      roomToken: tokens.roomToken,
    });

    view.unmount();
    await act(async () => {});
    expect(mocks.disconnect).toHaveBeenCalledWith({
      sessionToken: tokens.sessionToken,
    });
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(mocks.heartbeat).toHaveBeenCalledTimes(2);
  },
);

test("a rejected in-flight heartbeat drains its queued call even if that call throws", async () => {
  let rejectFirst!: (reason: Error) => void;
  mocks.heartbeat
    .mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectFirst = reject;
        }),
    )
    .mockImplementationOnce(() => {
      throw new Error("queued failure");
    });
  connect();
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  expect(mocks.heartbeat).toHaveBeenCalledTimes(1);

  await act(async () => {
    rejectFirst(new Error("first failure"));
  });
  expect(mocks.heartbeat).toHaveBeenCalledTimes(2);
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  expect(mocks.heartbeat).toHaveBeenCalledTimes(3);
  expect(mocks.query).toHaveBeenLastCalledWith(api.presence.list, {
    roomToken: tokens.roomToken,
  });
});

test("a failed renewal preserves the tokens and retries without creating a new session", async () => {
  connect();
  await act(async () => {});
  mocks.heartbeat.mockRejectedValueOnce(new Error("renewal failed"));
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  expect(mocks.query).toHaveBeenLastCalledWith(api.presence.list, {
    roomToken: tokens.roomToken,
  });
  await act(() => vi.advanceTimersByTimeAsync(30_000));
  expect(mocks.heartbeat).toHaveBeenCalledTimes(3);
  expect(mocks.heartbeat.mock.calls[2]).toEqual(mocks.heartbeat.mock.calls[0]);
});
