"use client";

import { 
  LiveKitRoom, 
  useRemoteParticipants,
  RoomAudioRenderer,
  useConnectionState,
  useTracks,
  useIsSpeaking,
  useRoomContext
} from "@livekit/components-react";
import { VideoTrack } from "@livekit/components-react";
import { ConnectionState, Participant, Track, RemoteParticipant, TrackPublication } from "livekit-client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Hand, MicOff } from "lucide-react";
import { SharedWhiteboard } from "@/components/classroom/shared-whiteboard";

// --- Helpers (Kept DRY from your main UI) ---
const getRole = (p: Participant | undefined): string => {
  if (!p || !p.metadata) return "student";
  try { return JSON.parse(p.metadata).role || "student"; } 
  catch { return "student"; }
};

const getImageUrl = (p: Participant | undefined): string | null => {
  if (!p || !p.metadata) return null;
  try { return JSON.parse(p.metadata).imageUrl || null; } 
  catch { return null; }
};

// --- Failsafe Trigger ---
function RecordingTrigger() {
  const state = useConnectionState();
  useEffect(() => {
    const fallbackTimer = setTimeout(() => { console.log("START_RECORDING"); }, 5000);
    if (state === ConnectionState.Connected) {
      console.log("START_RECORDING");
      clearTimeout(fallbackTimer);
    }
    return () => clearTimeout(fallbackTimer);
  }, [state]);
  return null;
}

// --- The UI Tile (Mimics ParticipantTile) ---
function RecordingTile({ 
  participant, 
  variant = "grid", 
  raisedHand = false,
  roleBadge 
}: { 
  participant: Participant, 
  variant?: "stage" | "grid",
  raisedHand?: boolean,
  roleBadge?: string
}) {
  const cameraTrack = participant.getTrackPublication(Track.Source.Camera);
  const audioTrack = participant.getTrackPublication(Track.Source.Microphone);
  const isSpeaking = useIsSpeaking(participant);
  
  const isVideoEnabled = cameraTrack && cameraTrack.isSubscribed && !cameraTrack.isMuted;
  const isAudioMuted = !audioTrack || !audioTrack.isSubscribed || audioTrack.isMuted;
  const imageUrl = getImageUrl(participant);
  const name = participant.name || participant.identity || "Unknown";

  const avatarSize = variant === "stage" ? "w-32 h-32 text-6xl" : "w-16 h-16 text-2xl";

  return (
    <div className={`relative bg-muted overflow-hidden transition-all duration-300 ${isSpeaking ? "ring-4 ring-success shadow-[0_0_15px_rgba(34,197,94,0.4)] z-20" : ""} ${variant === "grid" ? "aspect-square rounded-xl border-2 border-border" : "w-full h-full"}`}>
      {isVideoEnabled && cameraTrack?.track ? (
        <VideoTrack 
          trackRef={{ participant, source: Track.Source.Camera, publication: cameraTrack as TrackPublication }} 
          className="w-full h-full object-cover" 
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-secondary">
          <div className={`${avatarSize} rounded-full flex items-center justify-center font-bold text-white shadow-xl overflow-hidden bg-gradient-to-tr from-yellow-500 to-orange-500`}>
            {imageUrl ? (
              <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              name.charAt(0).toUpperCase()
            )}
          </div>
        </div>
      )}
      
      {/* Name and Role Labels */}
      {variant === "stage" ? (
        <div className="absolute bottom-6 left-6 bg-black/70 backdrop-blur-sm px-4 py-2 rounded-lg flex items-center gap-2 border border-white/10 shadow-md z-10">
          {roleBadge && <span className="text-xs font-bold text-primary-foreground bg-primary px-2 py-1 rounded uppercase tracking-wide">{roleBadge}</span>}
          <span className="text-lg font-bold text-white">{name}</span>
        </div>
      ) : (
        <div className="absolute bottom-1 left-1 bg-black/60 px-2 py-1 rounded text-[10px] text-white font-medium truncate max-w-[90%] backdrop-blur-sm">
          {name}
        </div>
      )}

      {/* Overlays: Raised Hand & Muted State */}
      {raisedHand && (
        <div className="absolute top-2 right-2 bg-amber-500 rounded-full p-1.5 shadow-md">
          <Hand className="w-4 h-4 text-white" />
        </div>
      )}
      {isAudioMuted && (
        <div className={`absolute pointer-events-none bg-destructive/80 rounded-full shadow-sm ${variant === "stage" ? "bottom-6 right-6 p-2" : "bottom-1 right-1 p-1"}`}>
          <MicOff className={`text-white ${variant === "stage" ? "w-5 h-5" : "w-3 h-3"}`} />
        </div>
      )}
    </div>
  );
}

// --- The Core Layout Architecture ---
function RecordingLayout() {
  const room = useRoomContext();
  const remoteParticipants = useRemoteParticipants(); // Excludes the bot
  const screenTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false });
  
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);

  // Listen to data channels exactly like the main UI to catch hands in the recording
  useEffect(() => {
    const decoder = new TextDecoder();
    const handleData = (payload: Uint8Array, participant?: RemoteParticipant) => {
      try {
        const msg = JSON.parse(decoder.decode(payload));
        if (msg.type === "RAISE_HAND" && participant) {
          setRaisedHands((prev) => new Set(prev).add(participant.identity));
        }
        if (msg.type === "LOWER_HAND" || msg.type === "FORCE_LOWER_HAND") {
          if (participant) {
            setRaisedHands((prev) => { const next = new Set(prev); next.delete(participant.identity); return next; });
          }
        }
        if (msg.type === "WHITEBOARD_STATE") {
          setIsWhiteboardActive(!!msg.active);
        }
      } catch { /* ignore */ }
    };
    room.on("dataReceived", handleData);
    return () => { room.off("dataReceived", handleData); };
  }, [room]);

  // Sort and assign participants
  const teacher = remoteParticipants.find(p => getRole(p) === "teacher" || getRole(p) === "admin");
  const students = remoteParticipants.filter(p => getRole(p) !== "teacher" && getRole(p) !== "admin");
  const activeScreenTrack = screenTracks[0]; // Take the first active screen share

  return (
    <div className="w-screen h-screen bg-background flex flex-row overflow-hidden font-sans text-foreground">
      <RoomAudioRenderer />
      
      {/* LEFT: MAIN STAGE */}
      <div className="flex-1 relative bg-muted border-r border-border flex items-center justify-center p-2">
        {isWhiteboardActive ? (
          <div className="w-full h-full bg-white relative rounded-2xl overflow-hidden border-2 border-border shadow-xl">
             <SharedWhiteboard isReadonly={true} />
             {teacher && (
               <div className="absolute bottom-4 left-4 w-48 h-48 rounded-xl overflow-hidden shadow-2xl border-2 border-border z-50">
                 <RecordingTile participant={teacher} variant="grid" roleBadge="Teacher" />
               </div>
             )}
          </div>
        ) : activeScreenTrack ? (
          <div className="w-full h-full bg-black relative rounded-2xl overflow-hidden border-2 border-border shadow-xl">
             <VideoTrack 
               trackRef={activeScreenTrack} 
               className="w-full h-full object-contain" 
             />
             {/* Small PiP for Teacher when sharing screen */}
             {teacher && (
               <div className="absolute bottom-4 left-4 w-48 h-48 rounded-xl overflow-hidden shadow-2xl border-2 border-border z-50">
                 <RecordingTile participant={teacher} variant="grid" roleBadge="Teacher" />
               </div>
             )}
          </div>
        ) : teacher ? (
           <div className="w-full h-full rounded-2xl overflow-hidden border-2 border-border shadow-xl relative">
             <RecordingTile participant={teacher} variant="stage" roleBadge="Teacher" />
           </div>
        ) : (
           <div className="text-center p-8">
             <div className="w-24 h-24 mx-auto bg-background/50 rounded-full flex items-center justify-center border-2 border-border mb-4">
               <span className="text-4xl">👩‍🏫</span>
             </div>
             <h2 className="text-xl font-bold">Waiting for Teacher</h2>
           </div>
        )}
      </div>

      {/* RIGHT: CLASSMATES SIDEBAR */}
      <div className="w-[320px] bg-card flex flex-col shadow-xl z-20">
        <div className="bg-primary text-primary-foreground px-4 py-3 border-b border-border shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-widest">
            Classmates ({students.length})
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-muted/30">
          <div className="grid grid-cols-2 gap-3 auto-rows-max">
            {students.map(p => (
              <RecordingTile 
                key={p.identity} 
                participant={p} 
                variant="grid" 
                raisedHand={raisedHands.has(p.identity)}
              />
            ))}
          </div>
          {students.length === 0 && (
            <div className="text-center text-muted-foreground text-sm italic mt-10">
              No other students have joined yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main Wrapper ---
function RecordingContent() {
  const searchParams = useSearchParams();
  const url = searchParams.get("url");
  const token = searchParams.get("token");

  if (!url || !token) return null;

  return (
    <LiveKitRoom serverUrl={url} token={token} audio={true} video={true}>
      <RecordingTrigger />
      <RecordingLayout />
    </LiveKitRoom>
  );
}

export default function RecordingPage() {
  return (
    <Suspense fallback={<div className="w-screen h-screen bg-black" />}>
      <RecordingContent />
    </Suspense>
  );
}