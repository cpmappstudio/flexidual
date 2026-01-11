"use client";

import { api } from "@/convex/_generated/api";
import { 
  VideoTrack,
  useLocalParticipant,
  useTrackToggle,
  useRoomContext,
  useParticipants,
  useTracks,
  RoomAudioRenderer,
} from "@livekit/components-react";
import { 
  Track, 
  Participant, 
  TrackPublication,
  RemoteParticipant,
  RemoteTrackPublication
} from "livekit-client";
import { 
  Mic, MicOff, Video as VideoIcon, VideoOff, Hand, Loader2, VolumeX,
  ZoomIn, ZoomOut, Move, MessageCircle, LogOut,
  MonitorUp
} from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

// Helper Functions
const getRole = (p: Participant | undefined): string => {
  if (!p || !p.metadata) return "student";
  try {
    const data = JSON.parse(p.metadata);
    return data.role || "student";
  } catch {
    return "student";
  }
};

// Helper Components
function CustomMediaToggle({ source, iconOn, iconOff }: { 
  source: Track.Source.Camera | Track.Source.Microphone, 
  iconOn: React.ReactNode, 
  iconOff: React.ReactNode 
}) {
  const { toggle, enabled, pending } = useTrackToggle({ source });
  return (
    <button 
      onClick={() => toggle()}
      disabled={pending}
      className={`
        w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg
        ${enabled 
          ? 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-purple-600 dark:text-purple-400 border-2 border-purple-300 dark:border-purple-600' 
          : 'bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400 border-2 border-red-200 dark:border-red-800'}
        ${pending ? 'opacity-50 cursor-wait' : ''}
      `}
    >
      {enabled ? iconOn : iconOff}
    </button>
  );
}

function ParticipantTile({ 
  participant, 
  className, 
  showLabel = true,
  variant = "grid"
}: { 
  participant: Participant, 
  className?: string, 
  showLabel?: boolean,
  variant?: "grid" | "stage" | "mini"
}) {
  const cameraTrack = participant.getTrackPublication(Track.Source.Camera);
  const isVideoEnabled = cameraTrack && cameraTrack.isSubscribed && !cameraTrack.isMuted;

  const avatarSize = variant === "stage" ? "w-32 h-32 text-6xl" : variant === "mini" ? "w-8 h-8 text-xs" : "w-16 h-16 text-2xl";
  const borderSize = variant === "mini" ? "border-2" : "border-4";

  return (
    <div className={`relative bg-gradient-to-br from-gray-800 to-gray-900 overflow-hidden ${className}`}>
      {isVideoEnabled ? (
        <VideoTrack 
          trackRef={{ participant, source: Track.Source.Camera, publication: cameraTrack as TrackPublication }} 
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
           <div className={`${avatarSize} rounded-full bg-gradient-to-tr from-yellow-400 to-orange-500 flex items-center justify-center font-bold text-white ${borderSize} border-white/10 shadow-xl`}>
              {participant.name?.charAt(0).toUpperCase() || "?"}
           </div>
        </div>
      )}
      
      {showLabel && (
        <div className="absolute bottom-1 left-1 bg-black/60 px-2 py-1 rounded text-[10px] text-white font-medium truncate max-w-[90%] backdrop-blur-sm">
          {participant.name || participant.identity} {participant.isLocal && "(You)"}
        </div>
      )}
    </div>
  );
}

function DraggablePip({ children, initialPos = { x: 20, y: 20 } }: { children: React.ReactNode, initialPos?: {x: number, y: number} }) {
  const [pos, setPos] = useState(initialPos);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pos.x, y: e.clientY - pos.y });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPos({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  return (
    <div 
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
      className="absolute z-50 w-48 h-36 bg-black rounded-lg shadow-2xl overflow-hidden border-2 border-purple-500 cursor-move"
      onMouseDown={handleMouseDown}
    >
      {children}
      <div className="absolute top-1 right-1 p-1 bg-black/50 rounded-full hover:bg-white/10 transition-colors">
        <Move className="w-3 h-3 text-white/70" />
      </div>
    </div>
  );
}

interface StudentClassroomUIProps {
  currentUserRole?: string;
  roomName: string;
  className?: string;
  lessonTitle?: string;
  onLeave?: () => void;
}

export function StudentClassroomUI({ currentUserRole, roomName, className, lessonTitle, onLeave }: StudentClassroomUIProps) {
  const t = useTranslations();
  const room = useRoomContext();
  const [needsClick, setNeedsClick] = useState(false);
  const [waitingForApproval, setWaitingForApproval] = useState(false);
  const [zoom, setZoom] = useState(1);

  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  
  const teacher = participants.find((p) => getRole(p) === "teacher");
  const students = participants.filter((p) => {
    const role = getRole(p);
    return role === "student";
  });

  const screenTracks = useTracks([Track.Source.ScreenShare], { updateOnlyOn: [], onlySubscribed: false });
  
  const activeScreenTrack = useMemo(() => {
    const sorted = [...screenTracks].sort((a, b) => {
      const roleA = getRole(a.participant);
      const roleB = getRole(b.participant);
      if (roleA === "teacher") return -1;
      if (roleB === "teacher") return 1;
      return 0;
    });
    return sorted[0];
  }, [screenTracks]);

  const isScreenSharingActive = !!activeScreenTrack;
  const isSharingLocally = localParticipant?.isScreenShareEnabled;

  // Explicit subscription for remote screen shares
  useEffect(() => {
    if (!activeScreenTrack || activeScreenTrack.participant.isLocal) return;
    
    const publication = activeScreenTrack.publication;
    
    if (!publication.isSubscribed && publication.track) {
      (publication as RemoteTrackPublication).setSubscribed(true);
    }
  }, [activeScreenTrack]);

  const teacherCameraTrack = teacher?.getTrackPublication(Track.Source.Camera);
  const teacherAudioTrack = teacher?.getTrackPublication(Track.Source.Microphone);
  const isTeacherVideoOn = teacherCameraTrack && teacherCameraTrack.isSubscribed && !teacherCameraTrack.isMuted;
  const isTeacherAudioOn = teacherAudioTrack && teacherAudioTrack.isSubscribed && !teacherAudioTrack.isMuted;

  // Data channel for screen share requests
  useEffect(() => {
    const decoder = new TextDecoder();

    const handleData = (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(decoder.decode(payload));
        
        if (msg.type === "ALLOW_SHARE") {
          setWaitingForApproval(false);
          localParticipant?.setScreenShareEnabled(true, { audio: true });
          toast.success(t('classroom.permissionGranted'));
        }
        
        if (msg.type === "DENY_SHARE") {
          setWaitingForApproval(false);
          toast.error(t('classroom.permissionDenied'));
        }
        
        if (msg.type === "STOP_SHARE" && isSharingLocally) {
           localParticipant?.setScreenShareEnabled(false);
           toast.info(t('classroom.sharingStoppedByTeacher'));
        }
      } catch (e) {
        console.error("Failed to parse data message", e);
      }
    };

    room.on("dataReceived", handleData);
    return () => { room.off("dataReceived", handleData); };
  }, [room, isSharingLocally, localParticipant, t]);

  const requestPermission = async () => {
    if (isScreenSharingActive && !isSharingLocally) {
      toast.error(t('classroom.someoneSharing'));
      return;
    }
    setWaitingForApproval(true);
    const encoder = new TextEncoder();
    const data = JSON.stringify({ type: "REQUEST_SHARE" });
    await room.localParticipant.publishData(encoder.encode(data), { reliable: true });
    toast.info(t('classroom.requestSent'));
  };

  const handleZoom = (delta: number) => setZoom(prev => Math.min(Math.max(prev + delta, 1), 3));

  const handleLeave = async () => {
    try {
      // Disconnect from room
      await room.disconnect();
      
      // Call parent callback if provided
      if (onLeave) {
        onLeave();
      }
    } catch (error) {
      console.error("Error leaving classroom:", error);
    }
  };

  useEffect(() => {
    const unlockAudio = async () => {
        try { await room.startAudio(); } 
        catch { setNeedsClick(true);}
    };
    unlockAudio();
  }, [room]);

  useEffect(() => {
    if (!localParticipant) return;
    const initMedia = async () => {
      try { await localParticipant.setMicrophoneEnabled(true); } catch {}
      try { await localParticipant.setCameraEnabled(true); } catch {}
    };
    initMedia();
  }, [localParticipant]);

  return (
    <div className="flex h-full w-full bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 overflow-hidden font-sans relative">
      <RoomAudioRenderer />
      
      {needsClick && (
        <div className="absolute inset-0 z-[999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl border-4 border-purple-400">
                <VolumeX className="w-12 h-12 text-orange-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2 text-gray-800 dark:text-gray-200">{t('classroom.enableAudio')}</h3>
                <button 
                  onClick={async () => { await room.startAudio(); setNeedsClick(false); }} 
                  className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-lg shadow-lg"
                >
                  {t('classroom.startClass')}
                </button>
            </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-4 gap-4">
        {/* Header */}
        <div className="flex justify-between items-center bg-white/90 dark:bg-gray-900/90 backdrop-blur-md p-3 rounded-2xl shadow-lg border-2 border-purple-300 dark:border-purple-700">
          <div className="flex flex-col">
            <h2 className="text-lg font-black text-purple-600 dark:text-purple-400">{className || t('classroom.classroom')}</h2>
            {lessonTitle && <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{lessonTitle}</p>}
          </div>
          <div className="flex items-center gap-2 bg-green-100 dark:bg-green-900/30 px-4 py-2 rounded-full border-2 border-green-300 dark:border-green-700">
            <div className={`w-3 h-3 rounded-full ${teacher ? 'bg-green-500 animate-pulse' : 'bg-orange-400'}`} />
            <span className="text-sm font-bold text-green-700 dark:text-green-400 uppercase tracking-wide">{teacher ? t('common.live') : t('classroom.waiting')}</span>
          </div>
        </div>

        {/* Main Stage */}
        <div className="flex-1 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-3xl shadow-2xl overflow-hidden relative border-4 border-purple-400 dark:border-purple-600 flex items-center justify-center group">
          {isScreenSharingActive ? (
            <>
              <div 
                className="w-full h-full flex items-center justify-center transition-transform duration-200 ease-out origin-center bg-black relative"
                style={{ transform: `scale(${zoom})` }}
              >
                <VideoTrack 
                   trackRef={activeScreenTrack} 
                   className="w-full h-full object-contain" 
                />

                {(!activeScreenTrack.publication.isSubscribed || !activeScreenTrack.publication.track) && (
                   <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/90 backdrop-blur-sm z-50">
                      <Loader2 className="w-12 h-12 text-purple-500 animate-spin mb-4" />
                      <p className="text-white font-bold text-lg">{t('classroom.loadingShare')}</p>
                   </div>
                )}
              </div>

              <div className="absolute bottom-4 right-4 flex gap-2 z-40 bg-black/60 p-2 rounded-xl backdrop-blur-sm border border-white/20">
                <button onClick={() => handleZoom(-0.25)} className="p-2 hover:bg-white/20 rounded-lg text-white">
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-white text-sm font-mono py-2 min-w-[3ch] text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => handleZoom(0.25)} className="p-2 hover:bg-white/20 rounded-lg text-white">
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              {teacher && isTeacherVideoOn && (
                 <DraggablePip initialPos={{ x: 20, y: 20 }}>
                    <ParticipantTile participant={teacher} variant="mini" className="w-full h-full" showLabel={false} />
                 </DraggablePip>
              )}
            </>
          ) : (
            <>
              <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/chalkboard.png')]" />
              {teacher ? (
                isTeacherVideoOn ? (
                  <ParticipantTile participant={teacher} variant="stage" className="w-full h-full object-contain bg-transparent" showLabel={false} />
                ) : (
                  <div className="z-10 flex flex-col items-center justify-center p-8 text-center">
                      <div className="w-40 h-40 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center border-8 border-white/20 mb-6 shadow-2xl">
                        <span className="text-7xl font-bold text-white">{teacher.name?.charAt(0) || "T"}</span>
                      </div>
                      <h2 className="text-3xl font-black text-white mb-2">{teacher.name || t('classroom.teacher')}</h2>
                      <div className="flex items-center gap-2 mt-3 bg-black/40 px-4 py-2 rounded-full backdrop-blur-sm border-2 border-white/20">
                        <Mic className={`w-5 h-5 ${isTeacherAudioOn ? "animate-pulse text-green-400" : "text-red-400"}`} />
                        <span className="text-sm text-white font-bold">{isTeacherAudioOn ? t('classroom.audioOnly') : t('classroom.micOff')}</span>
                      </div>
                  </div>
                )
              ) : (
                <div className="text-center z-10 p-8">
                  <div className="text-9xl mb-4">👩‍🏫</div>
                  <h2 className="text-3xl font-black text-white">{t('classroom.waitingForTeacher')}</h2>
                </div>
              )}
            </>
          )}
        </div>

        {/* Controls */}
        <div className="h-24 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md rounded-3xl shadow-lg border-2 border-purple-300 dark:border-purple-700 px-6 flex items-center justify-center gap-6 relative">
           <div className="absolute left-6 flex items-center gap-3">
              <div className="w-16 h-10 rounded overflow-hidden border-2 border-purple-400 shadow-md">
                 {localParticipant && <ParticipantTile participant={localParticipant} variant="mini" className="w-full h-full" showLabel={false} />}
              </div>
              <span className="text-sm font-bold text-gray-700 dark:text-gray-300">👋 {t('classroom.you', { role: 'Student' })}</span>
           </div>

           <CustomMediaToggle source={Track.Source.Microphone} iconOn={<Mic className="w-6 h-6" />} iconOff={<MicOff className="w-6 h-6" />} />
           <CustomMediaToggle source={Track.Source.Camera} iconOn={<VideoIcon className="w-6 h-6" />} iconOff={<VideoOff className="w-6 h-6" />} />

           <button 
              onClick={requestPermission}
              disabled={waitingForApproval || isSharingLocally}
              className={`
                w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg border-2
                ${isSharingLocally
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-300 dark:border-green-600' 
                  : waitingForApproval 
                     ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 border-yellow-300 dark:border-yellow-600 cursor-wait'
                     : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-600'}
              `}
              title={waitingForApproval ? t('classroom.waitingForApproval') : t('classroom.shareScreen')}
           >
              {waitingForApproval ? <MonitorUp className="w-6 h-6 animate-bounce" /> : <MonitorUp className="w-6 h-6" />}
           </button>

           <button 
             onClick={handleLeave} 
             className="ml-4 px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-full font-bold text-sm flex items-center gap-2 shadow-lg border-2 border-red-300"
           >
             <LogOut className="w-4 h-4" /> {t('classroom.leave')}
           </button>
        </div>
      </div>

      {/* Classmates Sidebar */}
      <div className="w-72 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-l-2 border-purple-300 dark:border-purple-700 flex flex-col shadow-xl z-10">
        <div className="p-4 bg-purple-600 dark:bg-purple-700 text-white text-center border-b-2 border-purple-700 dark:border-purple-800">
          <h3 className="text-sm font-black uppercase tracking-widest">{t('classroom.classmates', { count: students.length })}</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-3 bg-purple-50/50 dark:bg-gray-800/50">
          <div className="grid grid-cols-2 gap-3">
            {students.length === 0 && (
              <div className="col-span-2 text-center py-10 text-gray-500 dark:text-gray-400 text-sm font-medium">
                {t('classroom.youAreFirst')}
              </div>
            )}
            {students.map((p) => (
              <ParticipantTile 
                key={p.identity} 
                variant="grid" 
                participant={p} 
                className="aspect-square rounded-2xl border-4 border-purple-300 dark:border-purple-600 shadow-md" 
              />
            ))}
          </div>
        </div>
        <div className="bg-yellow-100 dark:bg-yellow-900/30 border-t-2 border-yellow-300 dark:border-yellow-700 p-4">
           <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white font-black text-xl border-4 border-yellow-500 shadow-md">T</div>
              <div>
                <p className="text-sm font-black text-gray-800 dark:text-gray-200">{t('classroom.liveTutor')}</p>
                <p className="text-xs text-green-600 dark:text-green-400 font-bold">● {t('classroom.online')}</p>
              </div>
           </div>
           <button className="w-full text-left px-3 py-2 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-yellow-200 dark:hover:bg-yellow-800 rounded-xl flex items-center gap-2 bg-white dark:bg-gray-800 border-2 border-yellow-300 dark:border-yellow-600 shadow-sm transition-all">
              <MessageCircle className="w-4 h-4" /> {t('classroom.chatWithTutor')}
           </button>
        </div>
      </div>
    </div>
  );
}