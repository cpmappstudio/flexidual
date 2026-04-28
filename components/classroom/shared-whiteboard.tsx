"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ComponentType, MutableRefObject } from "react";
import dynamic from "next/dynamic";
import { useConvex, useMutation } from "convex/react";
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
// Wire protocol — discriminated union keeps message handling exhaustive
// ---------------------------------------------------------------------------

type WhiteboardSyncMsg = {
  type: "WHITEBOARD_SYNC";
  elements: ReturnType<ExcalidrawImperativeAPI["getSceneElements"]>;
};

/** Sent once per image: a Convex storage URL replaces raw base64 over the DataChannel. */
type WhiteboardFileRefMsg = {
  type: "WHITEBOARD_FILE_REF";
  /** Excalidraw's own file ID, used as the key in BinaryFiles */
  fileId: string;
  /** Public Convex CDN URL — receivers fetch the image from here */
  url: string;
  mimeType: string;
  created: number;
};

type WhiteboardPointerMsg = {
  type: "WHITEBOARD_POINTER";
  x: number;
  y: number;
  button: "up" | "down";
  tool: "pointer" | "laser";
};

type WhiteboardMessage = WhiteboardSyncMsg | WhiteboardFileRefMsg | WhiteboardPointerMsg;

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
}

export function SharedWhiteboard({ roomName, isReadonly = false, onApiReady, broadcastRef, cleanupRef }: SharedWhiteboardProps) {
  const room = useRoomContext();
  const convex = useConvex();
  const generateUploadUrl = useMutation(api.whiteboardFiles.generateUploadUrl);
  const deleteSessionFiles = useMutation(api.whiteboardFiles.deleteSessionFiles);

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const suppressRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Throttle: stores the timestamp of the last pointer message sent
  const lastPointerSentRef = useRef(0);

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

        if (msg.type === "WHITEBOARD_SYNC") {
          const elements = msg.elements;
          if (apiRef.current) {
            const api = apiRef.current;
            // setTimeout(0) pushes to the macrotask queue — safely outside any
            // ongoing React/Excalidraw render cycle, preventing setState-in-update
            setTimeout(() => {
              suppressRef.current = true;
              api.updateScene({ elements });
              setTimeout(() => { suppressRef.current = false; }, 0);
            }, 0);
          } else {
            pendingElementsRef.current = elements;
          }
        }

        if (msg.type === "WHITEBOARD_FILE_REF") {
          // Fetch the image from Convex CDN and add it to the local canvas
          void (async () => {
            try {
              const response = await fetch(msg.url);
              const blob = await response.blob();
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
              const fileData: BinaryFileData = {
                id: msg.fileId as BinaryFileData["id"],
                mimeType: msg.mimeType as BinaryFileData["mimeType"],
                dataURL: dataUrl as BinaryFileData["dataURL"],
                created: msg.created,
              };
              if (apiRef.current) {
                const api = apiRef.current;
                setTimeout(() => api.addFiles([fileData]), 0);
              } else {
                pendingFilesRef.current.push(fileData);
              }
            } catch (err) {
              console.error("[Whiteboard] Failed to load remote image:", err);
            }
          })();
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
   * Upload one file to Convex, cache the CDN URL in fileRefsRef + localStorage,
   * then broadcast a WHITEBOARD_FILE_REF message (optionally targeted).
   */
  const uploadAndBroadcastFile = useCallback(async (
    file: BinaryFileData,
    destinationIdentities?: string[],
  ) => {
    if (!room) return;
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

      // Cache so re-broadcasts after a refresh don't trigger re-uploads
      fileRefsRef.current[file.id] = { url, mimeType: uploadMimeType, storageId };
      persistFileRefs();

      const msg: WhiteboardFileRefMsg = {
        type: "WHITEBOARD_FILE_REF",
        fileId: file.id,
        url,
        mimeType: uploadMimeType,
        created: file.created,
      };
      room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify(msg)),
        { reliable: true, ...(destinationIdentities ? { destinationIdentities } : {}) },
      );
    } catch (err) {
      console.error("[Whiteboard] Image upload failed:", err);
      sentFileIdsRef.current.delete(file.id);
    }
  }, [room, generateUploadUrl, convex, persistFileRefs]);

  /**
   * Re-broadcast all current scene images to the room (or specific participants).
   * Uses cached CDN URLs (fast path) for previously uploaded files — no re-upload.
   * Called by CompanionClassroomUI on re-present or when a late joiner connects.
   */
  const broadcastAllFiles = useCallback(async (destinationIdentities?: string[]) => {
    if (!room) return;
    const encoder = new TextEncoder();
    for (const [fileId, file] of Object.entries(currentFilesRef.current)) {
      const cached = fileRefsRef.current[fileId];
      if (cached) {
        // Fast path: CDN URL already known — just re-broadcast the lightweight ref
        const msg: WhiteboardFileRefMsg = {
          type: "WHITEBOARD_FILE_REF",
          fileId: file.id,
          url: cached.url,
          mimeType: cached.mimeType,
          created: file.created,
        };
        try {
          room.localParticipant.publishData(
            encoder.encode(JSON.stringify(msg)),
            { reliable: true, ...(destinationIdentities ? { destinationIdentities } : {}) },
          );
        } catch (err) {
          console.error("[Whiteboard] Failed to re-broadcast file ref:", err);
        }
      } else if (!sentFileIdsRef.current.has(fileId)) {
        // Slow path: first time seen after a page refresh — upload then broadcast
        void uploadAndBroadcastFile(file, destinationIdentities);
      }
    }
  }, [room, uploadAndBroadcastFile]);

  /** Delete all Convex storage objects for this session and wipe localStorage. */
  const cleanupSession = useCallback(async () => {
    const storageIds = Object.values(fileRefsRef.current).map((r) => r.storageId);
    try {
      if (storageIds.length > 0) {
        await deleteSessionFiles({ storageIds: storageIds as Id<"_storage">[] });
      }
    } catch (err) {
      console.error("[Whiteboard] Failed to delete session files:", err);
    }
    localStorage.removeItem(`${WB_STORAGE_PREFIX}${roomName}`);
    fileRefsRef.current = {};
    sentFileIdsRef.current.clear();
  }, [deleteSessionFiles, roomName]);

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
  // BROADCASTER — elements (debounced) + new image files (via Convex storage)
  // ---------------------------------------------------------------------------
  const handleChange = useCallback(
    (elements: ExcalidrawElements, _appState: AppState, files: BinaryFiles) => {
      if (!room || isReadonly || suppressRef.current) return;

      // Keep currentFilesRef current — needed by broadcastAllFiles
      currentFilesRef.current = files;

      // Upload any new files; sentFileIdsRef prevents duplicate in-flight uploads
      for (const id of Object.keys(files)) {
        if (!sentFileIdsRef.current.has(id)) {
          void uploadAndBroadcastFile(files[id]);
        }
      }

      // Debounced element sync — only when DataChannel is open
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (room.state !== ConnectionState.Connected) { timerRef.current = null; return; }
        const msg: WhiteboardSyncMsg = { type: "WHITEBOARD_SYNC", elements: apiRef.current?.getSceneElements() ?? [] };
        try {
          room.localParticipant.publishData(
            new TextEncoder().encode(JSON.stringify(msg)),
            { reliable: true },
          );
        } catch { /* DataChannel not ready — next change will retry */ }
        timerRef.current = null;
      }, 80);

      // Persist to session-scoped localStorage (fileRefs included for refresh recovery)
      try {
        const scene: PersistedScene = { elements, files, fileRefs: fileRefsRef.current };
        localStorage.setItem(`${WB_STORAGE_PREFIX}${roomName}`, JSON.stringify(scene));
      } catch { /* ignore QuotaExceededError */ }
    },
    [room, isReadonly, roomName, uploadAndBroadcastFile],
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
