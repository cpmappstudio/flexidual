import type { ConvexReactClient } from "convex/react";
import { getFunctionName } from "convex/server";
import { afterEach, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { uploadClassSessionVideo } from "@/lib/upload-class-session-video";

afterEach(() => vi.unstubAllGlobals());

test("finalization is announced before complete and a later external abort never cancels a confirmed video", async () => {
  vi.stubGlobal(
    "XMLHttpRequest",
    class {
      status = 200;
      upload = { onprogress: null };
      onload?: () => void;
      onloadend?: () => void;
      open() {}
      getResponseHeader() {
        return "etag-one";
      }
      send() {
        queueMicrotask(() => {
          this.onload?.();
          this.onloadend?.();
        });
      }
      abort() {}
    },
  );
  let finish!: () => void;
  let enter!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const finalizing = vi.fn();
  let announcedBeforeComplete = false;
  const action = vi.fn(async (reference, args) => {
    const name = getFunctionName(reference);
    if (name.endsWith(":begin"))
      return { id: "video", partSize: 8 * 1024 * 1024 };
    if (name.endsWith(":signParts"))
      return args.partNumbers.map((partNumber: number) => ({
        partNumber,
        url: "https://private.test/part",
      }));
    announcedBeforeComplete = finalizing.mock.calls.length === 1;
    enter();
    await gate;
    return null;
  });
  const mutation = vi.fn().mockResolvedValue(null);
  const controller = new AbortController();
  const upload = uploadClassSessionVideo(
    { action, mutation } as unknown as ConvexReactClient,
    {
      scheduleId: "schedule" as Id<"classSchedule">,
      file: new File(["video"], "lesson.mp4", { type: "video/mp4" }),
      durationMs: 60_000,
      signal: controller.signal,
      onFinalizing: finalizing,
    },
  );
  await entered;
  controller.abort();
  await Promise.resolve();
  finish();
  await expect(upload).resolves.toBe("video");
  expect(announcedBeforeComplete).toBe(true);
  expect(finalizing).toHaveBeenCalledOnce();
  expect(mutation).not.toHaveBeenCalled();
});
