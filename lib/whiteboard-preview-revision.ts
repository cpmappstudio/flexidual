import {
  whiteboardBucketId,
  type WhiteboardElement,
} from "./whiteboard-elements";
type RevisionElement = Pick<
  WhiteboardElement,
  "id" | "version" | "versionNonce" | "isDeleted" | "index"
>;

async function digest(value: unknown) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value)),
      ),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Canonical version metadata, including deletions; independent of array order. */
export function whiteboardPreviewBucketRevision(
  elements: readonly RevisionElement[],
) {
  return digest(
    [...elements]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map(({ id, version, versionNonce, isDeleted, index }) => [
        id,
        version,
        versionNonce,
        Boolean(isDeleted),
        index ?? null,
      ]),
  );
}

export function whiteboardPreviewSignature(
  buckets: readonly (readonly [number, string])[],
) {
  return digest([...buckets].sort(([a], [b]) => a - b));
}

export async function whiteboardPreviewRevision(
  elements: readonly RevisionElement[],
) {
  const buckets = new Map<number, RevisionElement[]>();
  for (const element of elements) {
    const id = whiteboardBucketId(element.id);
    const bucket = buckets.get(id) ?? [];
    bucket.push(element);
    buckets.set(id, bucket);
  }
  return whiteboardPreviewSignature(
    await Promise.all(
      [...buckets].map(
        async ([id, values]) =>
          [id, await whiteboardPreviewBucketRevision(values)] as const,
      ),
    ),
  );
}
