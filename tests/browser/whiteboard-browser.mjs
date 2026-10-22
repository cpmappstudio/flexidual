// Real editor, scene hook, synchronization and draft storage; only service boundaries are replaced.
import React, {
  StrictMode,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { getFunctionName } from "convex/server";
import {
  convertToExcalidrawElements,
  CaptureUpdateAction,
  restoreElements,
} from "@excalidraw/excalidraw";
import { SharedWhiteboard } from "../../components/classroom/shared-whiteboard";
import { whiteboardDraftStorage } from "../../lib/whiteboard-draft-storage";

const listeners = new Set();
const apis = [];
const diagnostics = [];
let snapshot;
let currentApi;
let ready = 0;
let tokenRequests = 0;
let releaseBuckets;
const readonly = new URLSearchParams(location.search).has("readonly");
const loadCount = Number(new URLSearchParams(location.search).get("load") ?? 0);
let revision = -1;
let refreshQueue = Promise.resolve();
let requestedQueries = {};
const room = {
  name: "browser-live-activation",
  state: "connected",
  on() {},
  off() {},
  localParticipant: { publishData: async () => {} },
};

async function rpc(path, body) {
  const response = await fetch(
    path,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok) throw new Error(`Local test transport: ${response.status}`);
  return response.json();
}
async function refresh(reload = false) {
  const cursors = Object.fromEntries(
    Object.entries(requestedQueries).flatMap(([id, query]) =>
      query.args.cursor ? [[id, query.args.cursor]] : [],
    ),
  );
  const next = await rpc(
    `/scene?since=${revision}&cursors=${encodeURIComponent(JSON.stringify(cursors))}${reload ? "&reload=1" : ""}`,
  );
  revision = next.revision;
  const previousIds = new Set(snapshot?.manifest.bucketIds ?? []);
  const merged = {
    manifest:
      JSON.stringify(snapshot?.manifest) === JSON.stringify(next.manifest)
        ? snapshot.manifest
        : next.manifest,
    files:
      JSON.stringify(snapshot?.files) === JSON.stringify(next.files)
        ? snapshot.files
        : next.files,
    buckets: { ...snapshot?.buckets, ...next.buckets },
  };
  // Exercise the manifest-before-new-bucket transition, not just complete snapshots.
  const added = next.manifest.bucketIds.filter((id) => !previousIds.has(id));
  if (!loadCount && snapshot && added.length) {
    snapshot = {
      ...merged,
      buckets: {
        ...merged.buckets,
        ...Object.fromEntries(added.map((id) => [id, undefined])),
      },
    };
    listeners.forEach((listener) => listener());
    clearTimeout(releaseBuckets);
    releaseBuckets = setTimeout(() => {
      snapshot = merged;
      listeners.forEach((listener) => listener());
    }, 120);
  } else {
    clearTimeout(releaseBuckets);
    snapshot = merged;
    listeners.forEach((listener) => listener());
  }
}
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
function useSnapshot() {
  return useSyncExternalStore(subscribe, () => snapshot);
}
export function useQuery(ref, args) {
  const value = useSnapshot();
  if (args === "skip") return undefined;
  const name = getFunctionName(ref);
  if (name.endsWith(":getSceneManifest")) return value.manifest;
  if (name.endsWith(":getSceneFiles")) return value.files;
  throw new Error(`Unexpected full-scene query: ${name}`);
}
export function useQueries(queries) {
  requestedQueries = queries;
  const cursors = JSON.stringify(
    Object.fromEntries(
      Object.entries(queries).flatMap(([id, query]) =>
        query.args.cursor ? [[id, query.args.cursor]] : [],
      ),
    ),
  );
  useEffect(() => {
    if (cursors !== "{}") refreshQueue = refreshQueue.then(() => refresh(true));
  }, [cursors]);
  return useSnapshot().buckets;
}
const mutate = async (args) => {
  const result = await rpc("/delta", args);
  await refresh();
  return result;
};
export function useMutation(ref) {
  return getFunctionName(ref).endsWith(":applySceneDelta")
    ? mutate
    : async () => {
        throw new Error("Unexpected mutation invocation");
      };
}
export function useRoomContext() {
  return room;
}
export function useTranslations() {
  return (key) => key;
}
const getToken = async () => {
  tokenRequests++;
  return "local-browser-test-token";
};
export function useAuth() {
  return { getToken };
}
export function reportRuntimeError(error, context) {
  diagnostics.push({ error: String(error), ...context });
}
export function reportWhiteboardDiagnostic(context) {
  diagnostics.push(context);
}
export function dynamic(loader) {
  const loaded = loader().then(async (component) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return component;
  });
  return function DelayedEditor(props) {
    const [Component, setComponent] = useState();
    useEffect(() => {
      let active = true;
      void loaded.then((value) => {
        if (active) setComponent(() => value);
      });
      return () => {
        active = false;
      };
    }, []);
    if (!Component) return null;
    return React.createElement(Component, {
      ...props,
      excalidrawAPI(api) {
        apis.push(api);
        currentApi = api;
        props.excalidrawAPI(api);
      },
    });
  };
}

let initial = convertToExcalidrawElements(
  [
    {
      id: "remote-base",
      type: "rectangle",
      x: 60,
      y: 180,
      width: 50,
      height: 40,
    },
    {
      id: "remote-image",
      type: "image",
      fileId: "remote-file",
      status: "saved",
      x: 140,
      y: 180,
      width: 50,
      height: 40,
    },
  ],
  { regenerateIds: false },
);
const imageFiles = {};
if (loadCount) {
  let seed = 42;
  const random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const shapes = Array.from({ length: loadCount }, (_, i) => ({
    id: `load-${i}`,
    type: i % 4 === 0 ? "rectangle" : "freedraw",
    x: (i % 30) * 95,
    y: Math.floor(i / 30) * 70,
    width: 65,
    height: 40,
    ...(i % 4 === 0
      ? {}
      : {
          points: Array.from({ length: 160 }, (_, p) => [
            p * 0.4,
            Math.sin(p * 0.15 + i) * 20,
          ]),
          pressures: [],
          simulatePressure: true,
        }),
    strokeColor: ["#1971c2", "#e03131", "#2f9e44"][i % 3],
  }));
  const imageCount = loadCount > 200 ? 12 : 4;
  for (let i = 0; i < imageCount; i++) {
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 320;
    const ctx = canvas.getContext("2d");
    for (let y = 0; y < 320; y += 4)
      for (let x = 0; x < 480; x += 4) {
        ctx.fillStyle = `rgb(${Math.floor(random() * 256)},${Math.floor(random() * 256)},${Math.floor(random() * 256)})`;
        ctx.fillRect(x, y, 4, 4);
      }
    const fileId = `load-file-${i}`;
    imageFiles[fileId] = canvas.toDataURL("image/png");
    shapes.push({
      id: `load-image-${i}`,
      type: "image",
      fileId,
      status: "saved",
      x: i * 180,
      y: 210,
      width: 160,
      height: 105,
    });
  }
  // Freehand imports need the public restore utility to populate SDK metadata.
  initial = restoreElements(
    convertToExcalidrawElements(shapes, { regenerateIds: false }),
    null,
    { normalizeIndices: true },
  );
}
await rpc("/initialize", { elements: initial, files: imageFiles });
await refresh();
const events = new EventSource("/events");
events.onmessage = () => {
  refreshQueue = refreshQueue.then(refresh);
};

let measurement;
let stopObservation;
let animation;
function observeBenchmark(trackedId) {
  cancelAnimationFrame(animation);
  stopObservation?.();
  measurement = {
    changes: [],
    frames: [],
    longTasks: [],
    strokes: [],
    started: Date.now(),
  };
  const versions = new Map();
  stopObservation = currentApi.onChange((elements) => {
    const changed = [];
    const at = Date.now();
    for (const element of elements) {
      if (
        (trackedId
          ? element.id !== trackedId
          : element.id.startsWith("load-") || element.type !== "freedraw") ||
        versions.get(element.id) === element.version
      )
        continue;
      versions.set(element.id, element.version);
      changed.push({
        id: element.id,
        version: element.version,
        at,
        deleted: element.isDeleted,
      });
    }
    if (changed.length)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          measurement.changes.push(
            ...changed.map((change) => ({ ...change, painted: Date.now() })),
          );
        }),
      );
  });
  let previous;
  const frame = (at) => {
    if (previous !== undefined) measurement.frames.push(at - previous);
    previous = at;
    animation = requestAnimationFrame(frame);
  };
  animation = requestAnimationFrame(frame);
  const observer = new PerformanceObserver((list) => {
    measurement.longTasks.push(
      ...list.getEntries().map((entry) => entry.duration),
    );
  });
  observer.observe({ type: "longtask", buffered: false });
  const unsubscribe = stopObservation;
  stopObservation = () => {
    unsubscribe();
    observer.disconnect();
  };
}
document.addEventListener("pointerdown", () => {
  if (
    measurement &&
    !readonly &&
    currentApi.getAppState().activeTool.type === "freedraw"
  )
    measurement.strokes.push({ down: Date.now() });
});
document.addEventListener("pointerup", () => {
  if (measurement?.strokes.at(-1)) measurement.strokes.at(-1).up = Date.now();
});

window.whiteboardAudit = {
  startMeasurement: observeBenchmark,
  stopMeasurement: () => {
    cancelAnimationFrame(animation);
    stopObservation?.();
    return { ...measurement, ended: Date.now() };
  },
  state: () => ({
    apis: apis.map((api) => ({
      id: api.id,
      files: Object.keys(api.getFiles()),
    })),
    elements: currentApi?.getSceneElementsIncludingDeleted(),
    files: currentApi?.getFiles(),
    tool: currentApi?.getAppState().activeTool.type,
    readonly: currentApi?.getAppState().viewModeEnabled,
    viewport: currentApi && {
      scrollX: currentApi.getAppState().scrollX,
      scrollY: currentApi.getAppState().scrollY,
      zoom: currentApi.getAppState().zoom.value,
    },
    ready,
    tokenRequests,
    diagnostics,
  }),
  pencil: () => currentApi.setActiveTool({ type: "freedraw", locked: true }),
  editElement: (id) => {
    let version;
    currentApi.updateScene({
      elements: currentApi.getSceneElementsIncludingDeleted().map((element) => {
        if (element.id !== id) return element;
        version = element.version + 1;
        return {
          ...element,
          x: element.x + 1,
          version,
          versionNonce: element.versionNonce + 1,
        };
      }),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    return version;
  },
  draft: () => whiteboardDraftStorage.load("browser-room"),
  addImage: () => {
    const file = {
      id: "pending-file",
      dataURL: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="blue"/></svg>')}`,
      mimeType: "image/svg+xml",
      created: 1,
    };
    currentApi.addFiles([file]);
    currentApi.updateScene({
      elements: [
        ...currentApi.getSceneElementsIncludingDeleted(),
        ...convertToExcalidrawElements(
          [
            {
              id: "pending-image",
              type: "image",
              fileId: file.id,
              status: "pending",
              x: 230,
              y: 180,
              width: 40,
              height: 40,
            },
          ],
          { regenerateIds: false },
        ),
      ],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    return file;
  },
  remote: () =>
    rpc(
      "/remote",
      convertToExcalidrawElements(
        [
          {
            id: "remote-later",
            type: "ellipse",
            x: 300,
            y: 180,
            width: 40,
            height: 40,
          },
        ],
        { regenerateIds: false },
      ),
    ),
};
createRoot(document.getElementById("root")).render(
  React.createElement(
    StrictMode,
    null,
    React.createElement(SharedWhiteboard, {
      roomName: "browser-room",
      isReadonly: readonly,
      followViewport: false,
      onReady() {
        ready++;
      },
    }),
  ),
);
