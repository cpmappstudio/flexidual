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
}

export function SharedWhiteboard({ isReadonly = false }: SharedWhiteboardProps) {
  const room = useRoomContext();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiRef = useRef<any>(null);
  const suppressRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // RECEIVER: apply remote element array into the local scene
  useEffect(() => {
    if (!room) return;

    const handleDataReceived = (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.type === "WHITEBOARD_SYNC" && apiRef.current) {
          suppressRef.current = true;
          apiRef.current.updateScene({ elements: msg.elements });
          // One tick so the resulting onChange fires suppressed, then re-enable
          setTimeout(() => { suppressRef.current = false; }, 0);
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
        excalidrawAPI={(api: any) => { apiRef.current = api; }}
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
