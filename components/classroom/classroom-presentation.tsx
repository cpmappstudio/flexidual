"use client";

import { createContext, useContext, useEffect } from "react";

export interface ClassroomPersistence {
  canPersist: boolean;
  needsFullView: boolean;
}

export interface ClassroomPresentation {
  mode: "full" | "compact";
  ownerWindow?: Window;
  classroomPath: string;
  uiPreviewEnabled: boolean;
  enabled: boolean;
  external: boolean;
  nativeVideoActive: boolean;
  opening: boolean;
  error: boolean;
  floatingKind: "document" | "video" | "window" | "internal";
  openFloating: () => void;
  openWindow: () => void;
  returnToClassroom: () => void;
  setVideoElement: (video: HTMLVideoElement | null) => void;
  reportPersistence: (state: ClassroomPersistence) => void;
  leaveSession: () => void;
}

export const ClassroomPresentationContext =
  createContext<ClassroomPresentation | null>(null);

export function useClassroomPresentation() {
  return useContext(ClassroomPresentationContext);
}

export function useRestoreClassroomForDialog(open: boolean) {
  const presentation = useClassroomPresentation();
  const shouldRestore = Boolean(
    open &&
      presentation &&
      (presentation.mode === "compact" ||
        presentation.external ||
        presentation.nativeVideoActive),
  );
  const restore = presentation?.returnToClassroom;

  useEffect(() => {
    if (shouldRestore) restore?.();
  }, [shouldRestore, restore]);
}
