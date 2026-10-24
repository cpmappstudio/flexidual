"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { useMutation } from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ClassroomNotebookPicker } from "./classroom-notebook-picker";
import { useRoomContext } from "@livekit/components-react";
import {
  ConnectionState,
  type RemoteParticipant,
  type Room,
} from "livekit-client";
import type {
  ExcalidrawProps,
  ExcalidrawImperativeAPI,
  AppState,
  BinaryFileData,
  Collaborator,
  SocketId,
  NormalizedZoomValue,
} from "@excalidraw/excalidraw/types";
import { useWhiteboardScene } from "@/hooks/use-whiteboard-scene";
import { useWhiteboardRealtime } from "@/hooks/use-whiteboard-realtime";
import { useNotebookPreview } from "@/hooks/use-notebook-preview";
import {
  compressWhiteboardImage,
  uploadWhiteboardImage,
} from "@/lib/whiteboard-image";
import {
  WhiteboardEditor,
  type WhiteboardEditorProps,
  type ExcalidrawElements,
} from "@/components/whiteboard/whiteboard-editor";

export { WhiteboardPreview as ClassroomWhiteboardPreview } from "@/components/whiteboard/whiteboard-editor";

type WhiteboardPointerMsg = {
  sourceId?: string;
  type: "WHITEBOARD_POINTER";
  x: number;
  y: number;
  button: "up" | "down";
  tool: "pointer" | "laser";
};

/** Sent by the broadcaster to sync all viewers' viewport (scroll + zoom level). */
type WhiteboardViewportMsg = {
  sourceId?: string;
  type: "WHITEBOARD_VIEWPORT";
  scrollX: number;
  scrollY: number;
  zoom: number;
};

type WhiteboardMessage = WhiteboardPointerMsg | WhiteboardViewportMsg;

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
  courseId?: Id<"classes">;
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
  const key = `${props.roomName}:${room.name}:${Boolean(props.isReadonly)}:${props.recordingToken ?? ""}`;
  // Recording renders outside the localized, authenticated application layout.
  if (props.isReadonly) return <SharedWhiteboardSession key={key} {...props} />;
  return <WritableWhiteboard key={key} {...props} />;
}

type WhiteboardMessages = { recovery: string; save: string; size: string };
function WritableWhiteboard(props: SharedWhiteboardProps) {
  const courseId = props.courseId;
  const t = useTranslations("classroom");
  const { getToken } = useAuth();
  const getUploadToken = useCallback(
    () => getToken({ template: "convex" }),
    [getToken],
  );
  const editor = (
    renderTopRightUI?: WhiteboardEditorProps["renderTopRightUI"],
  ) => (
    <SharedWhiteboardSession
      {...props}
      getUploadToken={getUploadToken}
      renderTopRightUI={renderTopRightUI}
      messages={{
        recovery: t("whiteboardRecoveryFailed"),
        save: t("whiteboardSaveFailed"),
        size: t("whiteboardSizeLimit"),
      }}
    />
  );
  return courseId ? (
    <ClassroomNotebookPicker classId={courseId} roomName={props.roomName}>
      {editor}
    </ClassroomNotebookPicker>
  ) : (
    editor()
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
  messages,
  renderTopRightUI,
}: SharedWhiteboardProps & {
  getUploadToken?: () => Promise<string | null>;
  messages?: WhiteboardMessages;
  renderTopRightUI?: WhiteboardEditorProps["renderTopRightUI"];
}) {
  const room = useRoomContext();
  const applyDelta = useMutation(api.whiteboardSessions.applySceneDelta);
  const applyNotebookDelta = useMutation(api.courseNotebook.applyDelta);
  const { scene, manifest, error } = useWhiteboardScene(
    roomName,
    room.name,
    isReadonly,
    recordingToken,
  );
  const generation = manifest?.format === 2 ? manifest.generation : undefined;
  const pageId = manifest?.format === 2 ? manifest.notebookPageId : undefined;
  const preview = useNotebookPreview(pageId, !isReadonly, getUploadToken);
  const realtime = useWhiteboardRealtime({
    room,
    roomName,
    sourceId: manifest?.format === 2 ? manifest.sourceId : undefined,
    generation,
    durable: scene?.elements,
    isReadonly,
    recordingToken,
  });
  const presentation = useWhiteboardPresentation(
    room,
    isReadonly,
    followViewport,
    presentationMode,
    pageId && manifest?.format === 2 ? manifest.sourceId : undefined,
  );
  const setPresentationApi = presentation.onApiReady;
  const saveDelta = useCallback<WhiteboardEditorProps["saveDelta"]>(
    (bucketId, parts) => {
      if (generation === undefined)
        return Promise.reject(new Error("WHITEBOARD_NOT_READY"));
      // Pending saves keep their page even after the live presentation switches.
      if (pageId)
        return applyNotebookDelta({ pageId, generation, bucketId, parts });
      return applyDelta({
        roomName,
        expectedLiveRoomName: room.name,
        generation,
        bucketId,
        parts,
      });
    },
    [applyDelta, applyNotebookDelta, roomName, room, generation, pageId],
  );
  const uploadImage = useCallback<WhiteboardEditorProps["uploadImage"]>(
    async (file: BinaryFileData) => {
      const token = await getUploadToken?.();
      if (!token) throw new Error("PERMISSION_DENIED");
      const { blob, mimeType } = await compressWhiteboardImage(
        file.dataURL,
        file.mimeType,
      );
      return uploadWhiteboardImage(blob, mimeType, token, {
        ...(pageId
          ? { pageId }
          : { roomName, expectedLiveRoomName: room.name }),
        fileId: file.id,
        created: String(file.created),
      });
    },
    [getUploadToken, roomName, room, pageId],
  );
  const handleApiReady = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      setPresentationApi(api);
      onApiReady?.(api);
    },
    [setPresentationApi, onApiReady],
  );
  const diagnostics = useMemo(
    () => ({ live_room: room.name, connection_state: room.state }),
    [room.name, room.state],
  );
  return (
    <WhiteboardEditor
      draftKey={pageId ? `notebook:${pageId}` : roomName}
      scene={scene as WhiteboardEditorProps["scene"]}
      remoteElements={realtime.elements as ExcalidrawElements | undefined}
      fromLegacy={manifest?.fromLegacy}
      legacyOrder={manifest?.legacyOrder}
      recoveryError={error}
      saveDelta={saveDelta}
      uploadImage={uploadImage}
      realtime={realtime}
      onViewportChange={presentation.onViewportChange}
      onPointerUpdate={presentation.onPointerUpdate}
      onApiReady={handleApiReady}
      onReady={onReady}
      onSaved={pageId && !isReadonly ? preview.saved : undefined}
      onClose={pageId && !isReadonly ? preview.closed : undefined}
      renderTopRightUI={renderTopRightUI}
      isReadonly={isReadonly}
      presentationMode={presentationMode}
      diagnostics={diagnostics}
      messages={messages}
    />
  );
}

/** Live-only presentation; the common editor never needs a RoomContext. */
function useWhiteboardPresentation(
  room: Room,
  isReadonly: boolean,
  followViewport: boolean,
  presentationMode: boolean,
  sourceId?: string,
) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const collaboratorsRef = useRef<Map<SocketId, Collaborator>>(new Map());
  const lastPointerSentRef = useRef(0);
  const lastViewportRef = useRef<{
    scrollX: number;
    scrollY: number;
    zoom: number;
  } | null>(null);
  const lastViewportSentRef = useRef(0);
  const followViewportRef = useRef(followViewport);
  useEffect(() => {
    followViewportRef.current = followViewport;
  }, [followViewport]);
  useEffect(() => {
    let active = true;
    collaboratorsRef.current.clear();

    const handleDataReceived = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
    ) => {
      try {
        const msg = JSON.parse(
          new TextDecoder().decode(payload),
        ) as WhiteboardMessage;
        if (!isWhiteboardBroadcaster(participant)) return;
        if (msg.sourceId !== sourceId) return;

        if (msg.type === "WHITEBOARD_VIEWPORT" && followViewportRef.current) {
          if (!active) return;
          if (apiRef.current) {
            const api = apiRef.current;
            setTimeout(() => {
              if (!active || apiRef.current !== api) return;
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
      active = false;
      room.off("dataReceived", handleDataReceived);
    };
  }, [presentationMode, room, sourceId]);

  const onViewportChange = useCallback(
    (appState: AppState) => {
      if (isReadonly) return;
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
          ...(sourceId ? { sourceId } : {}),
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
    [room, isReadonly, sourceId],
  );
  const onPointerUpdate = useCallback(
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
        ...(sourceId ? { sourceId } : {}),
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
    [room, isReadonly, sourceId],
  );

  const onApiReady = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
  }, []);
  return { onApiReady, onViewportChange, onPointerUpdate };
}
