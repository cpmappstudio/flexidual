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
  MonitorUp, ZoomIn, ZoomOut, Move, Hand, Loader2, Eye
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo, useRef } from "react";
import { FlexidualLogo } from "../ui/flexidual-logo";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

// --- Constants ---
const SCREEN_SHARE_OPTIONS = { updateOnlyOn: [], onlySubscribed: false };
const SCREEN_SHARE_SOURCE = [Track.Source.ScreenShare];
const AUTHORITY_ROLES = ["teacher", "admin", "superadmin", "tutor", "principal"] as const;
const isAuthority = (role: string) => (AUTHORITY_ROLES as readonly string[]).includes(role);

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
  variant = "grid",
  raisedHand = false,
  onLowerHand,
  roleBadge,
  youLabel,
}: { 
  participant: Participant, 
  className?: string, 
  showLabel?: boolean,
  variant?: "grid" | "stage" | "mini",
  raisedHand?: boolean,
  onLowerHand?: () => void,
  roleBadge?: string,
  youLabel?: string,
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
      
      {showLabel && variant === "stage" ? (
        <div className="absolute bottom-3 left-3 flex items-center gap-2 z-10">
          <div className="bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center gap-2 border border-white/10 shadow-md">
            {roleBadge && (
              <span className="text-[10px] font-bold text-primary-foreground bg-primary px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0">
                {roleBadge}
              </span>
            )}
            <span className="text-sm font-bold text-white truncate max-w-[200px]">
              {participant.name || participant.identity}{participant.isLocal && youLabel && ` (${youLabel})`}
            </span>
          </div>
        </div>
      ) : showLabel ? (
        <div className="absolute bottom-1 left-1 bg-black/60 px-2 py-1 rounded text-[10px] text-white font-medium truncate max-w-[90%] backdrop-blur-sm">
          {participant.name || participant.identity}{participant.isLocal && youLabel && ` (${youLabel})`}
        </div>
      ) : null}
      {raisedHand && (
        <button
          onClick={onLowerHand}
          title={onLowerHand ? "Lower hand" : undefined}
          className={`absolute top-1 right-1 bg-amber-500 rounded-full p-0.5 shadow-sm transition-colors ${
            onLowerHand ? 'cursor-pointer hover:bg-amber-600' : 'cursor-default pointer-events-none'
          }`}
        >
          <Hand className="w-3 h-3 text-white" />
        </button>
      )}
    </div>
  );
}

const PIP_W = 192, PIP_H = 144, PIP_MARGIN = 12;

function DraggablePip({ children, containerRef }: { children: React.ReactNode; containerRef: React.RefObject<HTMLDivElement | null> }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ active: boolean; startMouse: { x: number; y: number }; startPos: { x: number; y: number } }>({
    active: false, startMouse: { x: 0, y: 0 }, startPos: { x: 0, y: 0 },
  });

  const clampPos = (x: number, y: number) => {
    const el = containerRef.current;
    if (!el) return { x, y };
    return {
      x: Math.max(PIP_MARGIN, Math.min(el.offsetWidth - PIP_W - PIP_MARGIN, x)),
      y: Math.max(PIP_MARGIN, Math.min(el.offsetHeight - PIP_H - PIP_MARGIN, y)),
    };
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setPos({ x: PIP_MARGIN, y: el.offsetHeight - PIP_H - PIP_MARGIN });
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.startMouse.x;
      const dy = e.clientY - dragRef.current.startMouse.y;
      setPos(clampPos(dragRef.current.startPos.x + dx, dragRef.current.startPos.y + dy));
    };
    const handleMouseUp = () => { dragRef.current.active = false; };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  if (!pos) return null;

  return (
    <div
      style={{ left: pos.x, top: pos.y, width: PIP_W, height: PIP_H }}
      className="absolute z-50 rounded-lg shadow-2xl overflow-hidden border-2 border-border cursor-move select-none"
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        dragRef.current = { active: true, startMouse: { x: e.clientX, y: e.clientY }, startPos: { ...pos } };
      }}
    >
      {children}
      <div className="absolute top-1 right-1 p-1 bg-background/50 rounded-full pointer-events-none">
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
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  // --- STATE ---
  const [needsClick, setNeedsClick] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [pendingRequest, setPendingRequest] = useState<ShareRequest | null>(null);
  const [waitingForApproval, setWaitingForApproval] = useState(false);
  const [presenterMode, setPresenterMode] = useState(false);
  const [adminPresenterId, setAdminPresenterId] = useState<string | null>(null);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const panDragRef = useRef<{ active: boolean; startMouse: { x: number; y: number }; startPan: { x: number; y: number } }>({
    active: false, startMouse: { x: 0, y: 0 }, startPan: { x: 0, y: 0 },
  });

  const playHandChime = () => {
    if (!amIAuthority) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const t0 = ctx.currentTime;
      [[660, 0], [880, 0.18], [1100, 0.36]].forEach(([freq, delay]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t0 + delay);
        gain.gain.linearRampToValueAtTime(0.18, t0 + delay + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + delay + 0.35);
        osc.start(t0 + delay);
        osc.stop(t0 + delay + 0.35);
      });
    } catch { /* non-critical */ }
  };

  // --- ROLE & PARTICIPANT LOGIC ---
  const amITeacher = currentUserRole === "teacher";
  const amIAuthority = currentUserRole ? isAuthority(currentUserRole) : false;
  const actualTeacher = participants.find((p) => {
    const role = p.isLocal ? currentUserRole : getRole(p);
    return role === "teacher";
  });
  const adminPresenterParticipant = adminPresenterId
    ? participants.find((p) => p.identity === adminPresenterId)
    : null;
  const isLocalAdminPresenting = amIAuthority && !amITeacher && !actualTeacher && presenterMode;
  const teacher = actualTeacher || adminPresenterParticipant || (isLocalAdminPresenting ? localParticipant : null) || undefined;
  const amIIncognito = amIAuthority && !amITeacher && !!actualTeacher;
  const students = participants.filter((p) => {
    if (p.isLocal && (amITeacher || isLocalAdminPresenting)) return false;
    const role = p.isLocal ? currentUserRole : getRole(p);
    return role === "student";
  });
  const sortedStudents = [...students].sort((a, b) => {
    const aRaised = raisedHands.has(a.identity) ? 1 : 0;
    const bRaised = raisedHands.has(b.identity) ? 1 : 0;
    return bRaised - aRaised;
  });

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
        
        if (amIAuthority && msg.type === "REQUEST_SHARE" && participant) {
          setPendingRequest({ participantId: participant.identity, name: participant.name || t('classroom.student') });
        }

        if (!amIAuthority && msg.type === "ALLOW_SHARE") {
          setWaitingForApproval(false);
          localParticipant?.setScreenShareEnabled(true, { audio: true });
          toast.success(t('classroom.permissionGranted'));
        }
        
        if (!amIAuthority && msg.type === "DENY_SHARE") {
          setWaitingForApproval(false);
          toast.error(t('classroom.permissionDenied'));
        }
        
        if (msg.type === "STOP_SHARE" && isSharingLocally) {
           localParticipant?.setScreenShareEnabled(false);
           toast.info(t('classroom.sharingStoppedByTeacher'));
        }

        if (msg.type === "RAISE_HAND" && participant) {
          setRaisedHands((prev) => new Set(prev).add(participant.identity));
          if (amIAuthority) {
            playHandChime();
            const name = participant.name || participant.identity;
            toast.custom(
              (toastId) => (
                <div className="bg-card border border-amber-400/60 rounded-xl shadow-lg p-3 w-72 flex items-start gap-3">
                  <div className="bg-amber-100 dark:bg-amber-900/40 p-2 rounded-full flex-shrink-0">
                    <Hand className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-card-foreground truncate">{name}</p>
                    <p className="text-xs text-muted-foreground">{t('classroom.raisedHand')}</p>
                  </div>
                  <button
                    onClick={async () => {
                      const encoder = new TextEncoder();
                      await room.localParticipant.publishData(
                        encoder.encode(JSON.stringify({ type: "FORCE_LOWER_HAND" })),
                        { reliable: true, destinationIdentities: [participant.identity] }
                      );
                      setRaisedHands((prev) => { const next = new Set(prev); next.delete(participant.identity); return next; });
                      toast.dismiss(toastId);
                    }}
                    className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-800/60 border border-amber-300 dark:border-amber-700 rounded-lg px-2 py-1 flex-shrink-0 transition-colors"
                  >
                    {t('classroom.lowerHand')}
                  </button>
                </div>
              ),
              { id: `hand-${participant.identity}`, duration: 8000 }
            );
          }
        }

        if (msg.type === "LOWER_HAND" && participant) {
          setRaisedHands((prev) => { const next = new Set(prev); next.delete(participant.identity); return next; });
        }

        if (msg.type === "ADMIN_PRESENTING" && participant && !amITeacher) {
          setAdminPresenterId(msg.presenting ? participant.identity : null);
        }
      } catch (e) {
        console.error("Failed to parse data message", e);
      }
    };

    room.on("dataReceived", handleData);
    return () => { room.off("dataReceived", handleData); };
  }, [room, amIAuthority, amITeacher, isSharingLocally, localParticipant, t]);

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

  const forceLowerHand = async (participantId: string) => {
    const encoder = new TextEncoder();
    const data = JSON.stringify({ type: "FORCE_LOWER_HAND" });
    await room.localParticipant.publishData(encoder.encode(data), {
      reliable: true,
      destinationIdentities: [participantId],
    });
    setRaisedHands((prev) => { const next = new Set(prev); next.delete(participantId); return next; });
  };

  const togglePresenterMode = async () => {
    const newMode = !presenterMode;
    setPresenterMode(newMode);
    const encoder = new TextEncoder();
    const data = JSON.stringify({ type: "ADMIN_PRESENTING", presenting: newMode });
    await room.localParticipant.publishData(encoder.encode(data), { reliable: true });
  };

  const handleShareClick = async () => {
  if (isSharingLocally) {
    await localParticipant?.setScreenShareEnabled(false);
    return;
  }
  if (amIAuthority) {
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

  const handleZoom = (delta: number) => setZoom(prev => {
    const next = Math.min(Math.max(prev + delta, 1), 3);
    if (next === 1) setPan({ x: 0, y: 0 });
    return next;
  });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!panDragRef.current.active || !stageRef.current) return;
      const dx = e.clientX - panDragRef.current.startMouse.x;
      const dy = e.clientY - panDragRef.current.startMouse.y;
      const { offsetWidth: W, offsetHeight: H } = stageRef.current;
      const maxX = (W * (zoom - 1)) / 2;
      const maxY = (H * (zoom - 1)) / 2;
      setPan({
        x: Math.max(-maxX, Math.min(maxX, panDragRef.current.startPan.x + dx)),
        y: Math.max(-maxY, Math.min(maxY, panDragRef.current.startPan.y + dy)),
      });
    };
    const handleMouseUp = () => { panDragRef.current.active = false; };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [zoom]);

  // --- MEDIA INIT ---
  useEffect(() => {
    const unlockAudio = async () => {
        try {
          await room.startAudio();
          if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
          audioCtxRef.current.resume().catch(() => {});
        } 
        catch { setNeedsClick(true); }
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
    if (!amITeacher && !isLocalAdminPresenting) return;
    markLive({ roomName, isLive: true });
    return () => { markLive({ roomName, isLive: false }); };
  }, [amITeacher, isLocalAdminPresenting, roomName, markLive]);

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

      {pendingRequest && amIAuthority && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[100] bg-card text-card-foreground rounded-xl shadow-2xl border border-border p-4 w-80 animate-in slide-in-from-top-4">
           <div className="flex items-start gap-3">
              <div className="bg-primary/10 p-2 rounded-full"><Hand className="w-5 h-5 text-primary" /></div>
              <div>
                 <h4 className="font-bold text-sm text-card-foreground">{t('classroom.shareRequest', { name: pendingRequest.name })}</h4>
                 <p className="text-xs text-muted-foreground mt-1">{t('classroom.shareRequestDescription')}</p>
              </div>
           </div>
           <div className="flex gap-2 mt-4">
              <button onClick={() => grantPermission(false)} className="flex-1 py-2 text-xs font-bold text-secondary-foreground bg-secondary hover:bg-secondary/80 rounded-lg">{t('classroom.deny')}</button>
              <button onClick={() => grantPermission(true)} className="flex-1 py-2 text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg">{t('classroom.allow')}</button>
           </div>
        </div>
      )}

      {amIIncognito && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[90] bg-muted text-muted-foreground rounded-full px-4 py-1.5 text-xs font-medium flex items-center gap-2 border border-border shadow-sm pointer-events-none">
          <Eye className="w-3 h-3" /> {t('classroom.observingIncognito')}
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

        <div ref={stageRef} className="flex-1 bg-muted rounded-2xl shadow-xl overflow-hidden relative border-4 border-border flex items-center justify-center group">
          {isScreenSharingActive ? (
            <>
              <div 
                key={activeScreenTrack.publication.trackSid} 
                className={`w-full h-full flex items-center justify-center origin-center bg-black relative select-none ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                onMouseDown={zoom > 1 ? (e) => {
                  e.preventDefault();
                  panDragRef.current = { active: true, startMouse: { x: e.clientX, y: e.clientY }, startPan: { ...pan } };
                } : undefined}
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
                 <DraggablePip containerRef={stageRef}>
                    <ParticipantTile participant={teacher} variant="grid" className="w-full h-full" showLabel={true} youLabel={t('classroom.youShort')} />
                 </DraggablePip>
              )}
            </>
          ) : (
            <>
              <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/chalkboard.png')]" />
              {teacher ? (
                isTeacherVideoOn ? (
                  <ParticipantTile participant={teacher} variant="stage" className="w-full h-full object-contain bg-transparent" showLabel={true} roleBadge={t('classroom.teacher')} youLabel={t('classroom.youShort')} />
                ) : (amITeacher || isLocalAdminPresenting) ? (
                  <div className="z-10 flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-300">
                      <div className="w-28 h-28 bg-success/10 rounded-full flex items-center justify-center border-4 border-success mb-6 shadow-xl animate-pulse">
                          <VideoOff className="w-12 h-12 text-success" />
                      </div>
                      <h2 className="text-3xl font-bold text-foreground">{t('classroom.youAreLive')}</h2>
                      <p className="text-muted-foreground mt-2 text-lg">{t('classroom.cameraOff')}</p>
                  </div>
                ) : (
                  <div className="z-10 flex flex-col items-center justify-center p-8">
                      <div className="w-32 h-32 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center border-4 border-white/20 mb-6 shadow-lg">
                        <span className="text-5xl font-bold text-white">{teacher.name?.charAt(0) || "T"}</span>
                      </div>
                      <h2 className="text-2xl font-bold text-foreground">{teacher.name || t('classroom.teacher')}</h2>
                      <div className="flex items-center gap-2 mt-3 bg-secondary/80 px-4 py-1.5 rounded-full border border-border">
                        <Mic className={`w-4 h-4 ${isTeacherAudioOn ? "animate-pulse text-success" : "text-destructive"}`} />
                        <span className="text-sm text-secondary-foreground font-medium">{isTeacherAudioOn ? t('classroom.audioOnly') : t('classroom.micOff')}</span>
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

          <div className="absolute right-6 flex items-center gap-2">
            {amIAuthority && !amITeacher && !actualTeacher && (
              <button
                onClick={togglePresenterMode}
                className={`px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2 shadow-sm border transition-colors ${
                  isLocalAdminPresenting
                    ? 'bg-success/10 text-success border-success/40 hover:bg-success/20'
                    : 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'
                }`}
              >
                {isLocalAdminPresenting ? t('classroom.exitPresenterRole') : t('classroom.takePresenterRole')}
              </button>
            )}
            <button onClick={() => router.back()} className="px-6 py-2.5 bg-destructive hover:bg-destructive/90 text-white rounded-full font-bold text-sm flex items-center gap-2 shadow-md">
              <LogOut className="w-4 h-4" /> {t('classroom.leave')}
            </button>
          </div>
        </div>
      </div>

      <div className="w-72 bg-card border-l border-border flex flex-col shadow-xl z-10">
        <div className="p-4 bg-primary text-primary-foreground text-center border-b border-border">
          <h3 className="text-xs font-bold uppercase tracking-widest">{t('classroom.classmates', { count: students.length })}</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2 bg-muted/30">
          <div className="grid grid-cols-2 gap-2">
            {sortedStudents.length === 0 && <div className="col-span-2 text-center py-10 text-muted-foreground text-xs italic">{(amITeacher || isLocalAdminPresenting) ? t('classroom.waitingForStudents') : t('classroom.youAreFirst')}</div>}
            {sortedStudents.map((p) => (
              <ParticipantTile
                key={p.identity}
                variant="grid"
                participant={p}
                className={`aspect-square rounded-lg border-2 ${raisedHands.has(p.identity) ? 'border-amber-500' : 'border-border'}`}
                raisedHand={raisedHands.has(p.identity)}
                onLowerHand={(amITeacher || isLocalAdminPresenting) ? () => forceLowerHand(p.identity) : undefined}
                youLabel={t('classroom.youShort')}
              />
            ))}
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