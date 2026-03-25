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
        w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-md border
        ${enabled 
          ? 'bg-secondary hover:bg-secondary/80 text-secondary-foreground border-border' 
          : 'bg-destructive/10 text-destructive border-destructive/20'}
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
    <div className={`relative bg-muted overflow-hidden ${className}`}>
      {isVideoEnabled ? (
        <VideoTrack 
          trackRef={{ participant, source: Track.Source.Camera, publication: cameraTrack as TrackPublication }} 
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-secondary">
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
      className="absolute z-50 w-48 h-36 bg-card rounded-lg shadow-2xl overflow-hidden border-2 border-border cursor-move"
      onMouseDown={handleMouseDown}
    >
      {children}
      <div className="absolute top-1 right-1 p-1 bg-background/50 rounded-full hover:bg-foreground/10 transition-colors">
        <Move className="w-3 h-3 text-foreground/70" />
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

  // Explicit subscription for remote screen shares
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

  useEffect(() => {
    const decoder = new TextDecoder();

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
  }, [room, amITeacher, isSharingLocally, localParticipant, t]);

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

  const grantPermission = async (allow: boolean) => {
    if (!pendingRequest) return;
    const encoder = new TextEncoder();
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
    try {
      await localParticipant?.setScreenShareEnabled(true, { audio: true });
    } catch (error) {
      if ((error as Error)?.name === "NotAllowedError" || (error as Error)?.message?.includes("Permission denied")) {
         console.log("Screen share cancelled by user.");
         return; 
      }
      
      console.warn("Screen share with audio failed, trying video only...", error);
      try {
         await localParticipant?.setScreenShareEnabled(true, { audio: false });
         toast.warning(t('classroom.screenShareAudioNotSupported')); 
      } catch {
         toast.error(t('classroom.screenShareFailed')); 
      }
    }
  } else {
    requestPermission();
  }
};

  const handleZoom = (delta: number) => setZoom(prev => Math.min(Math.max(prev + delta, 1), 3));

  // --- MEDIA INIT ---
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
      try { 
        await localParticipant.setMicrophoneEnabled(true); 
      } catch (error) {
        console.error("Failed to enable microphone:", error);
      }
      try { 
        await localParticipant.setCameraEnabled(true); 
      } catch (error) {
        console.error("Failed to enable camera:", error);
      }
    };
    initMedia();
  }, [localParticipant]);

  useEffect(() => {
    if (currentUserRole !== "teacher") return;
    markLive({ roomName, isLive: true });
    return () => { markLive({ roomName, isLive: false }); };
  }, [currentUserRole, roomName, markLive]);

  return (
    <div className="flex h-full w-full bg-background overflow-hidden font-sans text-foreground relative">
      <RoomAudioRenderer />
      
      {needsClick && (
        <div className="absolute inset-0 z-[999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card text-card-foreground rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl border border-border">
                <VolumeX className="w-12 h-12 text-orange-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">{t('classroom.enableAudio')}</h3>
                <button onClick={async () => { await room.startAudio(); setNeedsClick(false); }} className="w-full py-3 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-lg font-bold">{t('classroom.startClass')}</button>
            </div>
        </div>
      )}

      {pendingRequest && amITeacher && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[100] bg-card text-card-foreground rounded-xl shadow-2xl border border-border p-4 w-80 animate-in slide-in-from-top-4">
           <div className="flex items-start gap-3">
              <div className="bg-primary/10 p-2 rounded-full"><Hand className="w-5 h-5 text-primary" /></div>
              <div>
                 <h4 className="font-bold text-sm text-slate-800">{t('classroom.shareRequest', { name: pendingRequest.name })}</h4>
                 <p className="text-xs text-muted-foreground mt-1">{t('classroom.shareRequestDescription')}</p>
              </div>
           </div>
           <div className="flex gap-2 mt-4">
              <button onClick={() => grantPermission(false)} className="flex-1 py-2 text-xs font-bold text-secondary-foreground bg-secondary hover:bg-secondary/80 rounded-lg">{t('classroom.deny')}</button>
              <button onClick={() => grantPermission(true)} className="flex-1 py-2 text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg">{t('classroom.allow')}</button>
           </div>
        </div>
      )}

      <div className="flex-1 flex flex-col p-4 gap-4">
        <div className="flex justify-between items-center bg-card p-3 rounded-xl shadow-sm border border-border">
          <div className="flex items-center gap-3">
            <FlexidualLogo />
            <div className="flex flex-col">
              <h2 className="text-sm font-bold text-card-foreground">{className || t('classroom.classroom')}</h2>
              {lessonTitle && <p className="text-xs text-muted-foreground">{lessonTitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
            <div className={`w-2.5 h-2.5 rounded-full ${teacher ? 'bg-success animate-pulse' : 'bg-chart-4'}`} />
            <span className="text-xs font-bold text-primary uppercase tracking-wide">{teacher ? t('classroom.live') : t('classroom.waiting')}</span>
          </div>
        </div>

        <div className="flex-1 bg-muted rounded-2xl shadow-xl overflow-hidden relative border-4 border-border flex items-center justify-center group">
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

              <div className="absolute bottom-4 right-4 flex gap-2 z-40 bg-background/60 p-1.5 rounded-lg backdrop-blur-sm border border-border/50">
                <button onClick={() => handleZoom(-0.25)} className="p-2 hover:bg-foreground/20 rounded text-foreground"><ZoomOut className="w-4 h-4" /></button>
                <span className="text-foreground text-xs font-mono py-2 min-w-[3ch] text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => handleZoom(0.25)} className="p-2 hover:bg-foreground/20 rounded text-foreground"><ZoomIn className="w-4 h-4" /></button>
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
                  <div className="w-32 h-32 mx-auto bg-background/50 backdrop-blur-sm rounded-full flex items-center justify-center border-2 border-border mb-4 shadow-sm">
                      <span className="text-6xl">👩‍🏫</span>
                  </div>
                  <h2 className="text-2xl font-bold text-foreground">{className || t('classroom.class')}</h2>
                  <p className="text-muted-foreground mt-2 font-medium">{t('classroom.waitingForTeacher')}</p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="h-20 bg-card rounded-2xl shadow-sm border border-border px-6 flex items-center justify-center relative">
          <div className="absolute left-6 flex items-center gap-3">
              <div className="w-16 h-10 rounded overflow-hidden border border-border relative shadow-sm">
                {localParticipant && <ParticipantTile participant={localParticipant} variant="mini" className="w-full h-full" showLabel={false} />}
              </div>
              <span className="hidden md:inline xl:hidden text-sm font-bold text-muted-foreground">{t('classroom.youShort')}</span>
              <span className="hidden xl:inline text-sm font-bold text-muted-foreground">{t('classroom.you', { role: currentUserRole || 'student' })}</span>
          </div>

          <div className="flex items-center gap-2 xl:gap-6">
              <CustomMediaToggle source={Track.Source.Microphone} iconOn={<Mic className="w-5 h-5" />} iconOff={<MicOff className="w-5 h-5" />} />
              <CustomMediaToggle source={Track.Source.Camera} iconOn={<VideoIcon className="w-5 h-5" />} iconOff={<VideoOff className="w-5 h-5" />} />
              <button 
                onClick={handleShareClick}
                disabled={waitingForApproval}
                className={`
                  w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-md border relative
                  ${isSharingLocally
                    ? 'bg-success/20 hover:bg-success/30 text-success border-success/50' 
                    : waitingForApproval 
                        ? 'bg-accent text-accent-foreground border-border cursor-wait'
                        : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground border-border'}
                `}
                title={waitingForApproval ? t('classroom.waitingForApproval') : t('classroom.shareScreen')}
              >
                {waitingForApproval ? <div className="animate-pulse"><Hand className="w-5 h-5" /></div> : <MonitorUp className="w-5 h-5" />}
              </button>
          </div>

          <button onClick={() => router.back()} className="absolute right-6 px-6 py-2.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-full font-bold text-sm flex items-center gap-2 shadow-md">
            <LogOut className="w-4 h-4" /> {t('classroom.leave')}
          </button>
        </div>
      </div>

      <div className="w-72 bg-card border-l border-border flex flex-col shadow-xl z-10">
        <div className="p-4 bg-primary text-primary-foreground text-center border-b border-border">
          <h3 className="text-xs font-bold uppercase tracking-widest">{t('classroom.classmates', { count: students.length })}</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2 bg-muted/30">
          <div className="grid grid-cols-2 gap-2">
            {students.length === 0 && <div className="col-span-2 text-center py-10 text-muted-foreground text-xs italic">{amITeacher ? t('classroom.waitingForStudents') : t('classroom.youAreFirst')}</div>}
            {students.map((p) => <ParticipantTile key={p.identity} variant="grid" participant={p} className="aspect-square rounded-lg border-2 border-border" />)}
          </div>
        </div>
        <div className="bg-accent/30 border-t border-border p-4">
           <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-bold border-2 border-border shadow-sm">T</div>
              <div><p className="text-xs font-bold text-foreground">{t('classroom.liveTutor')}</p><p className="text-[10px] text-success font-medium">● {t('classroom.online')}</p></div>
           </div>
           <button className="w-full text-left px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded flex items-center gap-2 bg-background border border-border transition-colors">
              <MessageCircle className="w-3 h-3" /> {t('classroom.chatWithTutor')}
           </button>
        </div>
      </div>
    </div>
  );
}