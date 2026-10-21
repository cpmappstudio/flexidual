import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";
import type { Id } from "@/convex/_generated/dataModel";
import { createWhiteboardSync } from "@/lib/whiteboard-sync";

// A transactional IDB test double: writes become visible only at commit, and
// quota errors roll back the whole scene/files transaction, as browsers do.
function indexedDatabase() {
  const stores = new Map<string, Map<string, unknown>>();
  const fileWrites: unknown[] = [];
  const transactions: Array<{ names: string[]; mode: string }> = [];
  let otherTabSave: (() => void) | undefined;
  let rejectWrites = false;
  let rejectReads = false;
  let rejectScenePut = false;
  const db = {
    close() {},
    createObjectStore(name: string) {
      stores.set(name, new Map());
    },
    transaction(names: string[], mode: string) {
      transactions.push({ names, mode });
      if (mode === "readwrite" && otherTabSave) {
        otherTabSave();
        otherTabSave = undefined;
      }
      const staged = new Map(
        names.map((name) => [name, new Map(stores.get(name))]),
      );
      let pending = 0;
      let timer: ReturnType<typeof setTimeout>;
      const transaction = {
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        error: null as DOMException | null,
        abort() {
          transaction.error = new DOMException("Aborted", "AbortError");
          finish();
        },
        objectStore(name: string) {
          const request = (action: () => unknown, write = false) => {
            pending += 1;
            clearTimeout(timer);
            const req = {
              result: undefined as unknown,
              error: null as DOMException | null,
              onsuccess: null as (() => void) | null,
              onerror: null as (() => void) | null,
            };
            setTimeout(() => {
              if ((write && rejectWrites) || (!write && rejectReads)) {
                transaction.error = new DOMException(
                  "Full",
                  "QuotaExceededError",
                );
                req.error = transaction.error;
                req.onerror?.();
              } else {
                req.result = structuredClone(action());
                req.onsuccess?.();
              }
              pending -= 1;
              finish();
            }, 0);
            return req;
          };
          return {
            get(key: unknown) {
              return request(() => staged.get(name)?.get(JSON.stringify(key)));
            },
            put(value: unknown, key: unknown) {
              if (name === "scenes" && rejectScenePut)
                throw new DOMException("Full", "QuotaExceededError");
              const captured = structuredClone(value);
              if (name === "files") fileWrites.push(captured);
              return request(() => {
                staged.get(name)?.set(JSON.stringify(key), captured);
                return key;
              }, true);
            },
          };
        },
      };
      function finish() {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (pending) return;
          if (transaction.error) transaction.onabort?.();
          else {
            if (mode === "readwrite")
              for (const [name, values] of staged) stores.set(name, values);
            if (mode === "readonly" && otherTabSave) {
              otherTabSave();
              otherTabSave = undefined;
            }
            transaction.oncomplete?.();
          }
        }, 0);
      }
      finish();
      return transaction;
    },
  };
  const factory = {
    open() {
      const req = {
        result: db,
        error: null,
        onupgradeneeded: null as (() => void) | null,
        onsuccess: null as (() => void) | null,
      };
      setTimeout(() => {
        if (!stores.size) req.onupgradeneeded?.();
        req.onsuccess?.();
      }, 0);
      return req;
    },
  };
  return {
    factory,
    fileWrites,
    transactions,
    interleaveOtherTabSave(room: string, elements: ExcalidrawElement[]) {
      otherTabSave = () => {
        const scenes = stores.get("scenes")!;
        const previous = scenes.get(JSON.stringify(room)) as Record<
          string,
          unknown
        >;
        scenes.set(JSON.stringify(room), {
          ...previous,
          elements,
          saved: false,
          draftUpdatedAt: Number(previous.draftUpdatedAt) + 1,
        });
      };
    },
    failWrites: () => {
      rejectWrites = true;
    },
    failReads: () => {
      rejectReads = true;
    },
    failScenePut: () => {
      rejectScenePut = true;
    },
  };
}

const element = (version = 1) =>
  ({
    id: "drawing",
    version,
    versionNonce: version,
    isDeleted: false,
  }) as ExcalidrawElement;
const image = {
  id: "image",
  dataURL: "data:image/png;base64,AA==",
  mimeType: "image/png",
  created: 1,
} as BinaryFileData;
const refs = {
  image: {
    url: "https://files.example/image",
    mimeType: "image/png",
    storageId: "blob" as Id<"_storage">,
  },
};

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("recovers drawings and images after reopening with localStorage full, without rewriting unchanged images", async () => {
  const idb = indexedDatabase();
  vi.stubGlobal("indexedDB", idb.factory);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  const { whiteboardDraftStorage: storage } = await import(
    "@/lib/whiteboard-draft-storage"
  );
  expect(
    await storage.save("room", {
      elements: [element()],
      files: { image },
      saved: false,
    }),
  ).toBe(true);
  expect(
    await storage.save("room", {
      elements: [element(2)],
      files: { image },
      saved: false,
    }),
  ).toBe(true);
  expect(idb.fileWrites).toHaveLength(1);

  vi.resetModules();
  const reopened = (await import("@/lib/whiteboard-draft-storage"))
    .whiteboardDraftStorage;
  expect(await reopened.load("room")).toMatchObject({
    elements: [element(2)],
    files: { image },
    saved: false,
  });
});

it("captures each queued save before awaiting and does not let an old confirmation retire a newer draft", async () => {
  vi.stubGlobal("indexedDB", indexedDatabase().factory);
  const { whiteboardDraftStorage: storage, whiteboardSceneRevision: revision } =
    await import("@/lib/whiteboard-draft-storage");
  const drawing = element();
  const first = storage.save("room", {
    elements: [drawing],
    files: { image },
    saved: false,
  });
  Object.assign(drawing, element(2));
  await first;
  expect((await storage.load("room"))?.elements).toEqual([element()]);
  const newer = storage.save("room", {
    elements: [element(2)],
    files: { image },
    saved: false,
  });
  const staleConfirmation = storage.confirm(
    "room",
    revision([element()]),
    refs,
  );
  await newer;
  expect(await staleConfirmation).toBe(false);
  expect((await storage.load("room"))?.saved).toBe(false);
});

it("keeps pending image bytes when the latest cloud scene supersedes an older cached drawing", async () => {
  const idb = indexedDatabase();
  vi.stubGlobal("indexedDB", idb.factory);
  const { whiteboardDraftStorage: storage, whiteboardSceneRevision: revision } =
    await import("@/lib/whiteboard-draft-storage");
  await storage.save("room", {
    elements: [element()],
    files: { image },
    saved: false,
  });
  expect(
    await storage.confirm(
      "room",
      revision([element(2)]),
      {},
      revision([element()]),
    ),
  ).toBe(true);
  expect(await storage.load("room")).toMatchObject({
    elements: [element()],
    files: { image },
    saved: true,
  });
  expect(idb.fileWrites).toHaveLength(1);
});

it("loads legacy drafts, falls back when IDB is unavailable, and never deletes the prior draft on quota errors", async () => {
  vi.stubGlobal("indexedDB", undefined);
  const previous = { elements: [element()], files: { image }, saved: false };
  localStorage.setItem("wb_room", JSON.stringify(previous));
  const { whiteboardDraftStorage: storage, whiteboardSceneRevision: revision } =
    await import("@/lib/whiteboard-draft-storage");
  expect(await storage.load("room")).toEqual(previous);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  expect(
    await storage.save("room", {
      elements: [element(2)],
      files: { image },
      saved: false,
    }),
  ).toBe(false);
  expect(await storage.confirm("room", revision([element()]), refs)).toBe(
    false,
  );
  expect(await storage.load("room")).toEqual(previous);
});

it("chooses a newer fallback draft after an atomic IDB quota failure", async () => {
  const idb = indexedDatabase();
  vi.stubGlobal("indexedDB", idb.factory);
  const { whiteboardDraftStorage: storage } = await import(
    "@/lib/whiteboard-draft-storage"
  );
  await storage.save("room", {
    elements: [element()],
    files: { image },
    saved: false,
  });
  idb.failWrites();
  const replacement: BinaryFileData = {
    ...image,
    dataURL: "data:image/png;base64,AQ==" as BinaryFileData["dataURL"],
  };
  expect(
    await storage.save("room", {
      elements: [element(2)],
      files: { image: replacement },
      saved: false,
    }),
  ).toBe(true);
  expect(await storage.load("room")).toMatchObject({
    elements: [element(2)],
    files: { image: replacement },
    saved: false,
  });
  vi.resetModules();
  const reopened = (await import("@/lib/whiteboard-draft-storage"))
    .whiteboardDraftStorage;
  expect(await reopened.load("room")).toMatchObject({
    elements: [element(2)],
    files: { image: replacement },
  });
});

it("uses the recoverable legacy draft when an IDB read request fails", async () => {
  const idb = indexedDatabase();
  vi.stubGlobal("indexedDB", idb.factory);
  const legacy = { elements: [element()], files: { image }, saved: false };
  localStorage.setItem("wb_room", JSON.stringify(legacy));
  const storage = (await import("@/lib/whiteboard-draft-storage"))
    .whiteboardDraftStorage;
  await storage.save("room", { ...legacy, elements: [element(2)] });
  idb.failReads();
  expect(await storage.load("room")).toEqual(legacy);
});

it("rolls back preceding file puts if a scene put throws and both stores are full", async () => {
  const idb = indexedDatabase();
  vi.stubGlobal("indexedDB", idb.factory);
  const storage = (await import("@/lib/whiteboard-draft-storage"))
    .whiteboardDraftStorage;
  const original = { elements: [element()], files: { image }, saved: false };
  await storage.save("room", original);
  idb.failScenePut();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  const changedImage: BinaryFileData = { ...image, version: 2 };
  expect(
    await storage.save("room", {
      elements: [element(2)],
      files: { image: changedImage },
      saved: false,
    }),
  ).toBe(false);
  expect(await storage.load("room")).toMatchObject(original);
});

it("bounds the binary dedup cache without deleting images from older rooms", async () => {
  const idb = indexedDatabase();
  vi.stubGlobal("indexedDB", idb.factory);
  const storage = (await import("@/lib/whiteboard-draft-storage"))
    .whiteboardDraftStorage;
  const draft = { elements: [element()], files: { image }, saved: false };
  for (const room of ["one", "two", "three"]) await storage.save(room, draft);
  expect(idb.fileWrites).toHaveLength(3);
  await storage.save("one", draft);
  expect(idb.fileWrites).toHaveLength(4); // Oldest in-memory room was evicted.
  for (const room of ["one", "two", "three"])
    expect(await storage.load(room)).toMatchObject({ files: { image } });
});

it("confirms in one scene-only transaction and cannot overwrite another tab's newer draft", async () => {
  const idb = indexedDatabase();
  vi.stubGlobal("indexedDB", idb.factory);
  const { whiteboardDraftStorage: storage, whiteboardSceneRevision: revision } =
    await import("@/lib/whiteboard-draft-storage");
  await storage.save("room", {
    elements: [element()],
    files: { image },
    saved: false,
  });
  idb.transactions.length = 0;
  idb.interleaveOtherTabSave("room", [element(2)]);
  expect(await storage.confirm("room", revision([element()]), refs)).toBe(
    false,
  );
  expect(idb.transactions).toEqual([{ names: ["scenes"], mode: "readwrite" }]);
  expect(await storage.load("room")).toMatchObject({
    elements: [element(2)],
    saved: false,
    files: { image },
  });
  const before = idb.fileWrites.length;
  expect(await storage.confirm("room", revision([element(2)]), refs)).toBe(
    true,
  );
  expect(idb.fileWrites).toHaveLength(before);
  expect(await storage.load("room")).toMatchObject({
    elements: [element(2)],
    saved: true,
    fileRefs: refs,
  });
});

it.each([false, true])(
  "concurrent acknowledgements and IDB reload keep pending images with localStorage full, newer edit=%s",
  async (newerEdit) => {
    const idb = indexedDatabase();
    vi.stubGlobal("indexedDB", idb.factory);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    const {
      whiteboardDraftStorage: storage,
      whiteboardSceneRevision: revision,
    } = await import("@/lib/whiteboard-draft-storage");
    const imageShape = {
      ...element(),
      id: "pending-image",
      type: "image",
      fileId: image.id,
    } as ExcalidrawElement;
    const initial = [element(), imageShape];
    const peer = { ...element(), id: "peer" };
    let release!: () => void;
    let confirmation: Promise<boolean> | undefined;
    const send = vi.fn<(elements: ExcalidrawElement[]) => Promise<void>>(
      async () => {},
    );
    send.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const error = vi.fn();
    const sync = createWhiteboardSync({
      send,
      error,
      saved: (elements) => {
        confirmation = storage.confirm("room", revision(elements));
      },
    });
    await storage.save("room", {
      elements: initial,
      files: { image },
      saved: false,
    });
    sync.update(initial);
    const inFlight = sync.flush();
    sync.seed([...initial, peer]);
    const current = [newerEdit ? element(2) : element(), imageShape, peer];
    sync.update(current);
    await storage.save("room", {
      elements: current,
      files: { image },
      saved: false,
    });
    release();
    await inFlight;
    if (newerEdit) {
      expect(confirmation).toBeUndefined();
      expect(await storage.load("room")).toMatchObject({
        elements: current,
        saved: false,
        files: { image },
      });
      await sync.flush();
    }
    expect(confirmation).toBeDefined();
    expect(await confirmation).toBe(true);
    expect(error).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(newerEdit ? 2 : 1);
    expect(idb.fileWrites).toHaveLength(1);
    sync.dispose();
    vi.resetModules();
    const reopened = (await import("@/lib/whiteboard-draft-storage"))
      .whiteboardDraftStorage;
    expect(await reopened.load("room")).toMatchObject({
      elements: current,
      saved: true,
      files: { image },
    });
    expect((await reopened.load("room"))?.fileRefs?.[image.id]).toBeUndefined();
  },
);
