"use client";

import { useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { 
  VideoTrack,
  useLocalParticipant,
  useTrackToggle,
  useRoomContext,
  useParticipants,
  useTracks,
  RoomAudioRenderer,
  useIsSpeaking,
} from "@livekit/components-react";
import { 
  Track, 
  Participant, 
  TrackPublication, 
  RemoteParticipant,
  RemoteTrackPublication,
  RoomEvent,
} from "livekit-client";
import { 
  Mic, MicOff, Video as VideoIcon, VideoOff, LogOut, VolumeX, 
  MonitorUp, ZoomIn, ZoomOut, Move, Hand, Loader2, Eye, Crown,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  CircleDot, StopCircle, TabletSmartphone
} from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { FlexidualLogo } from "../ui/flexidual-logo";
import { SharedWhiteboard } from "./shared-whiteboard";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { QRCodeSVG } from "qrcode.react";
import { FullscreenButton, FullscreenButtonCompact } from "./fullscreen-button";

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

const getImageUrl = (p: Participant | undefined): string | null => {
  if (!p || !p.metadata) return null;
  try {
    const data = JSON.parse(p.metadata);
    return data.imageUrl || null;
  } catch {
    return null;
  }
};

// --- Helper Components ---
function CustomMediaToggle({ source, iconOn, iconOff, compact = false }: { 
  source: Track.Source.Camera | Track.Source.Microphone | Track.Source.ScreenShare, 
  iconOn: React.ReactNode, 
  iconOff: React.ReactNode,
  compact?: boolean,
}) {
  const { toggle, enabled, pending } = useTrackToggle({ source });
  const { localParticipant } = useLocalParticipant();

  const handleToggle = async () => {
    try {
      await toggle();
      // Release camera hardware when disabling so other apps can use the device
      if (enabled && source === Track.Source.Camera) {
        localParticipant
          .getTrackPublication(Track.Source.Camera)
          ?.track?.mediaStreamTrack?.stop();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <button 
      onClick={handleToggle}
      disabled={pending}
      className={`
        ${compact ? 'w-11 h-11' : 'w-12 h-12'} rounded-full flex items-center justify-center transition-all shadow-md border
        ${enabled 
          ? compact
            ? 'bg-white/20 text-white border-white/30 hover:bg-white/30'
            : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground border-border'
          : compact
            ? 'bg-red-500/50 text-white border-red-400/60'
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
  audioMuted = false,
}: { 
  participant: Participant, 
  className?: string, 
  showLabel?: boolean,
  variant?: "grid" | "stage" | "mini",
  raisedHand?: boolean,
  onLowerHand?: () => void,
  roleBadge?: string,
  youLabel?: string,
  audioMuted?: boolean,
}) {
  const cameraTrack = participant.getTrackPublication(Track.Source.Camera);
  const isSpeaking = useIsSpeaking(participant);
  const isVideoEnabled = cameraTrack && cameraTrack.isSubscribed && !cameraTrack.isMuted;
  const imageUrl = getImageUrl(participant);

  const avatarSize = variant === "stage" ? "w-32 h-32 text-6xl" : variant === "mini" ? "w-8 h-8 text-xs" : "w-16 h-16 text-2xl";
  const borderSize = variant === "mini" ? "border-1" : "border-2";

  return (
    <div className={`relative bg-muted overflow-hidden transition-all duration-300 ${isSpeaking ? "ring-4 ring-success shadow-[0_0_15px_rgba(34,197,94,0.4)] z-20" : ""} ${className}`}>
      {isVideoEnabled ? (
        <VideoTrack 
          trackRef={{ participant, source: Track.Source.Camera, publication: cameraTrack as TrackPublication }} 
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-secondary">
          <div className={`${avatarSize} rounded-full flex items-center justify-center font-bold text-white ${borderSize} border-white/10 shadow-xl overflow-hidden bg-gradient-to-tr from-yellow-500 to-orange-500 transition-all`}>
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={participant.name || participant.identity} className="w-full h-full object-cover" />
            ) : (
              participant.name?.charAt(0).toUpperCase() || participant.identity?.charAt(0).toUpperCase() || "?"
            )}
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
      {audioMuted && (
        <div className={`absolute pointer-events-none bg-destructive/80 rounded-full shadow-sm ${
          variant === "stage" ? "bottom-3 right-3 p-1.5" : "bottom-1 right-1 p-1"
        }`}>
          <MicOff className={`text-white ${variant === "stage" ? "w-4 h-4" : "w-3 h-3"}`} />
        </div>
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

  // Re-clamp position whenever the container is resized (e.g. orientation change)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setPos(prev => {
        if (!prev) return prev;
        return {
          x: Math.max(PIP_MARGIN, Math.min(el.offsetWidth - PIP_W - PIP_MARGIN, prev.x)),
          y: Math.max(PIP_MARGIN, Math.min(el.offsetHeight - PIP_H - PIP_MARGIN, prev.y)),
        };
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.startMouse.x;
      const dy = e.clientY - dragRef.current.startMouse.y;
      setPos(clampPos(dragRef.current.startPos.x + dx, dragRef.current.startPos.y + dy));
    };
    const handleMouseUp = () => { dragRef.current.active = false; };
    const handleTouchMove = (e: TouchEvent) => {
      if (!dragRef.current.active) return;
      e.preventDefault();
      const touch = e.touches[0];
      const dx = touch.clientX - dragRef.current.startMouse.x;
      const dy = touch.clientY - dragRef.current.startMouse.y;
      setPos(clampPos(dragRef.current.startPos.x + dx, dragRef.current.startPos.y + dy));
    };
    const handleTouchEnd = () => { dragRef.current.active = false; };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
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
      onTouchStart={(e) => {
        const touch = e.touches[0];
        dragRef.current = { active: true, startMouse: { x: touch.clientX, y: touch.clientY }, startPos: { ...pos } };
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
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export function ActiveClassroomUI({ currentUserRole, roomName, className, lessonTitle, isFullscreen = false, onToggleFullscreen }: ActiveClassroomUIProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const room = useRoomContext();

  const [companionUrl, setCompanionUrl] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setCompanionUrl(`${window.location.origin}${pathname}?companion=true`);
    }
  }, [pathname]);
  const markLive = useMutation(api.schedule.markLive);
  const toggleRecording = useAction(api.livekit.toggleRecording);
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  // --- STATE ---
  const [needsClick, setNeedsClick] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [pendingRequest, setPendingRequest] = useState<ShareRequest | null>(null);
  const [waitingForApproval, setWaitingForApproval] = useState(false);
  const [shareApproved, setShareApproved] = useState(false);
  const [presenterMode, setPresenterMode] = useState(false);
  const [adminPresenterId, setAdminPresenterId] = useState<string | null>(null);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [classmatesCanScrollPrev, setClassmatesCanScrollPrev] = useState(false);
  const [classmatesCanScrollNext, setClassmatesCanScrollNext] = useState(false);
  const [isPhoneLandscape, setIsPhoneLandscape] = useState(false);
  const [stageControlsVisible, setStageControlsVisible] = useState(true);
  const [isRecording, setIsRecording] = useState(room.isRecording);
  const [showRecordConfirm, setShowRecordConfirm] = useState(false);
  const [isTogglingRecord, setIsTogglingRecord] = useState(false);
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
  const stageControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const classmateTilesRef = useRef<HTMLDivElement>(null);
  const panDragRef = useRef<{ active: boolean; startMouse: { x: number; y: number }; startPan: { x: number; y: number } }>({
    active: false, startMouse: { x: 0, y: 0 }, startPan: { x: 0, y: 0 },
  });

  const updateClassmatesScroll = useCallback(() => {
    const el = classmateTilesRef.current;
    if (!el) return;
    setClassmatesCanScrollPrev(el.scrollTop > 4 || el.scrollLeft > 4);
    setClassmatesCanScrollNext(
      (el.scrollHeight - el.scrollTop - el.clientHeight > 4) ||
      (el.scrollWidth - el.scrollLeft - el.clientWidth > 4)
    );
  }, []);

  const showStageControls = useCallback(() => {
    setStageControlsVisible(true);
    if (stageControlsTimerRef.current) clearTimeout(stageControlsTimerRef.current);
    stageControlsTimerRef.current = setTimeout(() => setStageControlsVisible(false), 3000);
  }, []);

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
  const sortedStudents = useMemo(() => {
    const raisedHandsQueue = Array.from(raisedHands);
    return [...students].sort((a, b) => {
      const aRaised = raisedHands.has(a.identity);
      const bRaised = raisedHands.has(b.identity);
      if (aRaised && bRaised) return raisedHandsQueue.indexOf(a.identity) - raisedHandsQueue.indexOf(b.identity);
      if (aRaised) return -1;
      if (bRaised) return 1;
      return (a.name || a.identity).localeCompare(b.name || b.identity);
    });
  }, [students, raisedHands]);

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
          setShareApproved(true); // requires a user gesture click to actually start — see handleShareClick
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
          toast.dismiss(`hand-${participant.identity}`);
        }

        if (msg.type === "ADMIN_PRESENTING" && participant && !amITeacher) {
          setAdminPresenterId(msg.presenting ? participant.identity : null);
        }

        if (msg.type === "WHITEBOARD_STATE") {
          setIsWhiteboardActive(msg.active);
          if (msg.active) {
            toast.success(t('classroom.whiteboardStarted') || "Whiteboard started");
          } else {
            toast.info(t('classroom.whiteboardStopped') || "Whiteboard stopped");
          }
        }
      } catch (e) {
        console.error("Failed to parse data message", e);
      }
    };

    room.on("dataReceived", handleData);
    return () => { room.off("dataReceived", handleData); };
  }, [room, amIAuthority, amITeacher, isSharingLocally, localParticipant, t]);

  useEffect(() => {
    const handleMediaError = (error: Error) => {
      if (error.message?.includes('Device in use') || error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        toast.error(t('classroom.cameraInUse'));
      } else {
        console.error('Room media devices error:', error);
      }
    };
    room.on(RoomEvent.MediaDevicesError, handleMediaError);
    return () => { room.off(RoomEvent.MediaDevicesError, handleMediaError); };
  }, [room, t]);

  useEffect(() => {
    setIsRecording(room.isRecording);

    const handleRecordingChange = (recording: boolean) => setIsRecording(recording);
    room.on(RoomEvent.RecordingStatusChanged, handleRecordingChange);
    
    return () => { room.off(RoomEvent.RecordingStatusChanged, handleRecordingChange); };
  }, [room, room.isRecording]);

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
    toast.dismiss(`hand-${participantId}`);
  };

  const togglePresenterMode = async () => {
    const newMode = !presenterMode;
    setPresenterMode(newMode);
    const encoder = new TextEncoder();
    const data = JSON.stringify({ type: "ADMIN_PRESENTING", presenting: newMode });
    await room.localParticipant.publishData(encoder.encode(data), { reliable: true });
  };

  const handleShareClick = async () => {
    // Pre-flight: Fail fast before allowing any state changes or requests
    if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
      toast.error(t('classroom.screenShareNotSupported'));
      return;
    }

    if (isSharingLocally) {
      await localParticipant?.setScreenShareEnabled(false);
      setShareApproved(false);
      return;
    }

    // Non-authority without approval: request it and wait for a second click
    if (!amIAuthority && !shareApproved) {
      requestPermission();
      return;
    }

    // Consume approval before the async call so double-clicks don't re-enter
    setShareApproved(false);

    try {
      await localParticipant?.setScreenShareEnabled(true, { audio: true });
    } catch (error) {
      const err = error as Error;
      // User cancelled the picker — nothing to do
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) return;
      // Any other error (NotSupportedError from audio constraint, codec issues, etc.):
      // retry without audio. If audio: true threw before showing the picker, the user
      // activation is still live so this call can succeed (feature detection, not UA sniffing).
      try {
        await localParticipant?.setScreenShareEnabled(true, { audio: false });
        toast.warning(t('classroom.screenShareAudioNotSupported'));
      } catch {
        // Both attempts failed — screen sharing is not supported on this device/browser
        toast.error(t('classroom.screenShareNotSupported'));
      }
    }
  };

  const handleRecordClick = () => {
    if (!amIAuthority) return;
    if (isRecording) {
      executeRecordingToggle(false);
    } else {
      setShowRecordConfirm(true);
    }
  };

  const handleLeaveClick = () => {
    // If an authority explicitly clicks leave while recording, ensure we stop the egress
    if (amIAuthority && isRecording) {
      // We fire this and intentionally DO NOT await it, 
      // so the teacher routes back instantly without being held hostage by the network request.
      toggleRecording({ 
        roomName, 
        start: false, 
        filePrefix: "" // Prefix doesn't matter for stopping
      }).catch(console.error);
    }
    
    // Route back immediately
    router.back();
  };

  const executeRecordingToggle = async (start: boolean) => {
    if (isTogglingRecord) return;
    setIsTogglingRecord(true);
    try {
      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const cleanClassName = (className || 'Class').replace(/\s+/g, '-');
      const cleanLesson = (lessonTitle || 'Lesson').replace(/\s+/g, '-');
      const uniqueSuffix = Date.now();

      // Store the result of the mutation
      const result = await toggleRecording({
        roomName,
        start,
        filePrefix: `${dateStr}_${cleanClassName}_${cleanLesson}_${roomName}_${uniqueSuffix}`,
      });
      
      // If the backend guard blocked it, show the error and stop
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      
      toast.success(start ? t('classroom.recordingStarted') : t('classroom.recordingStopped'));
    } catch {
      toast.error(t('classroom.recordingError'));
    } finally {
      setIsTogglingRecord(false);
      setShowRecordConfirm(false);
    }
  };

  const handleZoom = (delta: number) => setZoom(prev => {
    const next = Math.min(Math.max(prev + delta, 1), 3);
    if (next === 1) setPan({ x: 0, y: 0 });
    return next;
  });

  useEffect(() => {
    const applyDrag = (clientX: number, clientY: number) => {
      if (!panDragRef.current.active || !stageRef.current) return;
      const dx = clientX - panDragRef.current.startMouse.x;
      const dy = clientY - panDragRef.current.startMouse.y;
      const { offsetWidth: W, offsetHeight: H } = stageRef.current;
      const maxX = (W * (zoom - 1)) / 2;
      const maxY = (H * (zoom - 1)) / 2;
      setPan({
        x: Math.max(-maxX, Math.min(maxX, panDragRef.current.startPan.x + dx)),
        y: Math.max(-maxY, Math.min(maxY, panDragRef.current.startPan.y + dy)),
      });
    };
    const handleMouseMove = (e: MouseEvent) => applyDrag(e.clientX, e.clientY);
    const handleMouseUp = () => { panDragRef.current.active = false; };
    const handleTouchMove = (e: TouchEvent) => { e.preventDefault(); applyDrag(e.touches[0].clientX, e.touches[0].clientY); };
    const handleTouchEnd = () => { panDragRef.current.active = false; };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
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
    // Authority non-teachers join with audio=false/video=false at the LiveKitRoom level,
    // so no media is ever captured. Nothing to do here for them.
    if (amIAuthority && !amITeacher) return;
    const initMedia = async () => {
      try { await localParticipant.setMicrophoneEnabled(true); } catch (error) { console.error("Failed to enable microphone:", error); }
      try { await localParticipant.setCameraEnabled(true); } catch (error) {
        console.error("Failed to enable camera:", error);
      }
    };
    initMedia();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localParticipant]); // intentionally run once on join

  // When an admin takes the presenter role, enable their media
  useEffect(() => {
    if (!localParticipant || !isLocalAdminPresenting) return;
    localParticipant.setMicrophoneEnabled(true).catch(() => {});
    localParticipant.setCameraEnabled(true).catch(() => {});
  }, [localParticipant, isLocalAdminPresenting]);

  // Classmates scroll overflow detection
  useEffect(() => {
    const el = classmateTilesRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateClassmatesScroll, { passive: true });
    updateClassmatesScroll();
    return () => el.removeEventListener('scroll', updateClassmatesScroll);
  }, [updateClassmatesScroll]);

  useEffect(() => { updateClassmatesScroll(); }, [sortedStudents.length, updateClassmatesScroll]);

  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape) and (max-height: 500px)');
    const handle = () => setIsPhoneLandscape(mq.matches);
    handle();
    mq.addEventListener('change', handle);
    return () => {
      mq.removeEventListener('change', handle);
      if (stageControlsTimerRef.current) clearTimeout(stageControlsTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isPhoneLandscape) showStageControls();
  }, [isPhoneLandscape, showStageControls]);

  useEffect(() => {
    if (!amITeacher && !isLocalAdminPresenting) return;
    markLive({ roomName, isLive: true });
    return () => { markLive({ roomName, isLive: false }); };
  }, [amITeacher, isLocalAdminPresenting, roomName, markLive]);

  return (
    <div ref={rootRef} className="grid h-full w-full bg-background overflow-hidden font-sans text-foreground relative grid-cols-1 grid-rows-[min-content_1fr_min-content_min-content] landscape:grid-cols-[1fr_280px] landscape:grid-rows-[min-content_1fr_min-content] xl:grid-cols-[1fr_320px] xl:grid-rows-[min-content_1fr_min-content]">
      <RoomAudioRenderer />

      <AlertDialog open={showRecordConfirm} onOpenChange={setShowRecordConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('classroom.startRecordingTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('classroom.startRecordingDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => executeRecordingToggle(true)}
              disabled={isTogglingRecord}
            >
              {isTogglingRecord ? <Loader2 className="w-4 h-4 animate-spin" /> : t('classroom.confirmStart')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* 1. Header Row */}
      <div className={`col-start-1 row-start-1 z-10 flex flex-col ${isPhoneLandscape ? '' : 'p-3 md:p-4 pb-2 md:pb-0 justify-end'}`}>
        {isPhoneLandscape ? (
          <div className="flex items-center gap-2 px-2 py-1 bg-card/90 backdrop-blur-md border-b border-border">
            <FlexidualLogo stacked className="h-6 w-6 flex-shrink-0" />
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
              <span className="text-xs font-bold text-card-foreground truncate">{className || t('classroom.classroom')}</span>
              {lessonTitle && <span className="text-[10px] text-muted-foreground truncate">&middot; {lessonTitle}</span>}
            </div>
            {isRecording && (
              <div className="flex items-center gap-1 bg-red-500/10 px-1.5 py-0.5 rounded-full border border-red-500/20 flex-shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[9px] font-bold text-red-500 uppercase tracking-wide">REC</span>
              </div>
            )}
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border flex-shrink-0 ${teacher ? 'bg-green-500/20 border-green-400/30' : 'bg-orange-500/20 border-orange-400/30'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${teacher ? 'bg-green-500 dark:bg-green-400 animate-pulse' : 'bg-orange-500 dark:bg-orange-400'}`} />
              <span className="text-[9px] font-bold text-foreground/70 uppercase tracking-wide">{teacher ? t('classroom.live') : t('classroom.waiting')}</span>
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-center bg-card p-3 rounded-xl shadow-sm border border-border">
            <div className="flex items-center gap-3">
              <FlexidualLogo />
              <div className="flex flex-col">
                <h2 className="text-sm font-bold text-card-foreground">{className || t('classroom.classroom')}</h2>
                {lessonTitle && <p className="text-xs text-muted-foreground">{lessonTitle}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isRecording && (
                <div className="flex items-center gap-1.5 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-bold text-red-500 uppercase tracking-wide">REC</span>
                </div>
              )}
              <div className="flex items-center gap-2 bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                <div className={`w-2.5 h-2.5 rounded-full ${teacher ? 'bg-success animate-pulse' : 'bg-chart-4'}`} />
                <span className="text-xs font-bold text-primary uppercase tracking-wide">{teacher ? t('classroom.live') : t('classroom.waiting')}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Stage Row */}
      <div className={`col-start-1 row-start-2 min-h-0 z-10 flex flex-col relative ${isPhoneLandscape ? 'p-1' : 'p-3 md:p-4 py-2 md:py-4'}`}>
        <div ref={stageRef} className="flex-1 bg-muted rounded-2xl shadow-xl overflow-hidden relative border-4 border-border flex items-center justify-center group min-h-0">
          {amIIncognito && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-black/60 text-white backdrop-blur-sm rounded-full px-3 py-1 text-xs font-medium flex items-center gap-1.5 shadow-sm pointer-events-none">
              <Eye className="w-3 h-3 shrink-0" /> {t('classroom.observingIncognito')}
            </div>
          )}
          {isWhiteboardActive ? (
            <>
              <div className="w-full h-full relative rounded-xl overflow-hidden">
                <SharedWhiteboard roomName={roomName} isReadonly={true} />
              </div>
            </>
          ) : isScreenSharingActive ? (
            <>
              <div
                key={activeScreenTrack.publication.trackSid}
                className={`w-full h-full flex items-center justify-center origin-center bg-black relative select-none ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                onMouseDown={zoom > 1 ? (e) => {
                  e.preventDefault();
                  showStageControls();
                  panDragRef.current = { active: true, startMouse: { x: e.clientX, y: e.clientY }, startPan: { ...pan } };
                } : undefined}
                onTouchStart={zoom > 1 ? (e) => {
                  showStageControls();
                  const touch = e.touches[0];
                  panDragRef.current = { active: true, startMouse: { x: touch.clientX, y: touch.clientY }, startPan: { ...pan } };
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

              <div className={`absolute top-4 right-4 flex gap-2 z-40 bg-background/60 p-1.5 rounded-lg backdrop-blur-sm border border-border/50 transition-all duration-300 ${isPhoneLandscape && !stageControlsVisible ? 'opacity-0 -translate-y-2 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
                <button onClick={() => handleZoom(-0.25)} className="p-2 hover:bg-foreground/20 rounded text-foreground"><ZoomOut className="w-4 h-4" /></button>
                <span className="text-foreground text-xs font-mono py-2 min-w-[3ch] text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => handleZoom(0.25)} className="p-2 hover:bg-foreground/20 rounded text-foreground"><ZoomIn className="w-4 h-4" /></button>
              </div>

            </>
          ) : (
            <>
              <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/chalkboard.png')]" />
              {teacher ? (
                isTeacherVideoOn ? (
                  <ParticipantTile participant={teacher} variant="stage" className="w-full h-full object-contain bg-transparent" showLabel={true} roleBadge={t('classroom.teacher')} youLabel={t('classroom.youShort')} audioMuted={!isTeacherAudioOn} />
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
                      <div className="w-32 h-32 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center border-2 border-white/20 mb-6 shadow-lg overflow-hidden">
                        {getImageUrl(teacher) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={getImageUrl(teacher)!} alt={teacher.name || ""} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-5xl font-bold text-white">{teacher.name?.charAt(0) || "T"}</span>
                        )}
                      </div>
                      <h2 className="text-2xl font-bold text-foreground">{teacher.name || t('classroom.teacher')}</h2>
                      <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                        <div className="bg-secondary/80 px-3 py-1.5 rounded-full border border-border flex items-center gap-1.5">
                          <VideoOff className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm text-secondary-foreground font-medium">{t('classroom.cameraOffLabel')}</span>
                        </div>
                        <div className={`px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${
                          isTeacherAudioOn ? 'bg-secondary/80 border-border' : 'bg-destructive/10 border-destructive/20'
                        }`}>
                          <Mic className={`w-4 h-4 ${isTeacherAudioOn ? 'animate-pulse text-success' : 'text-destructive'}`} />
                          <span className="text-sm font-medium text-secondary-foreground">{isTeacherAudioOn ? t('classroom.audioOnly') : t('classroom.micOff')}</span>
                        </div>
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

          {/* Phone landscape: tap zone to reveal floating controls */}
          {isPhoneLandscape && (
            <div
              className="absolute inset-0 z-[25]"
              style={{ pointerEvents: zoom > 1 ? 'none' : 'auto' }}
              onTouchStart={(e) => { stageTouchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
              onTouchEnd={(e) => {
                if (!stageTouchStartRef.current) return;
                const dx = Math.abs(e.changedTouches[0].clientX - stageTouchStartRef.current.x);
                const dy = Math.abs(e.changedTouches[0].clientY - stageTouchStartRef.current.y);
                stageTouchStartRef.current = null;
                if (dx < 8 && dy < 8) showStageControls();
              }}
              onClick={showStageControls}
            />
          )}
          {/* Phone landscape: floating controls overlay — auto-hides after 3s, reveals on tap */}
          {isPhoneLandscape && (
            <div
              className={`absolute inset-x-0 bottom-3 z-[35] flex items-center justify-center pointer-events-none transition-all duration-300 ${
                stageControlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
              }`}
            >
              <div
                className="flex items-center gap-2 bg-black/60 backdrop-blur-md rounded-full px-4 py-2.5 border border-white/20 shadow-2xl pointer-events-auto"
                onClick={showStageControls}
              >
                {amIAuthority && !amITeacher && !actualTeacher && (
                  <button
                    onClick={togglePresenterMode}
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-lg border-2 ${
                      isLocalAdminPresenting
                        ? 'bg-green-500/80 text-white border-green-400'
                        : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                    }`}
                  >
                    <Crown className="w-5 h-5" />
                  </button>
                )}
                <CustomMediaToggle compact source={Track.Source.Microphone} iconOn={<Mic className="w-5 h-5" />} iconOff={<MicOff className="w-5 h-5" />} />
                {!amIIncognito && (
                  <CustomMediaToggle compact source={Track.Source.Camera} iconOn={<VideoIcon className="w-5 h-5" />} iconOff={<VideoOff className="w-5 h-5" />} />
                )}
                <button
                  onClick={handleShareClick}
                  disabled={waitingForApproval}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-lg border-2 ${
                    isSharingLocally
                      ? 'bg-green-500/80 text-white border-green-400'
                      : shareApproved
                        ? 'bg-blue-500/80 text-white border-blue-400 animate-pulse'
                        : waitingForApproval
                          ? 'bg-yellow-500/80 text-white border-yellow-400 cursor-wait'
                          : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                  }`}
                >
                  {waitingForApproval ? <Hand className="w-5 h-5 animate-pulse" /> : <MonitorUp className="w-5 h-5" />}
                </button>
                {amIAuthority && (
                  <button
                    onClick={handleRecordClick}
                    disabled={isTogglingRecord}
                    title={isRecording ? t('classroom.stopRecording') : t('classroom.startRecording')}
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-lg border-2 ${
                      isRecording
                        ? 'bg-red-500/80 text-white border-red-400 animate-pulse'
                        : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                    } ${isTogglingRecord ? 'opacity-50 cursor-wait' : ''}`}
                  >
                    {isTogglingRecord ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : isRecording ? (
                      <StopCircle className="w-5 h-5" />
                    ) : (
                      <CircleDot className="w-5 h-5" />
                    )}
                  </button>
                )}
                <div className="w-px h-6 bg-white/30 mx-1" />
                {onToggleFullscreen && (
                  <FullscreenButtonCompact isFullscreen={isFullscreen} onToggle={onToggleFullscreen} />
                )}
                <div className="w-px h-6 bg-white/30 mx-1" />
                <button
                  onClick={handleLeaveClick}
                  className="w-11 h-11 rounded-full bg-red-500/80 hover:bg-red-600/80 text-white flex items-center justify-center shadow-lg border-2 border-red-400/60 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Meeting Controls (row 4 on mobile, row 3 on md+) — hidden in phone landscape */}
      <div className={`col-start-1 row-start-4 landscape:col-start-1 landscape:row-start-3 xl:col-start-1 xl:row-start-3 p-3 md:p-4 pt-2 md:pt-0 z-10 ${isPhoneLandscape ? 'hidden' : ''}`}>
        <div className="h-20 bg-card rounded-2xl shadow-sm border border-border px-4 flex items-center">
          {/* Left spacer — presenter toggle when applicable */}
          <div className="flex-1 flex items-center">
            {amIAuthority && !amITeacher && !actualTeacher && (
              <button
                onClick={togglePresenterMode}
                title={isLocalAdminPresenting ? t('classroom.exitPresenterRole') : t('classroom.takePresenterRole')}
                className={`flex items-center gap-2 rounded-full px-2.5 lg:px-4 h-10 shadow-sm border transition-colors text-xs font-bold ${
                  isLocalAdminPresenting
                    ? 'bg-success/10 text-success border-success/40 hover:bg-success/20'
                    : 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'
                }`}
              >
                <Crown className="w-4 h-4 shrink-0" />
                <span className="hidden lg:inline whitespace-nowrap">
                  {isLocalAdminPresenting ? t('classroom.exitPresenterRole') : t('classroom.takePresenterRole')}
                </span>
              </button>
            )}
          </div>
          {/* Centered media controls */}
          <div className="flex items-center gap-2">
            <CustomMediaToggle source={Track.Source.Microphone} iconOn={<Mic className="w-5 h-5" />} iconOff={<MicOff className="w-5 h-5" />} />
            {!amIIncognito && (
              <CustomMediaToggle source={Track.Source.Camera} iconOn={<VideoIcon className="w-5 h-5" />} iconOff={<VideoOff className="w-5 h-5" />} />
            )}
            {amIAuthority && (
              <Dialog>
                <DialogTrigger asChild>
                  <button
                    title={t('classroom.connectTablet') || "Connect Tablet"}
                    className="w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-md border bg-secondary hover:bg-secondary/80 text-secondary-foreground border-border"
                  >
                    <TabletSmartphone className="w-5 h-5" />
                  </button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-xl">{t('classroom.connectTablet') || "Connect Companion Tablet"}</DialogTitle>
                    <DialogDescription>
                      {t('classroom.connectTabletDesc') || "Scan this QR code with your iPad or Android tablet to open the interactive whiteboard."}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col items-center justify-center p-6 bg-white rounded-xl shadow-inner my-4">
                    {companionUrl ? (
                      <QRCodeSVG value={companionUrl} size={220} level="M" includeMargin={true} />
                    ) : (
                      <div className="w-[220px] h-[220px] flex items-center justify-center bg-muted animate-pulse rounded-lg" />
                    )}
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground break-all bg-muted p-3 rounded-lg border border-border/50 font-mono select-all">
                      {companionUrl}
                    </p>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            <button
              onClick={handleShareClick}
              disabled={waitingForApproval}
              className={`
                w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-md border relative
                ${isSharingLocally
                  ? 'bg-success/20 hover:bg-success/30 text-success border-success/50'
                  : shareApproved
                    ? 'bg-primary/20 hover:bg-primary/30 text-primary border-primary/50 animate-pulse'
                    : waitingForApproval
                      ? 'bg-accent text-accent-foreground border-border cursor-wait'
                      : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground border-border'}
              `}
              title={waitingForApproval ? t('classroom.waitingForApproval') : t('classroom.shareScreen')}
            >
              {waitingForApproval
                ? <div className="animate-pulse"><Hand className="w-5 h-5" /></div>
                : <MonitorUp className="w-5 h-5" />}
            </button>
            {amIAuthority && (
              <button
                onClick={handleRecordClick}
                title={isRecording ? t('classroom.stopRecording') : t('classroom.startRecording')}
                className={`
                  w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-md border
                  ${isRecording
                    ? 'bg-red-500/20 hover:bg-red-500/30 text-red-500 border-red-500/50 animate-pulse'
                    : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground border-border'}
                `}
              >
                {isRecording ? <StopCircle className="w-5 h-5" /> : <CircleDot className="w-5 h-5" />}
              </button>
            )}
          </div>
          {/* Right spacer — icon-only Leave */}
          <div className="flex-1 flex items-center justify-end gap-2">
            {onToggleFullscreen && (
              <FullscreenButton isFullscreen={isFullscreen} onToggle={onToggleFullscreen} />
            )}
            <button
              onClick={handleLeaveClick}
              title={t('classroom.leave')}
              className="w-12 h-12 rounded-full bg-destructive hover:bg-destructive/90 text-white flex items-center justify-center shadow-md transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. Classmates Sidebar (row 3 on mobile, right column on md+) */}
      <div className="col-start-1 row-start-3 landscape:col-start-2 landscape:row-start-1 landscape:row-span-3 xl:col-start-2 xl:row-start-1 xl:row-span-3 flex flex-col bg-card border-border shadow-xl z-20 border-y landscape:border-y-0 landscape:border-l xl:border-y-0 xl:border-l h-36 landscape:h-full xl:h-full overflow-hidden">

        {/* Header + nav arrows */}
        <div className="bg-primary text-primary-foreground flex items-center gap-2 px-3 py-1.5 md:py-2.5 border-b border-border flex-shrink-0">
          <h3 className="flex-1 text-xs font-bold uppercase tracking-widest truncate">
            {t('classroom.classmates', { count: students.length })}
          </h3>
          {(classmatesCanScrollPrev || classmatesCanScrollNext) && (
            <>
              <div className="hidden md:flex landscape:flex items-center gap-0.5">
                <button onClick={() => classmateTilesRef.current?.scrollBy({ top: -160, behavior: 'smooth' })} disabled={!classmatesCanScrollPrev} className="p-1 rounded hover:bg-white/20 transition-colors disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                <button onClick={() => classmateTilesRef.current?.scrollBy({ top: 160, behavior: 'smooth' })} disabled={!classmatesCanScrollNext} className="p-1 rounded hover:bg-white/20 transition-colors disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex md:hidden landscape:hidden items-center gap-0.5">
                <button onClick={() => classmateTilesRef.current?.scrollBy({ left: -160, behavior: 'smooth' })} disabled={!classmatesCanScrollPrev} className="p-1 rounded hover:bg-white/20 transition-colors disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /></button>
                <button onClick={() => classmateTilesRef.current?.scrollBy({ left: 160, behavior: 'smooth' })} disabled={!classmatesCanScrollNext} className="p-1 rounded hover:bg-white/20 transition-colors disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
            </>
          )}
        </div>

        {/* Responsive Tiles Auto-Grid */}
        <div
          ref={classmateTilesRef}
          className="flex-1 min-h-0 min-w-0 bg-muted/30 p-2 md:p-3 gap-2 md:gap-3 flex flex-row items-start overflow-x-auto overflow-y-hidden snap-x snap-mandatory landscape:grid landscape:grid-cols-[repeat(auto-fill,minmax(110px,1fr))] landscape:auto-rows-max landscape:overflow-y-auto landscape:overflow-x-hidden landscape:snap-y landscape:content-start landscape:items-start scrollbar-thin"
        >
          {sortedStudents.length === 0 && (
            <div className="md:col-span-full landscape:col-span-full flex items-center justify-center w-full text-muted-foreground text-xs italic text-center px-2 whitespace-nowrap md:whitespace-normal h-full">
              {(amITeacher || isLocalAdminPresenting) ? t('classroom.waitingForStudents') : t('classroom.youAreFirst')}
            </div>
          )}
          {sortedStudents.map((p) => (
            <ParticipantTile
              key={p.identity}
              variant="grid"
              participant={p}
              className={`flex-shrink-0 rounded-xl landscape:rounded-2xl border-2 overflow-hidden aspect-square w-24 h-24 sm:w-28 sm:h-28 landscape:w-full landscape:h-auto snap-start snap-always
                ${raisedHands.has(p.identity) ? 'border-amber-500 shadow-[0_0_8px_2px] shadow-amber-500/40' : 'border-border'}`}
              raisedHand={raisedHands.has(p.identity)}
              onLowerHand={(amITeacher || isLocalAdminPresenting) ? () => forceLowerHand(p.identity) : undefined}
              youLabel={t('classroom.youShort')}
            />
          ))}
        </div>
      </div>

      {/* Teacher PiP — floats over the entire classroom during whiteboard & screen share */}
      {(isWhiteboardActive || isScreenSharingActive) && teacher && isTeacherVideoOn && (
        <DraggablePip containerRef={rootRef}>
          <ParticipantTile participant={teacher} variant="grid" className="w-full h-full" showLabel={true} youLabel={t('classroom.youShort')} />
        </DraggablePip>
      )}
    </div>
  );
}