"use client";

import { useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { ConnectionState, type Room } from "livekit-client";
import { toast } from "sonner";
import { reportRuntimeError } from "@/lib/error-tracking";
import { normalizeClassroomMediaError } from "./use-classroom-media-errors";

export function useClassroomScreenShare(room: Room) {
  const t = useTranslations();
  const pending = useRef(false);
  const stopRequested = useRef(false);

  return useCallback(
    async (enabled: boolean) => {
      if (enabled && pending.current) return false;
      if (enabled && room.state !== ConnectionState.Connected) {
        toast.error(t("classroom.screenShareConnectionError"));
        return false;
      }

      if (enabled) pending.current = true;
      stopRequested.current = !enabled;
      let withoutAudio = false;
      try {
        try {
          await room.localParticipant.setScreenShareEnabled(enabled, {
            audio: true,
          });
        } catch (error) {
          if (enabled && stopRequested.current) return false;
          const normalized = normalizeClassroomMediaError(
            error,
            "Screen sharing failed",
          );
          // Only capture-compatibility errors can benefit from dropping audio.
          const captureCompatibilityError =
            ["NotSupportedError", "OverconstrainedError"].includes(
              normalized.name,
            ) ||
            (normalized.name === "TypeError" &&
              /getDisplayMedia|audio|constraint/i.test(normalized.message));
          if (!enabled || !captureCompatibilityError) throw error;
          await room.localParticipant.setScreenShareEnabled(true, {
            audio: false,
          });
          withoutAudio = true;
        }
        if (enabled && stopRequested.current) {
          await room.localParticipant.setScreenShareEnabled(false);
          return false;
        }
        if (withoutAudio)
          toast.warning(t("classroom.screenShareAudioNotSupported"));
        return true;
      } catch (error) {
        const normalized = normalizeClassroomMediaError(
          error,
          "Screen sharing failed",
        );
        if (enabled && normalized.name === "NotAllowedError") return false;

        const connectionError =
          room.state !== ConnectionState.Connected ||
          [
            "ConnectionError",
            "NegotiationError",
            "UnexpectedConnectionState",
          ].includes(normalized.name);
        reportRuntimeError(normalized, {
          operation: `classroom.screenShare.${enabled ? "start" : "stop"}`,
          live_room: room.name,
          connection_state: room.state,
        });
        toast.error(
          t(
            connectionError
              ? "classroom.screenShareConnectionError"
              : "classroom.screenShareFailed",
          ),
        );
        return false;
      } finally {
        if (enabled) pending.current = false;
      }
    },
    [room, t],
  );
}
