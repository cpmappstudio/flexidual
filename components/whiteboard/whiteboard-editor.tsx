"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ComponentType } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import type {
  ExcalidrawProps,
  ExcalidrawImperativeAPI,
  AppState,
  BinaryFiles,
  BinaryFileData,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import "./whiteboard-mobile.css";
import { canShowWhiteboardProperties } from "./whiteboard-properties";
import { cn } from "@/lib/utils";
import { WHITEBOARD_SAVE_INTERVAL } from "@/lib/whiteboard-realtime";
import { createWhiteboardSync } from "@/lib/whiteboard-sync";
import {
  whiteboardBucketId,
  mergeWhiteboardElements,
  parseWhiteboardElements,
  splitWhiteboardPayload,
  joinWhiteboardPayload,
  isolateWhiteboardElements,
} from "@/lib/whiteboard-elements";
import {
  whiteboardDraftStorage,
  whiteboardSceneRevision as sceneRevision,
  type WhiteboardFileRefs,
  type WhiteboardDraft,
} from "@/lib/whiteboard-draft-storage";
import {
  reportRuntimeError,
  reportWhiteboardDiagnostic,
  type DiagnosticContext,
} from "@/lib/error-tracking";

// Derived from the onChange signature — avoids importing the unexported OrderedExcalidrawElement
export type ExcalidrawElements = Parameters<
  NonNullable<ExcalidrawProps["onChange"]>
>[0];

function WhiteboardLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-whiteboard text-sm text-muted-foreground">
      Loading whiteboard…
    </div>
  );
}

// Dynamic import required — Excalidraw uses browser-only APIs (no SSR)
let reconcileScene:
  | typeof import("@excalidraw/excalidraw").reconcileElements
  | undefined;
const Excalidraw = dynamic(
  async () => {
    const editor = await import("@excalidraw/excalidraw");
    const { WhiteboardMobileToolbar } = await import(
      "./whiteboard-mobile-toolbar"
    );
    reconcileScene = editor.reconcileElements;
    return function ExcalidrawCanvas(props: ExcalidrawProps) {
      const [host, setHost] = useState<HTMLDivElement | null>(null);
      const [uiApi, setUiApi] = useState<ExcalidrawImperativeAPI>();
      const [compact, setCompact] = useState(false);
      useEffect(() => {
        if (!host) return;
        const observer = new ResizeObserver(([entry]) =>
          setCompact(!props.zenModeEnabled && entry.contentRect.width <= 1024),
        );
        observer.observe(host);
        return () => observer.disconnect();
      }, [host, props.zenModeEnabled]);
      const callback = useRef(props.excalidrawAPI);
      callback.current = props.excalidrawAPI;
      const captureAPI = useCallback((api: ExcalidrawImperativeAPI) => {
        setUiApi(api);
        callback.current?.(api);
      }, []);
      return (
        <div
          ref={setHost}
          className={`whiteboard-sdk-host ${compact ? "whiteboard-compact" : ""}`}
        >
          <editor.Excalidraw
            {...props}
            excalidrawAPI={captureAPI}
            renderTopRightUI={(mobile, state) => {
              const hasProperties = canShowWhiteboardProperties(
                state,
                uiApi?.getSceneElements() ?? [],
              );
              return (
                <>
                  {!props.zenModeEnabled && (
                    <span
                      className={`whiteboard-ui-state ${state.openMenu === "shape" ? "whiteboard-properties-open" : ""}`}
                    />
                  )}
                  {props.renderTopRightUI?.(compact || mobile, state)}
                  {!props.zenModeEnabled &&
                    !props.viewModeEnabled &&
                    uiApi &&
                    host &&
                    createPortal(
                      <WhiteboardMobileToolbar
                        api={uiApi}
                        activeTool={state.activeTool.type}
                        theme={state.theme}
                        openMenu={state.openMenu}
                        hasProperties={hasProperties}
                        compact={compact}
                        boundary={host}
                      />,
                      host,
                    )}
                </>
              );
            }}
          >
            <editor.DefaultSidebar.Trigger style={{ display: "none" }} />
            <editor.MainMenu>
              <editor.MainMenu.DefaultItems.SaveAsImage />
              <editor.MainMenu.DefaultItems.SearchMenu />
              <editor.MainMenu.DefaultItems.ClearCanvas />
              <editor.MainMenu.Separator />
              <editor.MainMenu.DefaultItems.ChangeCanvasBackground />
            </editor.MainMenu>
          </editor.Excalidraw>
        </div>
      );
    };
  },
  {
    ssr: false,
    loading: WhiteboardLoading,
  },
) as ComponentType<ExcalidrawProps>;

const WHITEBOARD_UI_OPTIONS: ExcalidrawProps["UIOptions"] = {
  canvasActions: {
    saveToActiveFile: false,
    loadScene: false,
    export: false,
    toggleTheme: false,
  },
};

interface WhiteboardCanvasProps {
  initialData: ExcalidrawInitialDataState;
  excalidrawAPI?: ExcalidrawProps["excalidrawAPI"];
  onChange?: ExcalidrawProps["onChange"];
  onPointerUpdate?: ExcalidrawProps["onPointerUpdate"];
  renderTopRightUI?: ExcalidrawProps["renderTopRightUI"];
  isReadonly?: boolean;
  presentationMode?: boolean;
}

function WhiteboardCanvas({
  initialData,
  excalidrawAPI,
  onChange,
  onPointerUpdate,
  renderTopRightUI,
  isReadonly = true,
  presentationMode = false,
}: WhiteboardCanvasProps) {
  return (
    <div
      className={cn(
        "relative h-full w-full touch-none overflow-hidden overscroll-none rounded-lg border border-border bg-whiteboard",
        !presentationMode && "flexidual-whiteboard",
        presentationMode &&
          "classroom-whiteboard-presentation pointer-events-none",
      )}
    >
      {presentationMode ? (
        <style>{`
          .classroom-whiteboard-presentation .App-menu,
          .classroom-whiteboard-presentation .App-top-bar,
          .classroom-whiteboard-presentation .App-bottom-bar,
          .classroom-whiteboard-presentation .layer-ui__wrapper,
          .classroom-whiteboard-presentation .main-menu-trigger {
            display: none !important;
          }
        `}</style>
      ) : null}
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={excalidrawAPI}
        onChange={onChange}
        onPointerUpdate={onPointerUpdate}
        viewModeEnabled={isReadonly}
        zenModeEnabled={presentationMode}
        UIOptions={WHITEBOARD_UI_OPTIONS}
        renderTopRightUI={presentationMode ? undefined : renderTopRightUI}
      />
    </div>
  );
}

export function WhiteboardPreview() {
  return (
    <WhiteboardCanvas
      initialData={{ elements: [] }}
      presentationMode
      isReadonly
    />
  );
}

function hasPendingImages(
  elements: ExcalidrawElements,
  files: Readonly<Record<string, unknown>>,
) {
  return elements.some(
    (element) =>
      element.type === "image" &&
      !element.isDeleted &&
      element.fileId &&
      !Object.hasOwn(files, element.fileId),
  );
}

type PersistedScene = Omit<WhiteboardDraft, "elements"> & {
  elements: ExcalidrawElements;
};

export interface WhiteboardEditorProps {
  /** Stable storage identity; independent of a live connection or editor instance. */
  draftKey: string;
  scene?: {
    elements: ExcalidrawElements;
    fileRefs?: Record<string, WhiteboardFileRefs[string] & { created: number }>;
  };
  remoteElements?: ExcalidrawElements;
  fromLegacy?: boolean;
  legacyOrder?: string[];
  recoveryError?: unknown;
  saveDelta: (
    bucketId: number,
    parts: string[],
  ) => Promise<{ conflictsParts: string[] }>;
  uploadImage: (file: BinaryFileData) => Promise<WhiteboardFileRefs[string]>;
  realtime?: {
    canBroadcast: boolean;
    transport: Pick<
      ReturnType<typeof createWhiteboardSync<ExcalidrawElements[number]>>,
      "seed" | "update" | "flush"
    >;
  };
  onViewportChange?: (appState: AppState) => void;
  onPointerUpdate?: ExcalidrawProps["onPointerUpdate"];
  renderTopRightUI?: ExcalidrawProps["renderTopRightUI"];
  onApiReady?: (api: ExcalidrawImperativeAPI) => void;
  onReady?: () => void;
  /** Durable scene with its visible image references and canvas binaries ready. */
  onSaved?: (
    revision: string,
    snapshot: { elements: ExcalidrawElements; files: BinaryFiles },
  ) => void;
  /** Final local revision on actual exit; confirmation may arrive afterwards. */
  onClose?: (revision: string) => void;
  isReadonly?: boolean;
  presentationMode?: boolean;
  diagnostics?: Omit<DiagnosticContext, "operation">;
  messages?: { recovery: string; save: string; size: string };
}

/** Scene lifecycle, recovery and persistence; no room, authentication or provider hooks. */
export function WhiteboardEditor(props: WhiteboardEditorProps) {
  return (
    <WhiteboardEditorSession
      key={`${props.draftKey}:${Boolean(props.isReadonly)}`}
      {...props}
    />
  );
}

function WhiteboardEditorSession({
  draftKey,
  scene: receivedScene,
  remoteElements = receivedScene?.elements,
  fromLegacy,
  legacyOrder,
  recoveryError,
  saveDelta,
  uploadImage,
  realtime,
  onViewportChange,
  onPointerUpdate,
  renderTopRightUI,
  onApiReady,
  onReady,
  onSaved,
  onClose,
  isReadonly = false,
  presentationMode = false,
  diagnostics,
  messages = {
    recovery: "The whiteboard could not be recovered. Reload to retry.",
    save: "Some changes are not saved yet.",
    size: "The whiteboard synchronization size limit was reached.",
  },
}: WhiteboardEditorProps) {
  const durableElements = receivedScene?.elements;
  const { canBroadcast = false, transport } = realtime ?? {};
  const diagnosticsRef = useRef(diagnostics);
  useLayoutEffect(() => {
    diagnosticsRef.current = diagnostics;
  }, [diagnostics]);
  const [localImageIds, setLocalImageIds] = useState<string[]>([]);
  const localImageKeyRef = useRef("[]");
  const neededImageKey = JSON.stringify(
    [
      ...new Set([
        ...(remoteElements ?? []).flatMap((element) =>
          element.type === "image" &&
          !element.isDeleted &&
          typeof element.fileId === "string"
            ? [element.fileId]
            : [],
        ),
        ...localImageIds,
      ]),
    ].sort(),
  );
  const neededImageIds = useMemo(
    () => new Set<string>(JSON.parse(neededImageKey)),
    [neededImageKey],
  );
  const [initialScene, setInitialScene] = useState<typeof receivedScene>();
  const [draft, setDraft] = useState<PersistedScene | null>();
  const [saveError, setSaveError] = useState(false);
  const [sizeError, setSizeError] = useState(false);
  const [imageSaveError, setImageSaveError] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState(false);
  const reportedSaveFailureRef = useRef(false);
  useEffect(() => {
    let active = true;
    void whiteboardDraftStorage.load(draftKey).then((value) => {
      if (active) setDraft(value as PersistedScene | null);
    });
    return () => {
      active = false;
    };
  }, [draftKey]);

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const onReadyRef = useRef(onReady);
  const onSavedRef = useRef(onSaved);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onSavedRef.current = onSaved;
    onCloseRef.current = onClose;
  }, [onSaved, onClose]);
  const notifiedRevisionRef = useRef<string | undefined>(undefined);
  const savedSnapshotRef = useRef<ExcalidrawElements>([]);
  const hasSignaledReadyRef = useRef(false);
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  useEffect(() => {
    reportWhiteboardDiagnostic({
      operation: "whiteboard.mount",
      ...diagnosticsRef.current,
      readonly: isReadonly,
    });
    const timeout = setTimeout(() => {
      if (!hasSignaledReadyRef.current)
        reportRuntimeError(new Error("Whiteboard readiness timed out"), {
          operation: "whiteboard.ready_timeout",
          ...diagnosticsRef.current,
          readonly: isReadonly,
        });
    }, 20_000);
    return () => clearTimeout(timeout);
  }, [isReadonly]);
  const lastSceneRevisionRef = useRef<string | null>(null);
  const confirmedSceneRevisionRef = useRef<string | null>(null);
  const latestElementsRef = useRef<ExcalidrawElements>([]);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishStrokeRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // Track file IDs already fetched and added to the canvas (reader side)
  const addedFileIdsRef = useRef<Set<string>>(new Set());

  // Buffer data that arrives before Excalidraw has finished loading
  const pendingFilesRef = useRef<BinaryFileData[]>([]);

  // Track file IDs already in-flight — prevents duplicate uploads
  const sentFileIdsRef = useRef<Set<string>>(new Set());
  const uploadingFileIdsRef = useRef(new Set<string>());
  const failedFileIdsRef = useRef(new Set<string>());
  const uploadAttemptsRef = useRef(new Map<string, number>());
  const imageRetryTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const imageLoadAttemptsRef = useRef(new Map<string, number>());
  const imageLoadSourcesRef = useRef(
    new Map<string, WhiteboardFileRefs[string]["storageId"]>(),
  );
  const imageLoadTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const startUploadsRef = useRef<() => void>(() => {});
  const mountedRef = useRef(true);
  useLayoutEffect(() => {
    mountedRef.current = true;
    const retryTimers = imageRetryTimersRef.current;
    const loadTimers = imageLoadTimersRef.current;
    return () => {
      mountedRef.current = false;
      // Capture before the child SDK destroys its scene/files; persistence stays passive.
      finishStrokeRef.current?.();
      // Finish Board images after close; a reader/temporary canvas needs no task.
      if (!onCloseRef.current) {
        for (const timer of retryTimers.values()) clearTimeout(timer);
        retryTimers.clear();
        for (const timer of loadTimers) clearTimeout(timer);
        loadTimers.clear();
      }
    };
  }, []);

  // Wait for the asynchronous draft before mounting the editor or accepting edits.
  const {
    initialData: cachedData,
    initialFileRefs,
    initialFiles,
    hasPendingScene,
    cachedRevision,
  } = useMemo(() => {
    const empty = {
      initialData: { elements: [] } as ExcalidrawInitialDataState,
      initialFileRefs: {} as WhiteboardFileRefs,
      initialFiles: {} as BinaryFiles,
      hasPendingScene: false,
      cachedRevision: null as string | null,
    };
    if (draft) {
      const scene = draft;
      return {
        initialData: scene as ExcalidrawInitialDataState,
        initialFileRefs: scene.fileRefs ?? ({} as WhiteboardFileRefs),
        initialFiles: scene.files ?? ({} as BinaryFiles),
        hasPendingScene:
          scene.saved === false ||
          (scene.saved === undefined && fromLegacy === false),
        cachedRevision: sceneRevision(scene.elements),
      };
    }
    return empty;
  }, [draft, fromLegacy]);

  // CDN refs — initialised from the recovered draft so a page refresh doesn’t lose the mapping
  const fileRefsRef = useRef<WhiteboardFileRefs>(initialFileRefs);
  // Current BinaryFiles in scene — initialised from the recovered draft, kept current by handleChange
  const currentFilesRef = useRef<BinaryFiles>(initialFiles);
  const cachedRevisionRef = useRef(cachedRevision);
  const initialCanvasData = useMemo(() => {
    const cloud = initialScene?.elements as ExcalidrawElements | undefined;
    const elements = cloud
      ? !isReadonly && hasPendingScene
        ? mergeWhiteboardElements(
            cloud,
            cachedData.elements ?? [],
            cloud.map((element) => element.id),
          )
        : cloud
      : (cachedData.elements ?? []);
    return { ...cachedData, elements: isolateWhiteboardElements(elements) };
  }, [initialScene, cachedData, isReadonly, hasPendingScene]);

  const confirmCachedScene = useCallback(() => {
    if (
      confirmedSceneRevisionRef.current === null ||
      confirmedSceneRevisionRef.current !== lastSceneRevisionRef.current
    )
      return;
    void whiteboardDraftStorage.confirm(
      draftKey,
      confirmedSceneRevisionRef.current,
      fileRefsRef.current,
      cachedRevisionRef.current,
    );
    if (
      !hasPendingImages(latestElementsRef.current, fileRefsRef.current) &&
      !hasPendingImages(latestElementsRef.current, currentFilesRef.current) &&
      onSavedRef.current &&
      notifiedRevisionRef.current !== confirmedSceneRevisionRef.current
    ) {
      notifiedRevisionRef.current = confirmedSceneRevisionRef.current;
      savedSnapshotRef.current = isolateWhiteboardElements(
        latestElementsRef.current,
        savedSnapshotRef.current,
      );
      onSavedRef.current(confirmedSceneRevisionRef.current, {
        elements: savedSnapshotRef.current,
        files: { ...currentFilesRef.current },
      });
      queueMicrotask(() => {
        // A winning concurrent version may change the final revision after exit.
        const revision = confirmedSceneRevisionRef.current;
        if (
          !mountedRef.current &&
          revision !== null &&
          revision === lastSceneRevisionRef.current
        )
          onCloseRef.current?.(revision);
      });
    }
  }, [draftKey]);

  useEffect(() => {
    if (
      draft === undefined ||
      initialScene !== undefined ||
      receivedScene === undefined
    )
      return;
    fileRefsRef.current = { ...initialFileRefs, ...receivedScene.fileRefs };
    currentFilesRef.current = initialFiles;
    cachedRevisionRef.current = cachedRevision;
    setInitialScene(receivedScene);
  }, [
    draft,
    initialScene,
    receivedScene,
    initialFileRefs,
    initialFiles,
    cachedRevision,
  ]);
  useEffect(() => {
    if (receivedScene?.fileRefs)
      fileRefsRef.current = {
        ...fileRefsRef.current,
        ...receivedScene.fileRefs,
      };
  }, [receivedScene?.fileRefs]);

  const persistDraft = useCallback(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = null;
    const elements = latestElementsRef.current;
    const revision = sceneRevision(elements);
    void whiteboardDraftStorage
      .save(draftKey, {
        elements,
        files: currentFilesRef.current,
        fileRefs: fileRefsRef.current,
        saved: revision === confirmedSceneRevisionRef.current,
      })
      .then((saved) => {
        if (saved) cachedRevisionRef.current = revision;
        else if (revision !== confirmedSceneRevisionRef.current)
          setDraftSaveError(true);
      });
  }, [draftKey]);
  const scheduleDraft = useCallback(() => {
    if (!mountedRef.current) return;
    if (!draftTimerRef.current)
      draftTimerRef.current = setTimeout(persistDraft, 300);
  }, [persistDraft]);
  const saveIntervalRef = useRef(80);
  useLayoutEffect(() => {
    saveIntervalRef.current = canBroadcast ? WHITEBOARD_SAVE_INTERVAL : 80;
  }, [canBroadcast]);
  const sync: ReturnType<
    typeof createWhiteboardSync<ExcalidrawElements[number]>
  > = useMemo(
    () =>
      createWhiteboardSync<ExcalidrawElements[number]>({
        interval: () => saveIntervalRef.current,
        send: async (elements) => {
          const buckets = new Map<number, ExcalidrawElements[number][]>();
          for (const element of elements) {
            const id = whiteboardBucketId(element.id);
            const group = buckets.get(id) ?? [];
            group.push(element);
            buckets.set(id, group);
          }
          // Sequential requests bound write pressure and keep retry acknowledgements simple.
          for (const [bucketId, group] of buckets) {
            const result = await saveDelta(
              bucketId,
              splitWhiteboardPayload(JSON.stringify(group)),
            );
            const conflicts = result.conflictsParts.length
              ? parseWhiteboardElements(
                  joinWhiteboardPayload(result.conflictsParts),
                )
              : [];
            if (conflicts.length) {
              // A successful merge need not accept our version. Recover the winning
              // values before confirming, without replacing edits made while awaiting it.
              const next = mergeWhiteboardElements(
                latestElementsRef.current,
                conflicts as unknown as ExcalidrawElements,
              );
              latestElementsRef.current = sync.update(
                next,
              ) as ExcalidrawElements;
              lastSceneRevisionRef.current = sceneRevision(
                latestElementsRef.current,
              );
              if (mountedRef.current)
                apiRef.current?.updateScene({
                  elements: next,
                  captureUpdate: "NEVER" as Parameters<
                    ExcalidrawImperativeAPI["updateScene"]
                  >[0]["captureUpdate"],
                });
              scheduleDraft();
            }
          }
        },
        saved: (elements) => {
          const revision = sceneRevision(elements);
          if (revision !== lastSceneRevisionRef.current) return;
          confirmedSceneRevisionRef.current = revision;
          setSaveError(false);
          setSizeError(false);
          reportedSaveFailureRef.current = false;
          if (!hasPendingImages(latestElementsRef.current, fileRefsRef.current))
            setDraftSaveError(false);
          confirmCachedScene();
        },
        error: (error) => {
          setSaveError(true);
          setSizeError(/TOO_LARGE/.test(String(error)));
          if (!reportedSaveFailureRef.current) {
            reportedSaveFailureRef.current = true;
            reportRuntimeError(error, {
              operation: "whiteboard.scene_save",
              ...diagnosticsRef.current,
            });
          }
        },
      }),
    [saveDelta, confirmCachedScene, scheduleDraft],
  );
  useEffect(() => {
    if (!isReadonly && initialScene)
      sync.seed(initialScene.elements as ExcalidrawElements);
  }, [sync, isReadonly, initialScene]);
  useEffect(() => {
    if (isReadonly) return;
    sync.resume();
    const flush = () => {
      finishStrokeRef.current?.();
      persistDraft();
      void sync.flush();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const close = () => {
      flush();
      if (lastSceneRevisionRef.current !== null)
        onCloseRef.current?.(lastSceneRevisionRef.current);
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const pendingImage = hasPendingImages(
        latestElementsRef.current,
        fileRefsRef.current,
      );
      if (
        finishStrokeRef.current !== null ||
        sync.hasPending() ||
        pendingImage ||
        (lastSceneRevisionRef.current !== null &&
          lastSceneRevisionRef.current !== confirmedSceneRevisionRef.current)
      ) {
        // Browsers need not finish async storage/network work during navigation.
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("pagehide", close);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pagehide", close);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", visibility);
      if (lastSceneRevisionRef.current !== null) persistDraft();
      sync.dispose();
      // StrictMode's effect replay is not an exit. The SDK was already captured
      // in layout cleanup; delayed scene/image confirmations retain this identity.
      queueMicrotask(() => {
        if (!mountedRef.current && lastSceneRevisionRef.current !== null)
          onCloseRef.current?.(lastSceneRevisionRef.current);
      });
    };
  }, [isReadonly, persistDraft, sync]);
  // ---------------------------------------------------------------------------
  // Upload and retain image references independently of drawing acknowledgements.
  // ---------------------------------------------------------------------------

  const uploadAndBroadcastFile = useCallback(
    async (file: BinaryFileData) => {
      if (uploadingFileIdsRef.current.size >= 2) return;
      sentFileIdsRef.current.add(file.id);
      uploadingFileIdsRef.current.add(file.id);
      try {
        const fileRef = await uploadImage(file);

        // Cache locally so a page refresh doesn't lose the mapping
        fileRefsRef.current[file.id] = fileRef;
        failedFileIdsRef.current.delete(file.id);
        setImageSaveError(failedFileIdsRef.current.size > 0);
        if (!hasPendingImages(latestElementsRef.current, fileRefsRef.current))
          setDraftSaveError(false);
        scheduleDraft();
        confirmCachedScene();
      } catch (err) {
        console.error("[Whiteboard] Image upload failed:", err);
        reportRuntimeError(err, {
          operation: "whiteboard.image_upload",
          ...diagnosticsRef.current,
        });
        sentFileIdsRef.current.delete(file.id);
        failedFileIdsRef.current.add(file.id);
        setImageSaveError(true);
        const attempt = (uploadAttemptsRef.current.get(file.id) ?? 0) + 1;
        uploadAttemptsRef.current.set(file.id, attempt);
        if (
          attempt < 3 &&
          (mountedRef.current || onCloseRef.current) &&
          !/STALE_|PERMISSION_DENIED|INVALID_|RATE_LIMIT/.test(String(err))
        ) {
          imageRetryTimersRef.current.set(
            file.id,
            setTimeout(
              () => {
                imageRetryTimersRef.current.delete(file.id);
                startUploadsRef.current();
              },
              1000 * 2 ** (attempt - 1),
            ),
          );
        } else uploadAttemptsRef.current.set(file.id, 3);
      } finally {
        uploadingFileIdsRef.current.delete(file.id);
        if (mountedRef.current || onCloseRef.current)
          queueMicrotask(() => startUploadsRef.current());
      }
    },
    [uploadImage, scheduleDraft, confirmCachedScene],
  );
  const startUploads = useCallback(() => {
    if (isReadonly || (!mountedRef.current && !onCloseRef.current)) return;
    for (const element of latestElementsRef.current) {
      if (uploadingFileIdsRef.current.size >= 2) break;
      if (element.type !== "image" || element.isDeleted || !element.fileId)
        continue;
      const id = element.fileId;
      const file = Object.hasOwn(currentFilesRef.current, id)
        ? currentFilesRef.current[id]
        : undefined;
      if (
        file &&
        !Object.hasOwn(fileRefsRef.current, id) &&
        !sentFileIdsRef.current.has(id) &&
        !imageRetryTimersRef.current.has(id) &&
        (uploadAttemptsRef.current.get(id) ?? 0) < 3
      )
        void uploadAndBroadcastFile(file);
    }
  }, [isReadonly, uploadAndBroadcastFile]);
  useLayoutEffect(() => {
    startUploadsRef.current = startUploads;
  }, [startUploads]);

  // ---------------------------------------------------------------------------
  // Apply complete remote scenes after editor initialization, for both roles.
  // ---------------------------------------------------------------------------

  // Merge concurrent staff edits; remote changes must not become local undo steps.
  useEffect(() => {
    if (!isCanvasReady || !remoteElements || !initialScene) return;
    const elements = remoteElements as ExcalidrawElements;
    if (apiRef.current) {
      const api = apiRef.current;
      const timer = setTimeout(() => {
        if (!mountedRef.current) return;
        const current = api.getSceneElementsIncludingDeleted();
        const isolated = isolateWhiteboardElements(elements, current);
        const next = isReadonly
          ? isolated
          : reconcileScene
            ? reconcileScene(
                current,
                isolated as unknown as Parameters<
                  NonNullable<typeof reconcileScene>
                >[1],
                api.getAppState(),
              )
            : (mergeWhiteboardElements(
                current,
                isolated,
                legacyOrder,
              ) as ExcalidrawElements);
        if (!isReadonly) {
          // Live delivery is not a durable acknowledgement.
          sync.seed((durableElements ?? []) as ExcalidrawElements);
          transport?.seed(elements);
          latestElementsRef.current = sync.update(next) as ExcalidrawElements;
          lastSceneRevisionRef.current = sceneRevision(
            latestElementsRef.current,
          );
          if (!sync.hasPending()) {
            confirmedSceneRevisionRef.current = lastSceneRevisionRef.current;
            confirmCachedScene();
          }
          scheduleDraft();
        }
        // Track the remote revision before onChange; never suppress later local input.
        api.updateScene({
          elements: next,
          captureUpdate: "NEVER" as Parameters<
            typeof api.updateScene
          >[0]["captureUpdate"],
        });
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [
    isCanvasReady,
    isReadonly,
    remoteElements,
    durableElements,
    initialScene,
    legacyOrder,
    sync,
    scheduleDraft,
    confirmCachedScene,
    transport,
  ]);

  // Load new images from Convex file refs as they are added.
  useEffect(() => {
    if (draft === undefined || !receivedScene?.fileRefs) return;
    const fileRefs = receivedScene.fileRefs;
    for (const [fileId, ref] of Object.entries(fileRefs)) {
      if (!neededImageIds.has(fileId)) continue;
      if (imageLoadSourcesRef.current.get(fileId) !== ref.storageId) {
        imageLoadSourcesRef.current.set(fileId, ref.storageId);
        imageLoadAttemptsRef.current.delete(fileId);
        addedFileIdsRef.current.delete(fileId);
      }
      if ((imageLoadAttemptsRef.current.get(fileId) ?? 0) >= 3) continue;
      if (addedFileIdsRef.current.has(fileId)) continue;
      addedFileIdsRef.current.add(fileId);
      if (
        Object.hasOwn(initialFiles, fileId) &&
        Object.hasOwn(initialFileRefs, fileId) &&
        initialFileRefs[fileId]?.storageId === ref.storageId
      )
        continue;
      async function loadFile() {
        try {
          // Route through the Next.js proxy to bypass browser CORS restrictions.
          // Relative URL ensures the phone on ngrok inherits the correct tunnel origin.
          // The ngrok header bypasses the tunnel's HTML interstitial on first mobile connection.
          const proxyUrl = `/api/whiteboard-image?url=${encodeURIComponent(ref.url)}`;
          const response = await fetch(proxyUrl, {
            headers: { "ngrok-skip-browser-warning": "true" },
          });
          if (!response.ok)
            throw new Error(`Proxy fetch failed (${response.status})`);
          const blob = await response.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const fileData: BinaryFileData = {
            id: fileId as BinaryFileData["id"],
            mimeType: ref.mimeType as BinaryFileData["mimeType"],
            dataURL: dataUrl as BinaryFileData["dataURL"],
            created: ref.created,
          };
          if (imageLoadSourcesRef.current.get(fileId) !== ref.storageId) return;
          currentFilesRef.current = {
            ...currentFilesRef.current,
            [fileId]: fileData,
          };
          confirmCachedScene();
          if (!mountedRef.current) return;
          if (apiRef.current) {
            const api = apiRef.current;
            setTimeout(() => {
              if (
                mountedRef.current &&
                imageLoadSourcesRef.current.get(fileId) === ref.storageId
              )
                api.addFiles([fileData]);
            }, 0);
          } else {
            pendingFilesRef.current.push(fileData);
          }
        } catch (err) {
          if (imageLoadSourcesRef.current.get(fileId) !== ref.storageId) return;
          console.error("[Whiteboard] Failed to load image from Convex:", err);
          reportRuntimeError(err, {
            operation: "whiteboard.image_load",
            ...diagnosticsRef.current,
          });
          const attempt = (imageLoadAttemptsRef.current.get(fileId) ?? 0) + 1;
          imageLoadAttemptsRef.current.set(fileId, attempt);
          if (attempt < 3 && (mountedRef.current || onCloseRef.current)) {
            const timer = setTimeout(
              () => {
                imageLoadTimersRef.current.delete(timer);
                if (imageLoadSourcesRef.current.get(fileId) !== ref.storageId)
                  return;
                if (
                  !isReadonly &&
                  !latestElementsRef.current.some(
                    (element) =>
                      !element.isDeleted &&
                      element.type === "image" &&
                      element.fileId === fileId,
                  )
                ) {
                  addedFileIdsRef.current.delete(fileId);
                  return;
                }
                void loadFile();
              },
              1000 * 2 ** (attempt - 1),
            );
            imageLoadTimersRef.current.add(timer);
          } else addedFileIdsRef.current.delete(fileId);
        }
      }
      void loadFile();
    }
  }, [
    draft,
    receivedScene?.fileRefs,
    initialFiles,
    initialFileRefs,
    isReadonly,
    neededImageIds,
    confirmCachedScene,
  ]);

  useEffect(() => {
    if (
      !isCanvasReady ||
      hasSignaledReadyRef.current ||
      receivedScene === undefined
    ) {
      return;
    }

    const readyTimer = setTimeout(() => {
      if (hasSignaledReadyRef.current) return;
      hasSignaledReadyRef.current = true;
      reportWhiteboardDiagnostic({
        operation: "whiteboard.ready",
        ...diagnosticsRef.current,
        readonly: isReadonly,
      });
      onReadyRef.current?.();
    }, 0);

    return () => clearTimeout(readyTimer);
  }, [isCanvasReady, isReadonly, receivedScene]);

  const handleChange = useCallback(
    (elements: ExcalidrawElements, appState: AppState, files: BinaryFiles) => {
      if (isReadonly || initialScene === undefined) return;

      // Keep currentFilesRef current
      const filesChanged = currentFilesRef.current !== files;
      currentFilesRef.current = files;
      const imageIds = [
        ...new Set<string>(
          elements.flatMap((element) =>
            element.type === "image" && !element.isDeleted && element.fileId
              ? [element.fileId]
              : [],
          ),
        ),
      ].sort();
      const imageKey = JSON.stringify(imageIds);
      if (imageKey !== localImageKeyRef.current) {
        localImageKeyRef.current = imageKey;
        setLocalImageIds(imageIds);
        for (const id of failedFileIdsRef.current)
          if (!imageIds.includes(id)) failedFileIdsRef.current.delete(id);
        setImageSaveError(failedFileIdsRef.current.size > 0);
      }

      // Track ordered element revisions, not appState (selection, zoom, cursors).
      // Include IDs and nonces: summing versions alone can miss different scenes.
      const revision = sceneRevision(elements);
      if (revision !== lastSceneRevisionRef.current) {
        latestElementsRef.current = sync.update(elements) as ExcalidrawElements;
        if (canBroadcast) transport?.update(latestElementsRef.current);
        lastSceneRevisionRef.current = sceneRevision(latestElementsRef.current);
        scheduleDraft();
      } else if (filesChanged) {
        scheduleDraft();
      }
      // addFiles reports binary availability without changing element revisions.
      if (filesChanged) confirmCachedScene();
      startUploads();

      onViewportChange?.(appState);
    },
    [
      onViewportChange,
      isReadonly,
      startUploads,
      initialScene,
      sync,
      scheduleDraft,
      canBroadcast,
      transport,
      confirmCachedScene,
    ],
  );

  useEffect(() => {
    if (isReadonly || !isCanvasReady) return;
    const api = apiRef.current;
    let strokeTimer: ReturnType<typeof setTimeout> | undefined;
    const finishStroke = () => {
      if (!api) return;
      if (strokeTimer !== undefined) clearTimeout(strokeTimer);
      strokeTimer = undefined;
      finishStrokeRef.current = null;
      handleChange(
        api.getSceneElementsIncludingDeleted(),
        api.getAppState(),
        api.getFiles(),
      );
      void transport?.flush();
      // Durable writes still coalesce when live delivery is available.
      if (!canBroadcast) void sync.flush();
    };
    const unsubscribe = api?.onPointerUp?.(() => {
      if (strokeTimer !== undefined) clearTimeout(strokeTimer);
      // Excalidraw emits pointerUp before finalizing freedraw. Read its final
      // scene next task, through the same change path, before snapshotting it.
      finishStrokeRef.current = finishStroke;
      strokeTimer = setTimeout(() => {
        finishStroke();
        persistDraft();
      }, 0);
    });
    return () => {
      unsubscribe?.();
      if (strokeTimer !== undefined) clearTimeout(strokeTimer);
      if (finishStrokeRef.current === finishStroke)
        finishStrokeRef.current = null;
    };
  }, [
    isReadonly,
    isCanvasReady,
    handleChange,
    sync,
    transport,
    canBroadcast,
    persistDraft,
  ]);

  if (recoveryError) {
    return <div role="alert">{messages.recovery}</div>;
  }
  // Incremental reads can wait for a new bucket; never remount an initialized editor.
  if (draft === undefined || initialScene === undefined) {
    return <WhiteboardLoading />;
  }

  return (
    <div className="relative h-full w-full">
      {!isReadonly && (saveError || imageSaveError || draftSaveError) ? (
        <div
          role="status"
          className="absolute bottom-2 left-2 z-10 rounded bg-background p-2 text-sm text-destructive"
        >
          {sizeError ? messages.size : messages.save}
        </div>
      ) : null}
      <WhiteboardCanvas
        initialData={initialCanvasData}
        excalidrawAPI={(api: ExcalidrawImperativeAPI) => {
          apiRef.current = api;
          onApiReady?.(api);
          // Add files buffered while the API was loading, then reconcile the latest scene.
          // setTimeout(0) is a macrotask — it fires AFTER React has fully committed
          // Excalidraw's initial render, preventing the "setState inside update" error
          // that occurs when requestAnimationFrame fires mid-reconciliation.
          setTimeout(() => {
            // StrictMode can discard a constructor after it provided an API.
            if (!mountedRef.current || apiRef.current !== api) return;
            if (pendingFilesRef.current.length > 0) {
              api.addFiles(pendingFilesRef.current.splice(0));
            }
            setIsCanvasReady(true);
          }, 0);
        }}
        onChange={handleChange}
        onPointerUpdate={!isReadonly ? onPointerUpdate : undefined}
        renderTopRightUI={renderTopRightUI}
        isReadonly={isReadonly}
        presentationMode={presentationMode}
      />
    </div>
  );
}
