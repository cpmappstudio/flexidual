"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useMutation } from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useRoomContext } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import type { RemoteParticipant } from "livekit-client";
import type {
  ExcalidrawProps,
  ExcalidrawImperativeAPI,
  AppState,
  BinaryFiles,
  BinaryFileData,
  Collaborator,
  SocketId,
  ExcalidrawInitialDataState,
  NormalizedZoomValue,
} from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import { cn } from "@/lib/utils";
import { useWhiteboardScene } from "@/hooks/use-whiteboard-scene";
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
} from "@/lib/whiteboard-draft-storage";
import {
  reportRuntimeError,
  reportWhiteboardDiagnostic,
} from "@/lib/error-tracking";

// Derived from the onChange signature — avoids importing the unexported OrderedExcalidrawElement
type ExcalidrawElements = Parameters<
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
    reconcileScene = editor.reconcileElements;
    return editor.Excalidraw;
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
  isReadonly?: boolean;
  presentationMode?: boolean;
}

function WhiteboardCanvas({
  initialData,
  excalidrawAPI,
  onChange,
  onPointerUpdate,
  isReadonly = true,
  presentationMode = false,
}: WhiteboardCanvasProps) {
  return (
    <div
      className={cn(
        "relative h-full w-full touch-none overflow-hidden overscroll-none rounded-lg border border-border bg-whiteboard",
        presentationMode &&
          "classroom-whiteboard-presentation pointer-events-none",
      )}
    >
      {presentationMode ? (
        <style>{`
          .classroom-whiteboard-presentation .App-menu,
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
      />
    </div>
  );
}

export function ClassroomWhiteboardPreview() {
  return (
    <WhiteboardCanvas
      initialData={{ elements: [] }}
      presentationMode
      isReadonly
    />
  );
}

// ---------------------------------------------------------------------------
// Wire protocol — only ephemeral real-time events (pointer + viewport).
// Scene elements and file refs use Convex, independently of DataChannel limits.
// ---------------------------------------------------------------------------

type WhiteboardPointerMsg = {
  type: "WHITEBOARD_POINTER";
  x: number;
  y: number;
  button: "up" | "down";
  tool: "pointer" | "laser";
};

/** Sent by the broadcaster to sync all viewers' viewport (scroll + zoom level). */
type WhiteboardViewportMsg = {
  type: "WHITEBOARD_VIEWPORT";
  scrollX: number;
  scrollY: number;
  zoom: number;
};

type WhiteboardMessage = WhiteboardPointerMsg | WhiteboardViewportMsg;

// ---------------------------------------------------------------------------
// Session-scoped persistence
// ---------------------------------------------------------------------------

/** Cached Convex CDN reference for a single uploaded image */
type FileRef = { url: string; mimeType: string; storageId: Id<"_storage"> };
/** Map from Excalidraw file ID → Convex CDN ref */
type FileRefMap = Record<string, FileRef>;

function hasPendingImages(elements: ExcalidrawElements, refs: FileRefMap) {
  return elements.some(
    (element) =>
      element.type === "image" &&
      !element.isDeleted &&
      element.fileId &&
      !Object.hasOwn(refs, element.fileId),
  );
}

type PersistedScene = {
  elements: ExcalidrawElements;
  files: BinaryFiles;
  /** False only for local edits not yet acknowledged by Convex. */
  saved?: boolean;
  /** CDN refs written after each upload — survives page refresh without re-uploading */
  fileRefs?: FileRefMap;
};

/**
 * Compress a data URL image via an off-screen Canvas before upload.
 * - Non-raster types (SVG, unknown) are returned unchanged.
 * - Transparency is preserved only when the original is PNG; otherwise JPEG is used.
 * Operates entirely in the browser — no external libraries needed.
 */
async function compressImage(
  dataUrl: string,
  mimeType: string,
  maxDimension = 1920,
  quality = 0.82,
): Promise<{ blob: Blob; mimeType: string }> {
  const raster =
    mimeType === "image/png" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/webp";
  if (!raster) {
    const res = await fetch(dataUrl);
    return { blob: await res.blob(), mimeType };
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas 2d unavailable"));
        return;
      }

      // Fill white background for JPEG (which has no alpha channel)
      const outputType = mimeType === "image/png" ? "image/png" : "image/jpeg";
      if (outputType === "image/jpeg") {
        ctx.fillStyle = getComputedStyle(document.documentElement)
          .getPropertyValue("--whiteboard")
          .trim();
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve({ blob, mimeType: outputType });
          else reject(new Error("canvas.toBlob returned null"));
        },
        outputType,
        quality,
      );
    };
    img.onerror = () => reject(new Error("image load failed"));
    img.src = dataUrl;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Derives a stable HSL colour from a participant identity string. */
function identityColor(identity: string): {
  background: string;
  stroke: string;
} {
  let hash = 0;
  for (let i = 0; i < identity.length; i++) {
    hash = identity.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  const background = `hsl(${h},70%,55%)`;
  const stroke = `hsl(${h},70%,35%)`;
  return { background, stroke };
}

function isWhiteboardBroadcaster(participant?: RemoteParticipant): boolean {
  if (!participant?.metadata) return false;
  try {
    const metadata = JSON.parse(participant.metadata);
    return (
      (metadata.role === "teacher" || metadata.role === "admin") &&
      metadata.isCompanion === true
    );
  } catch {
    return false;
  }
}

export interface SharedWhiteboardProps {
  /** Stable class occurrence ID; separate from the physical live activation. */
  roomName: string;
  isReadonly?: boolean;
  onApiReady?: (api: ExcalidrawImperativeAPI) => void;
  /**
   * When true (default), this viewer's whiteboard viewport (scroll/zoom) automatically
   * follows the broadcaster. Set to false to let the viewer pan/zoom independently.
   */
  followViewport?: boolean;
  recordingToken?: string;
  presentationMode?: boolean;
  onReady?: () => void;
}

export function SharedWhiteboard(props: SharedWhiteboardProps) {
  const room = useRoomContext();
  const key = `${props.roomName}:${room.name}:${Boolean(props.isReadonly)}`;
  // Recording renders outside the localized, authenticated application layout.
  if (props.isReadonly) return <SharedWhiteboardSession key={key} {...props} />;
  return <WritableWhiteboard key={key} {...props} />;
}

type WhiteboardMessages = { recovery: string; save: string; size: string };
function WritableWhiteboard(props: SharedWhiteboardProps) {
  const t = useTranslations("classroom");
  const { getToken } = useAuth();
  const getUploadToken = useCallback(
    () => getToken({ template: "convex" }),
    [getToken],
  );
  return (
    <SharedWhiteboardSession
      {...props}
      getUploadToken={getUploadToken}
      messages={{
        recovery: t("whiteboardRecoveryFailed"),
        save: t("whiteboardSaveFailed"),
        size: t("whiteboardSizeLimit"),
      }}
    />
  );
}

function SharedWhiteboardSession({
  roomName,
  isReadonly = false,
  onApiReady,
  followViewport = true,
  recordingToken,
  presentationMode = false,
  onReady,
  getUploadToken,
  messages = {
    recovery: "The whiteboard could not be recovered. Reload to retry.",
    save: "Some changes are not saved yet.",
    size: "The whiteboard synchronization size limit was reached.",
  },
}: SharedWhiteboardProps & {
  getUploadToken?: () => Promise<string | null>;
  messages?: WhiteboardMessages;
}) {
  const room = useRoomContext();
  const applyDelta = useMutation(api.whiteboardSessions.applySceneDelta);
  const {
    scene: receivedScene,
    manifest,
    error: recoveryError,
  } = useWhiteboardScene(roomName, room.name, isReadonly, recordingToken);
  const generation = manifest?.format === 2 ? manifest.generation : undefined;
  const remoteElements = receivedScene?.elements;
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
  const [writerSnapshot, setWriterSnapshot] = useState<typeof receivedScene>();
  const [draft, setDraft] = useState<PersistedScene | null>();
  const [saveError, setSaveError] = useState(false);
  const [sizeError, setSizeError] = useState(false);
  const [imageSaveError, setImageSaveError] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState(false);
  const reportedSaveFailureRef = useRef(false);
  useEffect(() => {
    let active = true;
    void whiteboardDraftStorage.load(roomName).then((value) => {
      if (active) setDraft(value as PersistedScene | null);
    });
    return () => {
      active = false;
    };
  }, [roomName]);

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const onReadyRef = useRef(onReady);
  const hasSignaledReadyRef = useRef(false);
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  useEffect(() => {
    reportWhiteboardDiagnostic({
      operation: "whiteboard.mount",
      live_room: room.name,
      readonly: isReadonly,
    });
    const timeout = setTimeout(() => {
      if (!hasSignaledReadyRef.current)
        reportRuntimeError(new Error("Whiteboard readiness timed out"), {
          operation: "whiteboard.ready_timeout",
          live_room: room.name,
          readonly: isReadonly,
          connection_state: room.state,
        });
    }, 20_000);
    return () => clearTimeout(timeout);
  }, [room, isReadonly]);
  const suppressRef = useRef(false);
  const lastSceneRevisionRef = useRef<string | null>(null);
  const confirmedSceneRevisionRef = useRef<string | null>(null);
  const latestElementsRef = useRef<ExcalidrawElements>([]);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Throttle: stores the timestamp of the last pointer message sent
  const lastPointerSentRef = useRef(0);
  // Viewport sync — tracks last-broadcast viewport to avoid redundant sends
  const lastViewportRef = useRef<{
    scrollX: number;
    scrollY: number;
    zoom: number;
  } | null>(null);
  const lastViewportSentRef = useRef(0);
  // Ref so the dataReceived closure always reads the latest followViewport value
  const followViewportRef = useRef(followViewport);
  useEffect(() => {
    followViewportRef.current = followViewport;
  }, [followViewport]);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // Track file IDs already fetched and added to the canvas (reader side)
  const addedFileIdsRef = useRef<Set<string>>(new Set());

  // Buffer data that arrives before Excalidraw has finished loading
  const pendingElementsRef = useRef<ExcalidrawElements | null>(null);
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
  const imageLoadTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [imageLoadRetry, setImageLoadRetry] = useState(0);
  const startUploadsRef = useRef<() => void>(() => {});
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    const retryTimers = imageRetryTimersRef.current;
    const loadTimers = imageLoadTimersRef.current;
    return () => {
      mountedRef.current = false;
      for (const timer of retryTimers.values()) clearTimeout(timer);
      retryTimers.clear();
      for (const timer of loadTimers) clearTimeout(timer);
      loadTimers.clear();
    };
  }, []);

  // Remote collaborator state — drives laser pointer rendering
  const collaboratorsRef = useRef<Map<SocketId, Collaborator>>(new Map());

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
      initialFileRefs: {} as FileRefMap,
      initialFiles: {} as BinaryFiles,
      hasPendingScene: false,
      cachedRevision: null as string | null,
    };
    if (draft) {
      const scene = draft;
      return {
        initialData: scene as ExcalidrawInitialDataState,
        initialFileRefs: scene.fileRefs ?? ({} as FileRefMap),
        initialFiles: scene.files ?? ({} as BinaryFiles),
        hasPendingScene:
          scene.saved === false ||
          (scene.saved === undefined && manifest?.fromLegacy === false),
        cachedRevision: sceneRevision(scene.elements),
      };
    }
    return empty;
  }, [draft, manifest?.fromLegacy]);

  // CDN refs — initialised from localStorage so a page refresh doesn’t lose the mapping
  const fileRefsRef = useRef<FileRefMap>(initialFileRefs);
  // Current BinaryFiles in scene — initialised from localStorage, kept current by handleChange
  const currentFilesRef = useRef<BinaryFiles>(initialFiles);
  const cachedRevisionRef = useRef(cachedRevision);
  const initialCanvasData = useMemo(() => {
    const cloud = writerSnapshot?.elements as ExcalidrawElements | undefined;
    const elements =
      !isReadonly && cloud
        ? hasPendingScene
          ? mergeWhiteboardElements(
              cloud,
              cachedData.elements ?? [],
              cloud.map((element) => element.id),
            )
          : cloud
        : (cachedData.elements ?? []);
    return { ...cachedData, elements: isolateWhiteboardElements(elements) };
  }, [writerSnapshot, cachedData, isReadonly, hasPendingScene]);

  const confirmCachedScene = useCallback(() => {
    if (
      confirmedSceneRevisionRef.current === null ||
      confirmedSceneRevisionRef.current !== lastSceneRevisionRef.current
    )
      return;
    void whiteboardDraftStorage.confirm(
      roomName,
      confirmedSceneRevisionRef.current,
      fileRefsRef.current,
      cachedRevisionRef.current,
    );
  }, [roomName]);

  useEffect(() => {
    if (
      isReadonly ||
      draft === undefined ||
      writerSnapshot !== undefined ||
      receivedScene === undefined
    )
      return;
    fileRefsRef.current = { ...initialFileRefs, ...receivedScene.fileRefs };
    currentFilesRef.current = initialFiles;
    cachedRevisionRef.current = cachedRevision;
    setWriterSnapshot(receivedScene);
  }, [
    isReadonly,
    draft,
    writerSnapshot,
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
      .save(roomName, {
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
  }, [roomName]);
  const scheduleDraft = useCallback(() => {
    if (!mountedRef.current) return;
    if (!draftTimerRef.current)
      draftTimerRef.current = setTimeout(persistDraft, 300);
  }, [persistDraft]);
  const sync: ReturnType<
    typeof createWhiteboardSync<ExcalidrawElements[number]>
  > = useMemo(
    () =>
      createWhiteboardSync<ExcalidrawElements[number]>({
        send: async (elements) => {
          if (generation === undefined) throw new Error("WHITEBOARD_NOT_READY");
          const buckets = new Map<number, ExcalidrawElements[number][]>();
          for (const element of elements) {
            const id = whiteboardBucketId(element.id);
            const group = buckets.get(id) ?? [];
            group.push(element);
            buckets.set(id, group);
          }
          // Sequential requests bound write pressure and keep retry acknowledgements simple.
          for (const [bucketId, group] of buckets) {
            const result = await applyDelta({
              roomName,
              expectedLiveRoomName: room.name,
              generation,
              bucketId,
              parts: splitWhiteboardPayload(JSON.stringify(group)),
            });
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
              live_room: room.name,
              connection_state: room.state,
            });
          }
        },
      }),
    [roomName, room, applyDelta, generation, confirmCachedScene, scheduleDraft],
  );
  useEffect(() => {
    if (writerSnapshot)
      sync.seed(writerSnapshot.elements as ExcalidrawElements);
  }, [sync, writerSnapshot]);
  useEffect(() => {
    if (isReadonly) return;
    sync.resume();
    const flush = () => {
      persistDraft();
      void sync.flush();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const pendingImage = hasPendingImages(
        latestElementsRef.current,
        fileRefsRef.current,
      );
      if (
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
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", visibility);
      if (lastSceneRevisionRef.current !== null) persistDraft();
      sync.dispose();
    };
  }, [isReadonly, persistDraft, sync]);

  // ---------------------------------------------------------------------------
  // RECEIVER — apply remote scene data into the local canvas
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!room) return;

    const handleDataReceived = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
    ) => {
      try {
        const msg = JSON.parse(
          new TextDecoder().decode(payload),
        ) as WhiteboardMessage;
        if (!isWhiteboardBroadcaster(participant)) return;

        if (msg.type === "WHITEBOARD_VIEWPORT" && followViewportRef.current) {
          if (!mountedRef.current) return;
          if (apiRef.current) {
            const api = apiRef.current;
            setTimeout(() => {
              api.updateScene({
                appState: {
                  scrollX: msg.scrollX,
                  scrollY: msg.scrollY,
                  zoom: { value: msg.zoom as NormalizedZoomValue },
                },
              });
            }, 0);
          }
        }

        if (
          msg.type === "WHITEBOARD_POINTER" &&
          participant &&
          !presentationMode
        ) {
          const id = participant.identity as SocketId;
          collaboratorsRef.current.set(id, {
            pointer: { x: msg.x, y: msg.y, tool: msg.tool },
            button: msg.button,
            username: participant.name ?? id,
            color: identityColor(participant.identity),
            isCurrentUser: false,
          });
          // No setTimeout here — pointer updates must reach Excalidraw immediately
          // for the laser trail to render. LiveKit dataReceived fires outside React's
          // render cycle so there is no setState-in-update risk.
          apiRef.current?.updateScene({
            collaborators: new Map(collaboratorsRef.current),
          });
        }
      } catch {
        /* ignore non-whiteboard packets */
      }
    };

    room.on("dataReceived", handleDataReceived);
    return () => {
      room.off("dataReceived", handleDataReceived);
    };
  }, [presentationMode, room]);

  // ---------------------------------------------------------------------------
  // Helpers — upload to Convex, cache CDN URL, broadcast ref; cleanup
  // ---------------------------------------------------------------------------

  /**
   * Upload one file to Convex storage, then store the CDN ref via the
   * whiteboardSessions mutation. All readers receive it reactively — no
   * DataChannel publish needed, so there are no size or connectivity issues.
   */
  const uploadAndBroadcastFile = useCallback(
    async (file: BinaryFileData) => {
      if (uploadingFileIdsRef.current.size >= 2) return;
      sentFileIdsRef.current.add(file.id);
      uploadingFileIdsRef.current.add(file.id);
      try {
        const token = await getUploadToken?.();
        if (!token) throw new Error("PERMISSION_DENIED");
        const site =
          process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
          process.env.NEXT_PUBLIC_CONVEX_URL?.replace(
            /\.convex\.cloud$/,
            ".convex.site",
          );
        if (!site) throw new Error("WHITEBOARD_UPLOAD_UNAVAILABLE");
        const { blob, mimeType: uploadMimeType } = await compressImage(
          file.dataURL,
          file.mimeType,
        );
        const uploadUrl = new URL("/whiteboard-files", site);
        uploadUrl.search = new URLSearchParams({
          roomName,
          expectedLiveRoomName: room.name,
          fileId: file.id,
          created: String(file.created),
        }).toString();
        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          body: blob,
          headers: {
            "Content-Type": uploadMimeType,
            "X-File-Size": String(blob.size),
            Authorization: `Bearer ${token}`,
          },
        });
        if (!uploadResponse.ok) {
          const body = await uploadResponse.json().catch(() => null);
          throw new Error(
            typeof body?.error === "string"
              ? body.error
              : "Whiteboard image upload failed",
          );
        }
        const fileRef = (await uploadResponse.json()) as FileRef;

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
          live_room: room.name,
        });
        sentFileIdsRef.current.delete(file.id);
        failedFileIdsRef.current.add(file.id);
        setImageSaveError(true);
        const attempt = (uploadAttemptsRef.current.get(file.id) ?? 0) + 1;
        uploadAttemptsRef.current.set(file.id, attempt);
        if (
          attempt < 3 &&
          mountedRef.current &&
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
        if (mountedRef.current) queueMicrotask(() => startUploadsRef.current());
      }
    },
    [getUploadToken, scheduleDraft, confirmCachedScene, roomName, room],
  );
  const startUploads = useCallback(() => {
    if (isReadonly || !mountedRef.current) return;
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
  startUploadsRef.current = startUploads;

  // ---------------------------------------------------------------------------
  // READER — apply scene from Convex when it changes (reactive subscription)
  // Only active when isReadonly=true (teacher view, students).
  // ---------------------------------------------------------------------------

  // Merge concurrent staff edits; remote changes must not become local undo steps.
  useEffect(() => {
    if (!remoteElements || (!isReadonly && !writerSnapshot)) return;
    const elements = remoteElements as ExcalidrawElements;
    if (apiRef.current) {
      const api = apiRef.current;
      const timer = setTimeout(() => {
        if (!mountedRef.current) return;
        suppressRef.current = true;
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
                manifest?.legacyOrder,
              ) as ExcalidrawElements);
        api.updateScene({
          elements: next,
          captureUpdate: "NEVER" as Parameters<
            typeof api.updateScene
          >[0]["captureUpdate"],
        });
        if (!isReadonly) {
          sync.seed(elements);
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
        setTimeout(() => {
          suppressRef.current = false;
        }, 0);
      }, 0);
      return () => clearTimeout(timer);
    } else {
      // API not mounted yet — buffer until excalidrawAPI callback fires
      if (isReadonly) pendingElementsRef.current = elements;
    }
  }, [
    isReadonly,
    remoteElements,
    writerSnapshot,
    manifest?.legacyOrder,
    sync,
    scheduleDraft,
    confirmCachedScene,
  ]);

  // Load new images from Convex file refs as they are added.
  useEffect(() => {
    if (draft === undefined || !receivedScene?.fileRefs) return;
    const fileRefs = receivedScene.fileRefs;
    for (const [fileId, ref] of Object.entries(fileRefs)) {
      if (!neededImageIds.has(fileId)) continue;
      if (addedFileIdsRef.current.has(fileId)) continue;
      addedFileIdsRef.current.add(fileId);
      if (
        Object.hasOwn(initialFiles, fileId) &&
        Object.hasOwn(initialFileRefs, fileId) &&
        initialFileRefs[fileId]?.storageId === ref.storageId
      )
        continue;
      void (async () => {
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
          if (!mountedRef.current) return;
          if (apiRef.current) {
            const api = apiRef.current;
            setTimeout(() => {
              if (mountedRef.current) api.addFiles([fileData]);
            }, 0);
          } else {
            pendingFilesRef.current.push(fileData);
          }
        } catch (err) {
          console.error("[Whiteboard] Failed to load image from Convex:", err);
          reportRuntimeError(err, {
            operation: "whiteboard.image_load",
            live_room: room.name,
          });
          addedFileIdsRef.current.delete(fileId); // allow retry on next render
          const attempt = (imageLoadAttemptsRef.current.get(fileId) ?? 0) + 1;
          imageLoadAttemptsRef.current.set(fileId, attempt);
          if (attempt < 3 && mountedRef.current) {
            const timer = setTimeout(
              () => {
                imageLoadTimersRef.current.delete(timer);
                setImageLoadRetry((value) => value + 1);
              },
              1000 * 2 ** (attempt - 1),
            );
            imageLoadTimersRef.current.add(timer);
          }
        }
      })();
    }
  }, [
    draft,
    receivedScene?.fileRefs,
    room.name,
    initialFiles,
    initialFileRefs,
    imageLoadRetry,
    neededImageIds,
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
        live_room: room.name,
        readonly: isReadonly,
      });
      onReadyRef.current?.();
    }, 0);

    return () => clearTimeout(readyTimer);
  }, [isCanvasReady, isReadonly, receivedScene, room.name]);

  const handleChange = useCallback(
    (elements: ExcalidrawElements, appState: AppState, files: BinaryFiles) => {
      if (isReadonly || writerSnapshot === undefined || suppressRef.current)
        return;

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
        lastSceneRevisionRef.current = sceneRevision(latestElementsRef.current);
        scheduleDraft();
      } else if (filesChanged) {
        scheduleDraft();
      }
      startUploads();

      // Viewport sync — throttled at 30 fps, sent unreliably (ephemeral, like pointer)
      const { scrollX, scrollY, zoom: zoomState } = appState;
      const zoomValue = zoomState.value;
      const lastVP = lastViewportRef.current;
      const nowVP = Date.now();
      if (
        (!lastVP ||
          lastVP.scrollX !== scrollX ||
          lastVP.scrollY !== scrollY ||
          lastVP.zoom !== zoomValue) &&
        nowVP - lastViewportSentRef.current >= 33 &&
        room.state === ConnectionState.Connected
      ) {
        lastViewportRef.current = { scrollX, scrollY, zoom: zoomValue };
        lastViewportSentRef.current = nowVP;
        const vpMsg: WhiteboardViewportMsg = {
          type: "WHITEBOARD_VIEWPORT",
          scrollX,
          scrollY,
          zoom: zoomValue,
        };
        try {
          room.localParticipant.publishData(
            new TextEncoder().encode(JSON.stringify(vpMsg)),
            { reliable: false },
          );
        } catch {
          /* ephemeral — next change will retry */
        }
      }
    },
    [room, isReadonly, startUploads, writerSnapshot, sync, scheduleDraft],
  );

  // ---------------------------------------------------------------------------
  // POINTER BROADCASTER — laser / cursor at ~30 fps (throttled, not debounced)
  // ---------------------------------------------------------------------------
  // Throttle (not debounce): send immediately then block for 33 ms.
  // Debounce would only send the final resting position, destroying the laser
  // trail which needs a continuous stream of intermediate positions.
  const handlePointerUpdate = useCallback(
    ({
      pointer,
      button,
    }: Parameters<NonNullable<ExcalidrawProps["onPointerUpdate"]>>[0]) => {
      if (!room || isReadonly) return;
      if (room.state !== ConnectionState.Connected) return; // DataChannel not ready
      const now = Date.now();
      if (now - lastPointerSentRef.current < 33) return; // throttle gate
      lastPointerSentRef.current = now;
      const msg: WhiteboardPointerMsg = {
        type: "WHITEBOARD_POINTER",
        x: pointer.x,
        y: pointer.y,
        button,
        tool: pointer.tool,
      };
      try {
        room.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify(msg)),
          { reliable: false },
        );
      } catch {
        /* ephemeral — next pointer event will retry */
      }
    },
    [room, isReadonly],
  );

  if (recoveryError) {
    return <div role="alert">{messages.recovery}</div>;
  }
  if (
    draft === undefined ||
    receivedScene === undefined ||
    (!isReadonly && writerSnapshot === undefined)
  ) {
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
          // Flush data buffered while the API was loading.
          // setTimeout(0) is a macrotask — it fires AFTER React has fully committed
          // Excalidraw's initial render, preventing the "setState inside update" error
          // that occurs when requestAnimationFrame fires mid-reconciliation.
          setTimeout(() => {
            if (!mountedRef.current) return;
            if (pendingElementsRef.current) {
              suppressRef.current = true;
              api.updateScene({
                elements: isolateWhiteboardElements(pendingElementsRef.current),
                captureUpdate: "NEVER" as Parameters<
                  typeof api.updateScene
                >[0]["captureUpdate"],
              });
              pendingElementsRef.current = null;
              setTimeout(() => {
                suppressRef.current = false;
              }, 0);
            }
            if (pendingFilesRef.current.length > 0) {
              api.addFiles(pendingFilesRef.current.splice(0));
            }
            setIsCanvasReady(true);
          }, 0);
        }}
        onChange={handleChange}
        onPointerUpdate={!isReadonly ? handlePointerUpdate : undefined}
        isReadonly={isReadonly}
        presentationMode={presentationMode}
      />
    </div>
  );
}
