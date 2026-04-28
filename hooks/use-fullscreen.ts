"use client";

import { useCallback, useEffect, useState } from "react";

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(typeof document !== "undefined" && !!document.fullscreenEnabled);
    setIsFullscreen(!!document.fullscreenElement);
  }, []);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  const toggleFullscreen = useCallback((element?: HTMLElement | null) => {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(console.error);
    } else {
      const target = element ?? document.documentElement;
      target.requestFullscreen().catch(console.error);
    }
  }, []);

  return { isFullscreen, isSupported, toggleFullscreen };
}
