"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRoomContext, useLocalParticipant } from "@livekit/components-react";
import { ConnectionState, RoomEvent } from "livekit-client";
import type { RemoteParticipant } from "livekit-client";
import { LogOut, MonitorUp, StopCircle } from "lucide-react";
import { SharedWhiteboard } from "./shared-whiteboard";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { FullscreenButton } from "./fullscreen-button";

/** localStorage key that survives companion page refreshes while the session is live. */
const WB_PRESENTING_KEY = "wb_presenting_";

export function CompanionClassroomUI({ roomName, isFullscreen = false, onToggleFullscreen }: { roomName: string; isFullscreen?: boolean; onToggleFullscreen?: () => void }) {
  const t = useTranslations();
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  // Restore presenting state from localStorage so a phone refresh doesn't reset the UI
  const [isBroadcasting, setIsBroadcasting] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(`${WB_PRESENTING_KEY}${roomName}`) === "true";
  });
  const [isPortrait, setIsPortrait] = useState(false);
  const whiteboardApiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  // Ref so ParticipantConnected listener always reads the current broadcasting state
  const isBroadcastingRef = useRef(false);
  useEffect(() => { isBroadcastingRef.current = isBroadcasting; }, [isBroadcasting]);

  // Persist presenting state — lets the button show the correct label after a refresh
  useEffect(() => {
    localStorage.setItem(`${WB_PRESENTING_KEY}${roomName}`, isBroadcasting ? "true" : "false");
  }, [isBroadcasting, roomName]);

  // Guard: fires only once per mount to avoid double re-announce
  const hasRestoredRef = useRef(false);

  // Populated by SharedWhiteboard — call to re-broadcast images or clean up Convex storage
  const broadcastRef = useRef<((destinationIdentities?: string[]) => Promise<void>) | null>(null);
  const cleanupRef = useRef<(() => Promise<void>) | null>(null);

  /**
   * After a companion page refresh where the teacher was already presenting, re-announce
   * WHITEBOARD_STATE + scene + files to all current participants.
   * Guards against running before the room is connected or before the Excalidraw API is ready.
   * Safe to call multiple times — hasRestoredRef ensures it only executes once.
   */
  const restoreBroadcastState = useCallback(async () => {
    if (!isBroadcastingRef.current) return;
    if (hasRestoredRef.current) return;
    if (room.state !== ConnectionState.Connected) return;
    if (!whiteboardApiRef.current || !broadcastRef.current) return;

    // Mark done optimistically — reset on failure so a Reconnected event can retry
    hasRestoredRef.current = true;
    const encoder = new TextEncoder();
    try {
      await localParticipant.publishData(
        encoder.encode(JSON.stringify({
          type: "WHITEBOARD_STATE",
          active: true,
          companionId: localParticipant.identity,
        })),
        { reliable: true },
      );
      const elements = whiteboardApiRef.current.getSceneElements();
      await localParticipant.publishData(
        encoder.encode(JSON.stringify({ type: "WHITEBOARD_SYNC", elements })),
        { reliable: true },
      );
      await broadcastRef.current();
    } catch (err) {
      // DataChannel was not ready — reset so the Reconnected event can trigger a retry
      hasRestoredRef.current = false;
      console.error("[Companion] Failed to restore broadcast state after refresh:", err);
    }
  }, [room, localParticipant]);

  // Run when the LiveKit room connects or reconnects
  useEffect(() => {
    if (!room) return;
    const onReconnected = () => {
      // Allow restoreBroadcastState to run again after a reconnect cycle
      hasRestoredRef.current = false;
      void restoreBroadcastState();
    };
    // Try immediately in case the room was already connected before this effect ran
    void restoreBroadcastState();
    room.on(RoomEvent.Connected, restoreBroadcastState);
    room.on(RoomEvent.Reconnected, onReconnected);
    return () => {
      room.off(RoomEvent.Connected, restoreBroadcastState);
      room.off(RoomEvent.Reconnected, onReconnected);
    };
  }, [room, restoreBroadcastState]);

  // screen.height/width is stable across virtual keyboard open/close
  useEffect(() => {
    const check = () => setIsPortrait(window.screen.height > window.screen.width);
    check();
    window.addEventListener("orientationchange", check);
    return () => window.removeEventListener("orientationchange", check);
  }, []);

  // Issue 3: Send current whiteboard state to participants who join late
  useEffect(() => {
    if (!room) return;
    const handleParticipantConnected = async (participant: RemoteParticipant) => {
      if (!isBroadcastingRef.current) return;
      if (room.state !== ConnectionState.Connected) return;
      const encoder = new TextEncoder();
      try {
        await localParticipant.publishData(
          encoder.encode(JSON.stringify({
            type: "WHITEBOARD_STATE",
            active: true,
            companionId: localParticipant.identity,
          })),
          { reliable: true, destinationIdentities: [participant.identity] },
        );
        if (whiteboardApiRef.current) {
          const elements = whiteboardApiRef.current.getSceneElements();
          await localParticipant.publishData(
            encoder.encode(JSON.stringify({ type: "WHITEBOARD_SYNC", elements })),
            { reliable: true, destinationIdentities: [participant.identity] },
          );
        }
        // Re-broadcast all image file refs to the late joiner
        await broadcastRef.current?.([participant.identity]);
      } catch (err) {
        console.error("[Companion] Failed to sync late joiner:", err);
      }
    };
    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
    return () => { room.off(RoomEvent.ParticipantConnected, handleParticipantConnected); };
  }, [room, localParticipant]);

  // Issue 2: Guard against publishing when the WebRTC connection isn't ready
  const toggleWhiteboard = async () => {
    if (room.state !== ConnectionState.Connected) {
      toast.error(t("classroom.connectionNotReady") || "Connection not ready — please try again.");
      return;
    }
    const newState = !isBroadcasting;
    setIsBroadcasting(newState);
    const encoder = new TextEncoder();
    try {
      await localParticipant.publishData(
        encoder.encode(JSON.stringify({
          type: "WHITEBOARD_STATE",
          active: newState,
          companionId: localParticipant.identity,
        })),
        { reliable: true },
      );
      // When activating, immediately broadcast the full current scene so students
      // who are already in the room see existing content without drawing anything new
      if (newState && whiteboardApiRef.current) {
        const elements = whiteboardApiRef.current.getSceneElements();
        await localParticipant.publishData(
          encoder.encode(JSON.stringify({ type: "WHITEBOARD_SYNC", elements })),
          { reliable: true },
        );
        // Re-broadcast all image file refs to the whole room
        // (covers refresh recovery — cached CDN URLs, no re-upload)
        await broadcastRef.current?.();
      }
      if (newState) {
        toast.success(t("classroom.whiteboardStarted") || "Whiteboard is now visible");
      }
    } catch (err) {
      console.error("[Companion] toggleWhiteboard failed:", err);
      setIsBroadcasting(!newState); // revert optimistic update
      toast.error(t("classroom.broadcastFailed") || "Broadcast failed — please try again.");
    }
  };

  // Issue 1: Don't call router.back() — LiveKitRoom.onDisconnected in flexi-classroom.tsx
  // already navigates to the dashboard for non-student views.
  const handleLeave = async () => {
    if (isBroadcasting && room.state === ConnectionState.Connected) {
      try {
        await localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify({ type: "WHITEBOARD_STATE", active: false })),
          { reliable: true },
        );
      } catch { /* ignore — we're leaving anyway */ }
    }
    // Clear the persisted presenting flag so a future reconnect starts clean
    localStorage.removeItem(`${WB_PRESENTING_KEY}${roomName}`);
    // Delete all Convex storage objects uploaded this session and clear localStorage
    await cleanupRef.current?.();
    await room.disconnect();
    // Navigation is handled by LiveKitRoom.onDisconnected → flexi-classroom.handleDisconnect
  };

  return (
    <div className="flex flex-col w-full h-full bg-background p-2 touch-none overscroll-none">
      <div className={`flex items-center bg-card rounded-xl border border-border mb-2 ${isPortrait ? "justify-center gap-2 p-2" : "justify-between p-3"}`}>
        {!isPortrait && (
          <div className="bg-primary/10 text-primary px-3 py-1 rounded-md text-sm font-bold uppercase tracking-wider">
            {t("classroom.companionDeviceFor", { room: roomName }) || `Companion — "${roomName}"`}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleWhiteboard}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all ${
              isBroadcasting ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" : "bg-primary hover:bg-primary/90 text-primary-foreground"
            }`}
          >
            {isBroadcasting ? <StopCircle className="w-4 h-4" /> : <MonitorUp className="w-4 h-4" />}
            {isBroadcasting ? (t("classroom.stopPresenting") || "Stop") : (t("classroom.presentBoard") || "Present")}
          </button>

          {onToggleFullscreen && (
            <FullscreenButton isFullscreen={isFullscreen} onToggle={onToggleFullscreen} />
          )}

          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleLeave}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-muted hover:bg-muted/80 text-destructive transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 rounded-xl overflow-hidden shadow-2xl ring-1 ring-border touch-none overscroll-none">
        <SharedWhiteboard
          roomName={roomName}
          isReadonly={false}
          broadcastRef={broadcastRef}
          cleanupRef={cleanupRef}
          onApiReady={(api) => {
            whiteboardApiRef.current = api;
            // Excalidraw API + broadcastRef are now both ready; attempt state restore
            void restoreBroadcastState();
          }}
        />
      </div>
    </div>
  );
}
