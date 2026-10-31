"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "convex/react";
import { ConnectionState, RoomEvent, type Room } from "livekit-client";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  mergeWhiteboardElements,
  type WhiteboardElement,
} from "@/lib/whiteboard-elements";
import { createWhiteboardSync } from "@/lib/whiteboard-sync";
import {
  decodeWhiteboardLiveChanges,
  encodeWhiteboardLiveChanges,
  MAX_WHITEBOARD_LIVE_BYTES,
  pendingWhiteboardLiveChanges,
  WHITEBOARD_SCENE_TOPIC,
  type WhiteboardLiveScope,
} from "@/lib/whiteboard-realtime";

// Metadata is issued by getToken; clients cannot update their own metadata.
function participantUserId(
  metadata?: string,
  writerOnly = false,
): Id<"users"> | undefined {
  try {
    const value = JSON.parse(metadata ?? "null");
    return (!writerOnly || value?.roomAdmin === true) &&
      typeof value?.convexUserId === "string"
      ? (value.convexUserId as Id<"users">)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Delivery is ephemeral. Only the existing Convex sync may acknowledge a save. */
export function useWhiteboardRealtime<T extends WhiteboardElement>({
  room,
  roomName,
  sourceId,
  generation,
  durable,
  isReadonly,
  recordingToken,
}: {
  room: Room;
  roomName: string;
  sourceId?: string;
  generation?: number;
  durable?: readonly T[];
  isReadonly: boolean;
  recordingToken?: string;
}) {
  const [participants, setParticipants] = useState(() => [
    room.localParticipant,
    ...room.remoteParticipants.values(),
  ]);
  useEffect(() => {
    const refresh = () =>
      setParticipants([
        room.localParticipant,
        ...room.remoteParticipants.values(),
      ]);
    refresh();
    const events = [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.ParticipantMetadataChanged,
      RoomEvent.Reconnected,
      RoomEvent.ConnectionStateChanged,
    ] as const;
    for (const event of events) room.on(event, refresh);
    return () => {
      for (const event of events) room.off(event, refresh);
    };
  }, [room]);

  const queries = useMemo(
    () =>
      Object.fromEntries(
        participants.flatMap((participant) => {
          const id = participantUserId(participant.metadata, true);
          return id
            ? [
                [
                  participant.identity,
                  {
                    query: api.whiteboardSessions.getRealtimeWriter,
                    args: {
                      roomName,
                      expectedLiveRoomName: room.name,
                      writerId: id,
                      ...(recordingToken ? { recordingToken } : {}),
                    },
                  },
                ],
              ]
            : [];
        }),
      ),
    [participants, room.name, roomName, recordingToken],
  );
  const permissions = useQueries(queries);
  const audienceQueries = useMemo((): Parameters<typeof useQueries>[0] => {
    if (isReadonly || !sourceId || generation === undefined) return {};
    const recipients = participants.flatMap((participant) => {
      const userId = participantUserId(participant.metadata);
      return userId && participant.identity !== room.localParticipant.identity
        ? [{ identity: participant.identity, userId }]
        : [];
    });
    const batches = Math.max(1, Math.ceil(recipients.length / 128));
    return Object.fromEntries(
      Array.from({ length: batches }, (_, index) => [
        index === 0 ? "audience" : `audience-${index}`,
        {
          query: api.whiteboardSessions.getRealtimeAudience,
          args: {
            roomName,
            expectedLiveRoomName: room.name,
            participants: recipients.slice(index * 128, (index + 1) * 128),
          },
        },
      ]),
    );
  }, [isReadonly, sourceId, generation, roomName, room, participants]);
  const audienceResults = useQueries(audienceQueries);
  const audience =
    Object.keys(audienceQueries).every((key) =>
      Array.isArray(audienceResults[key]),
    ) && Object.keys(audienceQueries).length
      ? Object.keys(audienceQueries).flatMap(
          (key) => audienceResults[key] as string[],
        )
      : undefined;
  const canBroadcast =
    Boolean(sourceId) &&
    generation !== undefined &&
    !isReadonly &&
    audience !== undefined &&
    room.state === ConnectionState.Connected &&
    permissions[room.localParticipant.identity] === true;
  const scope = useMemo<WhiteboardLiveScope | undefined>(
    () =>
      sourceId && generation !== undefined
        ? { roomName, liveRoomName: room.name, generation, sourceId }
        : undefined,
    [roomName, room.name, sourceId, generation],
  );
  const [previews, setPreviews] = useState<{
    scope: typeof scope;
    writers: Map<string, T[]>;
  }>({ scope, writers: new Map() });
  const current = useRef({
    scope,
    permissions,
    durable,
    canBroadcast,
    audience,
  });
  current.current = { scope, permissions, durable, canBroadcast, audience };

  useEffect(() => {
    if (!scope) return;
    const abort = new AbortController();
    const reading = new Set<string>();
    room.registerByteStreamHandler(WHITEBOARD_SCENE_TOPIC, (reader, sender) => {
      // shortcut: overlapping streams recover via Convex; bound tablet memory to one per writer.
      if (
        current.current.permissions[sender.identity] !== true ||
        reading.has(sender.identity) ||
        (reader.info.size ?? Infinity) > MAX_WHITEBOARD_LIVE_BYTES
      ) {
        // Closing the public reader also stops SDK buffering (upstream #2167/#2168).
        void reader.readAll({ signal: AbortSignal.abort() }).catch(() => {});
        return;
      }
      reading.add(sender.identity);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const cancel = () => controller.abort();
      abort.signal.addEventListener("abort", cancel, { once: true });
      void (async () => {
        try {
          const chunks: Uint8Array[] = [];
          let size = 0;
          reader.signal = controller.signal;
          for await (const chunk of reader) {
            size += chunk.length;
            if (size > MAX_WHITEBOARD_LIVE_BYTES)
              throw new Error("WHITEBOARD_LIVE_TOO_LARGE");
            chunks.push(chunk);
          }
          if (
            abort.signal.aborted ||
            current.current.scope !== scope ||
            current.current.permissions[sender.identity] !== true
          )
            return;
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
          }
          const elements = decodeWhiteboardLiveChanges(bytes, scope) as T[];
          setPreviews((previous) => {
            const writers = new Map(
              previous.scope === scope ? previous.writers : [],
            );
            writers.set(
              sender.identity,
              pendingWhiteboardLiveChanges(
                mergeWhiteboardElements(
                  writers.get(sender.identity) ?? [],
                  elements,
                ),
                current.current.durable ?? [],
              ),
            );
            return { scope, writers };
          });
        } catch {
          // A missed preview recovers through the durable subscription, never a false save.
        } finally {
          clearTimeout(timeout);
          abort.signal.removeEventListener("abort", cancel);
          reading.delete(sender.identity);
        }
      })();
    });
    return () => {
      abort.abort();
      room.unregisterByteStreamHandler(WHITEBOARD_SCENE_TOPIC);
    };
  }, [room, scope]);

  const transport = useMemo(
    () =>
      createWhiteboardSync<T>({
        interval: 33,
        send: async (elements) => {
          if (
            !scope ||
            current.current.scope !== scope ||
            !current.current.canBroadcast
          )
            throw new Error("PERMISSION_DENIED");
          for (const bytes of encodeWhiteboardLiveChanges(scope, elements)) {
            const destinationIdentities = current.current.audience;
            // LiveKit treats an empty destination list as a room-wide broadcast.
            if (!destinationIdentities?.length) return;
            if (
              !current.current.canBroadcast ||
              current.current.scope !== scope
            )
              throw new Error("PERMISSION_DENIED");
            await room.localParticipant.sendBytes(bytes, {
              topic: WHITEBOARD_SCENE_TOPIC,
              mimeType: "application/json",
              destinationIdentities,
            });
          }
        },
        saved: () => {},
        error: () => {}, // Durable sync owns retries, recovery notices and saved state.
      }),
    [room, scope],
  );
  useEffect(() => {
    transport.resume();
    return () => transport.dispose();
  }, [transport]);
  useEffect(() => {
    if (durable) transport.seed(durable);
  }, [transport, durable]);

  const authorized = JSON.stringify(
    Object.keys(queries)
      .filter((identity) => permissions[identity] === true)
      .sort(),
  );
  // A newly occupied bucket can be loading while live edits keep arriving.
  // This base is only for rendering, never a durable acknowledgement.
  const complete = useRef<{ scope: typeof scope; elements?: readonly T[] }>({
    scope,
  });
  if (complete.current.scope !== scope) complete.current = { scope };
  if (durable !== undefined) complete.current = { scope, elements: durable };
  const base =
    durable ?? (authorized !== "[]" ? complete.current.elements : undefined);
  useEffect(() => {
    setPreviews((previous) => {
      if (previous.scope !== scope) return previous;
      const writers = new Map<string, T[]>();
      let changed = false;
      const allowed = new Set<string>(JSON.parse(authorized));
      for (const [identity, preview] of previous.writers) {
        const pending = allowed.has(identity)
          ? pendingWhiteboardLiveChanges(preview, durable ?? [])
          : [];
        if (pending.length) writers.set(identity, pending);
        if (pending.length !== preview.length) changed = true;
      }
      return changed ? { scope, writers } : previous;
    });
  }, [scope, durable, authorized]);
  const elements = useMemo(() => {
    if (base === undefined || previews.scope !== scope) return base;
    const allowed = new Set<string>(JSON.parse(authorized));
    let merged = [...base];
    for (const [identity, preview] of previews.writers)
      if (allowed.has(identity))
        merged = mergeWhiteboardElements(
          merged,
          pendingWhiteboardLiveChanges(preview, base),
        );
    return merged;
  }, [base, previews, scope, authorized]);

  return { elements, canBroadcast, transport };
}
