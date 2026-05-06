"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ComponentType, MutableRefObject } from "react";
import dynamic from "next/dynamic";
import { useConvex, useMutation, useQuery } from "convex/react";
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

// Derived from the onChange signature — avoids importing the unexported OrderedExcalidrawElement
type ExcalidrawElements = Parameters<NonNullable<ExcalidrawProps["onChange"]>>[0];

// Dynamic import required — Excalidraw uses browser-only APIs (no SSR)
const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-white text-muted-foreground text-sm">
        Loading whiteboard…
      </div>
    ),
  }
) as ComponentType<ExcalidrawProps>;

// ---------------------------------------------------------------------------
// Wire protocol — only ephemeral real-time events (pointer + viewport).
// Scene elements and file refs are synced via Convex reactive queries, which
// have no size limit and are immune to WebRTC DataChannel constraints.
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

const WB_STORAGE_PREFIX = "wb_";

/** Cached Convex CDN reference for a single uploaded image */
type FileRef = { url: string; mimeType: string; storageId: string };
/** Map from Excalidraw file ID → Convex CDN ref */
type FileRefMap = Record<string, FileRef>;

type PersistedScene = {
  elements: ExcalidrawElements;
  files: BinaryFiles;
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
  const raster = mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/webp";
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
      if (!ctx) { reject(new Error("canvas 2d unavailable")); return; }

      // Fill white background for JPEG (which has no alpha channel)
      const outputType = mimeType === "image/png" ? "image/png" : "image/jpeg";
      if (outputType === "image/jpeg") {
        ctx.fillStyle = "#ffffff";
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
function identityColor(identity: string): { background: string; stroke: string } {
  let hash = 0;
  for (let i = 0; i < identity.length; i++) {
    hash = identity.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  const background = `hsl(${h},70%,55%)`;
  const stroke = `hsl(${h},70%,35%)`;
  return { background, stroke };
}

export interface SharedWhiteboardProps {
  /** LiveKit room name — scopes localStorage so each class starts clean. */
  roomName: string;
  isReadonly?: boolean;
  onApiReady?: (api: ExcalidrawImperativeAPI) => void;
  /**
   * Populated by SharedWhiteboard. Call with optional destinationIdentities
   * to re-broadcast all uploaded image refs (e.g. on re-present or late joiner).
   */
  broadcastRef?: MutableRefObject<((destinationIdentities?: string[]) => Promise<void>) | null>;
  /**
   * Populated by SharedWhiteboard. Call on session end to delete all Convex
   * storage objects uploaded during this session and clear localStorage.
   */
  cleanupRef?: MutableRefObject<(() => Promise<void>) | null>;
  /**
   * When true (default), this viewer's whiteboard viewport (scroll/zoom) automatically
   * follows the broadcaster. Set to false to let the viewer pan/zoom independently.
   */
  followViewport?: boolean;
}

export function SharedWhiteboard({ roomName, isReadonly = false, onApiReady, broadcastRef, cleanupRef, followViewport = true }: SharedWhiteboardProps) {
  const room = useRoomContext();
  const convex = useConvex();
  const generateUploadUrl = useMutation(api.whiteboardFiles.generateUploadUrl);
  const deleteSessionFiles = useMutation(api.whiteboardFiles.deleteSessionFiles);
  const upsertScene = useMutation(api.whiteboardSessions.upsertScene);
  const addFileRefMutation = useMutation(api.whiteboardSessions.addFileRef);
  const clearSessionMutation = useMutation(api.whiteboardSessions.clearSession);
  // Readers subscribe to Convex scene changes reactively.
  // Writers (isReadonly=false) skip the query — they write, not read.
  const sceneData = useQuery(
    api.whiteboardSessions.getScene,
    isReadonly ? { roomName } : "skip",
  );

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const suppressRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Throttle: stores the timestamp of the last pointer message sent
  const lastPointerSentRef = useRef(0);
  // Viewport sync — tracks last-broadcast viewport to avoid redundant sends
  const lastViewportRef = useRef<{ scrollX: number; scrollY: number; zoom: number } | null>(null);
  const lastViewportSentRef = useRef(0);
  // Ref so the dataReceived closure always reads the latest followViewport value
  const followViewportRef = useRef(followViewport);
  useEffect(() => { followViewportRef.current = followViewport; }, [followViewport]);

  // Track file IDs already fetched and added to the canvas (reader side)
  const addedFileIdsRef = useRef<Set<string>>(new Set());

  // Buffer data that arrives before Excalidraw has finished loading
  const pendingElementsRef = useRef<ExcalidrawElements | null>(null);
  const pendingFilesRef = useRef<BinaryFileData[]>([]);

  // Track file IDs already in-flight — prevents duplicate uploads
  const sentFileIdsRef = useRef<Set<string>>(new Set());

  // Remote collaborator state — drives laser pointer rendering
  const collaboratorsRef = useRef<Map<SocketId, Collaborator>>(new Map());

  // Load persisted scene once per mount — roomName change means a new instance
  const { initialData, initialFileRefs, initialFiles } = useMemo(() => {
    const empty = {
      initialData: { elements: [] } as ExcalidrawInitialDataState,
      initialFileRefs: {} as FileRefMap,
      initialFiles: {} as BinaryFiles,
    };
    if (typeof window === "undefined") return empty;
    try {
      const raw = localStorage.getItem(`${WB_STORAGE_PREFIX}${roomName}`);
      if (raw) {
        const scene = JSON.parse(raw) as PersistedScene;
        return {
          initialData: scene as ExcalidrawInitialDataState,
          initialFileRefs: scene.fileRefs ?? ({} as FileRefMap),
          initialFiles: scene.files ?? ({} as BinaryFiles),
        };
      }
    } catch { /* ignore parse/quota errors */ }
    return empty;
  }, [roomName]);

  // CDN refs — initialised from localStorage so a page refresh doesn’t lose the mapping
  const fileRefsRef = useRef<FileRefMap>(initialFileRefs);
  // Current BinaryFiles in scene — initialised from localStorage, kept current by handleChange
  const currentFilesRef = useRef<BinaryFiles>(initialFiles);

  // ---------------------------------------------------------------------------
  // RECEIVER — apply remote scene data into the local canvas
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!room) return;

    const handleDataReceived = (payload: Uint8Array, participant?: RemoteParticipant) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload)) as WhiteboardMessage;

        if (msg.type === "WHITEBOARD_VIEWPORT" && followViewportRef.current) {
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

        if (msg.type === "WHITEBOARD_POINTER" && participant) {
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
          apiRef.current?.updateScene({ collaborators: new Map(collaboratorsRef.current) });
        }
      } catch { /* ignore non-whiteboard packets */ }
    };

    room.on("dataReceived", handleDataReceived);
    return () => { room.off("dataReceived", handleDataReceived); };
  }, [room]);

  // ---------------------------------------------------------------------------
  // Helpers — upload to Convex, cache CDN URL, broadcast ref; cleanup
  // ---------------------------------------------------------------------------

  /** Persist updated fileRefs back into the existing localStorage entry. */
  const persistFileRefs = useCallback(() => {
    try {
      const raw = localStorage.getItem(`${WB_STORAGE_PREFIX}${roomName}`);
      if (!raw) return;
      const scene = JSON.parse(raw) as PersistedScene;
      localStorage.setItem(`${WB_STORAGE_PREFIX}${roomName}`, JSON.stringify({ ...scene, fileRefs: fileRefsRef.current }));
    } catch { /* ignore QuotaExceededError */ }
  }, [roomName]);

  /**
   * Upload one file to Convex storage, then store the CDN ref via the
   * whiteboardSessions mutation. All readers receive it reactively — no
   * DataChannel publish needed, so there are no size or connectivity issues.
   */
  const uploadAndBroadcastFile = useCallback(async (file: BinaryFileData) => {
    sentFileIdsRef.current.add(file.id);
    try {
      const uploadUrl = await generateUploadUrl();
      const { blob, mimeType: uploadMimeType } = await compressImage(file.dataURL, file.mimeType);
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        body: blob,
        headers: { "Content-Type": uploadMimeType },
      });
      const { storageId } = (await uploadResponse.json()) as { storageId: string };
      const url = await convex.query(api.whiteboardFiles.getServingUrl, {
        storageId: storageId as Id<"_storage">,
      });
      if (!url) return;

      // Cache locally so a page refresh doesn't lose the mapping
      fileRefsRef.current[file.id] = { url, mimeType: uploadMimeType, storageId };
      persistFileRefs();

      // Publish via Convex — readers pick it up from getScene subscription
      await addFileRefMutation({
        roomName,
        fileId: file.id,
        url,
        mimeType: uploadMimeType,
        storageId,
        created: file.created,
      });
    } catch (err) {
      console.error("[Whiteboard] Image upload failed:", err);
      sentFileIdsRef.current.delete(file.id);
    }
  }, [generateUploadUrl, convex, persistFileRefs, addFileRefMutation, roomName]);

  /**
   * No-op: Convex reactive queries automatically deliver the current scene
   * (including all file refs) to every subscriber, including late joiners.
   * This callback is kept for API compatibility with CompanionClassroomUI.
   */
  const broadcastAllFiles = useCallback(async () => {
    // Intentionally empty — Convex handles distribution.
  }, []);

  /** Delete all Convex storage objects and the session document; wipe localStorage. */
  const cleanupSession = useCallback(async () => {
    const storageIds = Object.values(fileRefsRef.current).map((r) => r.storageId);
    try {
      if (storageIds.length > 0) {
        await deleteSessionFiles({ storageIds: storageIds as Id<"_storage">[] });
      }
      await clearSessionMutation({ roomName });
    } catch (err) {
      console.error("[Whiteboard] Failed to delete session files:", err);
    }
    localStorage.removeItem(`${WB_STORAGE_PREFIX}${roomName}`);
    fileRefsRef.current = {};
    sentFileIdsRef.current.clear();
  }, [deleteSessionFiles, clearSessionMutation, roomName]);

  // Wire broadcastRef / cleanupRef so the parent (CompanionClassroomUI) can call them
  useEffect(() => {
    if (broadcastRef) broadcastRef.current = broadcastAllFiles;
    if (cleanupRef) cleanupRef.current = cleanupSession;
    return () => {
      if (broadcastRef) broadcastRef.current = null;
      if (cleanupRef) cleanupRef.current = null;
    };
  }, [broadcastRef, cleanupRef, broadcastAllFiles, cleanupSession]);

  // ---------------------------------------------------------------------------
  // READER — apply scene from Convex when it changes (reactive subscription)
  // Only active when isReadonly=true (teacher view, students).
  // ---------------------------------------------------------------------------

  // Apply element updates from Convex. sceneData.updatedAt changes on every write.
  useEffect(() => {
    if (!isReadonly || !sceneData) return;
    const elements = sceneData.elements;
    if (!elements) return;
    if (apiRef.current) {
      const api = apiRef.current;
      setTimeout(() => {
        suppressRef.current = true;
        api.updateScene({ elements });
        setTimeout(() => { suppressRef.current = false; }, 0);
      }, 0);
    } else {
      // API not mounted yet — buffer until excalidrawAPI callback fires
      pendingElementsRef.current = elements;
    }
  // sceneData?.updatedAt is the minimal dependency: changes only when the writer saves
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReadonly, sceneData?.updatedAt]);

  // Load new images from Convex file refs as they are added.
  useEffect(() => {
    if (!isReadonly || !sceneData?.fileRefs) return;
    const fileRefs = sceneData.fileRefs as Record<string, { url: string; mimeType: string; created: number }>;
    for (const [fileId, ref] of Object.entries(fileRefs)) {
      if (addedFileIdsRef.current.has(fileId)) continue;
      addedFileIdsRef.current.add(fileId);
      void (async () => {
        try {
          // Route through the Next.js proxy to bypass browser CORS restrictions.
          // Relative URL ensures the phone on ngrok inherits the correct tunnel origin.
          // The ngrok header bypasses the tunnel's HTML interstitial on first mobile connection.
          const proxyUrl = `/api/whiteboard-image?url=${encodeURIComponent(ref.url)}`;
          const response = await fetch(proxyUrl, {
            headers: { "ngrok-skip-browser-warning": "true" },
          });
          if (!response.ok) throw new Error(`Proxy fetch failed (${response.status})`);
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
          if (apiRef.current) {
            const api = apiRef.current;
            setTimeout(() => api.addFiles([fileData]), 0);
          } else {
            pendingFilesRef.current.push(fileData);
          }
        } catch (err) {
          console.error("[Whiteboard] Failed to load image from Convex:", err);
          addedFileIdsRef.current.delete(fileId); // allow retry on next render
        }
      })();
    }
  }, [isReadonly, sceneData?.fileRefs]);


  const handleChange = useCallback(
    (elements: ExcalidrawElements, appState: AppState, files: BinaryFiles) => {
      if (isReadonly || suppressRef.current) return;

      // Keep currentFilesRef current
      currentFilesRef.current = files;

      // Upload any new image files; check both sentFileIdsRef and cached fileRefs
      // to avoid re-uploading files that were already uploaded before a page refresh.
      for (const id of Object.keys(files)) {
        if (!sentFileIdsRef.current.has(id) && !fileRefsRef.current[id]) {
          void uploadAndBroadcastFile(files[id]);
        }
      }

      // Debounced element sync via Convex — no DataChannel, no size limit
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const els = apiRef.current?.getSceneElements() ?? [];
        void upsertScene({ roomName, elements: els });
        timerRef.current = null;
      }, 80);

      // Viewport sync — throttled at 30 fps, sent unreliably (ephemeral, like pointer)
      const { scrollX, scrollY, zoom: zoomState } = appState;
      const zoomValue = zoomState.value;
      const lastVP = lastViewportRef.current;
      const nowVP = Date.now();
      if (
        (!lastVP || lastVP.scrollX !== scrollX || lastVP.scrollY !== scrollY || lastVP.zoom !== zoomValue) &&
        nowVP - lastViewportSentRef.current >= 33 &&
        room.state === ConnectionState.Connected
      ) {
        lastViewportRef.current = { scrollX, scrollY, zoom: zoomValue };
        lastViewportSentRef.current = nowVP;
        const vpMsg: WhiteboardViewportMsg = { type: "WHITEBOARD_VIEWPORT", scrollX, scrollY, zoom: zoomValue };
        try {
          room.localParticipant.publishData(
            new TextEncoder().encode(JSON.stringify(vpMsg)),
            { reliable: false },
          );
        } catch { /* ephemeral — next change will retry */ }
      }

      // Persist to session-scoped localStorage (fileRefs included for refresh recovery)
      try {
        const scene: PersistedScene = { elements, files, fileRefs: fileRefsRef.current };
        localStorage.setItem(`${WB_STORAGE_PREFIX}${roomName}`, JSON.stringify(scene));
      } catch { /* ignore QuotaExceededError */ }
    },
    [room, isReadonly, roomName, uploadAndBroadcastFile, upsertScene],
  );

  // ---------------------------------------------------------------------------
  // POINTER BROADCASTER — laser / cursor at ~30 fps (throttled, not debounced)
  // ---------------------------------------------------------------------------
  // Throttle (not debounce): send immediately then block for 33 ms.
  // Debounce would only send the final resting position, destroying the laser
  // trail which needs a continuous stream of intermediate positions.
  const handlePointerUpdate = useCallback(
    ({ pointer, button }: Parameters<NonNullable<ExcalidrawProps["onPointerUpdate"]>>[0]) => {
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
      } catch { /* ephemeral — next pointer event will retry */ }
    },
    [room, isReadonly],
  );

  return (
    <div className="w-full h-full relative bg-white rounded-lg overflow-hidden border border-border touch-none overscroll-none">
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={(api: ExcalidrawImperativeAPI) => {
          apiRef.current = api;
          onApiReady?.(api);
          // Flush data buffered while the API was loading.
          // setTimeout(0) is a macrotask — it fires AFTER React has fully committed
          // Excalidraw's initial render, preventing the "setState inside update" error
          // that occurs when requestAnimationFrame fires mid-reconciliation.
          setTimeout(() => {
            if (pendingElementsRef.current) {
              suppressRef.current = true;
              api.updateScene({ elements: pendingElementsRef.current });
              pendingElementsRef.current = null;
              setTimeout(() => { suppressRef.current = false; }, 0);
            }
            if (pendingFilesRef.current.length > 0) {
              api.addFiles(pendingFilesRef.current.splice(0));
            }
          }, 0);
        }}
        onChange={handleChange}
        onPointerUpdate={!isReadonly ? handlePointerUpdate : undefined}
        viewModeEnabled={isReadonly}
        UIOptions={{
          canvasActions: {
            saveToActiveFile: false,
            loadScene: false,
            export: false,
            toggleTheme: false,
          },
        }}
      />
    </div>
  );
}
