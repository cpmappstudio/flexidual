"use client";

import { useState } from "react";
import { useRoomContext, useLocalParticipant } from "@livekit/components-react";
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

  // Inform the room when the companion starts/stops the whiteboard
  const toggleWhiteboard = async () => {
    const newState = !isBroadcasting;
    setIsBroadcasting(newState);

    const payload = JSON.stringify({
      type: "WHITEBOARD_STATE",
      active: newState,
      companionId: localParticipant.identity,
    });

    await localParticipant.publishData(new TextEncoder().encode(payload), {
      reliable: true,
    });

    if (newState) {
      toast.success(t('classroom.whiteboardStarted'));
    }
  };

  // Ensure companion disconnects cleanly
  const handleLeave = async () => {
    if (isBroadcasting) {
      const payload = JSON.stringify({ type: "WHITEBOARD_STATE", active: false });
      // 1. Await the message to ensure it sends
      await localParticipant.publishData(new TextEncoder().encode(payload), { reliable: true });
    }
    // 2. Await the disconnect to ensure WebRTC closes cleanly
    await room.disconnect();
    // 3. Finally, route back
    router.back();
  };

  return (
    <div className="flex flex-col w-full h-full bg-slate-950 p-2">
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
      <div className="flex-1 rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10">
        {/* The companion is never readonly */}
        <SharedWhiteboard isReadonly={false} />
      </div>
    </div>
  );
}