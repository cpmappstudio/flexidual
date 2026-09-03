"use client";

import type { LocalParticipant } from "livekit-client";
import { useEffect, useRef } from "react";
import { normalizeClassroomMediaError } from "./use-classroom-media-errors";

export function useClassroomMediaInitialization(
  localParticipant: LocalParticipant | undefined,
  shouldInitialize: boolean,
  onError?: (error: Error) => void,
) {
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!localParticipant || !shouldInitialize || hasInitializedRef.current) {
      return;
    }

    hasInitializedRef.current = true;

    const initializeMedia = async () => {
      try {
        if (!localParticipant.isMicrophoneEnabled) {
          await localParticipant.setMicrophoneEnabled(true);
        }
      } catch (error) {
        onError?.(normalizeClassroomMediaError(error, "Microphone failed"));
      }

      try {
        if (!localParticipant.isCameraEnabled) {
          await localParticipant.setCameraEnabled(true);
        }
      } catch (error) {
        onError?.(normalizeClassroomMediaError(error, "Camera failed"));
      }
    };

    void initializeMedia();
  }, [localParticipant, onError, shouldInitialize]);
}
