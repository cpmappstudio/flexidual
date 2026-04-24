"use client";

import { useEffect, useRef, useState } from "react";
import { Tldraw, createTLStore, defaultShapeUtils } from "tldraw";
import { useRoomContext } from "@livekit/components-react";
import "tldraw/tldraw.css";

export type TLEditorInstance = {
  getContainer: () => HTMLElement;
  updateInstanceState: (state: Record<string, unknown>) => void;
};

interface SharedWhiteboardProps {
  isReadonly?: boolean;
  onEditorReady?: (editor: TLEditorInstance) => void;
}

export function SharedWhiteboard({ isReadonly = false, onEditorReady }: SharedWhiteboardProps) {
  const room = useRoomContext();
  const [store] = useState(() => createTLStore({ shapeUtils: defaultShapeUtils }));
  const focusCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => focusCleanupRef.current?.();
  }, []);

  useEffect(() => {
    if (!room) return;

    const unlisten = store.listen(
      (update) => {
        if (update.source !== "user" || isReadonly) return;
        const payload = JSON.stringify({ type: "WHITEBOARD_SYNC", changes: update.changes });
        room.localParticipant.publishData(new TextEncoder().encode(payload), { reliable: true });
      },
      { source: "user", scope: "document" }
    );

    const handleDataReceived = (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.type === "WHITEBOARD_SYNC") {
          store.mergeRemoteChanges(() => {
            const { added, updated, removed } = msg.changes;
            if (added) store.put(Object.values(added) as Parameters<typeof store.put>[0]);
            if (updated) store.put(Object.values(updated).map((u: unknown) => (u as [unknown, unknown])[1]) as Parameters<typeof store.put>[0]);
            if (removed) store.remove(Object.values(removed).map((r: unknown) => (r as { id: string }).id) as Parameters<typeof store.remove>[0]);
          });
        }
      } catch { /* ignore non-whiteboard packets */ }
    };

    room.on("dataReceived", handleDataReceived);
    return () => {
      unlisten();
      room.off("dataReceived", handleDataReceived);
    };
  }, [room, store, isReadonly]);

  return (
    <div className="w-full h-full relative bg-white rounded-lg overflow-hidden border border-border touch-none overscroll-none">
      <Tldraw
        store={store}
        onMount={(editor) => {
          onEditorReady?.(editor as unknown as TLEditorInstance);

          if (isReadonly) {
            editor.updateInstanceState({ isReadonly: true });
            return;
          }

          const container = editor.getContainer();
          container.focus();

          const handleFocusOut = (e: FocusEvent) => {
            const relatedTarget = e.relatedTarget as Node | null;
            if (!container.contains(relatedTarget)) {
              requestAnimationFrame(() => container.focus());
            }
          };
          container.addEventListener("focusout", handleFocusOut);
          focusCleanupRef.current = () =>
            container.removeEventListener("focusout", handleFocusOut);
        }}
      />
    </div>
  );
}
