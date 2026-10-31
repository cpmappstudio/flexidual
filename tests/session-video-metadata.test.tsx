import { afterEach, expect, test, vi } from "vitest";
import { readSessionVideoDuration } from "@/lib/upload-class-session-video";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function setup() {
  const video = document.createElement("video");
  vi.spyOn(document, "createElement").mockReturnValue(video);
  vi.spyOn(video, "load").mockImplementation(() => {});
  const revoke = vi.fn();
  vi.stubGlobal(
    "URL",
    Object.assign(class extends URL {}, {
      createObjectURL: () => "blob:test-video",
      revokeObjectURL: revoke,
    }),
  );
  return {
    video,
    revoke,
    file: new File(["video"], "lesson.mp4", { type: "video/mp4" }),
  };
}
test("reads native metadata only and releases the object URL and media resource", async () => {
  const s = setup();
  Object.defineProperty(s.video, "duration", { value: 42, configurable: true });
  const result = readSessionVideoDuration(s.file);
  s.video.dispatchEvent(new Event("loadedmetadata"));
  await expect(result).resolves.toBe(42_000);
  expect(s.revoke).toHaveBeenCalledExactlyOnceWith("blob:test-video");
  expect(s.video.getAttribute("src")).toBeNull();
  expect(s.video.onloadedmetadata).toBeNull();
});
test("aborting metadata reading releases resources and does not complete a later callback", async () => {
  const s = setup();
  const abort = new AbortController();
  const result = readSessionVideoDuration(s.file, abort.signal);
  abort.abort();
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  s.video.dispatchEvent(new Event("loadedmetadata"));
  expect(s.revoke).toHaveBeenCalledOnce();
});
test("an unreadable video times out instead of holding the upload editor forever", async () => {
  vi.useFakeTimers();
  const s = setup();
  const result = expect(readSessionVideoDuration(s.file)).rejects.toThrow(
    "INVALID_SESSION_VIDEO",
  );
  await vi.advanceTimersByTimeAsync(15_000);
  await result;
  expect(s.revoke).toHaveBeenCalledOnce();
});
