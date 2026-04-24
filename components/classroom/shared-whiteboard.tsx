"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ComponentType } from "react";
import dynamic from "next/dynamic";
import { useRoomContext } from "@livekit/components-react";
import "@excalidraw/excalidraw/index.css";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawProps = Record<string, any>;

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

interface SharedWhiteboardProps {
  isReadonly?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onApiReady?: (api: any) => void;
}

export function SharedWhiteboard({ isReadonly = false, onApiReady }: SharedWhiteboardProps) {
  const room = useRoomContext();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiRef = useRef<any>(null);
  const suppressRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Buffer elements that arrive before Excalidraw has finished loading
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingElementsRef = useRef<any[] | null>(null);

  // RECEIVER: apply remote element array into the local scene
  useEffect(() => {
    if (!room) return;

    const handleDataReceived = (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.type === "WHITEBOARD_SYNC") {
          if (apiRef.current) {
            suppressRef.current = true;
            apiRef.current.updateScene({ elements: msg.elements });
            setTimeout(() => { suppressRef.current = false; }, 0);
          } else {
            // Excalidraw still loading — keep the latest snapshot so we can
            // apply it as soon as the API becomes available
            pendingElementsRef.current = msg.elements;
          }
        }
      } catch { /* ignore non-whiteboard packets */ }
    };

    room.on("dataReceived", handleDataReceived);
    return () => { room.off("dataReceived", handleDataReceived); };
  }, [room]);

  // BROADCASTER: debounced send of full element array on every local change
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChange = useCallback((elements: any) => {
    if (!room || isReadonly || suppressRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const payload = JSON.stringify({ type: "WHITEBOARD_SYNC", elements });
      room.localParticipant.publishData(new TextEncoder().encode(payload), { reliable: true });
      timerRef.current = null;
    }, 80);
  }, [room, isReadonly]);

  return (
    <div className="w-full h-full relative bg-white rounded-lg overflow-hidden border border-border touch-none overscroll-none">
      <Excalidraw
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        excalidrawAPI={(api: any) => {
          apiRef.current = api;
          onApiReady?.(api);
          // Apply any elements that arrived before the API was ready
          if (pendingElementsRef.current) {
            suppressRef.current = true;
            api.updateScene({ elements: pendingElementsRef.current });
            pendingElementsRef.current = null;
            setTimeout(() => { suppressRef.current = false; }, 0);
          }
        }}
        onChange={handleChange}
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
