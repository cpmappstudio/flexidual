"use client";

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
  Mic, MicOff, Video as VideoIcon, VideoOff, Loader2, VolumeX,
  ZoomIn, ZoomOut, Move, LogOut,
  MonitorUp, Hand, ChevronUp, ChevronDown, ChevronLeft, ChevronRight
} from "lucide-react";
import { FlexidualLogo } from "@/components/ui/flexidual-logo";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
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
function CustomMediaToggle({ source, iconOn, iconOff, compact = false }: { 
  source: Track.Source.Camera | Track.Source.Microphone, 
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
        ${compact ? 'w-11 h-11' : 'w-14 h-14'} rounded-full flex items-center justify-center transition-all shadow-lg
        ${enabled 
          ? compact
            ? 'bg-white/20 text-white border-2 border-white/30 hover:bg-white/30'
            : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-purple-600 dark:text-purple-400 border-2 border-purple-300 dark:border-purple-600' 
          : compact
            ? 'bg-red-500/50 text-white border-2 border-red-400/60'
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
    <div className={`relative bg-gradient-to-br from-gray-800 to-gray-900 overflow-hidden transition-all duration-300 ${isSpeaking ? "ring-4 ring-success shadow-[0_0_15px_rgba(34,197,94,0.4)] z-20" : ""} ${className}`}>
      {isVideoEnabled ? (
        <VideoTrack 
          trackRef={{ participant, source: Track.Source.Camera, publication: cameraTrack as TrackPublication }} 
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
          <div className={`${avatarSize} rounded-full flex items-center justify-center font-bold text-white ${borderSize} border-white/10 shadow-xl overflow-hidden bg-gradient-to-tr from-purple-400 to-pink-500`}>
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
          <div className="bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center gap-2 border border-white/10 shadow-md">
            {roleBadge && (
              <span className="text-[10px] font-bold text-white bg-purple-600 px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0">
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
        <div className="absolute top-1 right-1 bg-amber-500 rounded-full p-0.5 shadow-sm pointer-events-none">
          <Hand className="w-3 h-3 text-white" />
        </div>
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
      className="absolute z-50 rounded-lg shadow-2xl overflow-hidden border-2 border-purple-500 cursor-move select-none"
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
  currentUserRole?: string;
  roomName: string;
  className?: string;
  lessonTitle?: string;
  onLeave?: () => void;
}

export function StudentClassroomUI({ className, lessonTitle, onLeave }: StudentClassroomUIProps) {
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
  const stageControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
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

        if (msg.type === "ALLOW_SHARE") {
          setShareState("approved");
          toast.success(t('classroom.permissionGrantedClickToStart'));
        }

        if (msg.type === "DENY_SHARE") {
          setShareState("idle");
          toast.error(t('classroom.permissionDenied'));
        }

        if (msg.type === "STOP_SHARE" && isSharingLocally) {
          localParticipant?.setScreenShareEnabled(false);
          setShareState("idle");
          toast.info(t('classroom.sharingStoppedByTeacher'));
        }

        if (msg.type === "FORCE_LOWER_HAND") {
          setHandRaised(false);
        }

        if (msg.type === "RAISE_HAND" && participant) {
          setRaisedHands((prev) => new Set(prev).add(participant.identity));
        }

        if (msg.type === "LOWER_HAND" && participant) {
          setRaisedHands((prev) => { const next = new Set(prev); next.delete(participant.identity); return next; });
        }

        if (msg.type === "ADMIN_PRESENTING" && participant) {
          setAdminPresenterId(msg.presenting ? participant.identity : null);
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
    if (newState) toast.info(t('classroom.handRaised'));
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

  return (
    <div className="grid h-full w-full bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 overflow-hidden font-sans relative grid-cols-1 grid-rows-[min-content_1fr_min-content_min-content] md:grid-cols-[1fr_280px] md:grid-rows-[min-content_1fr_min-content] landscape:grid-cols-[1fr_280px] landscape:grid-rows-[min-content_1fr_min-content] lg:grid-cols-[1fr_320px]">
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

      {/* 1. Header */}
      <div className={`col-start-1 row-start-1 z-10 flex flex-col ${isPhoneLandscape ? '' : 'p-3 md:p-4 pb-2 md:pb-0 justify-end'}`}>
        {isPhoneLandscape ? (
          <div className="flex items-center gap-2 px-2 py-1 bg-white/90 dark:bg-black/80 backdrop-blur-md border-b border-gray-200 dark:border-white/10">
            <FlexidualLogo stacked className="h-6 w-6 flex-shrink-0" />
            <div className="flex-1 min-w-0 flex items-center gap-1.5">
              <span className="text-xs font-bold text-gray-800 dark:text-white truncate">{className || t('classroom.classroom')}</span>
              {lessonTitle && <span className="text-[10px] text-gray-500 dark:text-white/50 truncate">· {lessonTitle}</span>}
            </div>
            {isRecording && (
              <div className="flex items-center gap-1 bg-red-500/10 px-1.5 py-0.5 rounded-full border border-red-500/20 flex-shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[9px] font-bold text-red-500 uppercase tracking-wide">REC</span>
              </div>
            )}
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full border flex-shrink-0 ${teacher ? 'bg-green-500/20 border-green-400/30' : 'bg-orange-500/20 border-orange-400/30'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${teacher ? 'bg-green-500 dark:bg-green-400 animate-pulse' : 'bg-orange-500 dark:bg-orange-400'}`} />
              <span className="text-[9px] font-bold text-gray-700 dark:text-white/80 uppercase tracking-wide">{teacher ? t('common.live') : t('classroom.waiting')}</span>
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-center bg-white/90 dark:bg-gray-900/90 backdrop-blur-md p-3 rounded-2xl shadow-lg border-2 border-purple-300 dark:border-purple-700">
            <div className="flex flex-col">
              <h2 className="text-lg font-black text-purple-600 dark:text-purple-400">{className || t('classroom.classroom')}</h2>
              {lessonTitle && <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{lessonTitle}</p>}
            </div>
            <div className="flex items-center gap-2">
              {isRecording && (
                <div className="flex items-center gap-1.5 bg-red-500/10 px-3 py-1.5 rounded-full border-2 border-red-400/40">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-bold text-red-500 uppercase tracking-wide">REC</span>
                </div>
              )}
              <div className="flex items-center gap-2 bg-green-100 dark:bg-green-900/30 px-4 py-2 rounded-full border-2 border-green-300 dark:border-green-700">
                <div className={`w-3 h-3 rounded-full ${teacher ? 'bg-green-500 animate-pulse' : 'bg-orange-400'}`} />
                <span className="text-sm font-bold text-green-700 dark:text-green-400 uppercase tracking-wide">{teacher ? t('common.live') : t('classroom.waiting')}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Stage */}
      <div className={`col-start-1 row-start-2 min-h-0 z-10 flex flex-col relative ${isPhoneLandscape ? 'p-1' : 'p-3 md:p-4 py-2 md:py-4'}`}>
        <div ref={stageRef} className="flex-1 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-3xl shadow-2xl overflow-hidden relative border-4 border-purple-400 dark:border-purple-600 flex items-center justify-center group min-h-0">
          {isScreenSharingActive ? (
            <>
              <div
                className={`w-full h-full flex items-center justify-center origin-center bg-black relative select-none ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
                onMouseDown={zoom > 1 ? (e) => {
                  e.preventDefault();
                  panDragRef.current = { active: true, startMouse: { x: e.clientX, y: e.clientY }, startPan: { ...pan } };
                } : undefined}
                onTouchStart={zoom > 1 ? (e) => {
                  const touch = e.touches[0];
                  panDragRef.current = { active: true, startMouse: { x: touch.clientX, y: touch.clientY }, startPan: { ...pan } };
                } : undefined}
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
                  <ParticipantTile participant={teacher} variant="stage" className="w-full h-full object-contain bg-transparent" showLabel={true} roleBadge={t('classroom.teacher')} youLabel={t('classroom.youShort')} audioMuted={!isTeacherAudioOn} />
                ) : (
                  <div className="z-10 flex flex-col items-center justify-center p-8 text-center">
                      <div className="w-40 h-40 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full flex items-center justify-center border-4 border-white/20 mb-6 shadow-2xl overflow-hidden">
                        {getImageUrl(teacher) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={getImageUrl(teacher)!} alt={teacher.name || ""} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-7xl font-bold text-white">{teacher.name?.charAt(0) || "T"}</span>
                        )}
                      </div>
                      <h2 className="text-3xl font-black text-white mb-2">{teacher.name || t('classroom.teacher')}</h2>
                      <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                        <div className="bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-sm border-2 border-white/20 flex items-center gap-1.5">
                          <VideoOff className="w-4 h-4 text-white/70" />
                          <span className="text-sm text-white font-bold">{t('classroom.cameraOffLabel')}</span>
                        </div>
                        <div className={`px-3 py-1.5 rounded-full backdrop-blur-sm border-2 flex items-center gap-1.5 ${
                          isTeacherAudioOn ? 'bg-black/40 border-white/20' : 'bg-red-500/40 border-red-400/60'
                        }`}>
                          <Mic className={`w-4 h-4 ${isTeacherAudioOn ? "animate-pulse text-green-400" : "text-red-300"}`} />
                          <span className="text-sm text-white font-bold">{isTeacherAudioOn ? t('classroom.audioOnly') : t('classroom.micOff')}</span>
                        </div>
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
                <CustomMediaToggle compact source={Track.Source.Microphone} iconOn={<Mic className="w-5 h-5" />} iconOff={<MicOff className="w-5 h-5" />} />
                <CustomMediaToggle compact source={Track.Source.Camera} iconOn={<VideoIcon className="w-5 h-5" />} iconOff={<VideoOff className="w-5 h-5" />} />
                <button
                  onClick={toggleHandRaised}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-lg border-2 ${
                    handRaised
                      ? 'bg-amber-500/80 text-white border-amber-400 animate-bounce'
                      : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                  }`}
                >
                  <Hand className="w-5 h-5" />
                </button>
                <button
                  onClick={handleShareAction}
                  disabled={shareState === "requesting"}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-lg border-2 ${
                    isSharingLocally
                      ? 'bg-green-500/80 text-white border-green-400'
                      : shareState === "approved"
                        ? 'bg-blue-500/80 text-white border-blue-400 animate-pulse'
                        : shareState === "requesting"
                          ? 'bg-yellow-500/80 text-white border-yellow-400 cursor-wait'
                          : 'bg-white/20 text-white border-white/30 hover:bg-white/30'
                  }`}
                >
                  <MonitorUp className="w-5 h-5" />
                </button>
                <div className="w-px h-6 bg-white/30 mx-1" />
                <button
                  onClick={handleLeave}
                  className="w-11 h-11 rounded-full bg-red-500/80 hover:bg-red-600/80 text-white flex items-center justify-center shadow-lg border-2 border-red-400/60 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Controls — hidden in phone landscape (replaced by floating stage overlay) */}
      <div className={`col-start-1 row-start-4 md:col-start-1 md:row-start-3 landscape:col-start-1 landscape:row-start-3 p-3 md:p-4 pt-2 md:pt-0 z-10 ${isPhoneLandscape ? 'hidden' : ''}`}>
        <div className="h-24 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md rounded-3xl shadow-lg border-2 border-purple-300 dark:border-purple-700 px-4 flex items-center">
          {/* Left spacer */}
          <div className="flex-1" />
          {/* Centered controls */}
          <div className="flex items-center gap-2">
              <CustomMediaToggle source={Track.Source.Microphone} iconOn={<Mic className="w-6 h-6" />} iconOff={<MicOff className="w-6 h-6" />} />
              <CustomMediaToggle source={Track.Source.Camera} iconOn={<VideoIcon className="w-6 h-6" />} iconOff={<VideoOff className="w-6 h-6" />} />
              <button
                onClick={toggleHandRaised}
                title={handRaised ? t('classroom.lowerHand') : t('classroom.raiseHand')}
                className={`
                  w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg border-2
                  ${handRaised
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border-amber-400 dark:border-amber-600 animate-bounce'
                    : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-600'}
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
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-300 dark:border-green-600'
                    : shareState === "approved"
                        ? 'bg-blue-500 text-white border-blue-400 animate-pulse'
                    : shareState === "requesting"
                        ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 border-yellow-300 dark:border-yellow-600 cursor-wait'
                        : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-600'}
                `}
                title={shareState === "requesting" ? t('classroom.waitingForApproval') : t('classroom.shareScreen')}
              >
                {shareState === "requesting" ? <MonitorUp className="w-6 h-6 animate-bounce" /> : <MonitorUp className="w-6 h-6" />}
              </button>
          </div>
          {/* Right spacer — icon-only Leave */}
          <div className="flex-1 flex items-center justify-end">
            <button
              onClick={handleLeave}
              title={t('classroom.leave')}
              className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg border-2 border-red-300 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. Classmates Sidebar (row 3 on mobile, right column on md+) */}
      <div className="col-start-1 row-start-3 md:col-start-2 md:row-start-1 md:row-span-3 landscape:col-start-2 landscape:row-start-1 landscape:row-span-3 flex flex-col bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shadow-xl z-20 border-y-2 border-purple-300 dark:border-purple-700 md:border-y-0 md:border-l-2 landscape:border-y-0 landscape:border-l-2 h-36 md:h-full landscape:h-full overflow-hidden">

        {/* Header + nav arrows */}
        <div className="bg-purple-600 dark:bg-purple-700 text-white flex items-center gap-2 px-3 py-1.5 md:py-2.5 border-b-2 border-purple-700 dark:border-purple-800 flex-shrink-0">
          <h3 className="flex-1 text-xs font-black uppercase tracking-widest truncate">
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
          className="flex-1 min-h-0 min-w-0 bg-purple-50/50 dark:bg-gray-800/50 p-2 md:p-3 gap-2 md:gap-3 flex flex-row items-start overflow-x-auto overflow-y-hidden snap-x snap-mandatory md:grid md:grid-cols-[repeat(auto-fill,minmax(110px,1fr))] md:auto-rows-max md:overflow-y-auto md:overflow-x-hidden md:snap-y md:content-start md:items-start landscape:grid landscape:grid-cols-[repeat(auto-fill,minmax(110px,1fr))] landscape:auto-rows-max landscape:overflow-y-auto landscape:overflow-x-hidden landscape:snap-y landscape:content-start landscape:items-start scrollbar-thin"
        >
          {sortedStudents.length === 0 && (
            <div className="md:col-span-full landscape:col-span-full flex items-center justify-center w-full text-gray-500 dark:text-gray-400 text-xs italic text-center px-2 whitespace-nowrap md:whitespace-normal h-full">
              {t('classroom.youAreFirst')}
            </div>
          )}
          {sortedStudents.map((p) => (
            <ParticipantTile
              key={p.identity}
              variant="grid"
              participant={p}
              className={`flex-shrink-0 rounded-2xl border-4 shadow-md overflow-hidden aspect-square w-24 h-24 sm:w-28 sm:h-28 md:w-full md:h-auto landscape:w-full landscape:h-auto snap-start snap-always
                ${raisedHands.has(p.identity) || (p.isLocal && handRaised) ? 'border-amber-400 dark:border-amber-500 shadow-[0_0_8px_2px] shadow-amber-500/40' : 'border-purple-300 dark:border-purple-600'}`}
              raisedHand={raisedHands.has(p.identity) || (p.isLocal && handRaised)}
              youLabel={t('classroom.youShort')}
            />
          ))}
        </div>
      </div>
    </div>
  );
}