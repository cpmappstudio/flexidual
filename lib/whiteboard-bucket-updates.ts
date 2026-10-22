import {
  joinWhiteboardPayload,
  mergeWhiteboardElements,
  parseWhiteboardElements,
  splitWhiteboardPayload,
  whiteboardJsonBytes,
  type WhiteboardElement,
} from "./whiteboard-elements";

export const MAX_WHITEBOARD_RECENT_UPDATES = 32;
export const MAX_WHITEBOARD_RECENT_BYTES = 64 * 1024;
export type WhiteboardBucketCursor = {
  sourceId: string;
  generation: number;
  revision: number;
};
export type WhiteboardBucketHistory = {
  generation: number;
  revision: number;
  entries: { revision: number; parts: string[] }[];
};

/** A bounded acceleration layer; the canonical bucket remains the recovery source. */
export function appendWhiteboardBucketHistory(
  previous: WhiteboardBucketHistory | null | undefined,
  generation: number,
  previousRevision: number,
  changes: readonly WhiteboardElement[],
): WhiteboardBucketHistory {
  const revision = previousRevision + 1;
  const parts = splitWhiteboardPayload(JSON.stringify(changes));
  const entries = [
    ...(previous?.generation === generation &&
    previous.revision === previousRevision
      ? previous.entries
      : []),
    { revision, parts },
  ];
  while (
    entries.length > MAX_WHITEBOARD_RECENT_UPDATES ||
    whiteboardJsonBytes(JSON.stringify(entries)) > MAX_WHITEBOARD_RECENT_BYTES
  )
    entries.shift();
  return { generation, revision, entries };
}

/** null means the reader needs a snapshot, never a truncated change set. */
export function readWhiteboardBucketHistory(
  history: WhiteboardBucketHistory | null | undefined,
  cursor: WhiteboardBucketCursor,
): { parts: string[]; checkpoint: boolean } | null {
  if (
    !history ||
    history.generation !== cursor.generation ||
    !Number.isSafeInteger(cursor.revision) ||
    cursor.revision <
      (history.entries[0]?.revision ?? history.revision + 1) - 1 ||
    cursor.revision > history.revision
  )
    return null;
  const entries = history.entries.filter(
    (entry) => entry.revision > cursor.revision,
  );
  const elements = entries.flatMap((entry) =>
    parseWhiteboardElements(joinWhiteboardPayload(entry.parts)),
  );
  return {
    parts: elements.length
      ? splitWhiteboardPayload(
          JSON.stringify(mergeWhiteboardElements([], elements)),
        )
      : [],
    // Leave headroom for updates in flight. Renew only after the client applies
    // this response, before either retention limit expires a healthy reader.
    checkpoint:
      entries.length >= MAX_WHITEBOARD_RECENT_UPDATES / 2 ||
      whiteboardJsonBytes(JSON.stringify(entries)) >=
        MAX_WHITEBOARD_RECENT_BYTES / 2,
  };
}

export type WhiteboardBucketResult = {
  generation: number;
  parts: string[];
  sourceId?: string;
  revision?: number;
  baseRevision?: number | null;
  checkpoint?: boolean;
};
export type CachedWhiteboardBucket = {
  result: WhiteboardBucketResult;
  elements: WhiteboardElement[];
  anchor?: WhiteboardBucketCursor;
};

/** Repeated deltas are safe; checkpoints advance only after a complete merge. */
export function applyWhiteboardBucketResult(
  previous: CachedWhiteboardBucket | undefined,
  result: WhiteboardBucketResult,
): CachedWhiteboardBucket | undefined {
  if (previous?.result === result) return previous;
  const sameSource =
    previous?.result.sourceId === result.sourceId &&
    previous?.result.generation === result.generation;
  if (
    sameSource &&
    previous?.result.revision !== undefined &&
    result.revision !== undefined &&
    result.revision < previous.result.revision
  )
    return previous;
  const anchor =
    result.sourceId !== undefined && result.revision !== undefined
      ? {
          sourceId: result.sourceId,
          generation: result.generation,
          revision: result.revision,
        }
      : undefined;
  if (result.baseRevision != null) {
    if (
      !previous ||
      !sameSource ||
      previous.result.revision === undefined ||
      previous.result.revision < result.baseRevision
    )
      return undefined;
    const changes = parseWhiteboardElements(
      joinWhiteboardPayload(result.parts),
    );
    return {
      result,
      anchor: result.checkpoint ? (anchor ?? previous.anchor) : previous.anchor,
      elements: changes.length
        ? mergeWhiteboardElements(previous.elements, changes)
        : previous.elements,
    };
  }
  const elements = parseWhiteboardElements(joinWhiteboardPayload(result.parts));
  return { result, elements, anchor };
}
