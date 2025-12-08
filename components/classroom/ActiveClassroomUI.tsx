"use client";

import { 
  useTracks, 
  VideoTrack,
  useLocalParticipant,
  useIsSpeaking,
  useTrackToggle,
} from "@livekit/components-react";
import { Track, Participant } from "livekit-client";
import { Mic, MicOff, Video as VideoIcon, VideoOff, LogOut, Users, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// --- Helper Functions ---

// Metadata Parser (Still needed for Remote Participants)
const getRole = (p: Participant | undefined): string => {
  if (!p || !p.metadata) return "student";
  try {
    const data = JSON.parse(p.metadata);
    return data.role || "student";
  } catch {
    return "student";
  }
};

// Toggle Button Component
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

// Indicator Component
function SpeakingIndicator({ participant }: { participant: Participant }) {
  const isSpeaking = useIsSpeaking(participant);
  return (
    <div className={`
      absolute top-2 right-2 w-3 h-3 rounded-full border-2 border-white shadow-sm transition-colors duration-200
      ${isSpeaking ? 'bg-green-500' : 'bg-transparent'}
    `} />
  );
}

// --- Main Component ---

interface ActiveClassroomUIProps {
  currentUserRole?: string;
  currentUserName?: string;
}

export function ActiveClassroomUI({ currentUserRole, currentUserName }: ActiveClassroomUIProps) {
  const router = useRouter();
  const { localParticipant, cameraTrack: localCameraTrack } = useLocalParticipant();
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  
  // 1. Get Video Tracks
  const videoTracks = useTracks([Track.Source.Camera]);
  
  // 2. Identify Roles
  // A. Am I the teacher? (Trust the Prop passed from Database first)
  const amITeacher = currentUserRole === "teacher";

  // B. Find the Teacher's Track (Remote OR Local)
  const teacherVideoTrack = videoTracks.find((t) => {
    // If it's me, check my prop role. If remote, check metadata.
    const isMe = t.participant.identity === localParticipant?.identity;
    const role = isMe ? currentUserRole : getRole(t.participant);
    return role === "teacher";
  });
  
  // C. Find Student Tracks
  const studentTracks = videoTracks.filter((t) => {
    const isMe = t.participant.identity === localParticipant?.identity;
    const role = isMe ? currentUserRole : getRole(t.participant);
    if (t.participant.isLocal) return false;
    return role === "student";
  });

  // 3. Initial Media Setup
  useEffect(() => {
    if (!localParticipant) return;
    const initMedia = async () => {
      try { await localParticipant.setMicrophoneEnabled(true); } catch (e) { console.warn("Mic auto-start failed", e); }
      try { 
          await localParticipant.setCameraEnabled(true);
          setIsCameraEnabled(true);
      } catch (e) { console.warn("Camera auto-start failed", e); }
    };
    initMedia();
  }, [localParticipant]);

  return (
    <div className="flex h-screen w-full bg-[#f8f9fa] overflow-hidden font-sans text-slate-800 relative">
      
      {/* Center Stage */}
      <div className="flex-1 flex flex-col p-4 gap-4">
        
        {/* Header */}
        <div className="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm border border-slate-200">
           <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-orange-500">Flexi</span>
              <span className="text-xl font-bold text-yellow-600">Dual</span>
           </div>
           <div className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
              <div className={`w-2.5 h-2.5 rounded-full ${teacherVideoTrack || amITeacher ? 'bg-green-500 animate-pulse' : 'bg-orange-400'}`} />
              <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                {(teacherVideoTrack || amITeacher) ? "Class in Session" : "Waiting for Teacher"}
              </span>
           </div>
        </div>

        {/* Board Area */}
        <div className="flex-1 bg-[#2d3748] rounded-2xl shadow-xl overflow-hidden relative border-4 border-[#4a5568] flex items-center justify-center group">
          <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/chalkboard.png')]" />
          
          {teacherVideoTrack ? (
            <div className="relative w-full h-full">
                <VideoTrack trackRef={teacherVideoTrack} className="w-full h-full object-contain" />
                <SpeakingIndicator participant={teacherVideoTrack.participant} />
            </div>
          ) : amITeacher ? (
            <div className="text-center z-10 p-8 flex flex-col items-center">
               <div className="w-32 h-32 bg-slate-600 rounded-full flex items-center justify-center border-4 border-slate-500 mb-4 animate-pulse">
                  <span className="text-6xl">📷</span>
               </div>
               <h2 className="text-2xl font-bold text-white tracking-wide">You are Live!</h2>
               <p className="text-slate-300 mt-2">Your camera is currently off.</p>
            </div>
          ) : (
            <div className="text-center z-10 p-8">
               <div className="w-32 h-32 mx-auto bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center border-2 border-white/20 mb-4">
                  <span className="text-6xl">👩‍🏫</span>
               </div>
               <h2 className="text-2xl font-bold text-white font-serif tracking-wide">Classroom</h2>
               <p className="text-blue-100 mt-2 text-lg">Waiting for teacher...</p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="h-20 bg-white rounded-2xl shadow-sm border border-slate-200 px-6 flex items-center justify-center gap-6 relative">
           <div className="absolute left-6 flex items-center gap-3">
              <div className="w-16 h-10 bg-slate-200 rounded overflow-hidden border border-slate-300 relative">
                 {localParticipant && localCameraTrack && !localCameraTrack.isMuted ? (
                    <VideoTrack 
                      trackRef={{ 
                        participant: localParticipant, 
                        source: Track.Source.Camera,
                        publication: localCameraTrack 
                      }} 
                      className="w-full h-full object-cover mirror"
                    />
                 ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs bg-slate-100">Off</div>
                 )}
              </div>
              <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-600">You ({currentUserRole})</span>
              </div>
           </div>

           <CustomMediaToggle source={Track.Source.Microphone} iconOn={<Mic className="w-5 h-5" />} iconOff={<MicOff className="w-5 h-5" />} />
           <CustomMediaToggle source={Track.Source.Camera} iconOn={<VideoIcon className="w-5 h-5" />} iconOff={<VideoOff className="w-5 h-5" />} />

           <button onClick={() => router.back()} className="ml-4 px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-full font-bold text-sm flex items-center gap-2 shadow-md">
             <LogOut className="w-4 h-4" /> Leave
           </button>
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-72 bg-white border-l border-slate-200 flex flex-col shadow-xl z-10">
        <div className="p-4 bg-blue-600 text-white text-center">
          <h3 className="text-xs font-bold uppercase tracking-widest">Classmates</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2 bg-blue-50/50">
          <div className="grid grid-cols-2 gap-2">
            {!amITeacher && (
                <div className="aspect-square bg-white rounded-lg overflow-hidden border-2 border-green-400 relative shadow-sm">
                    {localParticipant && localCameraTrack && !localCameraTrack.isMuted ? (
                        <VideoTrack 
                            trackRef={{ participant: localParticipant, source: Track.Source.Camera, publication: localCameraTrack }} 
                            className="w-full h-full object-cover mirror" 
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-blue-100 text-blue-400"><span className="text-2xl">👤</span></div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] p-1 text-center">You</div>
                </div>
            )}
            
            {studentTracks.length === 0 && amITeacher && (
               <div className="col-span-2 text-center py-10 text-slate-400 text-xs italic">Waiting for students...</div>
            )}

            {studentTracks.map((track) => (
              <div key={track.participant.identity} className="aspect-square bg-blue-200 rounded-lg overflow-hidden border-2 border-blue-300 relative shadow-sm">
                <VideoTrack trackRef={track} className="w-full h-full object-cover" />
                <SpeakingIndicator participant={track.participant} />
                <div className="absolute bottom-0 left-0 right-0 bg-blue-900/70 text-white text-[10px] p-1 text-center truncate">
                  {track.participant.name || track.participant.identity}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Tutor Section */}
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