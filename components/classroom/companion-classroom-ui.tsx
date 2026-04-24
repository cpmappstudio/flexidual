"use client";

import { useEffect, useRef, useState } from "react";
import { useRoomContext, useLocalParticipant } from "@livekit/components-react";
import { Track, LocalVideoTrack } from "livekit-client";
import { LogOut, MonitorUp, StopCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { SharedWhiteboard, type TLEditorInstance } from "./shared-whiteboard";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export function CompanionClassroomUI({ roomName }: { roomName: string }) {
  const t = useTranslations();
  const router = useRouter();
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);

  const editorRef = useRef<TLEditorInstance | null>(null);
  const whiteboardContainerRef = useRef<HTMLDivElement>(null);
  const broadcastTrackRef = useRef<LocalVideoTrack | null>(null);
  const streamCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const broadcastActiveRef = useRef(false);
  const unlistenRef = useRef<(() => void) | null>(null);
  const renderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Responsive layout: detect portrait vs landscape
  useEffect(() => {
    const check = () => setIsPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      broadcastActiveRef.current = false;
      if (unlistenRef.current) unlistenRef.current();
      if (renderTimeoutRef.current) clearTimeout(renderTimeoutRef.current);
      const track = broadcastTrackRef.current;
      if (track) {
        localParticipant.unpublishTrack(track);
        track.mediaStreamTrack.stop();
      }
      // Remove ghost canvas from DOM
      document.getElementById("wb-stream-canvas")?.remove();
    };
  }, [localParticipant]);

  const startBroadcast = async () => {
    const editor = editorRef.current;
    const container = whiteboardContainerRef.current;
    if (!editor || !container) {
      toast.error("Whiteboard not ready. Please try again.");
      return;
    }

    const { width, height } = container.getBoundingClientRect();

    // Ghost canvas: attached to DOM at near-zero opacity so iOS Safari doesn't
    // kill the MediaStream when the canvas leaves the viewport.
    let canvas = document.getElementById("wb-stream-canvas") as HTMLCanvasElement | null;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = "wb-stream-canvas";
      Object.assign(canvas.style, {
        position: "fixed", bottom: "0", right: "0",
        width: "1px", height: "1px",
        opacity: "0.01", pointerEvents: "none", zIndex: "-1",
      });
      document.body.appendChild(canvas);
    }
    canvas.width = Math.round(width) || 1280;
    canvas.height = Math.round(height) || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    streamCanvasRef.current = canvas;
    streamCtxRef.current = ctx;
    broadcastActiveRef.current = true;

    // Paint one frame via getSvgString (lightweight — no PNG encoding on mobile)
    const paintFrame = async () => {
      const ed = editorRef.current;
      const cv = streamCanvasRef.current;
      const cx = streamCtxRef.current;
      if (!ed || !cv || !cx || !broadcastActiveRef.current) return;

      try {
        const ids = [...ed.getCurrentPageShapeIds()];
        if (ids.length === 0) {
          cx.fillStyle = "#ffffff";
          cx.fillRect(0, 0, cv.width, cv.height);
          return;
        }
        const result = await ed.getSvgString(ids, { background: true });
        if (!result) return;
        const blob = new Blob([result.svg], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            cx.clearRect(0, 0, cv.width, cv.height);
            cx.drawImage(img, 0, 0, cv.width, cv.height);
            URL.revokeObjectURL(url);
            resolve();
          };
          img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
          img.src = url;
        });
      } catch {
        // Silent fail — keep the last good frame
      }
    };

    // Render initial frame before publishing
    await paintFrame();

    // Event-driven updates: re-paint only when shapes actually change (~4 FPS max)
    unlistenRef.current = editor.store.listen(
      () => {
        if (!broadcastActiveRef.current || renderTimeoutRef.current) return;
        renderTimeoutRef.current = setTimeout(async () => {
          await paintFrame();
          renderTimeoutRef.current = null;
        }, 250);
      },
      { scope: "document" }
    );

    const mediaTrack = canvas.captureStream(10).getVideoTracks()[0];
    if (!mediaTrack) {
      broadcastActiveRef.current = false;
      toast.error("Failed to capture stream. Please try again.");
      return;
    }

    const pub = await localParticipant.publishTrack(mediaTrack, {
      source: Track.Source.ScreenShare,
      name: "whiteboard",
      simulcast: false,
    });
    if (pub.track) broadcastTrackRef.current = pub.track as LocalVideoTrack;
    setIsBroadcasting(true);
    toast.success(t("classroom.whiteboardStarted"));
  };

  const stopBroadcast = async () => {
    broadcastActiveRef.current = false;
    if (unlistenRef.current) { unlistenRef.current(); unlistenRef.current = null; }
    if (renderTimeoutRef.current) { clearTimeout(renderTimeoutRef.current); renderTimeoutRef.current = null; }
    streamCanvasRef.current = null;
    streamCtxRef.current = null;
    const track = broadcastTrackRef.current;
    if (track) {
      await localParticipant.unpublishTrack(track);
      track.mediaStreamTrack.stop();
      broadcastTrackRef.current = null;
    }
    setIsBroadcasting(false);
  };

  const handleLeave = async () => {
    await stopBroadcast();
    await room.disconnect();
    router.back();
  };

  return (
    <div className="flex flex-col w-full h-full bg-slate-950 p-2 touch-none overscroll-none">
      {/* Top Bar — compact in portrait, full in landscape */}
      <div
        className={`flex items-center bg-slate-900 rounded-xl border border-slate-800 mb-2 ${
          isPortrait ? "justify-center gap-2 p-2" : "justify-between p-3"
        }`}
      >
        {!isPortrait && (
          <div className="bg-blue-500/20 text-blue-400 px-3 py-1 rounded-md text-sm font-bold uppercase tracking-wider">
            {t("classroom.companionDeviceFor", { room: roomName }) ||
              `Companion — "${roomName}"`}
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* onMouseDown preventDefault keeps Tldraw focused when tapping the button */}
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (isBroadcasting ? stopBroadcast() : startBroadcast())}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all ${
              isBroadcasting
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            {isBroadcasting ? <StopCircle className="w-4 h-4" /> : <MonitorUp className="w-4 h-4" />}
            {isBroadcasting
              ? t("classroom.stopPresenting") || "Stop"
              : t("classroom.presentBoard") || "Present"}
          </button>

          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleLeave}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors"
          >
            <LogOut className="w-5 h-5 text-red-400" />
          </button>
        </div>
      </div>

      {/* Whiteboard — fills remaining space */}
      <div
        ref={whiteboardContainerRef}
        className="flex-1 rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 touch-none overscroll-none"
      >
        <SharedWhiteboard
          isReadonly={false}
          onEditorReady={(editor) => {
            editorRef.current = editor;
          }}
        />
      </div>
    </div>
  );
}