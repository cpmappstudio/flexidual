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
  // Flag to stop the render loop without relying on stale state closures
  const broadcastActiveRef = useRef(false);

  // Responsive layout: detect portrait vs landscape
  useEffect(() => {
    const check = () => setIsPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Cleanup on unmount — stop any active broadcast
  useEffect(() => {
    return () => {
      broadcastActiveRef.current = false;
      const track = broadcastTrackRef.current;
      if (track) {
        localParticipant.unpublishTrack(track);
        track.mediaStreamTrack.stop();
      }
    };
  }, [localParticipant]);

  const startBroadcast = async () => {
    const editor = editorRef.current;
    const container = whiteboardContainerRef.current;
    if (!editor || !container) {
      toast.error("Whiteboard not ready. Please try again.");
      return;
    }

    // Create a hidden canvas sized to the whiteboard container
    const { width, height } = container.getBoundingClientRect();
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width) || 1280;
    canvas.height = Math.round(height) || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    streamCanvasRef.current = canvas;
    streamCtxRef.current = ctx;
    broadcastActiveRef.current = true;

    // Self-referencing render loop — reads refs so never goes stale
    const render = async () => {
      if (!broadcastActiveRef.current) return;
      const ed = editorRef.current;
      const cv = streamCanvasRef.current;
      const cx = streamCtxRef.current;
      if (!ed || !cv || !cx) return;

      try {
        const ids = [...ed.getCurrentPageShapeIds()];
        if (ids.length === 0) {
          cx.fillStyle = "#ffffff";
          cx.fillRect(0, 0, cv.width, cv.height);
        } else {
          const { blob } = await ed.toImage(ids, { format: "png", background: true });
          const bitmap = await createImageBitmap(blob);
          cx.clearRect(0, 0, cv.width, cv.height);
          cx.drawImage(bitmap, 0, 0, cv.width, cv.height);
          bitmap.close();
        }
      } catch {
        // Keep the last good frame — don't crash the loop
      }

      if (broadcastActiveRef.current) setTimeout(render, 150);
    };

    // Render an initial frame so the stream isn't black on first publish
    await render();

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