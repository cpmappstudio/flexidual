"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClassroomPanelTab } from "./classroom-participants-panel";

export type ClassroomViewMode = "presenter" | "mosaic";

export function useClassroomViewMode(contentActive = false) {
  const [viewMode, setViewMode] = useState<ClassroomViewMode>("presenter");
  const [panelTab, setPanelTab] = useState<ClassroomPanelTab>("participants");
  const [highlightedParticipantId, setHighlightedParticipantId] =
    useState<string>();
  const shouldRestoreParticipantsRef = useRef(false);
  const wasContentActiveRef = useRef(contentActive);

  useEffect(() => {
    if (!highlightedParticipantId) return;
    const timeout = setTimeout(
      () => setHighlightedParticipantId(undefined),
      1800,
    );
    return () => clearTimeout(timeout);
  }, [highlightedParticipantId]);

  const changeViewMode = useCallback(
    (mode: ClassroomViewMode) => {
      if (mode === viewMode) return;

      if (mode === "mosaic") {
        shouldRestoreParticipantsRef.current = panelTab === "participants";
        if (shouldRestoreParticipantsRef.current) setPanelTab("chat");
      } else {
        if (shouldRestoreParticipantsRef.current) setPanelTab("participants");
        shouldRestoreParticipantsRef.current = false;
        setHighlightedParticipantId(undefined);
      }

      setViewMode(mode);
    },
    [panelTab, viewMode],
  );

  useEffect(() => {
    const contentStarted = contentActive && !wasContentActiveRef.current;
    wasContentActiveRef.current = contentActive;
    if (contentStarted && viewMode === "mosaic") {
      changeViewMode("presenter");
    }
  }, [changeViewMode, contentActive, viewMode]);

  const changePanelTab = (tab: ClassroomPanelTab) => {
    shouldRestoreParticipantsRef.current = false;
    setPanelTab(tab);
  };

  return {
    viewMode,
    changeViewMode,
    panelTab,
    changePanelTab,
    highlightedParticipantId,
    selectMosaicParticipant: setHighlightedParticipantId,
  };
}
