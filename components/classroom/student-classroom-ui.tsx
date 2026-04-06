"use client";

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
  Mic, MicOff, Video as VideoIcon, VideoOff, Loader2, VolumeX,
  ZoomIn, ZoomOut, Move, MessageCircle, LogOut,
  MonitorUp, Hand
} from "lucide-react";
import { useEffect, useState, useMemo, useRef } from "react";
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
  variant = "grid",
  raisedHand = false,
  roleBadge,
  youLabel,
}: { 
  participant: Participant, 
  className?: string, 
  showLabel?: boolean,
  variant?: "grid" | "stage" | "mini",
  raisedHand?: boolean,
  roleBadge?: string,
  youLabel?: string,
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
      className="absolute z-50 rounded-lg shadow-2xl overflow-hidden border-2 border-purple-500 cursor-move select-none"
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
  const stageRef = useRef<HTMLDivElement>(null);
  const panDragRef = useRef<{ active: boolean; startMouse: { x: number; y: number }; startPan: { x: number; y: number } }>({
    active: false, startMouse: { x: 0, y: 0 }, startPan: { x: 0, y: 0 },
  });

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
  const sortedStudents = [...students].sort((a, b) => {
    const aRaised = (raisedHands.has(a.identity) || (a.isLocal && handRaised)) ? 1 : 0;
    const bRaised = (raisedHands.has(b.identity) || (b.isLocal && handRaised)) ? 1 : 0;
    return bRaised - aRaised;
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
        <div ref={stageRef} className="flex-1 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-3xl shadow-2xl overflow-hidden relative border-4 border-purple-400 dark:border-purple-600 flex items-center justify-center group">
          {isScreenSharingActive ? (
            <>
              <div 
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
                  <ParticipantTile participant={teacher} variant="stage" className="w-full h-full object-contain bg-transparent" showLabel={true} roleBadge={t('classroom.teacher')} youLabel={t('classroom.youShort')} />
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
        <div className="h-24 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md rounded-3xl shadow-lg border-2 border-purple-300 dark:border-purple-700 px-6 flex items-center justify-center relative">
          <div className="flex items-center gap-2 xl:gap-6">
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

          <button 
            onClick={handleLeave} 
            className="absolute right-6 px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-full font-bold text-sm flex items-center gap-2 shadow-lg border-2 border-red-300"
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
            {sortedStudents.length === 0 && (
              <div className="col-span-2 text-center py-10 text-gray-500 dark:text-gray-400 text-sm font-medium">
                {t('classroom.youAreFirst')}
              </div>
            )}
            {sortedStudents.map((p) => (
              <ParticipantTile 
                key={p.identity} 
                variant="grid" 
                participant={p} 
                className={`aspect-square rounded-2xl border-4 shadow-md ${
                  raisedHands.has(p.identity) || (p.isLocal && handRaised)
                    ? 'border-amber-400 dark:border-amber-500'
                    : 'border-purple-300 dark:border-purple-600'
                }`}
                raisedHand={raisedHands.has(p.identity) || (p.isLocal && handRaised)}
                youLabel={t('classroom.youShort')}
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