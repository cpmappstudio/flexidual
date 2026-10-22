import {
  MAX_WHITEBOARD_BUCKET_BYTES,
  mergeWhiteboardElements,
  validateWhiteboardElements,
  type WhiteboardElement,
} from "./whiteboard-elements";
import { elementRevision } from "./whiteboard-sync";

export const WHITEBOARD_SCENE_TOPIC = "flexidual.whiteboard.scene.v1";
export const MAX_WHITEBOARD_LIVE_BYTES = MAX_WHITEBOARD_BUCKET_BYTES + 2048;
export const WHITEBOARD_SAVE_INTERVAL = 750;

export type WhiteboardLiveScope = {
  roomName: string;
  liveRoomName: string;
  generation: number;
  sourceId: string;
};

/** Images stay in authenticated file storage; the live channel carries elements only. */
export function encodeWhiteboardLiveChanges(
  scope: WhiteboardLiveScope,
  elements: readonly WhiteboardElement[],
): Uint8Array[] {
  const encoder = new TextEncoder();
  const prefix = JSON.stringify({ ...scope, elements: [] });
  const overhead = encoder.encode(prefix).length;
  const batches: Uint8Array[] = [];
  let parts: string[] = [];
  let size = overhead;
  const flush = () => {
    if (parts.length)
      batches.push(
        encoder.encode(prefix.slice(0, -2) + parts.join(",") + "]}"),
      );
    parts = [];
    size = overhead;
  };
  for (const element of elements) {
    const json = JSON.stringify(element);
    const bytes = encoder.encode(json).length + 1;
    // Oversized previews use the existing durable path, never truncate a drawing.
    if (bytes + overhead > MAX_WHITEBOARD_LIVE_BYTES) continue;
    if (size + bytes > MAX_WHITEBOARD_LIVE_BYTES) flush();
    parts.push(json);
    size += bytes;
  }
  flush();
  return batches;
}

export function decodeWhiteboardLiveChanges(
  bytes: Uint8Array,
  scope: WhiteboardLiveScope,
): WhiteboardElement[] {
  if (bytes.length > MAX_WHITEBOARD_LIVE_BYTES)
    throw new Error("WHITEBOARD_LIVE_TOO_LARGE");
  const value: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  if (!value || typeof value !== "object")
    throw new Error("INVALID_WHITEBOARD_LIVE");
  const message = value as Record<string, unknown>;
  if (
    Object.entries(scope).some(([key, expected]) => message[key] !== expected)
  )
    throw new Error("STALE_WHITEBOARD_LIVE");
  return validateWhiteboardElements(message.elements);
}

/** Keep only live revisions not yet represented by the durable snapshot. */
export function pendingWhiteboardLiveChanges<T extends WhiteboardElement>(
  preview: readonly T[],
  durable: readonly T[],
): T[] {
  const stored = new Map(durable.map((element) => [element.id, element]));
  return preview.filter((element) => {
    const current = stored.get(element.id);
    return (
      !current ||
      (elementRevision(current) !== elementRevision(element) &&
        mergeWhiteboardElements([current], [element])[0] === element)
    );
  });
}
