"use client";

import { useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { MediaDeviceFailure, Room, RoomEvent } from "livekit-client";
import { toast } from "sonner";

export function normalizeClassroomMediaError(
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof Error) return error;

  const normalized = new Error(
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message
      : fallbackMessage,
  );
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
  ) {
    normalized.name = error.name;
  }
  return normalized;
}

export function useClassroomMediaErrorHandler() {
  const t = useTranslations();

  return useCallback(
    (error: Error) => {
      const failure = MediaDeviceFailure.getFailure(error);
      const message =
        failure === MediaDeviceFailure.PermissionDenied
          ? t("classroom.mediaPermissionDenied")
          : failure === MediaDeviceFailure.NotFound
            ? t("classroom.mediaDeviceNotFound")
            : failure === MediaDeviceFailure.DeviceInUse
              ? t("classroom.mediaDeviceInUse")
              : t("classroom.mediaDeviceError");

      toast.error(message, {
        id: `classroom-media-${failure ?? MediaDeviceFailure.Other}`,
      });
      console.error("Classroom media device error:", error);
    },
    [t],
  );
}

export function useClassroomMediaDeviceErrors(room: Room) {
  const handleMediaError = useClassroomMediaErrorHandler();

  useEffect(() => {
    room.on(RoomEvent.MediaDevicesError, handleMediaError);
    return () => {
      room.off(RoomEvent.MediaDevicesError, handleMediaError);
    };
  }, [handleMediaError, room]);

  return handleMediaError;
}
