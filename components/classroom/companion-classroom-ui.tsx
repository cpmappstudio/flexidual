"use client";

import { useRef, useState } from "react";
import { useRoomContext, useLocalParticipant } from "@livekit/components-react";
import { Track, LocalVideoTrack } from "livekit-client";
import { LogOut, MonitorUp, StopCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { SharedWhiteboard } from "./shared-whiteboard";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export function CompanionClassroomUI({ roomName }: { roomName: string }) {
  const t = useTranslations();
  const router = useRouter();
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const whiteboardContainerRef = useRef<HTMLDivElement>(null);
  const broadcastTrackRef = useRef<LocalVideoTrack | null>(null);

  const startBroadcast = async () => {
    const canvas = whiteboardContainerRef.current?.querySelector("canvas");
    if (!canvas) {
      toast.error("Whiteboard canvas not ready. Please try again.");
      return;
    }
    const mediaTrack = canvas.captureStream(30).getVideoTracks()[0];
    if (!mediaTrack) return;

    const pub = await localParticipant.publishTrack(mediaTrack, {
      source: Track.Source.ScreenShare,
      name: "whiteboard",
      simulcast: false,
    });
    if (pub.track) broadcastTrackRef.current = pub.track as LocalVideoTrack;
    setIsBroadcasting(true);
    toast.success(t('classroom.whiteboardStarted'));
  };

  const stopBroadcast = async () => {
    const track = broadcastTrackRef.current;
    if (track) {
      await localParticipant.unpublishTrack(track);
      track.mediaStreamTrack.stop();
      broadcastTrackRef.current = null;
    }
    setIsBroadcasting(false);
  };

  const toggleWhiteboard = () => {
    if (isBroadcasting) stopBroadcast();
    else startBroadcast();
  };

  const handleLeave = async () => {
    await stopBroadcast();
    await room.disconnect();
    router.back();
  };

  return (
    <div className="flex flex-col w-full h-full bg-slate-950 p-2 touch-none overscroll-none">
      {/* Top Bar */}
      <div className="flex justify-between items-center bg-slate-900 rounded-xl p-3 mb-2 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500/20 text-blue-400 px-3 py-1 rounded-md text-sm font-bold uppercase tracking-wider">
            {/* Using a translation key here, or fallback string */}
            {t('classroom.companionDeviceFor', { room: roomName }) || `Companion Device at room "${roomName}"`}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleWhiteboard}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all ${
              isBroadcasting 
                ? "bg-red-500 hover:bg-red-600 text-white animate-pulse" 
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            {isBroadcasting ? <StopCircle className="w-5 h-5" /> : <MonitorUp className="w-5 h-5" />}
            {isBroadcasting ? (t('classroom.stopPresenting') || "Stop Presenting") : (t('classroom.presentBoard') || "Present Board")}
          </button>

          <button
            onClick={handleLeave}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors"
          >
            <LogOut className="w-5 h-5 text-red-400" />
          </button>
        </div>
      </div>

      {/* The Whiteboard Workspace */}
      <div ref={whiteboardContainerRef} className="flex-1 rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 touch-none overscroll-none">
        {/* The companion is never readonly */}
        <SharedWhiteboard isReadonly={false} />
      </div>
    </div>
  );
}