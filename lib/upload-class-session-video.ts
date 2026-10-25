import type { ConvexReactClient } from "convex/react";
import { ConvexError } from "convex/values";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import {
  SESSION_VIDEO_PART_BYTES,
  validSessionVideo,
} from "./class-session-video";

function uploadPart(
  url: string,
  body: Blob,
  signal: AbortSignal | undefined,
  onProgress: (bytes: number) => void,
) {
  return new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    request.open("PUT", url);
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onload = () => {
      const etag = request.getResponseHeader("ETag");
      if (request.status >= 200 && request.status < 300 && etag) resolve(etag);
      else reject(new Error(`Video part upload failed (${request.status})`));
    };
    request.onerror = () => reject(new Error("Video part network error"));
    request.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    request.onloadend = () => signal?.removeEventListener("abort", abort);
    try {
      request.send(body);
    } catch (error) {
      signal?.removeEventListener("abort", abort);
      reject(error);
    }
  });
}

/** Shared upload transport; the session-management UI can choose where to expose it. */
export async function uploadClassSessionVideo(
  client: ConvexReactClient,
  {
    scheduleId,
    file,
    durationMs,
    lessonIds,
    signal,
    onProgress,
    onFinalizing,
  }: {
    scheduleId: Id<"classSchedule">;
    file: File;
    durationMs: number;
    lessonIds?: Id<"lessons">[];
    signal?: AbortSignal;
    onProgress?: (progress: { loaded: number; total: number }) => void;
    onFinalizing?: () => void;
  },
) {
  if (
    !validSessionVideo({
      name: file.name,
      contentType: file.type,
      size: file.size,
      durationMs,
    })
  )
    throw new Error("INVALID_SESSION_VIDEO");
  signal?.throwIfAborted();
  const { id } = await client.action(api.classSessionVideoStorage.begin, {
    scheduleId,
    name: file.name,
    contentType: file.type,
    size: file.size,
    durationMs,
    lessonIds,
  });
  const parts: { partNumber: number; etag: string }[] = [];
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const uploadSignal = controller.signal;
  const progress = new Map<number, number>();
  const report = () =>
    onProgress?.({
      loaded: [...progress.values()].reduce((a, b) => a + b, 0),
      total: file.size,
    });
  try {
    const count = Math.ceil(file.size / SESSION_VIDEO_PART_BYTES);
    for (let first = 1; first <= count; first += 8) {
      uploadSignal.throwIfAborted();
      const numbers = Array.from(
        { length: Math.min(8, count - first + 1) },
        (_, i) => first + i,
      );
      const signed = await client.action(
        api.classSessionVideoStorage.signParts,
        { id, partNumbers: numbers },
      );
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(2, signed.length) }, async () => {
          while (next < signed.length) {
            const part = signed[next++];
            const body = file.slice(
              (part.partNumber - 1) * SESSION_VIDEO_PART_BYTES,
              part.partNumber * SESSION_VIDEO_PART_BYTES,
            );
            let url = part.url;
            for (let attempt = 0; ; attempt++) {
              uploadSignal.throwIfAborted();
              try {
                const etag = await uploadPart(
                  url,
                  body,
                  uploadSignal,
                  (loaded) => {
                    progress.set(part.partNumber, Math.min(loaded, body.size));
                    report();
                  },
                );
                parts.push({ partNumber: part.partNumber, etag });
                progress.set(part.partNumber, body.size);
                report();
                break;
              } catch (error) {
                if (uploadSignal.aborted || attempt >= 2) throw error;
                // Keep successful parts; renew only the failed part's permission/URL.
                [{ url }] = await client.action(
                  api.classSessionVideoStorage.signParts,
                  { id, partNumbers: [part.partNumber] },
                );
              }
            }
          }
        }),
      );
    }
    const completion = {
      id,
      parts: parts.sort((a, b) => a.partNumber - b.partNumber),
    };
    // The server commit is not abortable; the UI must stop offering cancellation here.
    onFinalizing?.();
    for (let attempt = 0; ; attempt++) {
      uploadSignal.throwIfAborted();
      try {
        await client.action(api.classSessionVideoStorage.complete, completion);
        break;
      } catch (error) {
        // Completion is idempotent: recover a lost acknowledgement, never retry a denial.
        if (error instanceof ConvexError || attempt >= 1) throw error;
      }
    }
    return id;
  } catch (error) {
    controller.abort();
    // Server expiry remains the cleanup fallback when the network is unavailable.
    await client
      .mutation(api.classSessionVideos.cancel, { id })
      .catch(() => undefined);
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

export function readSessionVideoDuration(file: File, signal?: AbortSignal) {
  return new Promise<number>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      const duration = video.duration * 1000;
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve(duration);
    };
    const abort = () => finish(new DOMException("Aborted", "AbortError"));
    const timeout = setTimeout(
      () => finish(new Error("INVALID_SESSION_VIDEO")),
      15_000,
    );
    video.preload = "metadata";
    video.onloadedmetadata = () =>
      finish(
        Number.isFinite(video.duration) && video.duration > 0
          ? undefined
          : new Error("INVALID_SESSION_VIDEO"),
      );
    video.onerror = () => finish(new Error("INVALID_SESSION_VIDEO"));
    signal?.addEventListener("abort", abort, { once: true });
    video.src = url;
  });
}
