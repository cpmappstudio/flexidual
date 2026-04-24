"use client";

import { useEffect, useState } from "react";
import { Tldraw, createTLStore, defaultShapeUtils, TLRecord } from "tldraw";
import "tldraw/tldraw.css";
import { useRoomContext } from "@livekit/components-react";

interface SharedWhiteboardProps {
  isReadonly?: boolean;
}

export function SharedWhiteboard({ isReadonly = false }: SharedWhiteboardProps) {
  const room = useRoomContext();
  const [store] = useState(() => createTLStore({ shapeUtils: defaultShapeUtils }));

  useEffect(() => {
    if (!room) return;

    // BROADCASTER: listen to local user changes and publish via data channel
    const unlisten = store.listen(
      (update) => {
        if (update.source !== "user" || isReadonly) return;
        const payload = JSON.stringify({ type: "WHITEBOARD_SYNC", changes: update.changes });
        room.localParticipant.publishData(new TextEncoder().encode(payload), { reliable: true });
      },
      { source: "user", scope: "document" }
    );

    // RECEIVER: apply remote changes into local store
    const handleDataReceived = (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.type === "WHITEBOARD_SYNC") {
          store.mergeRemoteChanges(() => {
            const { added, updated, removed } = msg.changes as {
              added?: Record<string, TLRecord>;
              updated?: Record<string, [TLRecord, TLRecord]>;
              removed?: Record<string, TLRecord>;
            };
            if (added) store.put(Object.values(added));
            if (updated) store.put(Object.values(updated).map((u) => u[1]));
            // store.remove requires an array of IDs, not objects
            if (removed) store.remove(Object.values(removed).map((r) => r.id) as Parameters<typeof store.remove>[0]);
          });
        }
      } catch (e) {
        console.error("Failed to parse whiteboard sync data", e);
      }
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
          if (isReadonly) {
            editor.updateInstanceState({ isReadonly: true });
          } else {
            editor.updateInstanceState({ isFocused: true });
          }
        }}
      />
    </div>
  );
}

