"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function usePhoneLandscapeStageControls() {
  const [isPhoneLandscape, setIsPhoneLandscape] = useState(false);
  const [stageControlsVisible, setStageControlsVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStageControls = useCallback(() => {
    setStageControlsVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStageControlsVisible(false), 3000);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(
      "(orientation: landscape) and (max-height: 500px)",
    );
    const handleChange = () => setIsPhoneLandscape(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isPhoneLandscape) showStageControls();
  }, [isPhoneLandscape, showStageControls]);

  return {
    isPhoneLandscape,
    stageControlsVisible,
    showStageControls,
  };
}

export function useClassroomStageViewport() {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const panDragRef = useRef({
    active: false,
    startMouse: { x: 0, y: 0 },
    startPan: { x: 0, y: 0 },
  });

  const handleZoom = (delta: number) =>
    setZoom((previousZoom) => {
      const nextZoom = Math.min(Math.max(previousZoom + delta, 1), 3);
      if (nextZoom === 1) setPan({ x: 0, y: 0 });
      return nextZoom;
    });

  const startPanDrag = useCallback(
    (clientX: number, clientY: number) => {
      panDragRef.current = {
        active: true,
        startMouse: { x: clientX, y: clientY },
        startPan: { ...pan },
      };
    },
    [pan],
  );

  useEffect(() => {
    const applyDrag = (clientX: number, clientY: number) => {
      if (!panDragRef.current.active || !stageRef.current) return;

      const deltaX = clientX - panDragRef.current.startMouse.x;
      const deltaY = clientY - panDragRef.current.startMouse.y;
      const { offsetWidth, offsetHeight } = stageRef.current;
      const maxX = (offsetWidth * (zoom - 1)) / 2;
      const maxY = (offsetHeight * (zoom - 1)) / 2;

      setPan({
        x: Math.max(
          -maxX,
          Math.min(maxX, panDragRef.current.startPan.x + deltaX),
        ),
        y: Math.max(
          -maxY,
          Math.min(maxY, panDragRef.current.startPan.y + deltaY),
        ),
      });
    };
    const handleMouseMove = (event: MouseEvent) =>
      applyDrag(event.clientX, event.clientY);
    const stopDragging = () => {
      panDragRef.current.active = false;
    };
    const handleTouchMove = (event: TouchEvent) => {
      event.preventDefault();
      applyDrag(event.touches[0].clientX, event.touches[0].clientY);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", stopDragging);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", stopDragging);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", stopDragging);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", stopDragging);
    };
  }, [zoom]);

  return {
    zoom,
    pan,
    stageRef,
    handleZoom,
    startPanDrag,
  };
}
