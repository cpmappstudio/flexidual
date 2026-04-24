"use client";

import { useEffect, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { LogOut, MonitorUp, StopCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { SharedWhiteboard } from "./shared-whiteboard";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export function CompanionClassroomUI({ roomName }: { roomName: string }) {
  const t = useTranslations();
  const router = useRouter();
  const room = useRoomContext();
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);

  // Use screen dimensions (not window.inner*) so the virtual keyboard
  // appearing/disappearing does NOT trigger a re-render.
  useEffect(() => {
    const check = () => setIsPortrait(window.screen.height > window.screen.width);
    check();
    window.addEventListener("orientationchange", check);
    return () => window.removeEventListener("orientationchange", check);
  }, []);

  const sendWhiteboardState = (active: boolean) => {
    const payload = JSON.stringify({ type: "WHITEBOARD_STATE", active });
    room.localParticipant.publishData(new TextEncoder().encode(payload), { reliable: true });
  };

  const startBroadcast = () => {
    sendWhiteboardState(true);
    setIsBroadcasting(true);
    toast.success(t("classroom.whiteboardStarted") || "Whiteboard is now visible to students");
  };

  const stopBroadcast = () => {
    sendWhiteboardState(false);
    setIsBroadcasting(false);
  };

  const handleLeave = async () => {
    if (isBroadcasting) stopBroadcast();
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
      <div className="flex-1 rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 touch-none overscroll-none">
        <SharedWhiteboard isReadonly={false} />
      </div>
    </div>
  );
}

