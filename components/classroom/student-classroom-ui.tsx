"use client";

import { 
  VideoTrack,
  useLocalParticipant,
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
  Mic, MicOff, Video as VideoIcon, VideoOff, Loader2, VolumeX,
  ZoomIn, ZoomOut, Move,
  MonitorUp, Hand, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Eye, EyeOff, Maximize2, Minimize2
} from "lucide-react";
import { SharedWhiteboard } from "./shared-whiteboard";
import { LeaveClassButton } from "./leave-class-button";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { FullscreenButtonCompact } from "./fullscreen-button";
import { DeviceToggleButton } from "./device-toggle-button";
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

const isAuthority = (role: string) =>
  role === "teacher" || role === "admin";

const getImageUrl = (p: Participant | undefined): string | null => {
  if (!p || !p.metadata) return null;
  try {
    const data = JSON.parse(p.metadata);
    return data.imageUrl || null;
  } catch {
    return null;
  }
};

// Helper Components
function ParticipantTile({ 
  participant, 
  className, 
  showLabel = true,
  variant = "grid",
  raisedHand = false,
  roleBadge,
  youLabel,
  audioMuted = false,
}: { 
  participant: Participant, 
  className?: string, 
  showLabel?: boolean,
  variant?: "grid" | "stage" | "mini",
  raisedHand?: boolean,
  roleBadge?: string,
  youLabel?: string,
  audioMuted?: boolean,
}) {
  const cameraTrack = participant.getTrackPublication(Track.Source.Camera);
  const isSpeaking = useIsSpeaking(participant);
  const isVideoEnabled = cameraTrack && cameraTrack.isSubscribed && !cameraTrack.isMuted;
  const imageUrl = getImageUrl(participant);

  const avatarSize = variant === "stage" ? "w-32 h-32 text-6xl" : variant === "mini" ? "w-8 h-8 text-xs" : "w-16 h-16 text-2xl";
  const borderSize = variant === "mini" ? "border-2" : "border-4";

  return (
    <div className={`relative bg-inverse overflow-hidden transition-all duration-300 ${isSpeaking ? "ring-4 ring-success shadow-[0_0_15px] shadow-success/40 z-20" : ""} ${className}`}>
      {isVideoEnabled ? (
        <VideoTrack 
          trackRef={{ participant, source: Track.Source.Camera, publication: cameraTrack as TrackPublication }} 
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-secondary">
          <div className={`${avatarSize} rounded-full flex items-center justify-center font-bold text-primary-foreground ${borderSize} border-primary-foreground/10 shadow-xl overflow-hidden bg-primary`}>
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={participant.name || participant.identity} className="w-full h-full object-cover" />
            ) : (
              participant.name?.charAt(0).toUpperCase() || "?"
            )}
          </div>
        </div>
      )}
      
      {showLabel && variant === "stage" ? (
        <div className="absolute bottom-3 left-3 flex items-center gap-2 z-10">
          <div className="bg-inverse/70 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center gap-2 border border-inverse-foreground/10 shadow-md">
            {roleBadge && (
              <span className="text-[10px] font-bold text-primary-foreground bg-primary px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0">
                {roleBadge}
              </span>
            )}
            <span className="text-sm font-bold text-inverse-foreground truncate max-w-[200px]">
              {participant.name || participant.identity}{participant.isLocal && youLabel && ` (${youLabel})`}
            </span>
          </div>
        </div>
      ) : showLabel ? (
        <div className="absolute bottom-1 left-1 bg-inverse/60 px-2 py-1 rounded text-[10px] text-inverse-foreground font-medium truncate max-w-[90%] backdrop-blur-sm">
          {participant.name || participant.identity}{participant.isLocal && youLabel && ` (${youLabel})`}
        </div>
      ) : null}
      {raisedHand && (
        <div className="absolute top-1 right-1 bg-warning rounded-full p-0.5 shadow-sm pointer-events-none">
          <Hand className="w-3 h-3 text-warning-foreground" />
        </div>
      )}
      {audioMuted && (
        <div className={`absolute pointer-events-none bg-destructive/80 rounded-full shadow-sm ${
          variant === "stage" ? "bottom-3 right-3 p-1.5" : "bottom-1 right-1 p-1"
        }`}>
          <MicOff className={`text-destructive-foreground ${variant === "stage" ? "w-4 h-4" : "w-3 h-3"}`} />
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

  const clampPos = useCallback((x: number, y: number) => {
    const el = containerRef.current;
    if (!el) return { x, y };
    return {
      x: Math.max(PIP_MARGIN, Math.min(el.offsetWidth - PIP_W - PIP_MARGIN, x)),
      y: Math.max(PIP_MARGIN, Math.min(el.offsetHeight - PIP_H - PIP_MARGIN, y)),
    };
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setPos({ x: PIP_MARGIN, y: el.offsetHeight - PIP_H - PIP_MARGIN });
  }, [containerRef]);

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
  }, [clampPos]);

  if (!pos) return null;

  return (
    <div
      style={{ left: pos.x, top: pos.y, width: PIP_W, height: PIP_H }}
      className="absolute z-50 rounded-lg shadow-2xl overflow-hidden border-2 border-primary cursor-move select-none"
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

interface StudentClassroomUIProps {
  roomName: string;
  className?: string;
  lessonTitle?: string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export function StudentClassroomUI({ className, lessonTitle, isFullscreen = false, onToggleFullscreen }: StudentClassroomUIProps) {
  const t = useTranslations();
  const room = useRoomContext();
  const [needsClick, setNeedsClick] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "requesting" | "approved">("idle");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [handRaised, setHandRaised] = useState(false);
  const [adminPresenterId, setAdminPresenterId] = useState<string | null>(null);
  const [classmatesCanScrollPrev, setClassmatesCanScrollPrev] = useState(false);
  const [classmatesCanScrollNext, setClassmatesCanScrollNext] = useState(false);
  const [isPhoneLandscape, setIsPhoneLandscape] = useState(false);
  const [stageControlsVisible, setStageControlsVisible] = useState(true);
  const [isRecording, setIsRecording] = useState(room.isRecording);
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
  const [followViewport, setFollowViewport] = useState(true);
  const [pendingFullscreen, setPendingFullscreen] = useState(false);
  const stageControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageTouchStartRef = useRef<{ x: number; y: number } | null>(null);
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

  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  const adminPresenterParticipant = adminPresenterId
    ? participants.find((p) => p.identity === adminPresenterId)
    : null;
  const teacher = participants.find((p) => getRole(p) === "teacher") || adminPresenterParticipant || undefined;
  const students = participants.filter((p) => {
    const role = getRole(p);
    return role === "student";
  });
  const sortedStudents = useMemo(() => {
    const raisedHandsQueue = Array.from(raisedHands);
    return [...students].sort((a, b) => {
      const aRaised = raisedHands.has(a.identity) || (a.isLocal && handRaised);
      const bRaised = raisedHands.has(b.identity) || (b.isLocal && handRaised);
      if (aRaised && bRaised) {
        const indexA = raisedHandsQueue.indexOf(a.identity);
        const indexB = raisedHandsQueue.indexOf(b.identity);
        const safeIndexA = indexA === -1 ? Infinity : indexA;
        const safeIndexB = indexB === -1 ? Infinity : indexB;
        return safeIndexA - safeIndexB;
      }
      if (aRaised) return -1;
      if (bRaised) return 1;
      return (a.name || a.identity).localeCompare(b.name || b.identity);
    });
  }, [students, raisedHands, handRaised]);

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

    const handleData = (payload: Uint8Array, participant?: RemoteParticipant) => {
      try {
        const msg = JSON.parse(decoder.decode(payload));
        const senderRole = getRole(participant);
        const senderIsAuthority = isAuthority(senderRole);
        const senderIsStudent = senderRole === "student";

        if (senderIsAuthority && msg.type === "ALLOW_SHARE") {
          setShareState("approved");
          toast.success(t('classroom.permissionGrantedClickToStart'));
        }

        if (senderIsAuthority && msg.type === "DENY_SHARE") {
          setShareState("idle");
          toast.error(t('classroom.permissionDenied'));
        }

        if (
          senderIsAuthority &&
          msg.type === "STOP_SHARE" &&
          isSharingLocally
        ) {
          localParticipant?.setScreenShareEnabled(false);
          setShareState("idle");
          toast.info(t('classroom.sharingStoppedByTeacher'));
        }

        if (
          senderIsAuthority &&
          msg.type === "FORCE_LOWER_HAND" &&
          typeof msg.participantId === "string"
        ) {
          setRaisedHands((prev) => {
            const next = new Set(prev);
            next.delete(msg.participantId);
            return next;
          });
          if (msg.participantId === localParticipant?.identity) {
            setHandRaised(false);
            toast.dismiss('hand-raised');
          }
        }

        if (senderIsStudent && msg.type === "RAISE_HAND" && participant) {
          setRaisedHands((prev) => new Set(prev).add(participant.identity));
        }

        if (senderIsStudent && msg.type === "LOWER_HAND" && participant) {
          setRaisedHands((prev) => { const next = new Set(prev); next.delete(participant.identity); return next; });
        }

        if (
          senderIsAuthority &&
          msg.type === "ADMIN_PRESENTING" &&
          participant
        ) {
          setAdminPresenterId(msg.presenting ? participant.identity : null);
        }

        if (senderIsAuthority && msg.type === "WHITEBOARD_STATE") {
          setIsWhiteboardActive(msg.active);
          if (msg.active) {
            toast.success(t('classroom.whiteboardStarted') || "Teacher opened the whiteboard");
          } else {
            toast.info(t('classroom.whiteboardStopped') || "Whiteboard closed");
          }
        }
      } catch (e) {
        console.error("Failed to parse data message", e);
      }
    };

    room.on("dataReceived", handleData);
    return () => { room.off("dataReceived", handleData); };
  }, [room, isSharingLocally, localParticipant, t]);

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
    const handleRecordingChange = (recording: boolean) => {
      setIsRecording(recording);
      if (recording) {
        toast.info(t('classroom.recordingStarted'));
      } else {
        toast.info(t('classroom.recordingStopped'));
      }
    };
    room.on(RoomEvent.RecordingStatusChanged, handleRecordingChange);
    return () => { room.off(RoomEvent.RecordingStatusChanged, handleRecordingChange); };
  }, [room, t]);

  const handleShareAction = async () => {
    // Pre-flight: Fail fast before allowing any state changes or requests
    if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
      toast.error(t('classroom.screenShareNotSupported'));
      return;
    }

    if (isSharingLocally) {
      await localParticipant?.setScreenShareEnabled(false);
      setShareState("idle");
      return;
    }

    if (shareState === "approved") {
      setShareState("idle");

      try {
        await localParticipant?.setScreenShareEnabled(true, { audio: true });
      } catch (error) {
        const err = error as Error;
        if (err.name === "NotAllowedError" || err.message?.includes("Permission denied")) return;
        try {
          await localParticipant?.setScreenShareEnabled(true, { audio: false });
          toast.warning(t('classroom.screenShareAudioNotSupported'));
        } catch {
          toast.error(t('classroom.screenShareNotSupported'));
        }
      }
      return;
    }

    requestPermission();
  };

  const requestPermission = async () => {
    if (isScreenSharingActive && !isSharingLocally) {
      toast.error(t('classroom.someoneSharing'));
      return;
    }
    setShareState("requesting");
    const encoder = new TextEncoder();
    const data = JSON.stringify({ type: "REQUEST_SHARE" });
    await room.localParticipant.publishData(encoder.encode(data), { reliable: true });
    toast.info(t('classroom.requestSent'));
  };

  const toggleHandRaised = async () => {
    const newState = !handRaised;
    setHandRaised(newState);
    const encoder = new TextEncoder();
    const data = JSON.stringify({ type: newState ? "RAISE_HAND" : "LOWER_HAND" });
    await room.localParticipant.publishData(encoder.encode(data), { reliable: true });
    if (newState) toast.info(t('classroom.handRaised'), { id: 'hand-raised' });
    else toast.dismiss('hand-raised');
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

  const handleLeave = async () => {
    try {
      await room.disconnect();
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
      try { await localParticipant.setMicrophoneEnabled(true); } catch (error) { console.error("Failed to enable microphone:", error); }
      try { await localParticipant.setCameraEnabled(true); } catch (error) {
        console.error("Failed to enable camera:", error);
      }
    };
    initMedia();
  }, [localParticipant]);

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

  // Auto-fullscreen: prompt user to go fullscreen when remote content appears.
  // requestFullscreen() requires a user gesture, so we cannot call it from a useEffect directly.
  const autoFullscreenFiredRef = useRef(false);
  useEffect(() => {
    const hasContent = isScreenSharingActive || isWhiteboardActive;
    if (hasContent && !isFullscreen && !autoFullscreenFiredRef.current && onToggleFullscreen) {
      autoFullscreenFiredRef.current = true;
      setPendingFullscreen(true);
    }
    if (!hasContent) {
      autoFullscreenFiredRef.current = false;
      setPendingFullscreen(false);
    }
    if (isFullscreen) setPendingFullscreen(false);
  }, [isScreenSharingActive, isWhiteboardActive, isFullscreen, onToggleFullscreen]);

  return (
    <div ref={rootRef} className="grid h-full w-full bg-gradient-to-br from-background to-muted overflow-hidden font-sans relative grid-cols-1 grid-rows-[min-content_1fr_min-content_min-content] md:grid-cols-[1fr_280px] md:grid-rows-[min-content_1fr_min-content] landscape:grid-cols-[1fr_280px] landscape:grid-rows-[min-content_1fr_min-content] lg:grid-cols-[1fr_320px]">
      <RoomAudioRenderer />

      {needsClick && (
        <div className="absolute inset-0 z-[999] bg-inverse/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl border-4 border-primary">
                <VolumeX className="w-12 h-12 text-secondary mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2 text-foreground">{t('classroom.enableAudio')}</h3>
                <button
                  onClick={async () => { await room.startAudio(); setNeedsClick(false); }}
                  className="w-full py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-bold text-lg shadow-lg"
                >
                  {t('classroom.startClass')}
                </button>
            </div>
        </div>
      )}

      {/* 1. Header */}
      <div className={`col-start-1 row-start-1 z-10 flex flex-col ${isPhoneLandscape ? '' : 'p-3 md:p-4 pb-2 md:pb-0 justify-end'}`}>
        {isPhoneLandscape ? (
          <div className="flex items-center gap-2 px-2 py-1">
            <span
              role="status"
              aria-label={teacher ? t('common.live') : t('classroom.waiting')}
              className={`size-2 shrink-0 rounded-full ${teacher ? 'bg-success animate-pulse' : 'bg-secondary'}`}
            />
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
              <span className="text-xs font-bold text-card-foreground truncate">{className || t('classroom.classroom')}</span>
              {lessonTitle && <span className="text-[10px] text-muted-foreground truncate">· {lessonTitle}</span>}
            </div>
            {isRecording && (
              <div className="flex items-center gap-1 bg-destructive/10 px-1.5 py-0.5 rounded-full border border-destructive/20 flex-shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                <span className="text-[9px] font-bold text-destructive uppercase tracking-wide">REC</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-3">
              <span
                role="status"
                aria-label={teacher ? t('common.live') : t('classroom.waiting')}
                className={`size-2.5 shrink-0 rounded-full ${teacher ? 'bg-success animate-pulse' : 'bg-secondary'}`}
              />
              <div className="flex flex-col">
                <h2 className="text-lg font-black text-primary">{className || t('classroom.classroom')}</h2>
                {lessonTitle && <p className="text-sm text-muted-foreground font-medium">{lessonTitle}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isRecording && (
                <div className="flex items-center gap-1.5 bg-destructive/10 px-3 py-1.5 rounded-full border-2 border-destructive/40">
                  <div className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
                  <span className="text-xs font-bold text-destructive uppercase tracking-wide">REC</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. Stage */}
      <div className={`col-start-1 row-start-2 min-h-0 z-10 flex flex-col relative ${isPhoneLandscape ? 'p-1' : 'p-3 md:p-4 py-2 md:py-4'}`}>
        <div ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary to-secondary group">
          {/* Top-right stage overlay: following pill + fullscreen toggle */}
          {(isWhiteboardActive || isScreenSharingActive) && (
            <div className="absolute top-2 right-2 z-30 flex flex-col items-end gap-1.5 pointer-events-none">
              {isWhiteboardActive && (
                <button
                  onClick={() => setFollowViewport(v => !v)}
                  className={`pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-lg border transition-all ${
                    followViewport
                      ? 'bg-success/90 text-success-foreground border-success/50 hover:bg-success/80'
                      : 'bg-inverse/60 text-inverse-foreground/80 border-inverse-foreground/20 hover:bg-inverse/80'
                  }`}
                >
                  {followViewport ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  {followViewport ? t('classroom.followingTeacher') || 'Following' : t('classroom.viewUnlocked') || 'Unlocked'}
                </button>
              )}
              {onToggleFullscreen && (
                <button
                  onClick={onToggleFullscreen}
                  title={isFullscreen ? (t('classroom.exitFullscreen') || 'Exit fullscreen') : (t('classroom.enterFullscreen') || 'Fullscreen')}
                  className="pointer-events-auto w-8 h-8 rounded-full bg-inverse/60 hover:bg-inverse/80 text-inverse-foreground flex items-center justify-center shadow-lg border border-inverse-foreground/20 transition-all"
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              )}
            </div>
          )}
          {isWhiteboardActive ? (
            <>
              <div className="w-full h-full relative rounded-2xl overflow-hidden">
                <SharedWhiteboard roomName={room.name} isReadonly={true} followViewport={followViewport} />
              </div>
            </>
          ) : isScreenSharingActive ? (
            <>
              <div
                className={`w-full h-full flex items-center justify-center origin-center bg-inverse relative select-none ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
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
                />

                {(!activeScreenTrack.publication.isSubscribed || !activeScreenTrack.publication.track) && (
                   <div className="absolute inset-0 flex flex-col items-center justify-center bg-inverse/90 backdrop-blur-sm z-50">
                      <Loader2 className="w-12 h-12 text-info animate-spin mb-4" />
                      <p className="text-inverse-foreground font-bold text-lg">{t('classroom.loadingShare')}</p>
                   </div>
                )}
              </div>

              <div className={`absolute top-4 right-4 flex gap-2 z-40 bg-inverse/60 p-2 rounded-xl backdrop-blur-sm border border-inverse-foreground/20 transition-all duration-300 ${isPhoneLandscape && !stageControlsVisible ? 'opacity-0 -translate-y-2 pointer-events-none' : 'opacity-100 translate-y-0'}`}>
                <button onClick={() => handleZoom(-0.25)} className="p-2 hover:bg-inverse-foreground/20 rounded-lg text-inverse-foreground">
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-inverse-foreground text-sm font-mono py-2 min-w-[3ch] text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => handleZoom(0.25)} className="p-2 hover:bg-inverse-foreground/20 rounded-lg text-inverse-foreground">
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

            </>
          ) : (
            <>
              <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/chalkboard.png')]" />
              {teacher ? (
                isTeacherVideoOn ? (
                  <ParticipantTile participant={teacher} variant="stage" className="w-full h-full object-contain bg-transparent" showLabel={true} roleBadge={t('classroom.teacher')} youLabel={t('classroom.youShort')} audioMuted={!isTeacherAudioOn} />
                ) : (
                  <div className="z-10 flex flex-col items-center justify-center p-8 text-center">
                      <div className="w-40 h-40 bg-primary rounded-full flex items-center justify-center border-4 border-inverse-foreground/20 mb-6 shadow-2xl overflow-hidden">
                        {getImageUrl(teacher) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={getImageUrl(teacher)!} alt={teacher.name || ""} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-7xl font-bold text-primary-foreground">{teacher.name?.charAt(0) || "T"}</span>
                        )}
                      </div>
                      <h2 className="text-3xl font-black text-primary-foreground mb-2">{teacher.name || t('classroom.teacher')}</h2>
                      <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                        <div className="bg-inverse/40 px-3 py-1.5 rounded-full backdrop-blur-sm border-2 border-inverse-foreground/20 flex items-center gap-1.5">
                          <VideoOff className="w-4 h-4 text-inverse-foreground/70" />
                          <span className="text-sm text-inverse-foreground font-bold">{t('classroom.cameraOffLabel')}</span>
                        </div>
                        <div className={`px-3 py-1.5 rounded-full backdrop-blur-sm border-2 flex items-center gap-1.5 ${
                          isTeacherAudioOn ? 'bg-inverse/40 border-inverse-foreground/20' : 'bg-destructive/40 border-destructive/60'
                        }`}>
                          <Mic className={`w-4 h-4 ${isTeacherAudioOn ? "animate-pulse text-success" : "text-destructive"}`} />
                          <span className="text-sm text-inverse-foreground font-bold">{isTeacherAudioOn ? t('classroom.audioOnly') : t('classroom.micOff')}</span>
                        </div>
                      </div>
                  </div>
                )
              ) : (
                <div className="text-center z-10 p-8">
                  <div className="text-9xl mb-4">👩‍🏫</div>
                  <h2 className="text-3xl font-black text-primary-foreground">{t('classroom.waitingForTeacher')}</h2>
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
                className="flex items-center gap-2 bg-inverse/60 backdrop-blur-md rounded-full px-4 py-2.5 border border-inverse-foreground/20 shadow-2xl pointer-events-auto"
                onClick={showStageControls}
              >
                <DeviceToggleButton variant="compact" source={Track.Source.Microphone} kind="audioinput" iconOn={<Mic className="w-5 h-5" />} iconOff={<MicOff className="w-5 h-5" />} />
                <DeviceToggleButton variant="compact" source={Track.Source.Camera} kind="videoinput" iconOn={<VideoIcon className="w-5 h-5" />} iconOff={<VideoOff className="w-5 h-5" />} />
                <button
                  onClick={toggleHandRaised}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-lg border-2 ${
                    handRaised
                      ? 'bg-warning/80 text-warning-foreground border-warning animate-bounce'
                      : 'bg-inverse-foreground/20 text-inverse-foreground border-inverse-foreground/30 hover:bg-inverse-foreground/30'
                  }`}
                >
                  <Hand className="w-5 h-5" />
                </button>
                <button
                  onClick={handleShareAction}
                  disabled={shareState === "requesting"}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-lg border-2 ${
                    isSharingLocally
                      ? 'bg-success/80 text-success-foreground border-success'
                      : shareState === "approved"
                        ? 'bg-info/80 text-info-foreground border-info animate-pulse'
                        : shareState === "requesting"
                          ? 'bg-warning/80 text-warning-foreground border-warning cursor-wait'
                          : 'bg-inverse-foreground/20 text-inverse-foreground border-inverse-foreground/30 hover:bg-inverse-foreground/30'
                  }`}
                >
                  <MonitorUp className="w-5 h-5" />
                </button>
                <div className="w-px h-6 bg-inverse-foreground/30 mx-1" />
                {onToggleFullscreen && (
                  <FullscreenButtonCompact isFullscreen={isFullscreen} onToggle={onToggleFullscreen} />
                )}
                <div className="w-px h-6 bg-inverse-foreground/30 mx-1" />
                <LeaveClassButton
                  onConfirm={handleLeave}
                  className="flex size-11 items-center justify-center rounded-full border-2 border-destructive/60 bg-destructive/80 text-destructive-foreground shadow-lg transition-colors hover:bg-destructive/90"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Controls — hidden in phone landscape (replaced by floating stage overlay) */}
      <div className={`col-start-1 row-start-4 md:col-start-1 md:row-start-3 landscape:col-start-1 landscape:row-start-3 p-3 md:p-4 pt-2 md:pt-0 z-10 ${isPhoneLandscape ? 'hidden' : ''}`}>
        <div className="flex h-24 items-center px-4">
          {/* Left spacer */}
          <div className="flex-1" />
          {/* Centered controls */}
          <div className="flex items-center gap-2">
              <DeviceToggleButton variant="purple" source={Track.Source.Microphone} kind="audioinput" includeAudioOutput iconOn={<Mic className="w-6 h-6" />} iconOff={<MicOff className="w-6 h-6" />} />
              <DeviceToggleButton variant="purple" source={Track.Source.Camera} kind="videoinput" iconOn={<VideoIcon className="w-6 h-6" />} iconOff={<VideoOff className="w-6 h-6" />} />
              <button
                onClick={toggleHandRaised}
                title={handRaised ? t('classroom.lowerHand') : t('classroom.raiseHand')}
                className={`
                  w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg border-2
                  ${handRaised
                    ? 'bg-warning/10 text-warning border-warning/40 animate-bounce'
                    : 'bg-card hover:bg-muted text-primary border-primary/30'}
                `}
              >
                <Hand className="w-6 h-6" />
              </button>
              <button
                onClick={handleShareAction}
                disabled={shareState === "requesting"}
                className={`
                  w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg border-2
                  ${isSharingLocally
                    ? 'bg-success/10 text-success border-success/30'
                    : shareState === "approved"
                        ? 'bg-info text-info-foreground border-info animate-pulse'
                    : shareState === "requesting"
                        ? 'bg-warning/10 text-warning border-warning/30 cursor-wait'
                        : 'bg-card hover:bg-muted text-primary border-primary/30'}
                `}
                title={shareState === "requesting" ? t('classroom.waitingForApproval') : t('classroom.shareScreen')}
              >
                {shareState === "requesting" ? <MonitorUp className="w-6 h-6 animate-bounce" /> : <MonitorUp className="w-6 h-6" />}
              </button>
              <LeaveClassButton
                onConfirm={handleLeave}
                className="flex size-12 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg transition-colors hover:bg-destructive/90"
              />
          </div>
          <div className="flex-1" />
        </div>
      </div>

      {/* Fullscreen invitation dialog */}
      <AlertDialog open={pendingFullscreen} onOpenChange={(open) => { if (!open) setPendingFullscreen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('classroom.fullscreenInviteTitle') || 'Go fullscreen?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('classroom.fullscreenInviteDesc') || 'Content is being presented. Going fullscreen provides the best viewing experience.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingFullscreen(false)}>
              {t('common.notNow') || 'Not now'}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => { setPendingFullscreen(false); onToggleFullscreen?.(); }}>
              {t('classroom.goFullscreen') || 'Go Fullscreen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 4. Classmates Sidebar (row 3 on mobile, right column on md+) */}
      <div className="col-start-1 row-start-3 md:col-start-2 md:row-start-1 md:row-span-3 landscape:col-start-2 landscape:row-start-1 landscape:row-span-3 z-0 flex h-36 flex-col overflow-hidden md:h-full landscape:h-full">

        {/* Header + nav arrows */}
        <div className="flex flex-shrink-0 items-center gap-2 px-3 py-1.5 text-foreground md:py-2.5">
          <h3 className="flex-1 text-xs font-black uppercase tracking-widest truncate">
            {t('classroom.classmates', { count: students.length })}
          </h3>
          {(classmatesCanScrollPrev || classmatesCanScrollNext) && (
            <>
              <div className="hidden md:flex landscape:flex items-center gap-0.5">
                <button onClick={() => classmateTilesRef.current?.scrollBy({ top: -160, behavior: 'smooth' })} disabled={!classmatesCanScrollPrev} className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                <button onClick={() => classmateTilesRef.current?.scrollBy({ top: 160, behavior: 'smooth' })} disabled={!classmatesCanScrollNext} className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex md:hidden landscape:hidden items-center gap-0.5">
                <button onClick={() => classmateTilesRef.current?.scrollBy({ left: -160, behavior: 'smooth' })} disabled={!classmatesCanScrollPrev} className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-30"><ChevronLeft className="w-3.5 h-3.5" /></button>
                <button onClick={() => classmateTilesRef.current?.scrollBy({ left: 160, behavior: 'smooth' })} disabled={!classmatesCanScrollNext} className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
            </>
          )}
        </div>

        {/* Responsive Tiles Auto-Grid */}
        <div
          ref={classmateTilesRef}
          className="flex-1 min-h-0 min-w-0 p-2 md:p-3 gap-2 md:gap-3 flex flex-row items-start overflow-x-auto overflow-y-hidden snap-x snap-mandatory md:grid md:grid-cols-[repeat(auto-fill,minmax(110px,1fr))] md:auto-rows-max md:overflow-y-auto md:overflow-x-hidden md:snap-y md:content-start md:items-start landscape:grid landscape:grid-cols-[repeat(auto-fill,minmax(110px,1fr))] landscape:auto-rows-max landscape:overflow-y-auto landscape:overflow-x-hidden landscape:snap-y landscape:content-start landscape:items-start scrollbar-thin"
        >
          {sortedStudents.length === 0 && (
            <div className="md:col-span-full landscape:col-span-full flex items-center justify-center w-full text-muted-foreground text-xs italic text-center px-2 whitespace-nowrap md:whitespace-normal h-full">
              {t('classroom.youAreFirst')}
            </div>
          )}
          {sortedStudents.map((p) => (
            <ParticipantTile
              key={p.identity}
              variant="grid"
              participant={p}
              className={`flex-shrink-0 rounded-2xl border-4 shadow-md overflow-hidden aspect-square w-24 h-24 sm:w-28 sm:h-28 md:w-full md:h-auto landscape:w-full landscape:h-auto snap-start snap-always
                ${raisedHands.has(p.identity) || (p.isLocal && handRaised) ? 'border-warning shadow-[0_0_8px_2px] shadow-warning/40' : 'border-primary/30'}`}
              raisedHand={raisedHands.has(p.identity) || (p.isLocal && handRaised)}
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
