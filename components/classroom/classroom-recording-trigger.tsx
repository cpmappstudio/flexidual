"use client";

import { useConnectionState } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { useEffect, useRef } from "react";

interface ClassroomRecordingTriggerProps {
  isSceneReady: boolean;
}

export function ClassroomRecordingTrigger({
  isSceneReady,
}: ClassroomRecordingTriggerProps) {
  const connectionState = useConnectionState();
  const startedRef = useRef(false);

  useEffect(() => {
    if (
      startedRef.current ||
      connectionState !== ConnectionState.Connected ||
      !isSceneReady
    ) {
      return;
    }

    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        console.log("START_RECORDING");
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [connectionState, isSceneReady]);

  return null;
}
