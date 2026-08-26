"use client";

import {
  useLocalParticipant,
  useRoomContext,
  useParticipants,
} from "@livekit/components-react";
import { Track, RemoteParticipant, RoomEvent } from "livekit-client";
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  MonitorUp,
  Hand,
} from "lucide-react";
import { LeaveClassButton } from "./leave-class-button";
import { useEffect, useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FullscreenButtonCompact } from "./fullscreen-button";
import { DeviceToggleButton } from "./device-toggle-button";
import {
  ClassroomUiPreview,
  type ClassroomPreviewOption,
} from "./classroom-ui-preview";
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
  createClassroomPreviewParticipants,
  getParticipantImageUrl as getImageUrl,
  getParticipantRole as getRole,
} from "./classroom-participant";
import { ClassroomParticipantTile as ParticipantTile } from "./classroom-participant-tile";
import { DraggableClassroomPip as DraggablePip } from "./draggable-classroom-pip";
import { canRoleSendStudentScreenShareDecision as isAuthority } from "./classroom-capabilities";
import {
  useClassroomStageViewport,
  usePhoneLandscapeStageControls,
} from "./use-classroom-layout-state";
import { useClassroomMediaTracks } from "./use-classroom-media-tracks";
import { ClassroomView, ClassroomViewControls } from "./classroom-view";
import { ClassroomHeader } from "./classroom-header";
import {
  ClassroomParticipantsPanel,
  type ClassroomPanelTab,
} from "./classroom-participants-panel";
import {
  ClassroomActionBar,
  ClassroomActionButton,
} from "./classroom-action-bar";
import {
  ClassroomScreenShareContent,
  ClassroomStage,
  ClassroomWhiteboardContent,
} from "./classroom-stage";
import {
  ClassroomEnableAudioOverlay,
  ClassroomEndingSoonNotice,
  ClassroomFullscreenPrompt,
} from "./classroom-overlays";
import { getClassroomEndingSoonState } from "./classroom-session-timing";
import { useClassroomEndingSoonNotice } from "./use-classroom-ending-soon-notice";
import { getClassroomQueryNow } from "./use-classroom-clock";
import {
  selectClassroomLayer,
  type ClassroomLayer,
} from "./classroom-layer-coordinator";

type StudentClassroomPreviewState =
  | "none"
  | "next-class"
  | "leave-class"
  | "fullscreen"
  | "ending-soon"
  | "enable-audio"
  | "hand-raised"
  | "share-requesting"
  | "share-approved"
  | "recording-active";

const STUDENT_PREVIEW_LAYERS: Partial<
  Record<StudentClassroomPreviewState, ClassroomLayer>
> = {
  "next-class": "class-conflict",
  fullscreen: "fullscreen",
  "enable-audio": "enable-audio",
};

interface StudentClassroomUIProps {
  courseId: Id<"classes">;
  roomName: string;
  sessionNow: number;
  className?: string;
  lessonTitle?: string;
  curriculumIconKey?: string;
  onSwitchClassroom?: (roomName: string) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  uiPreviewEnabled?: boolean;
}

export function StudentClassroomUI({
  courseId,
  roomName,
  sessionNow,
  className,
  lessonTitle,
  curriculumIconKey,
  onSwitchClassroom,
  isFullscreen = false,
  onToggleFullscreen,
  uiPreviewEnabled = false,
}: StudentClassroomUIProps) {
  const t = useTranslations();
  const room = useRoomContext();
  const [needsClick, setNeedsClick] = useState(false);
  const [shareState, setShareState] = useState<
    "idle" | "requesting" | "approved"
  >("idle");
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [handRaised, setHandRaised] = useState(false);
  const [isRecording, setIsRecording] = useState(room.isRecording);
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
  const [followViewport, setFollowViewport] = useState(true);
  const [pendingFullscreen, setPendingFullscreen] = useState(false);
  const [dismissedExtensionEnd, setDismissedExtensionEnd] = useState<number>();
  const [isSessionActionDialogOpen, setIsSessionActionDialogOpen] =
    useState(false);
  const [uiPreviewState, setUiPreviewState] =
    useState<StudentClassroomPreviewState>("none");
  const [showPreviewParticipants, setShowPreviewParticipants] = useState(false);
  const [isClassroomPanelOpen, setIsClassroomPanelOpen] = useState(true);
  const [classroomPanelTab, setClassroomPanelTab] =
    useState<ClassroomPanelTab>("participants");
  const rootRef = useRef<HTMLDivElement>(null);
  const { zoom, pan, stageRef, handleZoom, startPanDrag } =
    useClassroomStageViewport();
  const { isPhoneLandscape, stageControlsVisible, showStageControls } =
    usePhoneLandscapeStageControls();

  const extensionContext = useQuery(api.schedule.getStudentExtensionContext, {
    roomName,
    now: getClassroomQueryNow(sessionNow),
  });
  const sessionLeadership = useQuery(api.schedule.getSessionLeadership, {
    roomName,
    now: getClassroomQueryNow(sessionNow),
  });
  const hasActivePreview =
    uiPreviewEnabled && (uiPreviewState !== "none" || showPreviewParticipants);
  const isPreviewing = (state: StudentClassroomPreviewState) =>
    uiPreviewEnabled && uiPreviewState === state;
  const previewNextClass = isPreviewing("next-class")
    ? {
        className: "Algebra I",
        roomName: "preview-next-class",
        startsAt: sessionNow + 5 * 60 * 1000,
      }
    : undefined;
  const nextClassForDisplay = isPreviewing("next-class")
    ? previewNextClass
    : extensionContext?.nextClass;
  const extensionEndForDisplay = isPreviewing("next-class")
    ? sessionNow + 10 * 60 * 1000
    : extensionContext?.extensionEndsAt;
  const hasClassConflict = Boolean(
    extensionEndForDisplay &&
      nextClassForDisplay &&
      dismissedExtensionEnd !== extensionEndForDisplay,
  );
  const endingSoonState = getClassroomEndingSoonState({
    roomName,
    now: sessionNow,
    timing: extensionContext,
    isPreview: isPreviewing("ending-soon"),
  });
  const endingSoonNotice = useClassroomEndingSoonNotice({
    ...endingSoonState,
    persistDismissal: !isPreviewing("ending-soon"),
  });
  const handRaisedForDisplay = hasActivePreview
    ? isPreviewing("hand-raised")
    : handRaised;
  const shareStateForDisplay = hasActivePreview
    ? isPreviewing("share-requesting")
      ? "requesting"
      : isPreviewing("share-approved")
        ? "approved"
        : "idle"
    : shareState;
  const isRecordingForDisplay = hasActivePreview
    ? isPreviewing("recording-active")
    : isRecording;
  const visibleLayer = selectClassroomLayer({
    activeLayers: {
      "class-conflict": hasClassConflict,
      "enable-audio": needsClick,
      fullscreen: pendingFullscreen,
    },
    isExternalDialogOpen: isSessionActionDialogOpen,
    isPreviewActive: hasActivePreview,
    previewLayer: STUDENT_PREVIEW_LAYERS[uiPreviewState] ?? null,
  });

  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  const teacher =
    (sessionLeadership?.leader
      ? participants.find(
          (participant) =>
            participant.identity ===
            sessionLeadership.leader?.participantIdentity,
        )
      : undefined) ||
    (!sessionLeadership?.leader
      ? participants.find((p) => getRole(p) === "teacher")
      : undefined) ||
    undefined;
  const students = participants.filter((p) => {
    const role = getRole(p);
    return role === "student";
  });
  const sortedStudents = useMemo(() => {
    const raisedHandsQueue = Array.from(raisedHands);
    return [...students].sort((a, b) => {
      const aRaised =
        raisedHands.has(a.identity) || (a.isLocal && handRaisedForDisplay);
      const bRaised =
        raisedHands.has(b.identity) || (b.isLocal && handRaisedForDisplay);
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
  }, [students, raisedHands, handRaisedForDisplay]);
  const previewParticipants = useMemo(
    () => createClassroomPreviewParticipants(),
    [],
  );
  const displayedStudents = useMemo(
    () =>
      uiPreviewEnabled && showPreviewParticipants
        ? [...sortedStudents, ...previewParticipants]
        : sortedStudents,
    [
      previewParticipants,
      showPreviewParticipants,
      sortedStudents,
      uiPreviewEnabled,
    ],
  );
  const {
    activeScreenTrack,
    isScreenSharingActive,
    isTeacherVideoOn,
    isTeacherAudioOn,
  } = useClassroomMediaTracks(teacher);
  const isSharingLocally = localParticipant?.isScreenShareEnabled;

  // Data channel for screen share requests
  useEffect(() => {
    const decoder = new TextDecoder();

    const handleData = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
    ) => {
      try {
        const msg = JSON.parse(decoder.decode(payload));
        const senderRole = getRole(participant);
        const senderIsAuthority = isAuthority(senderRole);
        const senderIsStudent = senderRole === "student";

        if (senderIsAuthority && msg.type === "ALLOW_SHARE") {
          setShareState("approved");
          toast.success(t("classroom.permissionGrantedClickToStart"));
        }

        if (senderIsAuthority && msg.type === "DENY_SHARE") {
          setShareState("idle");
          toast.error(t("classroom.permissionDenied"));
        }

        if (
          senderIsAuthority &&
          msg.type === "STOP_SHARE" &&
          isSharingLocally
        ) {
          localParticipant?.setScreenShareEnabled(false);
          setShareState("idle");
          toast.info(t("classroom.sharingStoppedByTeacher"));
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
            toast.dismiss("hand-raised");
          }
        }

        if (senderIsStudent && msg.type === "RAISE_HAND" && participant) {
          setRaisedHands((prev) => new Set(prev).add(participant.identity));
        }

        if (senderIsStudent && msg.type === "LOWER_HAND" && participant) {
          setRaisedHands((prev) => {
            const next = new Set(prev);
            next.delete(participant.identity);
            return next;
          });
        }

        if (senderIsAuthority && msg.type === "WHITEBOARD_STATE") {
          setIsWhiteboardActive(msg.active);
          if (msg.active) {
            toast.success(
              t("classroom.whiteboardStarted") ||
                "Teacher opened the whiteboard",
            );
          } else {
            toast.info(t("classroom.whiteboardStopped") || "Whiteboard closed");
          }
        }
      } catch (e) {
        console.error("Failed to parse data message", e);
      }
    };

    room.on("dataReceived", handleData);
    return () => {
      room.off("dataReceived", handleData);
    };
  }, [room, isSharingLocally, localParticipant, t]);

  useEffect(() => {
    const handleMediaError = (error: Error) => {
      if (
        error.message?.includes("Device in use") ||
        error.name === "NotReadableError" ||
        error.name === "TrackStartError"
      ) {
        toast.error(t("classroom.cameraInUse"));
      } else {
        console.error("Room media devices error:", error);
      }
    };
    room.on(RoomEvent.MediaDevicesError, handleMediaError);
    return () => {
      room.off(RoomEvent.MediaDevicesError, handleMediaError);
    };
  }, [room, t]);

  useEffect(() => {
    const handleRecordingChange = (recording: boolean) => {
      setIsRecording(recording);
      if (recording) {
        toast.info(t("classroom.recordingStarted"));
      } else {
        toast.info(t("classroom.recordingStopped"));
      }
    };
    room.on(RoomEvent.RecordingStatusChanged, handleRecordingChange);
    return () => {
      room.off(RoomEvent.RecordingStatusChanged, handleRecordingChange);
    };
  }, [room, t]);

  const handleShareAction = async () => {
    if (isPreviewing("share-requesting") || isPreviewing("share-approved")) {
      setUiPreviewState("none");
      return;
    }
    // Pre-flight: Fail fast before allowing any state changes or requests
    if (typeof navigator.mediaDevices?.getDisplayMedia !== "function") {
      toast.error(t("classroom.screenShareNotSupported"));
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
        if (
          err.name === "NotAllowedError" ||
          err.message?.includes("Permission denied")
        )
          return;
        try {
          await localParticipant?.setScreenShareEnabled(true, { audio: false });
          toast.warning(t("classroom.screenShareAudioNotSupported"));
        } catch {
          toast.error(t("classroom.screenShareNotSupported"));
        }
      }
      return;
    }

    requestPermission();
  };

  const requestPermission = async () => {
    if (isScreenSharingActive && !isSharingLocally) {
      toast.error(t("classroom.someoneSharing"));
      return;
    }
    setShareState("requesting");
    const encoder = new TextEncoder();
    const data = JSON.stringify({ type: "REQUEST_SHARE" });
    await room.localParticipant.publishData(encoder.encode(data), {
      reliable: true,
    });
    toast.info(t("classroom.requestSent"));
  };

  const toggleHandRaised = async () => {
    if (isPreviewing("hand-raised")) {
      setUiPreviewState("none");
      return;
    }
    const newState = !handRaised;
    setHandRaised(newState);
    const encoder = new TextEncoder();
    const data = JSON.stringify({
      type: newState ? "RAISE_HAND" : "LOWER_HAND",
    });
    await room.localParticipant.publishData(encoder.encode(data), {
      reliable: true,
    });
    if (newState) toast.info(t("classroom.handRaised"), { id: "hand-raised" });
    else toast.dismiss("hand-raised");
  };

  const handleLeave = async () => {
    try {
      await room.disconnect();
    } catch (error) {
      console.error("Error leaving classroom:", error);
    }
  };

  const handleGoToNextClass = async () => {
    if (isPreviewing("next-class")) {
      setUiPreviewState("none");
      return;
    }
    if (!extensionContext?.nextClass) return;
    onSwitchClassroom?.(extensionContext.nextClass.roomName);
    await room.disconnect();
  };

  useEffect(() => {
    const unlockAudio = async () => {
      try {
        await room.startAudio();
      } catch {
        setNeedsClick(true);
      }
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

  // Auto-fullscreen: prompt user to go fullscreen when remote content appears.
  // requestFullscreen() requires a user gesture, so we cannot call it from a useEffect directly.
  const autoFullscreenFiredRef = useRef(false);
  useEffect(() => {
    const hasContent = isScreenSharingActive || isWhiteboardActive;
    if (
      hasContent &&
      !isFullscreen &&
      !autoFullscreenFiredRef.current &&
      onToggleFullscreen
    ) {
      autoFullscreenFiredRef.current = true;
      setPendingFullscreen(true);
    }
    if (!hasContent) {
      autoFullscreenFiredRef.current = false;
      setPendingFullscreen(false);
    }
    if (isFullscreen) setPendingFullscreen(false);
  }, [
    isScreenSharingActive,
    isWhiteboardActive,
    isFullscreen,
    onToggleFullscreen,
  ]);

  const selectPreviewState = (state: StudentClassroomPreviewState) => {
    setShowPreviewParticipants(false);
    setUiPreviewState((current) => (current === state ? "none" : state));
  };

  const previewOptions: ClassroomPreviewOption[] = [
    {
      id: "next-class",
      label: "Next class conflict",
      group: "Dialogs",
      isActive: isPreviewing("next-class"),
      onSelect: () => selectPreviewState("next-class"),
    },
    {
      id: "leave-class",
      label: "Leave class",
      group: "Dialogs",
      isActive: isPreviewing("leave-class"),
      onSelect: () => selectPreviewState("leave-class"),
    },
    {
      id: "fullscreen",
      label: "Fullscreen invitation",
      group: "Dialogs",
      isActive: isPreviewing("fullscreen"),
      onSelect: () => selectPreviewState("fullscreen"),
    },
    {
      id: "ending-soon",
      label: "Ending soon banner",
      group: "Overlays",
      isActive: isPreviewing("ending-soon"),
      onSelect: () => selectPreviewState("ending-soon"),
    },
    {
      id: "enable-audio",
      label: "Enable audio",
      group: "Overlays",
      isActive: isPreviewing("enable-audio"),
      onSelect: () => selectPreviewState("enable-audio"),
    },
    {
      id: "hand-raised",
      label: "Hand raised",
      group: "Controls",
      isActive: isPreviewing("hand-raised"),
      onSelect: () => selectPreviewState("hand-raised"),
    },
    {
      id: "share-requesting",
      label: "Share requesting",
      group: "Controls",
      isActive: isPreviewing("share-requesting"),
      onSelect: () => selectPreviewState("share-requesting"),
    },
    {
      id: "share-approved",
      label: "Share approved",
      group: "Controls",
      isActive: isPreviewing("share-approved"),
      onSelect: () => selectPreviewState("share-approved"),
    },
    {
      id: "recording-active",
      label: "Recording active",
      group: "Controls",
      isActive: isPreviewing("recording-active"),
      onSelect: () => selectPreviewState("recording-active"),
    },
    {
      id: "demo-participants",
      label: "Demo participants",
      group: "Controls",
      isActive: showPreviewParticipants,
      onSelect: () => {
        setUiPreviewState("none");
        setShowPreviewParticipants((current) => !current);
      },
    },
    {
      id: "toast-hand",
      label: "Hand raised",
      group: "Notifications",
      onSelect: () => toast.info(t("classroom.handRaised")),
    },
    {
      id: "toast-permission",
      label: "Share approved",
      group: "Notifications",
      onSelect: () =>
        toast.success(t("classroom.permissionGrantedClickToStart")),
    },
    {
      id: "toast-recording",
      label: "Recording started",
      group: "Notifications",
      onSelect: () => toast.info(t("classroom.recordingStarted")),
    },
    {
      id: "toast-error",
      label: "Permission denied",
      group: "Notifications",
      onSelect: () => toast.error(t("classroom.permissionDenied")),
    },
  ];

  return (
    <ClassroomView ref={rootRef} isSidebarOpen={isClassroomPanelOpen}>
      {uiPreviewEnabled && (
        <ClassroomUiPreview
          roleLabel="student"
          options={previewOptions}
          onReset={() => {
            setUiPreviewState("none");
            setShowPreviewParticipants(false);
          }}
        />
      )}

      {endingSoonNotice.shouldShowNotice && (
        <ClassroomEndingSoonNotice
          label={t("classroom.studentClassEndingSoon")}
          dismissLabel={t("common.close")}
          onDismiss={() => {
            endingSoonNotice.dismissNotice();
            if (isPreviewing("ending-soon")) setUiPreviewState("none");
          }}
        />
      )}

      <AlertDialog
        open={visibleLayer === "class-conflict"}
        onOpenChange={(open) => {
          if (!open && isPreviewing("next-class")) {
            setUiPreviewState("none");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("classroom.classWasExtended")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {nextClassForDisplay
                ? t("classroom.nextClassStartsDuringExtension", {
                    className: nextClassForDisplay.className,
                    time: new Intl.DateTimeFormat(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(nextClassForDisplay.startsAt),
                  })
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                if (isPreviewing("next-class")) {
                  setUiPreviewState("none");
                  return;
                }
                setDismissedExtensionEnd(extensionEndForDisplay);
              }}
            >
              {t("classroom.stayInThisClass")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleGoToNextClass();
              }}
            >
              {t("classroom.goToNextClass")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {visibleLayer === "enable-audio" && (
        <ClassroomEnableAudioOverlay
          title={t("classroom.enableAudio")}
          actionLabel={t("classroom.startClass")}
          onEnable={async () => {
            if (isPreviewing("enable-audio")) {
              setUiPreviewState("none");
              return;
            }
            await room.startAudio();
            setNeedsClick(false);
          }}
        />
      )}

      {/* 1. Header */}
      <ClassroomHeader
        title={className || t("classroom.classroom")}
        subtitle={lessonTitle}
        curriculumIconKey={curriculumIconKey}
        isActive={Boolean(teacher)}
        activeLabel={t("common.live")}
        waitingLabel={t("classroom.waiting")}
        isRecording={isRecordingForDisplay}
        isPhoneLandscape={isPhoneLandscape}
        isPanelOpen={isClassroomPanelOpen}
        openPanelLabel={t("classroom.openInteractionPanel")}
        closePanelLabel={t("classroom.closeInteractionPanel")}
        onPanelOpenChange={setIsClassroomPanelOpen}
        sessionAction={
          <LeaveClassButton
            appearance="header"
            onConfirm={handleLeave}
            onOpenChange={setIsSessionActionDialogOpen}
          />
        }
      />

      {/* 2. Stage */}
      <ClassroomStage
        stageRef={stageRef}
        className="bg-muted"
        isPhoneLandscape={isPhoneLandscape}
        stageControlsVisible={stageControlsVisible}
        onRevealControls={showStageControls}
        zoom={zoom}
        contentActive={isWhiteboardActive || isScreenSharingActive}
        isWhiteboardActive={isWhiteboardActive}
        followViewport={followViewport}
        onToggleFollowViewport={() => setFollowViewport((value) => !value)}
        followingLabel={t("classroom.followingTeacher") || "Following"}
        unlockedLabel={t("classroom.viewUnlocked") || "Unlocked"}
        isFullscreen={isFullscreen}
        onToggleFullscreen={onToggleFullscreen}
        enterFullscreenLabel={t("classroom.enterFullscreen") || "Fullscreen"}
        exitFullscreenLabel={t("classroom.exitFullscreen") || "Exit fullscreen"}
        phoneControls={
          <>
            <DeviceToggleButton
              variant="compact"
              source={Track.Source.Microphone}
              kind="audioinput"
              iconOn={<Mic className="w-5 h-5" />}
              iconOff={<MicOff className="w-5 h-5" />}
            />
            <DeviceToggleButton
              variant="compact"
              source={Track.Source.Camera}
              kind="videoinput"
              iconOn={<VideoIcon className="w-5 h-5" />}
              iconOff={<VideoOff className="w-5 h-5" />}
            />
            <button
              onClick={toggleHandRaised}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-lg border-2 ${
                handRaisedForDisplay
                  ? "bg-warning/80 text-warning-foreground border-warning animate-bounce"
                  : "bg-inverse-foreground/20 text-inverse-foreground border-inverse-foreground/30 hover:bg-inverse-foreground/30"
              }`}
            >
              <Hand className="w-5 h-5" />
            </button>
            <button
              onClick={handleShareAction}
              disabled={shareStateForDisplay === "requesting"}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-lg border-2 ${
                isSharingLocally
                  ? "bg-success/80 text-success-foreground border-success"
                  : shareStateForDisplay === "approved"
                    ? "bg-info/80 text-info-foreground border-info animate-pulse"
                    : shareStateForDisplay === "requesting"
                      ? "bg-warning/80 text-warning-foreground border-warning cursor-wait"
                      : "bg-inverse-foreground/20 text-inverse-foreground border-inverse-foreground/30 hover:bg-inverse-foreground/30"
              }`}
            >
              <MonitorUp className="w-5 h-5" />
            </button>
            <div className="w-px h-6 bg-inverse-foreground/30 mx-1" />
            {onToggleFullscreen && (
              <FullscreenButtonCompact
                isFullscreen={isFullscreen}
                onToggle={onToggleFullscreen}
              />
            )}
            <div className="w-px h-6 bg-inverse-foreground/30 mx-1" />
            <LeaveClassButton
              onConfirm={handleLeave}
              onOpenChange={setIsSessionActionDialogOpen}
              className="flex size-11 items-center justify-center rounded-full border-2 border-destructive/60 bg-destructive/80 text-destructive-foreground shadow-lg transition-colors hover:bg-destructive/90"
            />
          </>
        }
      >
        {isWhiteboardActive ? (
          <ClassroomWhiteboardContent
            roomName={room.name}
            followViewport={followViewport}
          />
        ) : isScreenSharingActive ? (
          <ClassroomScreenShareContent
            trackRef={activeScreenTrack}
            zoom={zoom}
            pan={pan}
            isPhoneLandscape={isPhoneLandscape}
            stageControlsVisible={stageControlsVisible}
            onRevealControls={showStageControls}
            onStartPan={startPanDrag}
            onZoom={handleZoom}
            loadingLabel={t("classroom.loadingShare")}
          />
        ) : (
          <>
            <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/chalkboard.png')]" />
            {teacher ? (
              isTeacherVideoOn ? (
                <ParticipantTile
                  participant={teacher}
                  variant="stage"
                  className="w-full h-full object-contain bg-transparent"
                  showLabel={true}
                  roleBadge={t("classroom.teacher")}
                  youLabel={t("classroom.youShort")}
                  audioMuted={!isTeacherAudioOn}
                />
              ) : (
                <div className="z-10 flex flex-col items-center justify-center p-8 text-center">
                  <div className="mb-5 flex size-32 items-center justify-center overflow-hidden rounded-full border-2 border-border bg-secondary shadow-lg">
                    {getImageUrl(teacher) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getImageUrl(teacher)!}
                        alt={teacher.name || ""}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-5xl font-bold text-secondary-foreground">
                        {teacher.name?.charAt(0) || "T"}
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-bold text-foreground">
                    {teacher.name || t("classroom.teacher")}
                  </h2>
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <div className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/80 px-3 py-1.5">
                      <VideoOff className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-secondary-foreground">
                        {t("classroom.cameraOffLabel")}
                      </span>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 ${
                        isTeacherAudioOn
                          ? "border-border bg-secondary/80"
                          : "border-destructive/20 bg-destructive/10"
                      }`}
                    >
                      <Mic
                        className={`size-4 ${isTeacherAudioOn ? "animate-pulse text-success" : "text-destructive"}`}
                      />
                      <span className="text-sm font-medium text-secondary-foreground">
                        {isTeacherAudioOn
                          ? t("classroom.audioOnly")
                          : t("classroom.micOff")}
                      </span>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="z-10 p-8 text-center">
                <div className="mx-auto mb-4 flex size-32 items-center justify-center rounded-full border-2 border-border bg-background/50 shadow-sm backdrop-blur-sm">
                  <span className="text-6xl">👩‍🏫</span>
                </div>
                <h2 className="text-2xl font-bold text-foreground">
                  {className || t("classroom.class")}
                </h2>
                <p className="mt-2 font-medium text-muted-foreground">
                  {t("classroom.waitingForTeacher")}
                </p>
              </div>
            )}
          </>
        )}
      </ClassroomStage>

      {/* 3. Controls — hidden in phone landscape (replaced by floating stage overlay) */}
      <ClassroomViewControls isPhoneLandscape={isPhoneLandscape}>
        <ClassroomActionBar
          mobile={
            <>
              <DeviceToggleButton
                variant="toolbar"
                source={Track.Source.Microphone}
                kind="audioinput"
                includeAudioOutput
                label={t("classroom.microphone")}
                activeLabel={t("common.active")}
                inactiveLabel={t("common.inactive")}
                pickerLabel={t("classroom.selectAudioDevice")}
                iconOn={<Mic />}
                iconOff={<MicOff />}
              />
              <DeviceToggleButton
                variant="toolbar"
                source={Track.Source.Camera}
                kind="videoinput"
                label={t("classroom.camera")}
                activeLabel={t("common.active")}
                inactiveLabel={t("common.inactive")}
                pickerLabel={t("classroom.selectCamera")}
                iconOn={<VideoIcon />}
                iconOff={<VideoOff />}
              />
              <ClassroomActionButton
                icon={<Hand />}
                label={
                  handRaisedForDisplay
                    ? t("classroom.lowerHand")
                    : t("classroom.raiseHand")
                }
                pressed={handRaisedForDisplay}
                statusLabel={
                  handRaisedForDisplay
                    ? t("common.active")
                    : t("common.inactive")
                }
                tone="warning"
                onPressedChange={() => void toggleHandRaised()}
              />
              <ClassroomActionButton
                icon={<MonitorUp />}
                label={t("classroom.shareScreen")}
                pressed={Boolean(isSharingLocally)}
                statusLabel={
                  shareStateForDisplay === "requesting"
                    ? t("classroom.waitingForApproval")
                    : isSharingLocally || shareStateForDisplay === "approved"
                      ? t("common.active")
                      : t("common.inactive")
                }
                tone="success"
                disabled={shareStateForDisplay === "requesting"}
                onPressedChange={() => void handleShareAction()}
              />
            </>
          }
          left={
            <>
              <DeviceToggleButton
                variant="toolbar"
                source={Track.Source.Microphone}
                kind="audioinput"
                includeAudioOutput
                label={t("classroom.microphone")}
                activeLabel={t("common.active")}
                inactiveLabel={t("common.inactive")}
                pickerLabel={t("classroom.selectAudioDevice")}
                iconOn={<Mic />}
                iconOff={<MicOff />}
              />
              <DeviceToggleButton
                variant="toolbar"
                source={Track.Source.Camera}
                kind="videoinput"
                label={t("classroom.camera")}
                activeLabel={t("common.active")}
                inactiveLabel={t("common.inactive")}
                pickerLabel={t("classroom.selectCamera")}
                iconOn={<VideoIcon />}
                iconOff={<VideoOff />}
              />
            </>
          }
          center={
            <>
              <ClassroomActionButton
                icon={<Hand />}
                label={
                  handRaisedForDisplay
                    ? t("classroom.lowerHand")
                    : t("classroom.raiseHand")
                }
                pressed={handRaisedForDisplay}
                statusLabel={
                  handRaisedForDisplay
                    ? t("common.active")
                    : t("common.inactive")
                }
                tone="warning"
                title={
                  handRaisedForDisplay
                    ? t("classroom.lowerHand")
                    : t("classroom.raiseHand")
                }
                onPressedChange={() => void toggleHandRaised()}
              />
              <ClassroomActionButton
                icon={<MonitorUp />}
                label={t("classroom.shareScreen")}
                pressed={Boolean(isSharingLocally)}
                statusLabel={
                  shareStateForDisplay === "requesting"
                    ? t("classroom.waitingForApproval")
                    : isSharingLocally || shareStateForDisplay === "approved"
                      ? t("common.active")
                      : t("common.inactive")
                }
                tone="success"
                disabled={shareStateForDisplay === "requesting"}
                onPressedChange={() => void handleShareAction()}
              />
            </>
          }
          right={
            <LeaveClassButton
              appearance="toolbar"
              onConfirm={handleLeave}
              onOpenChange={setIsSessionActionDialogOpen}
              previewOpen={isPreviewing("leave-class")}
              onPreviewOpenChange={(open) => {
                if (!open) setUiPreviewState("none");
              }}
            />
          }
        />
      </ClassroomViewControls>

      <ClassroomFullscreenPrompt
        open={visibleLayer === "fullscreen"}
        title={t("classroom.fullscreenInviteTitle") || "Go fullscreen?"}
        description={
          t("classroom.fullscreenInviteDesc") ||
          "Content is being presented. Going fullscreen provides the best viewing experience."
        }
        cancelLabel={t("common.notNow") || "Not now"}
        confirmLabel={t("classroom.goFullscreen") || "Go Fullscreen"}
        onOpenChange={(open) => {
          if (!open) {
            setPendingFullscreen(false);
            if (isPreviewing("fullscreen")) setUiPreviewState("none");
          }
        }}
        onCancel={() => {
          setPendingFullscreen(false);
          if (isPreviewing("fullscreen")) setUiPreviewState("none");
        }}
        onConfirm={() => {
          setPendingFullscreen(false);
          if (isPreviewing("fullscreen")) {
            setUiPreviewState("none");
            return;
          }
          onToggleFullscreen?.();
        }}
      />

      {/* 4. Classmates: horizontal below the stage, vertical beside it */}
      <ClassroomParticipantsPanel
        courseId={courseId}
        heading={t("classroom.classmates")}
        compactHeading={t("classroom.classmatesAndChat")}
        compactOpenLabel={t("classroom.openPanelAction")}
        chatLabel={t("classroom.chat")}
        isOpen={isClassroomPanelOpen}
        activeTab={classroomPanelTab}
        onTabChange={setClassroomPanelTab}
        previousLabel={t("common.previous")}
        nextLabel={t("common.next")}
        isEmpty={displayedStudents.length === 0}
        emptyContent={t("classroom.youAreFirst")}
        participants={displayedStudents}
        raisedParticipantIds={raisedHands}
        localParticipantRaised={handRaisedForDisplay}
        youLabel={t("classroom.youShort")}
        raisedHandLabel={t("classroom.raisedHand")}
        raisedHandsCountLabel={(count) =>
          t("classroom.raisedHandsCount", { count })
        }
        lowerHandLabel={t("classroom.lowerHand")}
      >
        {displayedStudents.map((p) => (
          <ParticipantTile
            key={p.identity}
            variant="grid"
            participant={p}
            className="aspect-square h-24 w-24 flex-shrink-0 snap-start snap-always sm:h-28 sm:w-28 landscape:h-auto landscape:w-full xl:aspect-auto xl:h-full xl:w-full"
            raisedHand={
              raisedHands.has(p.identity) || (p.isLocal && handRaisedForDisplay)
            }
            youLabel={t("classroom.youShort")}
          />
        ))}
      </ClassroomParticipantsPanel>

      {/* Teacher PiP — floats over the entire classroom during whiteboard & screen share */}
      {(isWhiteboardActive || isScreenSharingActive) &&
        teacher &&
        isTeacherVideoOn && (
          <DraggablePip containerRef={rootRef}>
            <ParticipantTile
              participant={teacher}
              variant="grid"
              className="w-full h-full"
              showLabel={true}
              youLabel={t("classroom.youShort")}
            />
          </DraggablePip>
        )}
    </ClassroomView>
  );
}
