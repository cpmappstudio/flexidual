/** Transport rules shared by the canvas and the Convex whiteboard endpoints. */
export const WHITEBOARD_BUCKET_COUNT = 64;
export const MAX_WHITEBOARD_BUCKET_BYTES = 8 * 1024 * 1024;
export const MAX_WHITEBOARD_PART_BYTES = 128 * 1024;
export const MAX_WHITEBOARD_PARTS = 64;

export type WhiteboardElement = {
  id: string;
  version: number;
  versionNonce: number;
  isDeleted?: boolean;
  index?: string | null;
  [key: string]: unknown;
};

export function whiteboardBucketId(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1)
    hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return (hash >>> 0) % WHITEBOARD_BUCKET_COUNT;
}

export function whiteboardJsonBytes(json: string) {
  return new TextEncoder().encode(json).byteLength;
}

export function splitWhiteboardPayload(json: string): string[] {
  const bytes = new TextEncoder().encode(json);
  if (bytes.byteLength > MAX_WHITEBOARD_BUCKET_BYTES)
    throw new Error("WHITEBOARD_BUCKET_TOO_LARGE");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const parts: string[] = [];
  for (let start = 0; start < bytes.length; ) {
    let end = Math.min(start + MAX_WHITEBOARD_PART_BYTES, bytes.length);
    // Move before a UTF-8 continuation byte; each fragment is independently
    // valid Unicode and never splits an emoji's surrogate pair on transport.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    parts.push(decoder.decode(bytes.subarray(start, end)));
    start = end;
  }
  if (parts.length > MAX_WHITEBOARD_PARTS)
    throw new Error("WHITEBOARD_BUCKET_TOO_LARGE");
  return parts;
}

export function joinWhiteboardPayload(parts: readonly string[]): string {
  if (parts.length > MAX_WHITEBOARD_PARTS)
    throw new Error("WHITEBOARD_BUCKET_TOO_LARGE");
  let bytes = 0;
  for (const part of parts) {
    const size = whiteboardJsonBytes(part);
    bytes += size;
    if (size > MAX_WHITEBOARD_PART_BYTES || bytes > MAX_WHITEBOARD_BUCKET_BYTES)
      throw new Error("WHITEBOARD_BUCKET_TOO_LARGE");
  }
  return parts.length ? parts.join("") : "[]";
}

export function parseWhiteboardElements(
  json: string,
  { legacy = false }: { legacy?: boolean } = {},
): WhiteboardElement[] {
  const value: unknown = JSON.parse(json);
  if (!Array.isArray(value)) throw new Error("INVALID_WHITEBOARD_ELEMENTS");
  const ids = new Set<string>();
  return value.map((element: unknown) => {
    if (!element || typeof element !== "object" || Array.isArray(element))
      throw new Error("INVALID_WHITEBOARD_ELEMENTS");
    const item = element as Record<string, unknown>;
    const version = item.version ?? (legacy ? 0 : undefined);
    const versionNonce = item.versionNonce ?? (legacy ? 0 : undefined);
    if (
      typeof item.id !== "string" ||
      !item.id ||
      item.id.length > 256 ||
      ids.has(item.id) ||
      typeof version !== "number" ||
      !Number.isSafeInteger(version) ||
      version < 0 ||
      typeof versionNonce !== "number" ||
      !Number.isSafeInteger(versionNonce) ||
      versionNonce < 0 ||
      (item.isDeleted !== undefined && typeof item.isDeleted !== "boolean") ||
      (item.index !== undefined &&
        item.index !== null &&
        typeof item.index !== "string")
    )
      throw new Error("INVALID_WHITEBOARD_ELEMENTS");
    ids.add(item.id);
    return { ...item, id: item.id, version, versionNonce } as WhiteboardElement;
  });
}

export function sortWhiteboardElements<T extends WhiteboardElement>(
  elements: readonly T[],
  legacyOrder: readonly string[] = [],
): T[] {
  const positions = new Map(legacyOrder.map((id, position) => [id, position]));
  // A mixed comparator (indices for some pairs, legacy positions for others)
  // is not transitive. Keep the legacy total order until Excalidraw restores
  // valid indices for the entire scene, then use those indices exclusively.
  const allIndexed = elements.every(
    (element) => typeof element.index === "string" && element.index.length > 0,
  );
  return [...elements].sort((a, b) => {
    // Excalidraw 0.18 uses fractional indices; never sort these with localeCompare.
    if (allIndexed && a.index !== b.index) return a.index! < b.index! ? -1 : 1;
    const aPosition = positions.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bPosition = positions.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (aPosition !== bPosition) return aPosition - bPosition;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function mergeWhiteboardElements<T extends WhiteboardElement>(
  local: readonly T[],
  remote: readonly T[],
  legacyOrder: readonly string[] = [],
): T[] {
  const merged = new Map(local.map((element) => [element.id, element]));
  for (const element of remote) {
    const current = merged.get(element.id);
    // Same rule as installed Excalidraw's reconcileElements: higher version,
    // then lower nonce; an exact tie accepts the remote payload. Retain
    // tombstones so delayed older edits cannot resurrect them.
    if (
      !current ||
      element.version > current.version ||
      (element.version === current.version &&
        element.versionNonce <= current.versionNonce)
    )
      merged.set(element.id, element);
  }
  return sortWhiteboardElements([...merged.values()], legacyOrder);
}

/** Excalidraw mutates editor objects. Keep query/cache objects outside that boundary. */
export function isolateWhiteboardElements<T extends WhiteboardElement>(
  remote: readonly T[],
  local: readonly T[] = [],
): T[] {
  const existing = new Map(local.map((element) => [element.id, element]));
  return remote.map((element) => {
    const current = existing.get(element.id);
    return current &&
      current.version === element.version &&
      current.versionNonce === element.versionNonce &&
      current.isDeleted === element.isDeleted &&
      current.index === element.index
      ? current
      : structuredClone(element);
  });
}
