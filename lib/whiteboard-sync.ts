import type { WhiteboardElement } from "./whiteboard-elements";

export function elementRevision(element: WhiteboardElement) {
  return JSON.stringify([
    element.version,
    element.versionNonce,
    element.isDeleted,
    element.index,
  ]);
}

/** One durable write in flight. Later edits coalesce without postponing delivery. */
export function createWhiteboardSync<T extends WhiteboardElement>(options: {
  send: (elements: T[]) => Promise<unknown>;
  saved: (elements: readonly T[]) => void;
  error: (error: unknown) => void;
  interval?: number;
}) {
  const acknowledged = new Map<string, string>();
  let latest: readonly T[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let closed = false;
  let retryDelay = 1000;

  const changes = () =>
    latest.filter(
      (element) => acknowledged.get(element.id) !== elementRevision(element),
    );
  const hasChanges = () =>
    latest.some(
      (element) => acknowledged.get(element.id) !== elementRevision(element),
    );
  const schedule = (delay = options.interval ?? 80) => {
    if (!timer && !inFlight && !closed)
      timer = setTimeout(() => void flush(), delay);
  };
  async function flush() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (inFlight) return;
    const pending = changes();
    if (!pending.length) return;
    // Excalidraw can mutate elements while a network request is pending.
    const sent = JSON.parse(JSON.stringify(pending)) as T[];
    inFlight = true;
    try {
      await options.send(sent);
      for (const element of sent)
        acknowledged.set(element.id, elementRevision(element));
      retryDelay = 1000;
      // Remote revisions can arrive during send. Confirm the current scene only
      // after every local revision in it is acknowledged, not the old send snapshot.
      if (!hasChanges()) options.saved(latest);
      else if (closed) void flushAfterCurrent();
      else scheduleAfterCurrent();
    } catch (error) {
      options.error(error);
      const permanent =
        /STALE_LIVE_ACTIVATION|STALE_WHITEBOARD_GENERATION|PERMISSION_DENIED|NOT_AUTHENTICATED|LIMIT|TOO_LARGE|INVALID_|UPGRADE_REQUIRED/.test(
          String(error),
        );
      if (!permanent && !closed) {
        const delay = retryDelay;
        retryDelay = Math.min(10_000, retryDelay * 2);
        queueMicrotask(() => schedule(delay));
      }
    } finally {
      inFlight = false;
    }
  }
  function scheduleAfterCurrent() {
    queueMicrotask(() => schedule());
  }
  function flushAfterCurrent() {
    queueMicrotask(() => void flush());
  }
  return {
    seed(elements: readonly T[]) {
      for (const element of elements)
        acknowledged.set(element.id, elementRevision(element));
      if (!latest.length) latest = elements;
    },
    update(elements: readonly T[]) {
      // Normally Excalidraw supplies tombstones. Preserve deletion even for resetScene().
      // Equal-length replacements can still omit a deletion queued before flush.
      const ids = new Set(elements.map((element) => element.id));
      const removed = latest
        .filter((element) => !ids.has(element.id))
        .map((element) => ({
          ...element,
          isDeleted: true,
          version: element.isDeleted ? element.version : element.version + 1,
        }));
      latest = [...elements, ...removed];
      if (hasChanges()) schedule();
      return latest;
    },
    flush,
    hasPending: () => inFlight || hasChanges(),
    resume() {
      closed = false;
      if (hasChanges()) schedule();
    },
    dispose() {
      closed = true;
      void flush();
    },
  };
}
