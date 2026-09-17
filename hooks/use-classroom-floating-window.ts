"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PipVideo = HTMLVideoElement & {
  webkitPresentationMode?: string;
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
};

type PipWindow = Window & {
  documentPictureInPicture?: {
    requestWindow: (options: {
      width: number;
      height: number;
      disallowReturnToOpener: boolean;
    }) => Promise<Window>;
  };
};

type FloatingKind = "document" | "video" | "window" | "internal";

function isVideoPipActive(video: PipVideo) {
  return typeof video.webkitPresentationMode === "string"
    ? video.webkitPresentationMode === "picture-in-picture"
    : document.pictureInPictureElement === video;
}

function exitVideoPip(video: PipVideo) {
  if (typeof video.webkitPresentationMode === "string") {
    if (video.webkitPresentationMode === "picture-in-picture")
      video.webkitSetPresentationMode?.("inline");
  } else if (document.pictureInPictureElement === video) {
    void document.exitPictureInPicture().catch(() => {});
  }
}

function getFloatingKind(video: HTMLVideoElement | null): FloatingKind {
  if ((window as PipWindow).documentPictureInPicture) return "document";
  const nativeVideo = video as PipVideo | null;
  if (
    "webkitSetPresentationMode" in HTMLVideoElement.prototype ||
    typeof nativeVideo?.webkitSetPresentationMode === "function"
  )
    return "internal";
  if (!nativeVideo || nativeVideo.readyState < 1 || !nativeVideo.srcObject)
    return "window";
  if (
    document.pictureInPictureEnabled &&
    typeof nativeVideo.requestPictureInPicture === "function"
  )
    return "video";
  return "window";
}

function syncWindowStyles(source: Document, target: Document) {
  const base = target.createElement("base");
  base.href = source.baseURI;
  target.head.append(base);

  const copyStyles = () => {
    target.head
      .querySelectorAll("[data-classroom-window-style]")
      .forEach((node) => node.remove());
    source.head
      .querySelectorAll('style, link[rel="stylesheet"]')
      .forEach((node) => {
        const copy = node.cloneNode(true) as HTMLElement;
        copy.setAttribute("data-classroom-window-style", "");
        target.head.append(copy);
      });
  };
  const copyTheme = () => {
    target.documentElement.className = source.documentElement.className;
    target.documentElement.style.cssText = source.documentElement.style.cssText;
    target.body.className = source.body.className;
    target.body.style.cssText = "margin:0;height:100dvh;overflow:hidden";
  };
  copyStyles();
  copyTheme();

  const styles = new MutationObserver(copyStyles);
  styles.observe(source.head, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
  });
  const theme = new MutationObserver(copyTheme);
  theme.observe(source.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  theme.observe(source.body, { attributes: true, attributeFilter: ["class"] });
  return () => {
    styles.disconnect();
    theme.disconnect();
  };
}

export function useClassroomFloatingWindow({
  host,
  video,
  enabled,
  restoreHost,
}: {
  host: HTMLElement | null;
  video: HTMLVideoElement | null;
  enabled: boolean;
  restoreHost: () => void;
}) {
  const [externalWindow, setExternalWindow] = useState<Window | null>(null);
  const [nativeVideoActive, setNativeVideoActive] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState(false);
  const [floatingKind, setFloatingKind] = useState<FloatingKind>("window");
  const externalRef = useRef<Window | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const requestRef = useRef(0);
  const openingRef = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const videoRef = useRef(video);
  videoRef.current = video;
  const activeVideoRef = useRef<PipVideo | null>(null);

  useEffect(() => {
    const update = () => setFloatingKind(getFloatingKind(video));
    update();
    video?.addEventListener("loadedmetadata", update);
    video?.addEventListener("canplay", update);
    video?.addEventListener("emptied", update);
    return () => {
      video?.removeEventListener("loadedmetadata", update);
      video?.removeEventListener("canplay", update);
      video?.removeEventListener("emptied", update);
    };
  }, [video]);

  const close = useCallback(() => {
    requestRef.current += 1;
    openingRef.current = false;
    restoreHost();
    cleanupRef.current?.();
    cleanupRef.current = null;
    const external = externalRef.current;
    externalRef.current = null;
    if (external && !external.closed) external.close();
    const nativeVideo =
      activeVideoRef.current ?? (videoRef.current as PipVideo | null);
    activeVideoRef.current = null;
    if (nativeVideo) exitVideoPip(nativeVideo);
    setExternalWindow(null);
    setNativeVideoActive(false);
    setOpening(false);
    setError(false);
  }, [restoreHost]);

  const attachWindow = useCallback(
    (external: Window, normalPopup = false) => {
      if (!host) return;
      external.document.title = document.title;
      const stopSyncing = syncWindowStyles(document, external.document);
      const restore = () => {
        if (externalRef.current !== external) return;
        restoreHost();
        cleanupRef.current?.();
        cleanupRef.current = null;
        externalRef.current = null;
        setExternalWindow(null);
      };
      external.addEventListener("pagehide", restore);
      // A normal popup can navigate away without reliably delivering pagehide.
      const checkClosed = normalPopup
        ? window.setInterval(() => {
            if (external.closed) restore();
          }, 500)
        : undefined;
      cleanupRef.current = () => {
        stopSyncing();
        external.removeEventListener("pagehide", restore);
        window.clearInterval(checkClosed);
      };
      externalRef.current = external;
      external.document.body.append(host);
      setExternalWindow(external);
      setError(false);
    },
    [host, restoreHost],
  );

  const openFloating = useCallback(async () => {
    if (!host || !enabledRef.current || openingRef.current) return;
    if (getFloatingKind(videoRef.current) === "internal") return;
    if (externalRef.current) {
      externalRef.current.focus();
      return;
    }
    openingRef.current = true;
    setOpening(true);
    setError(false);
    const request = ++requestRef.current;
    let pendingWindow: Window | null = null;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      if (request !== requestRef.current || !enabledRef.current) return;
      const documentPip = (window as PipWindow).documentPictureInPicture;
      if (documentPip) {
        const external = await documentPip.requestWindow({
          width: 480,
          height: 400,
          disallowReturnToOpener: true,
        });
        pendingWindow = external;
        if (request !== requestRef.current || !enabledRef.current) {
          external.close();
          return;
        }
        attachWindow(external);
        return;
      }
      const nativeVideo = videoRef.current as PipVideo | null;
      if (
        !nativeVideo ||
        nativeVideo.readyState < 1 ||
        !nativeVideo.srcObject
      ) {
        throw new Error("No playable classroom video");
      }
      if (getFloatingKind(nativeVideo) !== "video")
        throw new Error("Picture-in-picture unavailable for this video");
      // Resume the PiP source from the same user gesture without delaying entry.
      const playback = nativeVideo.paused
        ? nativeVideo.play().then(
            () => true,
            () => false,
          )
        : true;
      if (
        document.pictureInPictureEnabled &&
        typeof nativeVideo.requestPictureInPicture === "function"
      ) {
        await nativeVideo.requestPictureInPicture();
      } else {
        throw new Error("Picture-in-picture unavailable");
      }
      if (!(await playback)) throw new Error("Classroom video playback failed");
      if (request !== requestRef.current || !enabledRef.current) {
        exitVideoPip(nativeVideo);
        return;
      }
      activeVideoRef.current = nativeVideo;
      setNativeVideoActive(isVideoPipActive(nativeVideo));
    } catch {
      if (request === requestRef.current) {
        close();
        setError(true);
      }
      if (pendingWindow && !pendingWindow.closed) pendingWindow.close();
    } finally {
      if (request === requestRef.current) {
        openingRef.current = false;
        setOpening(false);
      }
    }
  }, [host, attachWindow, close]);

  const openWindow = useCallback(() => {
    if (!host || !enabledRef.current || openingRef.current) return;
    if (externalRef.current) {
      externalRef.current.focus();
      return;
    }
    const popup = window.open("", "", "popup,width=480,height=400");
    if (!popup) {
      setError(true);
      return;
    }
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => {});
    try {
      attachWindow(popup, true);
    } catch {
      close();
      if (!popup.closed) popup.close();
      setError(true);
    }
  }, [host, attachWindow, close]);

  useEffect(() => {
    if (!video) return;
    const update = () => {
      const active = isVideoPipActive(video as PipVideo);
      if (
        active &&
        (!enabledRef.current || getFloatingKind(video) === "internal")
      ) {
        exitVideoPip(video as PipVideo);
        setNativeVideoActive(false);
        return;
      }
      if (active) activeVideoRef.current = video;
      else if (activeVideoRef.current === video) activeVideoRef.current = null;
      setNativeVideoActive(active);
    };
    video.addEventListener("enterpictureinpicture", update);
    video.addEventListener("leavepictureinpicture", update);
    video.addEventListener("webkitpresentationmodechanged", update);
    update();
    return () => {
      video.removeEventListener("enterpictureinpicture", update);
      video.removeEventListener("leavepictureinpicture", update);
      video.removeEventListener("webkitpresentationmodechanged", update);
    };
  }, [video]);

  useEffect(() => {
    if (!enabled) close();
  }, [enabled, close]);

  useEffect(() => close, [close]);

  return {
    externalWindow,
    nativeVideoActive,
    opening,
    error,
    floatingKind,
    openFloating,
    openWindow,
    close,
  };
}
