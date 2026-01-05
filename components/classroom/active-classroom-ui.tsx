"use client";

import { useMutation } from "convex/react";
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
  Mic, MicOff, Video as VideoIcon, VideoOff, LogOut, MessageCircle, VolumeX, 
  MonitorUp, ZoomIn, ZoomOut, Move, Hand, Loader2
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { FlexidualLogo } from "../ui/flexidual-logo";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

// --- Constants ---
const SCREEN_SHARE_OPTIONS = { updateOnlyOn: [], onlySubscribed: false };
const SCREEN_SHARE_SOURCE = [Track.Source.ScreenShare];

// --- Types ---
type ShareRequest = {
  participantId: string;
  name: string;
};

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
    <div className={`relative bg-slate-900 overflow-hidden ${className}`}>
      {isVideoEnabled ? (
        <VideoTrack 
          trackRef={{ participant, source: Track.Source.Camera, publication: cameraTrack as TrackPublication }} 
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
           <div className={`${avatarSize} rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center font-bold text-white ${borderSize} border-white/10 shadow-xl transition-all`}>
              {participant.name?.charAt(0).toUpperCase() || participant.identity?.charAt(0).toUpperCase() || "?"}
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
      className="absolute z-50 w-48 h-36 bg-black rounded-lg shadow-2xl overflow-hidden border-2 border-slate-700 cursor-move"
      onMouseDown={handleMouseDown}
    >
      {children}
      <div className="absolute top-1 right-1 p-1 bg-black/50 rounded-full hover:bg-white/10 transition-colors">
        <Move className="w-3 h-3 text-white/70" />
      </div>
    </div>
  );
}

// --- Main Component ---

interface ActiveClassroomUIProps {
  currentUserRole?: string;
  roomName: string;
  className?: string;
  lessonTitle?: string;
}

export function ActiveClassroomUI({ currentUserRole, roomName, className, lessonTitle }: ActiveClassroomUIProps) {
  const t = useTranslations();
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
    if (p.isLocal && amITeacher) return false;
    const role = getRole(p);
    return role === "student";
  });

  // --- STATE ---
  const [zoom, setZoom] = useState(1);
  const [pendingRequest, setPendingRequest] = useState<ShareRequest | null>(null);
  const [waitingForApproval, setWaitingForApproval] = useState(false);

  // --- TRACKS ---
  const screenTracks = useTracks(SCREEN_SHARE_SOURCE, SCREEN_SHARE_OPTIONS);
  
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

  // FIX: Explicit subscription for remote screen shares
  useEffect(() => {
    if (!activeScreenTrack || activeScreenTrack.participant.isLocal) return;
    
    const publication = activeScreenTrack.publication;
    
    // Subscribe if not already subscribed
    if (!publication.isSubscribed && publication.track) {
      (publication as RemoteTrackPublication).setSubscribed(true);
    }
    
  }, [activeScreenTrack]);

  const teacherCameraTrack = teacher?.getTrackPublication(Track.Source.Camera);
  const teacherAudioTrack = teacher?.getTrackPublication(Track.Source.Microphone);
  const isTeacherVideoOn = teacherCameraTrack && teacherCameraTrack.isSubscribed && !teacherCameraTrack.isMuted;
  const isTeacherAudioOn = teacherAudioTrack && teacherAudioTrack.isSubscribed && !teacherAudioTrack.isMuted;

  // --- SIGNALING ---
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  useEffect(() => {
    const handleData = (payload: Uint8Array, participant?: RemoteParticipant) => {
      try {
        const msg = JSON.parse(decoder.decode(payload));
        
        if (amITeacher && msg.type === "REQUEST_SHARE" && participant) {
          setPendingRequest({ participantId: participant.identity, name: participant.name || t('classroom.student') });
        }

        if (!amITeacher && msg.type === "ALLOW_SHARE") {
          setWaitingForApproval(false);
          localParticipant?.setScreenShareEnabled(true, { audio: true });
          toast.success(t('classroom.permissionGranted'));
        }
        
        if (!amITeacher && msg.type === "DENY_SHARE") {
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
  }, [room, amITeacher, isSharingLocally, localParticipant, decoder, t]);

  const requestPermission = async () => {
    if (isScreenSharingActive && !isSharingLocally) {
      toast.error(t('classroom.someoneSharing'));
      return;
    }
    setWaitingForApproval(true);
    const data = JSON.stringify({ type: "REQUEST_SHARE" });
    await room.localParticipant.publishData(encoder.encode(data), { reliable: true });
    toast.info(t('classroom.requestSent'));
  };

  const grantPermission = async (allow: boolean) => {
    if (!pendingRequest) return;
    const type = allow ? "ALLOW_SHARE" : "DENY_SHARE";
    const data = JSON.stringify({ type });
    await room.localParticipant.publishData(encoder.encode(data), { 
      reliable: true, 
      destinationIdentities: [pendingRequest.participantId] 
    });
    setPendingRequest(null);
  };

  const handleShareClick = async () => {
    if (isSharingLocally) {
      await localParticipant?.setScreenShareEnabled(false);
      return;
    }
    if (amITeacher) {
      await localParticipant?.setScreenShareEnabled(true, { audio: true });
    } else {
      requestPermission();
    }
  };

  const handleZoom = (delta: number) => setZoom(prev => Math.min(Math.max(prev + delta, 1), 3));

  // --- MEDIA INIT ---
  useEffect(() => {
    const unlockAudio = async () => {
        try { await room.startAudio(); } 
        catch (e) { setNeedsClick(true); }
    };
    unlockAudio();
  }, [room]);

  useEffect(() => {
    if (!localParticipant) return;
    const initMedia = async () => {
      try { await localParticipant.setMicrophoneEnabled(true); } catch (e) {}
      try { await localParticipant.setCameraEnabled(true); } catch (e) {}
    };
    initMedia();
  }, [localParticipant]);

  useEffect(() => {
    if (currentUserRole !== "teacher") return;
    markLive({ roomName, isLive: true });
    return () => { markLive({ roomName, isLive: false }); };
  }, [currentUserRole, roomName, markLive]);

  return (
    <div className="flex h-full w-full bg-[#faf8f9] overflow-hidden font-sans text-slate-800 relative">
      <RoomAudioRenderer />
      
      {needsClick && (
        <div className="absolute inset-0 z-[999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
                <VolumeX className="w-12 h-12 text-orange-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">{t('classroom.enableAudio')}</h3>
                <button onClick={async () => { await room.startAudio(); setNeedsClick(false); }} className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold">{t('classroom.startClass')}</button>
            </div>
        </div>
      )}

      {pendingRequest && amITeacher && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[100] bg-white rounded-xl shadow-2xl border border-slate-200 p-4 w-80 animate-in slide-in-from-top-4">
           <div className="flex items-start gap-3">
              <div className="bg-blue-100 p-2 rounded-full"><Hand className="w-5 h-5 text-blue-600" /></div>
              <div>
                 <h4 className="font-bold text-sm text-slate-800">{t('classroom.shareRequest', { name: pendingRequest.name })}</h4>
                 <p className="text-xs text-muted-foreground mt-1">{t('classroom.shareRequestDescription')}</p>
              </div>
           </div>
           <div className="flex gap-2 mt-4">
              <button onClick={() => grantPermission(false)} className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">{t('classroom.deny')}</button>
              <button onClick={() => grantPermission(true)} className="flex-1 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">{t('classroom.allow')}</button>
           </div>
        </div>
      )}

      <div className="flex-1 flex flex-col p-4 gap-4">
        <div className="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3">
            <FlexidualLogo />
            <div className="flex flex-col">
              <h2 className="text-sm font-bold text-slate-800">{className || t('classroom.classroom')}</h2>
              {lessonTitle && <p className="text-xs text-muted-foreground">{lessonTitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
            <div className={`w-2.5 h-2.5 rounded-full ${teacher ? 'bg-green-500 animate-pulse' : 'bg-orange-400'}`} />
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">{teacher ? t('classroom.live') : t('classroom.waiting')}</span>
          </div>
        </div>

        <div className="flex-1 bg-[#2d3748] rounded-2xl shadow-xl overflow-hidden relative border-4 border-[#4a5568] flex items-center justify-center group">
          {isScreenSharingActive ? (
            <>
              <div 
                key={activeScreenTrack.publication.trackSid} 
                className="w-full h-full flex items-center justify-center transition-transform duration-200 ease-out origin-center bg-black relative"
                style={{ transform: `scale(${zoom})`, cursor: zoom > 1 ? 'grab' : 'default' }}
              >
                <VideoTrack 
                   trackRef={activeScreenTrack} 
                   className="w-full h-full object-contain" 
                   onError={(e) => console.error("Video Track Error", e)}
                />

                {(!activeScreenTrack.publication.isSubscribed || !activeScreenTrack.publication.track) && (
                   <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-sm z-50">
                      <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                      <p className="text-white font-bold text-lg">{t('classroom.loadingShare')}</p>
                      <p className="text-white/50 text-xs mt-2 font-mono">
                        {t('classroom.presenterSharing', { name: activeScreenTrack.participant.name || t('classroom.presenter') })}
                      </p>
                   </div>
                )}
              </div>

              <div className="absolute bottom-4 right-4 flex gap-2 z-40 bg-black/60 p-1.5 rounded-lg backdrop-blur-sm">
                <button onClick={() => handleZoom(-0.25)} className="p-2 hover:bg-white/20 rounded text-white"><ZoomOut className="w-4 h-4" /></button>
                <span className="text-white text-xs font-mono py-2 min-w-[3ch] text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => handleZoom(0.25)} className="p-2 hover:bg-white/20 rounded text-white"><ZoomIn className="w-4 h-4" /></button>
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
                ) : amITeacher ? (
                  <div className="z-10 flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-300">
                      <div className="w-28 h-28 bg-green-100 rounded-full flex items-center justify-center border-4 border-green-500 mb-6 shadow-xl animate-pulse">
                          <VideoOff className="w-12 h-12 text-green-700" />
                      </div>
                      <h2 className="text-3xl font-bold text-white">{t('classroom.youAreLive')}</h2>
                      <p className="text-blue-200 mt-2 text-lg">{t('classroom.cameraOff')}</p>
                  </div>
                ) : (
                  <div className="z-10 flex flex-col items-center justify-center p-8">
                      <div className="w-32 h-32 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center border-4 border-white/20 mb-6 shadow-lg">
                        <span className="text-5xl font-bold text-white">{teacher.name?.charAt(0) || "T"}</span>
                      </div>
                      <h2 className="text-2xl font-bold text-white">{teacher.name || t('classroom.teacher')}</h2>
                      <div className="flex items-center gap-2 mt-3 bg-black/40 px-4 py-1.5 rounded-full backdrop-blur-sm border border-white/10">
                        <Mic className={`w-4 h-4 ${isTeacherAudioOn ? "animate-pulse text-green-400" : "text-red-400"}`} />
                        <span className="text-sm text-green-50 font-medium">{isTeacherAudioOn ? t('classroom.audioOnly') : t('classroom.micOff')}</span>
                      </div>
                  </div>
                )
              ) : (
                <div className="text-center z-10 p-8">
                  <div className="w-32 h-32 mx-auto bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center border-2 border-white/20 mb-4">
                      <span className="text-6xl">👩‍🏫</span>
                  </div>
                  <h2 className="text-2xl font-bold text-white">{className || t('classroom.class')}</h2>
                  <p className="text-blue-100 mt-2">{t('classroom.waitingForTeacher')}</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="h-20 bg-white rounded-2xl shadow-sm border border-slate-200 px-6 flex items-center justify-center gap-6 relative">
           <div className="absolute left-6 flex items-center gap-3">
              <div className="w-16 h-10 rounded overflow-hidden border border-slate-300 relative shadow-sm">
                 {localParticipant && <ParticipantTile participant={localParticipant} variant="mini" className="w-full h-full" showLabel={false} />}
              </div>
              <span className="text-sm font-bold text-slate-600">{t('classroom.you', { role: currentUserRole || 'student' })}</span>
           </div>

           <CustomMediaToggle source={Track.Source.Microphone} iconOn={<Mic className="w-5 h-5" />} iconOff={<MicOff className="w-5 h-5" />} />
           <CustomMediaToggle source={Track.Source.Camera} iconOn={<VideoIcon className="w-5 h-5" />} iconOff={<VideoOff className="w-5 h-5" />} />

           <button 
              onClick={handleShareClick}
              disabled={waitingForApproval}
              className={`
                w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-md border relative
                ${isSharingLocally
                  ? 'bg-green-100 hover:bg-green-200 text-green-700 border-green-300' 
                  : waitingForApproval 
                     ? 'bg-yellow-100 text-yellow-600 border-yellow-300 cursor-wait'
                     : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'}
              `}
              title={waitingForApproval ? t('classroom.waitingForApproval') : t('classroom.shareScreen')}
           >
              {waitingForApproval ? <div className="animate-pulse"><Hand className="w-5 h-5" /></div> : <MonitorUp className="w-5 h-5" />}
           </button>

           <button onClick={() => router.back()} className="ml-4 px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-full font-bold text-sm flex items-center gap-2 shadow-md">
             <LogOut className="w-4 h-4" /> {t('classroom.leave')}
           </button>
        </div>
      </div>

      <div className="w-72 bg-white border-l border-slate-200 flex flex-col shadow-xl z-10">
        <div className="p-4 bg-blue-600 text-white text-center">
          <h3 className="text-xs font-bold uppercase tracking-widest">{t('classroom.classmates', { count: students.length })}</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2 bg-blue-50/50">
          <div className="grid grid-cols-2 gap-2">
            {students.length === 0 && <div className="col-span-2 text-center py-10 text-slate-400 text-xs italic">{amITeacher ? t('classroom.waitingForStudents') : t('classroom.youAreFirst')}</div>}
            {students.map((p) => <ParticipantTile key={p.identity} variant="grid" participant={p} className="aspect-square rounded-lg border-2 border-blue-300" />)}
          </div>
        </div>
        <div className="bg-yellow-50 border-t border-yellow-200 p-4">
           <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-full bg-yellow-400 flex items-center justify-center text-white font-bold border-2 border-yellow-500 shadow-sm">T</div>
              <div><p className="text-xs font-bold text-slate-700">{t('classroom.liveTutor')}</p><p className="text-[10px] text-green-600 font-medium">● {t('classroom.online')}</p></div>
           </div>
           <button className="w-full text-left px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-yellow-50 rounded flex items-center gap-2 bg-white border border-yellow-200">
              <MessageCircle className="w-3 h-3" /> {t('classroom.chatWithTutor')}
           </button>
        </div>
      </div>
    </div>
  );
}