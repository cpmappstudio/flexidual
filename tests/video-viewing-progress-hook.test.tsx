import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { useVideoViewingProgress } from "@/hooks/use-video-viewing-progress";

const mocks = vi.hoisted(() => ({
  start: vi.fn<(video: HTMLVideoElement, options: { isCurrent: () => boolean }) => () => void>(
    () => vi.fn(),
  ),
  auth: { user: { id: "student-a" }, session: { id: "session-a" } },
  client: { url: "https://backend.test", action: vi.fn(), mutation: vi.fn() },
}));
vi.mock("@clerk/nextjs", () => ({ useClerk: () => mocks.auth }));
vi.mock("convex/react", () => ({ useConvex: () => mocks.client }));
vi.mock("@/lib/video-progress-session", () => ({
  startVideoProgress: mocks.start,
}));
afterEach(() => {
  cleanup();
  mocks.start.mockClear();
  mocks.auth.user.id = "student-a";
  mocks.auth.session.id = "session-a";
});

test.each(["user", "session"] as const)(
  "finalization still detects a changed %s after the player unmounts",
  (changed) => {
    const video = document.createElement("video");
    Object.defineProperty(video, "duration", { value: 120 });
    const view = renderHook(() =>
      useVideoViewingProgress(
        "video" as Id<"classSessionVideos">,
        video,
        true,
        "student-a:session-a",
        "student-a",
      ),
    );
    const options = mocks.start.mock.calls[0][1];
    expect(options.isCurrent()).toBe(true);
    view.unmount();
    expect(options.isCurrent()).toBe(true);
    mocks.auth[changed].id = "another-identity";
    expect(options.isCurrent()).toBe(false);
  },
);
