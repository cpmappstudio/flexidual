import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { Id } from "@/convex/_generated/dataModel";

export type WhiteboardFileRefs = Record<
  string,
  { url: string; mimeType: string; storageId: Id<"_storage">; created?: number }
>;

export interface WhiteboardDraft {
  elements: readonly ExcalidrawElement[];
  files: BinaryFiles;
  fileRefs?: WhiteboardFileRefs;
  /** Drawing confirmation is independent of pending image uploads. */
  saved?: boolean;
}

interface StoredDraft extends Omit<WhiteboardDraft, "files"> {
  fileIds: string[];
  draftUpdatedAt: number;
}

type LoadedDraft = WhiteboardDraft & { draftUpdatedAt?: number };

const DATABASE = "flexidual-whiteboard-drafts";
const queues = new Map<string, Promise<unknown>>();
const storedFiles = new Map<string, Map<string, BinaryFileData>>();
let database: Promise<IDBDatabase> | undefined;
let lastTimestamp = 0;

function rememberFiles(room: string, files: Map<string, BinaryFileData>) {
  storedFiles.delete(room);
  storedFiles.set(room, files);
  if (storedFiles.size > 2)
    storedFiles.delete(storedFiles.keys().next().value!);
}

export function whiteboardSceneRevision(
  elements: readonly ExcalidrawElement[],
) {
  return JSON.stringify(
    elements.map(({ id, version, versionNonce, isDeleted, index }) => [
      id,
      version,
      versionNonce,
      isDeleted,
      index,
    ]),
  );
}

function enqueue<T>(room: string, operation: () => Promise<T>): Promise<T> {
  const next = (queues.get(room) ?? Promise.resolve()).then(
    operation,
    operation,
  );
  queues.set(room, next);
  void next
    .finally(() => {
      if (queues.get(room) === next) queues.delete(room);
    })
    .catch(() => {});
  return next;
}

function openDatabase() {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is unavailable"));
        return;
      }
      const request = indexedDB.open(DATABASE, 1);
      let blocked = false;
      request.onupgradeneeded = () => {
        request.result.createObjectStore("scenes");
        request.result.createObjectStore("files");
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        blocked = true;
        reject(new Error("Whiteboard draft storage is blocked"));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) {
          db.close();
          return;
        }
        db.onversionchange = () => {
          db.close();
          database = undefined;
          storedFiles.clear();
        };
        resolve(db);
      };
    }).catch((error: unknown) => {
      database = undefined;
      throw error;
    });
  }
  return database;
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

function readLegacy(room: string): LoadedDraft | null {
  try {
    const raw = localStorage.getItem(`wb_${room}`);
    if (!raw) return null;
    const draft = JSON.parse(raw) as LoadedDraft;
    if (!Array.isArray(draft.elements)) return null;
    return { ...draft, files: draft.files ?? {} };
  } catch {
    return null;
  }
}

async function read(room: string): Promise<LoadedDraft | null> {
  const legacy = readLegacy(room);
  lastTimestamp = Math.max(lastTimestamp, legacy?.draftUpdatedAt ?? 0);
  try {
    const db = await openDatabase();
    const transaction = db.transaction(["scenes", "files"], "readonly");
    const done = completed(transaction);
    // Handle transaction rejection even if a request fails first.
    void done.catch(() => {});
    const scene = await result<StoredDraft | undefined>(
      transaction.objectStore("scenes").get(room),
    );
    if (!scene) {
      await done;
      return legacy;
    }
    lastTimestamp = Math.max(lastTimestamp, scene.draftUpdatedAt);
    const files = await Promise.all(
      scene.fileIds.map((id) =>
        result<BinaryFileData | undefined>(
          transaction.objectStore("files").get([room, id]),
        ),
      ),
    );
    await done;
    const binaries: BinaryFiles = {};
    for (const file of files) if (file) binaries[file.id] = file;
    rememberFiles(room, new Map(Object.entries(binaries)));
    if ((legacy?.draftUpdatedAt ?? 0) > scene.draftUpdatedAt) return legacy;
    return {
      elements: scene.elements,
      files: binaries,
      fileRefs: scene.fileRefs,
      saved: scene.saved,
      draftUpdatedAt: scene.draftUpdatedAt,
    };
  } catch {
    return legacy;
  }
}

function snapshot(draft: WhiteboardDraft): WhiteboardDraft {
  return {
    // Excalidraw can mutate elements after onChange; capture before awaiting storage.
    elements: structuredClone(draft.elements),
    files: Object.fromEntries(
      Object.entries(draft.files).map(([id, file]) => [id, { ...file }]),
    ),
    fileRefs: draft.fileRefs
      ? Object.fromEntries(
          Object.entries(draft.fileRefs).map(([id, ref]) => [id, { ...ref }]),
        )
      : undefined,
    saved: draft.saved,
  };
}

async function write(room: string, draft: WhiteboardDraft): Promise<boolean> {
  const draftUpdatedAt = Math.max(Date.now(), lastTimestamp + 1);
  lastTimestamp = draftUpdatedAt;
  let transaction: IDBTransaction | undefined;
  try {
    const db = await openDatabase();
    transaction = db.transaction(["scenes", "files"], "readwrite");
    const done = completed(transaction);
    void done.catch(() => {});
    const previousFiles = storedFiles.get(room);
    for (const [id, file] of Object.entries(draft.files)) {
      const previous = previousFiles?.get(id);
      if (
        !previous ||
        previous.version !== file.version ||
        previous.dataURL !== file.dataURL ||
        previous.mimeType !== file.mimeType
      ) {
        transaction.objectStore("files").put(file, [room, id]);
      }
    }
    const scene: StoredDraft = {
      elements: draft.elements,
      fileIds: Object.keys(draft.files),
      fileRefs: draft.fileRefs,
      saved: draft.saved,
      draftUpdatedAt,
    };
    transaction.objectStore("scenes").put(scene, room);
    await done;
    rememberFiles(room, new Map(Object.entries(draft.files)));
    return true;
  } catch {
    try {
      transaction?.abort();
    } catch {
      // An asynchronous quota failure may already have aborted the transaction.
    }
    try {
      // Compatibility fallback; callers schedule saves outside the drawing hot path.
      localStorage.setItem(
        `wb_${room}`,
        JSON.stringify({ ...draft, draftUpdatedAt }),
      );
      return true;
    } catch {
      // Preserve the preceding recoverable draft when both stores reject writes.
      return false;
    }
  }
}

/** A read/check/put transaction also protects against another browser tab's save. */
async function confirmIndexedDB(
  room: string,
  matches: (elements: readonly ExcalidrawElement[]) => boolean,
  fileRefs: WhiteboardFileRefs,
): Promise<boolean | null> {
  let transaction: IDBTransaction | undefined;
  try {
    const db = await openDatabase();
    transaction = db.transaction(["scenes"], "readwrite");
    const done = completed(transaction);
    const store = transaction.objectStore("scenes");
    const request = store.get(room);
    let confirmed: boolean | null = null;
    request.onsuccess = () => {
      try {
        const scene = request.result as StoredDraft | undefined;
        if (!scene) return;
        const legacy = readLegacy(room);
        if ((legacy?.draftUpdatedAt ?? 0) > scene.draftUpdatedAt) return;
        confirmed = false;
        if (!matches(scene.elements)) return;
        store.put(
          {
            ...scene,
            fileRefs: { ...scene.fileRefs, ...fileRefs },
            saved: true,
          },
          room,
        );
        confirmed = true;
      } catch {
        transaction?.abort();
      }
    };
    await done;
    return confirmed;
  } catch {
    try {
      transaction?.abort();
    } catch {
      /* already aborted */
    }
    return null;
  }
}

function confirmLegacy(
  room: string,
  matches: (elements: readonly ExcalidrawElement[]) => boolean,
  fileRefs: WhiteboardFileRefs,
): boolean {
  try {
    const raw = localStorage.getItem(`wb_${room}`);
    if (!raw) return false;
    const legacy = JSON.parse(raw) as WhiteboardDraft;
    if (!matches(legacy.elements)) return false;
    const confirmed = { ...legacy, saved: true };
    try {
      localStorage.setItem(
        `wb_${room}`,
        JSON.stringify({
          ...confirmed,
          fileRefs: { ...legacy.fileRefs, ...fileRefs },
        }),
      );
    } catch {
      // Replacing false with true can fit a full legacy store; preserve its shape.
      localStorage.setItem(`wb_${room}`, JSON.stringify(confirmed));
    }
    return true;
  } catch {
    return false;
  }
}

export const whiteboardDraftStorage = {
  load(room: string): Promise<WhiteboardDraft | null> {
    return enqueue(room, () => read(room));
  },

  save(room: string, draft: WhiteboardDraft): Promise<boolean> {
    const captured = snapshot(draft);
    return enqueue(room, () => write(room, captured));
  },

  /**
   * supersededRevision is only supplied after the caller verifies that the latest
   * cloud scene is confirmed. It retires stale drawing state, not its image files.
   */
  confirm(
    room: string,
    confirmedRevision: string,
    fileRefs: WhiteboardFileRefs = {},
    supersededRevision?: string | null,
  ): Promise<boolean> {
    const capturedRefs = Object.fromEntries(
      Object.entries(fileRefs).map(([id, ref]) => [id, { ...ref }]),
    );
    return enqueue(room, async () => {
      const matches = (elements: readonly ExcalidrawElement[]) => {
        const revision = whiteboardSceneRevision(elements);
        return (
          revision === confirmedRevision || revision === supersededRevision
        );
      };
      const confirmed = await confirmIndexedDB(room, matches, capturedRefs);
      return confirmed ?? confirmLegacy(room, matches, capturedRefs);
    });
  },
};
