import { mergeCoverage, subtractCoverage } from "./video-progress";

let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  if (!database)
    database = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined")
        return reject(new Error("Progress storage unavailable"));
      // Do not upgrade the database: already-open v1 clients must keep working.
      const request = indexedDB.open("flexidual-video-progress");
      let blocked = false;
      request.onupgradeneeded = () => {
        request.result.createObjectStore("pending");
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        blocked = true;
        reject(new Error("Progress storage blocked"));
      };
      request.onsuccess = () => {
        if (blocked) {
          request.result.close();
          return;
        }
        request.result.onversionchange = () => {
          request.result.close();
          database = undefined;
        };
        resolve(request.result);
      };
    }).catch((error) => {
      database = undefined;
      throw error;
    });
  return database;
}

export type VideoPlaybackSnapshot = {
  coverage: ArrayBuffer;
  positionMs: number;
  updatedAt: number;
  durationMs: number;
};

function playbackLocation(db: IDBDatabase, id: string) {
  // Preserve bookmarks from the earlier local v2 implementation without a
  // downgrade or migration. v1 uses array keys, distinct from pending string IDs.
  return db.objectStoreNames.contains("playback")
    ? { store: "playback", key: id }
    : { store: "pending", key: ["playback", id] };
}

export async function readVideoPlayback(id: string) {
  const db = await openDatabase();
  const location = playbackLocation(db, id);
  return await new Promise<VideoPlaybackSnapshot | undefined>(
    (resolve, reject) => {
      const transaction = db.transaction(location.store, "readonly");
      const request = transaction.objectStore(location.store).get(location.key);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    },
  );
}

/** Keep coverage monotonic and ignore a delayed bookmark from an older player/tab. */
export async function updateVideoPlayback(
  id: string,
  incoming: VideoPlaybackSnapshot,
) {
  const db = await openDatabase();
  const location = playbackLocation(db, id);
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(location.store, "readwrite");
    const store = transaction.objectStore(location.store);
    const request = store.get(location.key);
    request.onsuccess = () => {
      const previous = request.result as VideoPlaybackSnapshot | undefined;
      const compatible = previous?.durationMs === incoming.durationMs;
      const bookmark =
        previous && previous.updatedAt > incoming.updatedAt
          ? previous
          : incoming;
      store.put(
        {
          ...bookmark,
          coverage: compatible
            ? mergeCoverage(
                new Uint8Array(previous.coverage),
                new Uint8Array(incoming.coverage),
              ).buffer
            : bookmark.coverage,
        } satisfies VideoPlaybackSnapshot,
        location.key,
      );
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/** Read/merge/acknowledge in one IDB transaction so tabs never overwrite each other. */
export async function updatePendingVideoProgress(
  id: string,
  incoming = new Uint8Array(),
  acknowledged = new Uint8Array(),
  previousId?: string,
) {
  const db = await openDatabase();
  return await new Promise<Uint8Array>((resolve, reject) => {
    const transaction = db.transaction("pending", "readwrite");
    const store = transaction.objectStore("pending");
    const keys = previousId && previousId !== id ? [id, previousId] : [id];
    const requests = keys.map((key) => store.get(key));
    let remaining = requests.length;
    let pending: Uint8Array;
    for (const request of requests)
      request.onsuccess = () => {
        if (--remaining) return;
        const previous = requests.reduce((result, item) => {
          const stored: unknown = item.result;
          return stored instanceof ArrayBuffer
            ? mergeCoverage(result, new Uint8Array(stored))
            : result;
        }, new Uint8Array());
        pending = subtractCoverage(
          mergeCoverage(previous, incoming),
          acknowledged,
        );
        if (pending.some((byte) => byte !== 0)) store.put(pending.buffer, id);
        else store.delete(id);
        if (keys.length === 2) store.delete(keys[1]);
      };
    transaction.oncomplete = () => resolve(pending);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Progress transaction aborted"));
  });
}
