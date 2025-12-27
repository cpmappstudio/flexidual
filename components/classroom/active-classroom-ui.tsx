"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { 
  VideoTrack,
  useLocalParticipant,
  useIsSpeaking,
  useTrackToggle,
  useRoomContext,
  useParticipants,
  RoomAudioRenderer
} from "@livekit/components-react";
import { Track, Participant, TrackPublication } from "livekit-client";
import { Mic, MicOff, Video as VideoIcon, VideoOff, LogOut, MessageCircle, VolumeX, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// --- Helper Functions ---
const getRole = (p: Participant | undefined): string => {
  if (!p || !p.metadata) return "student";
  try {
    const data = JSON.parse(p.metadata);
    return data.role || "student";
  } catch {
    return "student";
  }
};

// --- Helper Components ---
function CustomMediaToggle({ source, iconOn, iconOff }: { 
  source: Track.Source.Camera | Track.Source.Microphone | Track.Source.ScreenShare, 
  iconOn: React.ReactNode, 
  iconOff: React.ReactNode 
}) {
  const { toggle, enabled, pending } = useTrackToggle({ source });
  return (
    <button 
      onClick={() => toggle()}
      disabled={pending}
      className={`
        w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-md
        ${enabled 
          ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300' 
          : 'bg-red-100 text-red-500 border border-red-200'}
        ${pending ? 'opacity-50 cursor-wait' : ''}
      `}
    >
      {enabled ? iconOn : iconOff}
    </button>
  );
}

function SpeakingIndicator({ participant }: { participant: Participant }) {
  const isSpeaking = useIsSpeaking(participant);
  return (
    <div className={`
      absolute top-2 right-2 w-3 h-3 rounded-full border-2 border-white shadow-sm transition-colors duration-200
      ${isSpeaking ? 'bg-green-500' : 'bg-transparent'}
    `} />
  );
}

function ParticipantTile({ 
  participant, 
  className, 
  showLabel = true, 
  variant = "grid" // "grid" (sidebar) | "stage" (center) | "mini" (you preview)
}: { 
  participant: Participant, 
  className?: string, 
  showLabel?: boolean,
  variant?: "grid" | "stage" | "mini"
}) {
  const cameraTrack = participant.getTrackPublication(Track.Source.Camera);
  const isVideoEnabled = cameraTrack && cameraTrack.isSubscribed && !cameraTrack.isMuted;

  // Dynamic sizing based on variant
  const avatarSize = variant === "stage" ? "w-32 h-32 text-6xl" : variant === "mini" ? "w-8 h-8 text-xs" : "w-16 h-16 text-2xl";
  const borderSize = variant === "mini" ? "border-2" : "border-4";

  return (
    <div className={`relative bg-slate-900 overflow-hidden ${className}`}>
      {isVideoEnabled ? (
        <VideoTrack 
          trackRef={{ participant, source: Track.Source.Camera, publication: cameraTrack as TrackPublication }} 
          className="w-full h-full object-cover"
        />
      ) : (
        // Responsive Avatar
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
           <div className={`${avatarSize} rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center font-bold text-white ${borderSize} border-white/10 shadow-xl transition-all`}>
              {participant.name?.charAt(0).toUpperCase() || participant.identity?.charAt(0).toUpperCase() || "?"}
           </div>
        </div>
      )}
      
      <SpeakingIndicator participant={participant} />
      
      {showLabel && (
        <div className="absolute bottom-1 left-1 bg-black/60 px-2 py-1 rounded text-[10px] text-white font-medium truncate max-w-[90%] backdrop-blur-sm">
          {participant.name || participant.identity} {participant.isLocal && "(You)"}
        </div>
      )}
    </div>
  );
}

// --- Main Component ---

interface ActiveClassroomUIProps {
  currentUserRole?: string;
  roomName: string;
}

export function ActiveClassroomUI({ currentUserRole, roomName }: ActiveClassroomUIProps) {
  const router = useRouter();
  const room = useRoomContext();
  const markLive = useMutation(api.schedule.markLive);
  const [needsClick, setNeedsClick] = useState(false);

  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  
  const amITeacher = currentUserRole === "teacher";

  const teacher = participants.find((p) => {
    const role = p.isLocal ? currentUserRole : getRole(p);
    return role === "teacher";
  });

  const students = participants.filter((p) => {
    if (p.isLocal) return false; 
    const role = getRole(p);
    return role === "student";
  });

  // Check Teacher Video Status explicitly for Main Stage Logic
  const teacherCameraTrack = teacher?.getTrackPublication(Track.Source.Camera);
  const teacherAudioTrack = teacher?.getTrackPublication(Track.Source.Microphone);
  const isTeacherVideoOn = teacherCameraTrack && teacherCameraTrack.isSubscribed && !teacherCameraTrack.isMuted;
  const isTeacherAudioOn = teacherAudioTrack && teacherAudioTrack.isSubscribed && !teacherAudioTrack.isMuted;

  // Audio Autoplay Handling
  useEffect(() => {
    const unlockAudio = async () => {
        try { await room.startAudio(); } 
        catch (e) { setNeedsClick(true); }
    };
    unlockAudio();
  }, [room]);

  const handleStartAudio = async () => {
      await room.startAudio();
      setNeedsClick(false);
  };

  // Media Setup
  useEffect(() => {
    if (!localParticipant) return;
    const initMedia = async () => {
      try { await localParticipant.setMicrophoneEnabled(true); } catch (e) {}
      try { await localParticipant.setCameraEnabled(true); } catch (e) {}
    };
    initMedia();
  }, [localParticipant]);

  useEffect(() => {
    // Only the Teacher controls the "Live" status
    if (currentUserRole !== "teacher") return;
    
    // Teacher Joined -> Mark Live
    markLive({ roomName: roomName, isLive: true });

    // Teacher Left (Cleanup) -> Mark Scheduled (Inactive)
    return () => {
      markLive({ roomName: roomName, isLive: false });
    };
  }, [currentUserRole, roomName, markLive]);

  return (
    <div className="flex h-full w-full bg-[#faf8f9] overflow-hidden font-sans text-slate-800 relative">
      <RoomAudioRenderer />
      
      {/* Audio Unblock Overlay */}
      {needsClick && (
        <div className="absolute inset-0 z-[999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
                <VolumeX className="w-12 h-12 text-orange-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">Enable Audio</h3>
                <button onClick={handleStartAudio} className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold">Start Class</button>
            </div>
        </div>
      )}

      {/* === CENTER STAGE === */}
      <div className="flex-1 flex flex-col p-4 gap-4">
        
        {/* Header */}
        <div className="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center">
            <span 
              className="text-2xl font-logo font-black tracking-tight text-orange-500"
              style={{ fontVariationSettings: '"SOFT" 100' }}
            >
              Flexi
            </span>
            <span 
              className="text-2xl font-logo font-black tracking-tight text-yellow-700" 
              style={{ fontVariationSettings: '"SOFT" 100' }}
            >
              Dual
            </span>
          </div>
           
           <div className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
              <div className={`w-2.5 h-2.5 rounded-full ${teacher ? 'bg-green-500 animate-pulse' : 'bg-orange-400'}`} />
              <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                {teacher ? "Class in Session" : "Waiting for Teacher"}
              </span>
           </div>
        </div>

        {/* The Board */}
        <div className="flex-1 bg-[#2d3748] rounded-2xl shadow-xl overflow-hidden relative border-4 border-[#4a5568] flex items-center justify-center group">
          <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/chalkboard.png')]" />
          
          {teacher ? (
            // LOGIC: Show Video Tile OR Special "Live" Screens
            isTeacherVideoOn ? (
               <ParticipantTile 
                  participant={teacher}
                  variant="stage"
                  className="w-full h-full object-contain bg-transparent" 
                  showLabel={false} 
               />
            ) : amITeacher ? (
               // === YOU ARE LIVE (Teacher View) ===
               <div className="z-10 flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-300">
                   <div className="w-28 h-28 bg-green-100 rounded-full flex items-center justify-center border-4 border-green-500 mb-6 shadow-xl animate-pulse">
                      <VideoOff className="w-12 h-12 text-green-700" />
                   </div>
                   <h2 className="text-3xl font-bold text-white tracking-wide drop-shadow-md">You are Live!</h2>
                   <p className="text-blue-200 mt-2 text-lg font-medium">Your camera is currently off</p>
                   <p className="text-slate-400 text-sm mt-3 bg-black/30 px-4 py-1.5 rounded-full backdrop-blur-sm">
                      { isTeacherAudioOn ? "Students can still hear you" : "Your microphone is off" }
                   </p>
               </div>
            ) : (
               // === TEACHER AUDIO ONLY (Student View) ===
               <div className="z-10 flex flex-col items-center justify-center p-8">
                  <div className="w-32 h-32 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center border-4 border-white/20 mb-6 shadow-lg">
                     <span className="text-5xl font-bold text-white">{teacher.name?.charAt(0) || "T"}</span>
                  </div>
                  <h2 className="text-2xl font-bold text-white drop-shadow-md">{teacher.name || "Teacher"}</h2>
                  <div className="flex items-center gap-2 mt-3 bg-black/40 px-4 py-1.5 rounded-full backdrop-blur-sm border border-white/10">
                     <Mic className={`w-4 h-4  ${isTeacherAudioOn ? "animate-pulse text-green-400" : "text-red-400"}`} />
                     <span className="text-sm text-green-50 font-medium">{ isTeacherAudioOn ? "Audio Only" : "Microphone Off" }</span>
                  </div>
               </div>
            )
          ) : (
            // === WAITING STATE ===
            <div className="text-center z-10 p-8">
               <div className="w-32 h-32 mx-auto bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center border-2 border-white/20 mb-4">
                  <span className="text-6xl">👩‍🏫</span>
               </div>
               <h2 className="text-2xl font-bold text-white font-serif tracking-wide">Math Class</h2>
               <p className="text-blue-100 mt-2 text-lg">Waiting for teacher to join...</p>
            </div>
          )}
        </div>

        {/* Controls Bar */}
        <div className="h-20 bg-white rounded-2xl shadow-sm border border-slate-200 px-6 flex items-center justify-center gap-6 relative">
           <div className="absolute left-6 flex items-center gap-3">
              <div className="w-16 h-10 rounded overflow-hidden border border-slate-300 relative shadow-sm">
                 {localParticipant && (
                    <ParticipantTile participant={localParticipant} variant="mini" className="w-full h-full" showLabel={false} />
                 )}
              </div>
              <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-600">You ({currentUserRole})</span>
              </div>
           </div>

           <CustomMediaToggle source={Track.Source.Microphone} iconOn={<Mic className="w-5 h-5" />} iconOff={<MicOff className="w-5 h-5" />} />
           <CustomMediaToggle source={Track.Source.Camera} iconOn={<VideoIcon className="w-5 h-5" />} iconOff={<VideoOff className="w-5 h-5" />} />

           <button 
             onClick={() => router.back()}
             className="ml-4 px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-full font-bold text-sm flex items-center gap-2 shadow-md hover:shadow-lg transition-all"
           >
             <LogOut className="w-4 h-4" />
             Leave
           </button>
        </div>
      </div>

      {/* === RIGHT SIDEBAR === */}
      <div className="w-72 bg-white border-l border-slate-200 flex flex-col shadow-xl z-10">
        <div className="p-4 bg-blue-600 text-white text-center">
          <h3 className="text-xs font-bold uppercase tracking-widest">Classmates ({students.length})</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-2 bg-blue-50/50">
          <div className="grid grid-cols-2 gap-2">
            {students.length === 0 && (
               <div className="col-span-2 text-center py-10 text-slate-400 text-xs italic">
                 {amITeacher ? "Waiting for students..." : "You are the first student here!"}
               </div>
            )}
            {students.map((p) => (
              <ParticipantTile 
                key={p.identity}
                variant="grid"
                participant={p} 
                className="aspect-square rounded-lg border-2 border-blue-300 shadow-sm"
              />
            ))}
          </div>
        </div>
        
        <div className="bg-yellow-50 border-t border-yellow-200 p-4">
           <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-full bg-yellow-400 flex items-center justify-center text-white font-bold border-2 border-yellow-500 shadow-sm">T</div>
              <div>
                 <p className="text-xs font-bold text-slate-700">Live Tutor</p>
                 <p className="text-[10px] text-green-600 font-medium">● Online</p>
              </div>
           </div>
           <div className="bg-white rounded-lg border border-yellow-200 p-2 shadow-sm">
              <button className="w-full text-left px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-yellow-50 rounded flex items-center gap-2">
                 <MessageCircle className="w-3 h-3" /> Chat with Tutor
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}