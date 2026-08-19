"use client";

import { useMutation, useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  useLocalParticipant,
  useRoomContext,
  useParticipants,
} from "@livekit/components-react";
import {
  Track,
  RemoteParticipant,
  RemoteTrackPublication,
  RoomEvent,
} from "livekit-client";
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  MonitorUp,
  Hand,
  Loader2,
  Eye,
  UserStar,
  CircleDot,
  StopCircle,
  TabletSmartphone,
  MoreHorizontal,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { LeaveClassButton } from "./leave-class-button";
import { EndClassButton } from "./end-class-button";
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
import { FullscreenButtonCompact } from "./fullscreen-button";
import { DeviceToggleButton } from "./device-toggle-button";
import {
  ClassroomUiPreview,
  type ClassroomPreviewOption,
} from "./classroom-ui-preview";
import {
  createClassroomPreviewParticipants,
  getIsCompanionParticipant as getIsCompanion,
  getParticipantImageUrl as getImageUrl,
  getParticipantRole as getRole,
} from "./classroom-participant";
import { ClassroomParticipantTile as ParticipantTile } from "./classroom-participant-tile";
import { DraggableClassroomPip as DraggablePip } from "./draggable-classroom-pip";
import {
  getClassroomCapabilities,
  isClassroomSessionAuthority as isAuthority,
} from "./classroom-capabilities";
import {
  useClassroomStageViewport,
  usePhoneLandscapeStageControls,
} from "./use-classroom-layout-state";
import { useClassroomMediaTracks } from "./use-classroom-media-tracks";
import { ClassroomView, ClassroomViewControls } from "./classroom-view";
import { ClassroomHeader } from "./classroom-header";
import { ClassroomParticipantsPanel } from "./classroom-participants-panel";
import {
  ClassroomActionBar,
  ClassroomActionButton,
} from "./classroom-action-bar";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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

// --- Types ---
type ShareRequest = {
  participantId: string;
  name: string;
};

type ActiveClassroomPreviewState =
  | "none"
  | "start-class"
  | "end-class"
  | "leave-class"
  | "extend-class"
  | "fullscreen"
  | "recording-confirm"
  | "companion"
  | "ending-soon"
  | "enable-audio"
  | "share-request"
  | "recording-active"
  | "share-waiting"
  | "presenter-active";

const ACTIVE_PREVIEW_LAYERS: Partial<
  Record<ActiveClassroomPreviewState, ClassroomLayer>
> = {
  "start-class": "session-start",
  "extend-class": "extension-decision",
  fullscreen: "fullscreen",
  "recording-confirm": "recording-confirmation",
  companion: "companion",
  "enable-audio": "enable-audio",
  "share-request": "share-permission",
};

// --- Main Component ---

interface ActiveClassroomUIProps {
  currentUserRole?: string;
  roomName: string;
  sessionNow: number;
  className?: string;
  lessonTitle?: string;
  sessionIsLive: boolean;
  sessionTimeZone: string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  uiPreviewEnabled?: boolean;
}

export function ActiveClassroomUI({
  currentUserRole,
  roomName,
  sessionNow,
  className,
  lessonTitle,
  sessionIsLive,
  sessionTimeZone,
  isFullscreen = false,
  onToggleFullscreen,
  uiPreviewEnabled = false,
}: ActiveClassroomUIProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const room = useRoomContext();

  const [companionUrl, setCompanionUrl] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setCompanionUrl(`${window.location.origin}${pathname}?companion=true`);
    }
  }, [pathname]);
  const markLive = useMutation(api.schedule.markLive);
  const confirmLiveExtension = useMutation(api.schedule.confirmLiveExtension);
  const toggleRecording = useAction(api.livekit.toggleRecording);
  const endSession = useAction(api.livekit.endSession);
  const notifyRoomAdministratorLeft = useAction(
    api.livekit.notifyRoomAdministratorLeft,
  );
  const requestLiveReconciliation = useAction(
    api.livekit.requestLiveReconciliation,
  );
  const setScreenSharePermission = useAction(
    api.livekit.setParticipantScreenSharePermission,
  );
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  // --- STATE ---
  const [needsClick, setNeedsClick] = useState(false);
  const [isConfirmingExtension, setIsConfirmingExtension] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<ShareRequest | null>(
    null,
  );
  const [waitingForApproval, setWaitingForApproval] = useState(false);
  const [shareApproved, setShareApproved] = useState(false);
  const [presenterMode, setPresenterMode] = useState(false);
  const [adminPresenterId, setAdminPresenterId] = useState<string | null>(null);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [isRecording, setIsRecording] = useState(room.isRecording);
  const [showRecordConfirm, setShowRecordConfirm] = useState(false);
  const [isTogglingRecord, setIsTogglingRecord] = useState(false);
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
  const [followViewport, setFollowViewport] = useState(true);
  const [pendingFullscreen, setPendingFullscreen] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [hasStartedSession, setHasStartedSession] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [isSessionActionDialogOpen, setIsSessionActionDialogOpen] =
    useState(false);
  const [uiPreviewState, setUiPreviewState] =
    useState<ActiveClassroomPreviewState>("none");
  const [showPreviewParticipants, setShowPreviewParticipants] = useState(false);
  const reconciliationAttemptRef = useRef({ effectiveEnd: 0, attemptedAt: 0 });
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { zoom, pan, stageRef, handleZoom, startPanDrag } =
    useClassroomStageViewport();
  const { isPhoneLandscape, stageControlsVisible, showStageControls } =
    usePhoneLandscapeStageControls();

  const capabilities = getClassroomCapabilities("staff", currentUserRole);
  const amITeacher = capabilities.isTeacher;
  const amIAuthority = capabilities.canManageSession;
  const hasActivePreview =
    uiPreviewEnabled && (uiPreviewState !== "none" || showPreviewParticipants);
  const isPreviewing = (state: ActiveClassroomPreviewState) =>
    uiPreviewEnabled && uiPreviewState === state;

  const extensionContext = useQuery(
    api.schedule.getLiveExtensionContext,
    amIAuthority && sessionIsLive
      ? {
          roomName,
          now: getClassroomQueryNow(sessionNow),
        }
      : "skip",
  );

  const hasExtensionDecision =
    amIAuthority &&
    sessionIsLive &&
    !!extensionContext?.decisionEndsAt &&
    sessionNow < extensionContext.decisionEndsAt;
  const decisionSecondsRemaining = isPreviewing("extend-class")
    ? 60
    : extensionContext?.decisionEndsAt
      ? Math.max(
          0,
          Math.ceil((extensionContext.decisionEndsAt - sessionNow) / 1000),
        )
      : 0;
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
  const extensionStaffConflict = isPreviewing("extend-class")
    ? {
        className: "Algebra I",
        startsAt: sessionNow + 5 * 60 * 1000,
      }
    : extensionContext?.staffConflict;
  const affectedStudentCount = isPreviewing("extend-class")
    ? 3
    : (extensionContext?.affectedStudentCount ?? 0);
  const isRecordingForDisplay = hasActivePreview
    ? isPreviewing("recording-active")
    : isRecording;
  const isWaitingForApprovalForDisplay = hasActivePreview
    ? isPreviewing("share-waiting")
    : waitingForApproval;
  const isShareApprovedForDisplay = hasActivePreview ? false : shareApproved;
  const visibleLayer = selectClassroomLayer({
    activeLayers: {
      "session-start": amIAuthority && !sessionIsLive && !hasStartedSession,
      "extension-decision": hasExtensionDecision,
      "share-permission": Boolean(pendingRequest && amIAuthority),
      "recording-confirmation": showRecordConfirm,
      companion: showQR,
      "enable-audio": needsClick,
      fullscreen: pendingFullscreen,
    },
    isExternalDialogOpen: isSessionActionDialogOpen,
    isPreviewActive: hasActivePreview,
    previewLayer: ACTIVE_PREVIEW_LAYERS[uiPreviewState] ?? null,
  });

  useEffect(() => {
    if (
      !amIAuthority ||
      !sessionIsLive ||
      !extensionContext ||
      extensionContext.decisionEndsAt ||
      sessionNow < extensionContext.effectiveEnd
    ) {
      return;
    }

    const previousAttempt = reconciliationAttemptRef.current;
    if (
      previousAttempt.effectiveEnd === extensionContext.effectiveEnd &&
      sessionNow - previousAttempt.attemptedAt < 10_000
    ) {
      return;
    }

    reconciliationAttemptRef.current = {
      effectiveEnd: extensionContext.effectiveEnd,
      attemptedAt: sessionNow,
    };
    void requestLiveReconciliation({ roomName }).catch((error) => {
      console.error("Failed to reconcile live session:", error);
    });
  }, [
    amIAuthority,
    extensionContext,
    sessionNow,
    requestLiveReconciliation,
    roomName,
    sessionIsLive,
  ]);

  const playHandChime = useCallback(() => {
    if (!amIAuthority) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const t0 = ctx.currentTime;
      [
        [660, 0],
        [880, 0.18],
        [1100, 0.36],
      ].forEach(([freq, delay]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t0 + delay);
        gain.gain.linearRampToValueAtTime(0.18, t0 + delay + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + delay + 0.35);
        osc.start(t0 + delay);
        osc.stop(t0 + delay + 0.35);
      });
    } catch {
      /* non-critical */
    }
  }, [amIAuthority]);

  // --- ROLE & PARTICIPANT LOGIC ---
  const actualTeacher = participants.find((p) => {
    const role = p.isLocal ? currentUserRole : getRole(p);
    return role === "teacher";
  });
  const adminPresenterParticipant = adminPresenterId
    ? participants.find((p) => p.identity === adminPresenterId)
    : null;
  const isLocalAdminPresenting =
    amIAuthority &&
    !amITeacher &&
    !actualTeacher &&
    (hasActivePreview ? isPreviewing("presenter-active") : presenterMode);
  const teacher =
    actualTeacher ||
    adminPresenterParticipant ||
    (isLocalAdminPresenting ? localParticipant : null) ||
    undefined;
  const amIIncognito = amIAuthority && !amITeacher && !!actualTeacher;

  const handleStartSession = async () => {
    setIsStartingSession(true);
    try {
      await markLive({ roomName, isLive: true });
      setHasStartedSession(true);
    } catch {
      toast.error(t("classroom.startClassError"));
    } finally {
      setIsStartingSession(false);
    }
  };

  // A companion is any remote participant whose metadata marks isCompanion: true
  const companionParticipants = participants.filter(
    (participant) =>
      !participant.isLocal &&
      getIsCompanion(participant) &&
      isAuthority(getRole(participant)),
  );
  const hasCompanion = companionParticipants.length > 0;
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
      if (aRaised && bRaised)
        return (
          raisedHandsQueue.indexOf(a.identity) -
          raisedHandsQueue.indexOf(b.identity)
        );
      if (aRaised) return -1;
      if (bRaised) return 1;
      return (a.name || a.identity).localeCompare(b.name || b.identity);
    });
  }, [students, raisedHands]);
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
    screenTracks,
    activeScreenTrack,
    isScreenSharingActive,
    isTeacherVideoOn,
    isTeacherAudioOn,
  } = useClassroomMediaTracks(teacher);
  const isSharingLocally = localParticipant?.isScreenShareEnabled;

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

        if (
          amIAuthority &&
          senderIsStudent &&
          msg.type === "REQUEST_SHARE" &&
          participant
        ) {
          setPendingRequest({
            participantId: participant.identity,
            name: participant.name || t("classroom.student"),
          });
        }

        if (!amIAuthority && senderIsAuthority && msg.type === "ALLOW_SHARE") {
          setWaitingForApproval(false);
          setShareApproved(true); // requires a user gesture click to actually start — see handleShareClick
          toast.success(t("classroom.permissionGranted"));
        }

        if (!amIAuthority && senderIsAuthority && msg.type === "DENY_SHARE") {
          setWaitingForApproval(false);
          toast.error(t("classroom.permissionDenied"));
        }

        if (
          senderIsAuthority &&
          msg.type === "STOP_SHARE" &&
          isSharingLocally
        ) {
          localParticipant?.setScreenShareEnabled(false);
          toast.info(t("classroom.sharingStoppedByTeacher"));
        }

        if (senderIsStudent && msg.type === "RAISE_HAND" && participant) {
          setRaisedHands((prev) => new Set(prev).add(participant.identity));
          if (amIAuthority) {
            playHandChime();
            const name = participant.name || participant.identity;
            toast.custom(
              (toastId) => (
                <div className="bg-card border border-warning/60 rounded-xl shadow-lg p-3 w-72 flex items-start gap-3">
                  <div className="bg-warning/10 p-2 rounded-full flex-shrink-0">
                    <Hand className="w-4 h-4 text-warning" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-card-foreground truncate">
                      {name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("classroom.raisedHand")}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      const encoder = new TextEncoder();
                      await room.localParticipant.publishData(
                        encoder.encode(
                          JSON.stringify({
                            type: "FORCE_LOWER_HAND",
                            participantId: participant.identity,
                          }),
                        ),
                        { reliable: true },
                      );
                      setRaisedHands((prev) => {
                        const next = new Set(prev);
                        next.delete(participant.identity);
                        return next;
                      });
                      toast.dismiss(toastId);
                    }}
                    className="text-[10px] font-bold text-warning bg-warning/10 hover:bg-warning/20 border border-warning/30 rounded-lg px-2 py-1 flex-shrink-0 transition-colors"
                  >
                    {t("classroom.lowerHand")}
                  </button>
                </div>
              ),
              { id: `hand-${participant.identity}`, duration: 8000 },
            );
          }
        }

        if (senderIsStudent && msg.type === "LOWER_HAND" && participant) {
          setRaisedHands((prev) => {
            const next = new Set(prev);
            next.delete(participant.identity);
            return next;
          });
          toast.dismiss(`hand-${participant.identity}`);
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
          toast.dismiss(`hand-${msg.participantId}`);
        }

        if (
          senderIsAuthority &&
          msg.type === "ADMIN_PRESENTING" &&
          participant &&
          !amITeacher
        ) {
          setAdminPresenterId(msg.presenting ? participant.identity : null);
        }

        if (senderIsAuthority && msg.type === "WHITEBOARD_STATE") {
          setIsWhiteboardActive(msg.active);
          if (msg.active) {
            toast.success(
              t("classroom.whiteboardStarted") || "Whiteboard started",
            );
          } else {
            toast.info(
              t("classroom.whiteboardStopped") || "Whiteboard stopped",
            );
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
  }, [
    room,
    amIAuthority,
    amITeacher,
    isSharingLocally,
    localParticipant,
    playHandChime,
    t,
  ]);

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
    setIsRecording(room.isRecording);

    const handleRecordingChange = (recording: boolean) =>
      setIsRecording(recording);
    room.on(RoomEvent.RecordingStatusChanged, handleRecordingChange);

    return () => {
      room.off(RoomEvent.RecordingStatusChanged, handleRecordingChange);
    };
  }, [room, room.isRecording]);

  const requestPermission = async () => {
    if (isScreenSharingActive && !isSharingLocally) {
      toast.error(t("classroom.someoneSharing"));
      return;
    }
    setWaitingForApproval(true);
    const encoder = new TextEncoder();
    const data = JSON.stringify({ type: "REQUEST_SHARE" });
    await room.localParticipant.publishData(encoder.encode(data), {
      reliable: true,
    });
    toast.info(t("classroom.requestSent"));
  };

  const grantPermission = async (allow: boolean) => {
    if (!pendingRequest) return;
    if (allow) {
      try {
        await setScreenSharePermission({
          roomName,
          participantIdentity: pendingRequest.participantId,
          allow: true,
        });
      } catch (error) {
        console.error("Failed to grant screen share permission:", error);
        toast.error(t("classroom.broadcastFailed"));
        return;
      }
    }
    const encoder = new TextEncoder();
    const type = allow ? "ALLOW_SHARE" : "DENY_SHARE";
    const data = JSON.stringify({ type });
    await room.localParticipant.publishData(encoder.encode(data), {
      reliable: true,
      destinationIdentities: [pendingRequest.participantId],
    });
    setPendingRequest(null);
  };

  useEffect(() => {
    if (!amIAuthority) return;

    const handleTrackUnpublished = (
      publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (
        publication.source !== Track.Source.ScreenShare ||
        getRole(participant) !== "student"
      ) {
        return;
      }
      void setScreenSharePermission({
        roomName,
        participantIdentity: participant.identity,
        allow: false,
      }).catch((error) => {
        console.error("Failed to revoke screen share permission:", error);
      });
    };

    room.on(RoomEvent.TrackUnpublished, handleTrackUnpublished);
    return () => {
      room.off(RoomEvent.TrackUnpublished, handleTrackUnpublished);
    };
  }, [amIAuthority, room, roomName, setScreenSharePermission]);

  const forceLowerHand = async (participantId: string) => {
    const encoder = new TextEncoder();
    const data = JSON.stringify({
      type: "FORCE_LOWER_HAND",
      participantId,
    });
    await room.localParticipant.publishData(encoder.encode(data), {
      reliable: true,
    });
    setRaisedHands((prev) => {
      const next = new Set(prev);
      next.delete(participantId);
      return next;
    });
    toast.dismiss(`hand-${participantId}`);
  };

  const togglePresenterMode = async () => {
    if (isPreviewing("presenter-active")) {
      setUiPreviewState("none");
      return;
    }
    const newMode = !presenterMode;
    setPresenterMode(newMode);
    const encoder = new TextEncoder();
    const data = JSON.stringify({
      type: "ADMIN_PRESENTING",
      presenting: newMode,
    });
    await room.localParticipant.publishData(encoder.encode(data), {
      reliable: true,
    });
  };

  const handleShareClick = async () => {
    if (isPreviewing("share-waiting")) {
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
      if (
        err.name === "NotAllowedError" ||
        err.message?.includes("Permission denied")
      )
        return;
      // Any other error (NotSupportedError from audio constraint, codec issues, etc.):
      // retry without audio. If audio: true threw before showing the picker, the user
      // activation is still live so this call can succeed (feature detection, not UA sniffing).
      try {
        await localParticipant?.setScreenShareEnabled(true, { audio: false });
        toast.warning(t("classroom.screenShareAudioNotSupported"));
      } catch {
        // Both attempts failed — screen sharing is not supported on this device/browser
        toast.error(t("classroom.screenShareNotSupported"));
      }
    }
  };

  const handleRecordClick = () => {
    if (!amIAuthority) return;
    if (isPreviewing("recording-active")) {
      setUiPreviewState("none");
      return;
    }
    if (isRecording) {
      executeRecordingToggle(false);
    } else {
      setShowRecordConfirm(true);
    }
  };

  const handleLeaveClick = async () => {
    try {
      await notifyRoomAdministratorLeft({ roomName });
    } catch (error) {
      console.error("Failed to notify room administrator departure:", error);
    } finally {
      await room.disconnect();
    }
  };

  const handleEndSession = async () => {
    if (isEndingSession) return;
    setIsEndingSession(true);
    try {
      await endSession({ roomName });
      toast.success(t("classroom.classEnded"));
    } catch (error) {
      console.error("Failed to end class:", error);
      toast.error(t("classroom.endClassError"));
      setIsEndingSession(false);
    }
  };

  const handleConfirmExtension = async () => {
    if (isConfirmingExtension) return;
    setIsConfirmingExtension(true);
    try {
      await confirmLiveExtension({ roomName });
      toast.success(t("classroom.extensionConfirmed"));
    } catch (error) {
      console.error("Failed to extend class:", error);
      toast.error(t("classroom.extensionError"));
    } finally {
      setIsConfirmingExtension(false);
    }
  };

  const executeRecordingToggle = async (start: boolean) => {
    if (isTogglingRecord) return;
    setIsTogglingRecord(true);
    try {
      // Store the result of the mutation
      const result = await toggleRecording({
        roomName,
        start,
      });

      // If the backend guard blocked it, show the error and stop
      if (!result.success) {
        toast.error(result.message);
        return;
      }

      toast.success(
        start
          ? t("classroom.recordingStarted")
          : t("classroom.recordingStopped"),
      );
    } catch {
      toast.error(t("classroom.recordingError"));
    } finally {
      setIsTogglingRecord(false);
      setShowRecordConfirm(false);
    }
  };

  // --- MEDIA INIT ---
  useEffect(() => {
    const unlockAudio = async () => {
      try {
        await room.startAudio();
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
        audioCtxRef.current.resume().catch(() => {});
      } catch {
        setNeedsClick(true);
      }
    };
    unlockAudio();
  }, [room]);

  useEffect(() => {
    if (!localParticipant) return;
    if (!sessionIsLive && !hasStartedSession) return;
    // Authority non-teachers join with audio=false/video=false at the LiveKitRoom level,
    // so no media is ever captured. Nothing to do here for them.
    if (amIAuthority && !amITeacher) return;
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
  }, [
    amIAuthority,
    amITeacher,
    hasStartedSession,
    localParticipant,
    sessionIsLive,
  ]);

  // When an admin takes the presenter role, enable their media
  useEffect(() => {
    if (!localParticipant || !isLocalAdminPresenting) return;
    localParticipant.setMicrophoneEnabled(true).catch(() => {});
    localParticipant.setCameraEnabled(true).catch(() => {});
  }, [localParticipant, isLocalAdminPresenting]);

  // Auto-close QR dialog when a companion device successfully joins the room
  useEffect(() => {
    if (hasCompanion && showQR) {
      setShowQR(false);
      toast.success(
        t("classroom.companionConnected") || "Companion device connected!",
      );
    }
  }, [hasCompanion, showQR, t]);

  // Auto-fullscreen: prompt user to go fullscreen when remote content becomes active.
  // We cannot call requestFullscreen() from a useEffect (no user gesture), so we prompt instead.
  const autoFullscreenFiredRef = useRef(false);
  useEffect(() => {
    const hasRemoteContent =
      screenTracks.some((t) => !t.participant.isLocal) || isWhiteboardActive;
    if (
      hasRemoteContent &&
      !isFullscreen &&
      !autoFullscreenFiredRef.current &&
      onToggleFullscreen
    ) {
      autoFullscreenFiredRef.current = true;
      setPendingFullscreen(true);
    }
    if (!hasRemoteContent) {
      autoFullscreenFiredRef.current = false;
      setPendingFullscreen(false);
    }
    // Clear the prompt once already fullscreen
    if (isFullscreen) setPendingFullscreen(false);
  }, [screenTracks, isWhiteboardActive, isFullscreen, onToggleFullscreen]);

  const selectPreviewState = (state: ActiveClassroomPreviewState) => {
    setShowPreviewParticipants(false);
    setUiPreviewState((current) => (current === state ? "none" : state));
  };

  const previewOptions: ClassroomPreviewOption[] = [
    {
      id: "start-class",
      label: "Start class",
      group: "Dialogs",
      isActive: isPreviewing("start-class"),
      onSelect: () => selectPreviewState("start-class"),
    },
    {
      id: "end-class",
      label: "End class",
      group: "Dialogs",
      isActive: isPreviewing("end-class"),
      onSelect: () => selectPreviewState("end-class"),
    },
    {
      id: "leave-class",
      label: "Leave class",
      group: "Dialogs",
      isActive: isPreviewing("leave-class"),
      onSelect: () => selectPreviewState("leave-class"),
    },
    {
      id: "extend-class",
      label: "Extension + conflicts",
      group: "Dialogs",
      isActive: isPreviewing("extend-class"),
      onSelect: () => selectPreviewState("extend-class"),
    },
    {
      id: "fullscreen",
      label: "Fullscreen invitation",
      group: "Dialogs",
      isActive: isPreviewing("fullscreen"),
      onSelect: () => selectPreviewState("fullscreen"),
    },
    {
      id: "recording-confirm",
      label: "Recording confirmation",
      group: "Dialogs",
      isActive: isPreviewing("recording-confirm"),
      onSelect: () => selectPreviewState("recording-confirm"),
    },
    {
      id: "companion",
      label: "Companion QR",
      group: "Dialogs",
      isActive: isPreviewing("companion"),
      onSelect: () => selectPreviewState("companion"),
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
      id: "share-request",
      label: "Student share request",
      group: "Overlays",
      isActive: isPreviewing("share-request"),
      onSelect: () => selectPreviewState("share-request"),
    },
    {
      id: "recording-active",
      label: "Recording active",
      group: "Controls",
      isActive: isPreviewing("recording-active"),
      onSelect: () => selectPreviewState("recording-active"),
    },
    {
      id: "share-waiting",
      label: "Share waiting",
      group: "Controls",
      isActive: isPreviewing("share-waiting"),
      onSelect: () => selectPreviewState("share-waiting"),
    },
    {
      id: "presenter-active",
      label: "Admin presenting",
      group: "Controls",
      isActive: isPreviewing("presenter-active"),
      onSelect: () => selectPreviewState("presenter-active"),
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
      id: "toast-recording",
      label: "Recording started",
      group: "Notifications",
      onSelect: () => toast.success(t("classroom.recordingStarted")),
    },
    {
      id: "toast-extension",
      label: "Extension confirmed",
      group: "Notifications",
      onSelect: () => toast.success(t("classroom.extensionConfirmed")),
    },
    {
      id: "toast-permission",
      label: "Permission granted",
      group: "Notifications",
      onSelect: () => toast.success(t("classroom.permissionGranted")),
    },
    {
      id: "toast-error",
      label: "Classroom error",
      group: "Notifications",
      onSelect: () => toast.error(t("classroom.endClassError")),
    },
  ];

  return (
    <ClassroomView ref={rootRef}>
      {uiPreviewEnabled && (
        <ClassroomUiPreview
          roleLabel={currentUserRole ?? "staff"}
          options={previewOptions}
          onReset={() => {
            setUiPreviewState("none");
            setShowPreviewParticipants(false);
          }}
        />
      )}

      {endingSoonNotice.shouldShowNotice && (
        <ClassroomEndingSoonNotice
          label={t("classroom.classEndingSoon")}
          dismissLabel={t("common.close")}
          onDismiss={() => {
            endingSoonNotice.dismissNotice();
            if (isPreviewing("ending-soon")) setUiPreviewState("none");
          }}
        />
      )}

      <AlertDialog
        open={visibleLayer === "session-start"}
        onOpenChange={(open) => {
          if (!open && isPreviewing("start-class")) {
            setUiPreviewState("none");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("classroom.startClassTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("classroom.startClassDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogAction
              disabled={isStartingSession}
              onClick={(event) => {
                event.preventDefault();
                if (isPreviewing("start-class")) {
                  setUiPreviewState("none");
                  return;
                }
                void handleStartSession();
              }}
            >
              {isStartingSession && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("classroom.confirmStartClass")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={visibleLayer === "extension-decision"}
        onOpenChange={(open) => {
          if (!open && isPreviewing("extend-class")) {
            setUiPreviewState("none");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("classroom.continueClassTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("classroom.continueClassDescription", {
                seconds: decisionSecondsRemaining,
              })}
            </AlertDialogDescription>
            {extensionStaffConflict && (
              <p className="text-sm text-warning-foreground">
                {t("classroom.staffExtensionConflict", {
                  className: extensionStaffConflict.className,
                  time: new Intl.DateTimeFormat(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: sessionTimeZone,
                  }).format(extensionStaffConflict.startsAt),
                })}
              </p>
            )}
            {!!affectedStudentCount && (
              <p className="text-sm text-muted-foreground">
                {t("classroom.studentExtensionConflicts", {
                  count: affectedStudentCount,
                })}
              </p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isEndingSession}
              onClick={() => {
                if (isPreviewing("extend-class")) {
                  setUiPreviewState("none");
                  return;
                }
                void handleEndSession();
              }}
            >
              {t("classroom.endClassNow")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isConfirmingExtension}
              onClick={(event) => {
                event.preventDefault();
                if (isPreviewing("extend-class")) {
                  setUiPreviewState("none");
                  return;
                }
                void handleConfirmExtension();
              }}
            >
              {isConfirmingExtension && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {t("classroom.continueTenMinutes")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
        onCancel={() => setPendingFullscreen(false)}
        onConfirm={() => {
          setPendingFullscreen(false);
          if (isPreviewing("fullscreen")) {
            setUiPreviewState("none");
            return;
          }
          onToggleFullscreen?.();
        }}
      />

      <AlertDialog
        open={visibleLayer === "recording-confirmation"}
        onOpenChange={(open) => {
          setShowRecordConfirm(open);
          if (!open && isPreviewing("recording-confirm")) {
            setUiPreviewState("none");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("classroom.startRecordingTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("classroom.startRecordingDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (isPreviewing("recording-confirm")) {
                  setUiPreviewState("none");
                  return;
                }
                void executeRecordingToggle(true);
              }}
              disabled={isTogglingRecord}
            >
              {isTogglingRecord ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t("classroom.confirmStart")
              )}
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

      {visibleLayer === "share-permission" && amIAuthority && (
        <div
          role="alertdialog"
          aria-label={t("classroom.shareRequest", {
            name: pendingRequest?.name ?? "Laura Camila",
          })}
          className="absolute top-20 left-1/2 -translate-x-1/2 z-[100] bg-card text-card-foreground rounded-xl shadow-2xl border border-border p-4 w-80 animate-in slide-in-from-top-4"
        >
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 p-2 rounded-full">
              <Hand className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-card-foreground">
                {t("classroom.shareRequest", {
                  name: pendingRequest?.name ?? "Laura Camila",
                })}
              </h4>
              <p className="text-xs text-muted-foreground mt-1">
                {t("classroom.shareRequestDescription")}
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => {
                if (isPreviewing("share-request")) {
                  setUiPreviewState("none");
                  return;
                }
                void grantPermission(false);
              }}
              className="flex-1 py-2 text-xs font-bold text-secondary-foreground bg-secondary hover:bg-secondary/80 rounded-lg"
            >
              {t("classroom.deny")}
            </button>
            <button
              onClick={() => {
                if (isPreviewing("share-request")) {
                  setUiPreviewState("none");
                  return;
                }
                void grantPermission(true);
              }}
              className="flex-1 py-2 text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg"
            >
              {t("classroom.allow")}
            </button>
          </div>
        </div>
      )}

      {/* 1. Header Row */}
      <ClassroomHeader
        title={className || t("classroom.classroom")}
        subtitle={lessonTitle}
        isActive={Boolean(teacher)}
        activeLabel={t("classroom.live")}
        waitingLabel={t("classroom.waiting")}
        isRecording={isRecordingForDisplay}
        isPhoneLandscape={isPhoneLandscape}
        sessionAction={
          amIAuthority && (sessionIsLive || hasStartedSession) ? (
            <EndClassButton
              appearance="header"
              onConfirm={handleEndSession}
              onLeave={handleLeaveClick}
              onOpenChange={setIsSessionActionDialogOpen}
              disabled={isEndingSession}
            />
          ) : (
            <LeaveClassButton
              appearance="header"
              onConfirm={handleLeaveClick}
              onOpenChange={setIsSessionActionDialogOpen}
            />
          )
        }
        action={
          amIAuthority && !amITeacher && !actualTeacher ? (
            <Toggle
              type="button"
              pressed={isLocalAdminPresenting}
              aria-label={
                isLocalAdminPresenting
                  ? t("classroom.stopLeadingClass")
                  : t("classroom.startLeadingClass")
              }
              title={
                isLocalAdminPresenting
                  ? t("classroom.stopLeadingClass")
                  : t("classroom.startLeadingClass")
              }
              className={`h-8 gap-1.5 rounded-md border border-primary/30 bg-background px-2.5 text-xs font-semibold text-primary shadow-none hover:bg-primary/5 data-[state=on]:border-success/50 data-[state=on]:bg-success/10 data-[state=on]:text-success ${
                isPhoneLandscape ? "size-7 p-0" : ""
              }`}
              onPressedChange={() => void togglePresenterMode()}
            >
              <UserStar className="size-4" />
              {!isPhoneLandscape && (
                <span>
                  {isLocalAdminPresenting
                    ? t("classroom.leadingClass")
                    : t("classroom.leadClass")}
                </span>
              )}
            </Toggle>
          ) : undefined
        }
      />

      {/* 2. Stage Row */}
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
            {!amIIncognito && (
              <DeviceToggleButton
                variant="compact"
                source={Track.Source.Camera}
                kind="videoinput"
                iconOn={<VideoIcon className="w-5 h-5" />}
                iconOff={<VideoOff className="w-5 h-5" />}
              />
            )}
            <button
              onClick={handleShareClick}
              disabled={isWaitingForApprovalForDisplay}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-lg border-2 ${
                isSharingLocally
                  ? "bg-success/80 text-success-foreground border-success"
                  : isShareApprovedForDisplay
                    ? "bg-info/80 text-info-foreground border-info animate-pulse"
                    : isWaitingForApprovalForDisplay
                      ? "bg-warning/80 text-warning-foreground border-warning cursor-wait"
                      : "bg-inverse-foreground/20 text-inverse-foreground border-inverse-foreground/30 hover:bg-inverse-foreground/30"
              }`}
            >
              {isWaitingForApprovalForDisplay ? (
                <Hand className="w-5 h-5 animate-pulse" />
              ) : (
                <MonitorUp className="w-5 h-5" />
              )}
            </button>
            {amIAuthority && (
              <button
                onClick={handleRecordClick}
                disabled={isTogglingRecord}
                title={
                  isRecordingForDisplay
                    ? t("classroom.stopRecording")
                    : t("classroom.startRecording")
                }
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-lg border-2 ${
                  isRecordingForDisplay
                    ? "bg-destructive/80 text-destructive-foreground border-destructive animate-pulse"
                    : "bg-inverse-foreground/20 text-inverse-foreground border-inverse-foreground/30 hover:bg-inverse-foreground/30"
                } ${isTogglingRecord ? "opacity-50 cursor-wait" : ""}`}
              >
                {isTogglingRecord ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isRecordingForDisplay ? (
                  <StopCircle className="w-5 h-5" />
                ) : (
                  <CircleDot className="w-5 h-5" />
                )}
              </button>
            )}
            {amIAuthority && (
              <button
                onClick={() => setShowQR(true)}
                title={
                  hasCompanion
                    ? t("classroom.companionActive") || "Companion active"
                    : t("classroom.connectTablet") || "Connect Tablet"
                }
                className={`w-11 h-11 rounded-full flex items-center justify-center relative transition-all shadow-lg border-2 ${
                  hasCompanion
                    ? "bg-success/80 text-success-foreground border-success"
                    : "bg-inverse-foreground/20 text-inverse-foreground border-inverse-foreground/30 hover:bg-inverse-foreground/30"
                }`}
              >
                <TabletSmartphone className="w-5 h-5" />
                {hasCompanion && (
                  <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-inverse/60 animate-pulse" />
                )}
              </button>
            )}
            <div className="w-px h-6 bg-inverse-foreground/30 mx-1" />
            {onToggleFullscreen && (
              <FullscreenButtonCompact
                isFullscreen={isFullscreen}
                onToggle={onToggleFullscreen}
              />
            )}
            <div className="w-px h-6 bg-inverse-foreground/30 mx-1" />
            {amIAuthority && (sessionIsLive || hasStartedSession) && (
              <EndClassButton
                onConfirm={handleEndSession}
                onOpenChange={setIsSessionActionDialogOpen}
                disabled={isEndingSession}
                className="flex size-11 items-center justify-center rounded-full border-2 border-destructive/60 bg-inverse-foreground/20 text-destructive-foreground shadow-lg transition-colors hover:bg-destructive/30 disabled:cursor-wait disabled:opacity-60"
              />
            )}
            <LeaveClassButton
              onConfirm={handleLeaveClick}
              onOpenChange={setIsSessionActionDialogOpen}
              className="flex size-11 items-center justify-center rounded-full border-2 border-destructive/60 bg-destructive/80 text-destructive-foreground shadow-lg transition-colors hover:bg-destructive/90"
            />
          </>
        }
      >
        {amIIncognito && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-inverse/60 text-inverse-foreground backdrop-blur-sm rounded-full px-3 py-1 text-xs font-medium flex items-center gap-1.5 shadow-sm pointer-events-none">
            <Eye className="w-3 h-3 shrink-0" />{" "}
            {t("classroom.observingIncognito")}
          </div>
        )}
        {isWhiteboardActive ? (
          <ClassroomWhiteboardContent
            roomName={roomName}
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
            presenterDescription={t("classroom.presenterSharing", {
              name:
                activeScreenTrack.participant.name || t("classroom.presenter"),
            })}
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
              ) : amITeacher || isLocalAdminPresenting ? (
                <div className="z-10 flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-300">
                  <div className="w-28 h-28 bg-success/10 rounded-full flex items-center justify-center border-4 border-success mb-6 shadow-xl animate-pulse">
                    <VideoOff className="w-12 h-12 text-success" />
                  </div>
                  <h2 className="text-3xl font-bold text-foreground">
                    {t("classroom.youAreLive")}
                  </h2>
                  <p className="text-muted-foreground mt-2 text-lg">
                    {t("classroom.cameraOff")}
                  </p>
                </div>
              ) : (
                <div className="z-10 flex flex-col items-center justify-center p-8">
                  <div className="w-32 h-32 bg-secondary rounded-full flex items-center justify-center border-2 border-inverse-foreground/20 mb-6 shadow-lg overflow-hidden">
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
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                    <div className="bg-secondary/80 px-3 py-1.5 rounded-full border border-border flex items-center gap-1.5">
                      <VideoOff className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-secondary-foreground font-medium">
                        {t("classroom.cameraOffLabel")}
                      </span>
                    </div>
                    <div
                      className={`px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${
                        isTeacherAudioOn
                          ? "bg-secondary/80 border-border"
                          : "bg-destructive/10 border-destructive/20"
                      }`}
                    >
                      <Mic
                        className={`w-4 h-4 ${isTeacherAudioOn ? "animate-pulse text-success" : "text-destructive"}`}
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
              <div className="text-center z-10 p-8">
                <div className="w-32 h-32 mx-auto bg-background/50 backdrop-blur-sm rounded-full flex items-center justify-center border-2 border-border mb-4 shadow-sm">
                  <span className="text-6xl">👩‍🏫</span>
                </div>
                <h2 className="text-2xl font-bold text-foreground">
                  {className || t("classroom.class")}
                </h2>
                <p className="text-muted-foreground mt-2 font-medium">
                  {t("classroom.waitingForTeacher")}
                </p>
              </div>
            )}
          </>
        )}
      </ClassroomStage>

      {/* 3. Meeting Controls (row 4 on mobile, row 3 on md+) — hidden in phone landscape */}
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
              {!amIIncognito && (
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
              )}
              <ClassroomActionButton
                icon={
                  <MonitorUp
                    className={
                      isWaitingForApprovalForDisplay
                        ? "animate-pulse"
                        : undefined
                    }
                  />
                }
                label={t("classroom.shareScreen")}
                pressed={Boolean(isSharingLocally)}
                statusLabel={
                  isWaitingForApprovalForDisplay
                    ? t("classroom.waitingForApproval")
                    : isSharingLocally || isShareApprovedForDisplay
                      ? t("common.active")
                      : t("common.inactive")
                }
                tone="success"
                disabled={isWaitingForApprovalForDisplay}
                onPressedChange={() => void handleShareClick()}
              />
              {amIAuthority && (
                <Sheet>
                  <SheetTrigger asChild>
                    <ClassroomActionButton
                      icon={<MoreHorizontal />}
                      label={t("classroom.moreActions")}
                    />
                  </SheetTrigger>
                  <SheetContent
                    side="bottom"
                    className="gap-0 pb-[max(1rem,env(safe-area-inset-bottom))]"
                  >
                    <SheetHeader className="border-b border-border/70">
                      <SheetTitle>{t("classroom.moreActionsTitle")}</SheetTitle>
                    </SheetHeader>
                    <div className="grid gap-1 p-3">
                      <SheetClose asChild>
                        <Toggle
                          type="button"
                          pressed={isRecordingForDisplay}
                          aria-label={
                            isRecordingForDisplay
                              ? t("classroom.stopRecording")
                              : t("classroom.startRecording")
                          }
                          title={
                            isRecordingForDisplay
                              ? t("classroom.stopRecording")
                              : t("classroom.startRecording")
                          }
                          className="h-12 w-full justify-start gap-3 px-3 font-normal data-[state=on]:bg-destructive/10 data-[state=on]:text-destructive"
                          disabled={isTogglingRecord}
                          onPressedChange={handleRecordClick}
                        >
                          {isTogglingRecord ? (
                            <Loader2 className="size-5 animate-spin" />
                          ) : isRecordingForDisplay ? (
                            <StopCircle className="size-5 text-destructive" />
                          ) : (
                            <CircleDot className="size-5" />
                          )}
                          <span>{t("classroom.record")}</span>
                        </Toggle>
                      </SheetClose>
                      <SheetClose asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-12 justify-start gap-3 px-3"
                          onClick={() => setShowQR(true)}
                        >
                          <TabletSmartphone
                            className={
                              hasCompanion ? "size-5 text-success" : "size-5"
                            }
                          />
                          <span className="flex flex-1 items-center justify-between gap-3">
                            <span>{t("classroom.connectDevice")}</span>
                            {hasCompanion && (
                              <span className="text-xs font-medium text-success">
                                {t("classroom.connected")}
                              </span>
                            )}
                          </span>
                        </Button>
                      </SheetClose>
                    </div>
                  </SheetContent>
                </Sheet>
              )}
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
              {!amIIncognito && (
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
              )}
            </>
          }
          center={
            <>
              <ClassroomActionButton
                icon={
                  <MonitorUp
                    className={
                      isWaitingForApprovalForDisplay
                        ? "animate-pulse"
                        : undefined
                    }
                  />
                }
                label={t("classroom.shareScreen")}
                pressed={Boolean(isSharingLocally)}
                statusLabel={
                  isWaitingForApprovalForDisplay
                    ? t("classroom.waitingForApproval")
                    : isSharingLocally || isShareApprovedForDisplay
                      ? t("common.active")
                      : t("common.inactive")
                }
                tone="success"
                disabled={isWaitingForApprovalForDisplay}
                onPressedChange={() => void handleShareClick()}
              />
              {amIAuthority && (
                <ClassroomActionButton
                  icon={
                    isTogglingRecord ? (
                      <Loader2 className="animate-spin" />
                    ) : isRecordingForDisplay ? (
                      <StopCircle />
                    ) : (
                      <CircleDot />
                    )
                  }
                  label={t("classroom.record")}
                  pressed={isRecordingForDisplay}
                  statusLabel={
                    isRecordingForDisplay
                      ? t("common.active")
                      : t("common.inactive")
                  }
                  tone="destructive"
                  disabled={isTogglingRecord}
                  title={
                    isRecordingForDisplay
                      ? t("classroom.stopRecording")
                      : t("classroom.startRecording")
                  }
                  onPressedChange={handleRecordClick}
                />
              )}
              {amIAuthority && (
                <Dialog
                  open={visibleLayer === "companion"}
                  onOpenChange={(open) => {
                    setShowQR(open);
                    if (!open && isPreviewing("companion")) {
                      setUiPreviewState("none");
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <ClassroomActionButton
                      icon={<TabletSmartphone />}
                      label={t("classroom.connectDevice")}
                      statusLabel={
                        hasCompanion ? t("common.active") : t("common.inactive")
                      }
                      tone="success"
                      className={
                        hasCompanion
                          ? "border-success/50 bg-success/10 text-success hover:border-success/60 hover:bg-success/15 hover:text-success"
                          : undefined
                      }
                      aria-label={
                        hasCompanion
                          ? t("classroom.companionActive")
                          : t("classroom.connectCompanionDevice")
                      }
                      title={
                        hasCompanion
                          ? t("classroom.companionActive")
                          : t("classroom.connectCompanionDevice")
                      }
                    />
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="text-xl">
                        {hasCompanion
                          ? t("classroom.companionConnected") ||
                            "Companion device connected!"
                          : t("classroom.connectTablet") ||
                            "Connect Companion Tablet"}
                      </DialogTitle>
                      <DialogDescription>
                        {hasCompanion
                          ? t("classroom.companionActiveDesc") ||
                            "A companion device is currently active in this session. Scan again to add another."
                          : t("classroom.connectTabletDesc") ||
                            "Scan this QR code with your iPad or Android tablet to open the interactive whiteboard."}
                      </DialogDescription>
                    </DialogHeader>
                    {hasCompanion && (
                      <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3">
                        <span className="size-3 shrink-0 animate-pulse rounded-full bg-success" />
                        <p className="text-sm font-medium text-success">
                          {companionParticipants
                            .map(
                              (participant) =>
                                participant.name || participant.identity,
                            )
                            .join(", ")}
                        </p>
                      </div>
                    )}
                    <div className="my-4 flex flex-col items-center justify-center rounded-xl bg-whiteboard p-6 shadow-inner">
                      {companionUrl ? (
                        <QRCodeSVG
                          value={companionUrl}
                          size={220}
                          level="M"
                          includeMargin
                        />
                      ) : (
                        <div className="flex size-[220px] animate-pulse items-center justify-center rounded-lg bg-muted" />
                      )}
                    </div>
                    <div className="text-center">
                      <p className="select-all break-all rounded-lg border border-border/50 bg-muted p-3 font-mono text-xs text-muted-foreground">
                        {companionUrl}
                      </p>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </>
          }
          right={
            <>
              {amIAuthority && (sessionIsLive || hasStartedSession) && (
                <EndClassButton
                  appearance="toolbar"
                  onConfirm={handleEndSession}
                  onOpenChange={setIsSessionActionDialogOpen}
                  disabled={isEndingSession}
                  previewOpen={isPreviewing("end-class")}
                  onPreviewOpenChange={(open) => {
                    if (!open) setUiPreviewState("none");
                  }}
                />
              )}
              <LeaveClassButton
                appearance="toolbar"
                onConfirm={handleLeaveClick}
                onOpenChange={setIsSessionActionDialogOpen}
                previewOpen={isPreviewing("leave-class")}
                onPreviewOpenChange={(open) => {
                  if (!open) setUiPreviewState("none");
                }}
              />
            </>
          }
        />
      </ClassroomViewControls>

      {/* 4. Classmates: horizontal below the stage, vertical beside it */}
      <ClassroomParticipantsPanel
        heading={t("classroom.classmates")}
        previousLabel={t("common.previous")}
        nextLabel={t("common.next")}
        isEmpty={displayedStudents.length === 0}
        emptyContent={
          amITeacher || isLocalAdminPresenting
            ? t("classroom.waitingForStudents")
            : t("classroom.youAreFirst")
        }
        participants={displayedStudents}
        raisedParticipantIds={raisedHands}
        youLabel={t("classroom.youShort")}
        raisedHandLabel={t("classroom.raisedHand")}
        raisedHandsCountLabel={(count) =>
          t("classroom.raisedHandsCount", { count })
        }
        lowerHandLabel={t("classroom.lowerHand")}
        onLowerHand={
          amITeacher || isLocalAdminPresenting ? forceLowerHand : undefined
        }
      >
        {displayedStudents.map((p) => (
          <ParticipantTile
            key={p.identity}
            variant="grid"
            participant={p}
            className="aspect-square h-24 w-24 flex-shrink-0 snap-start snap-always sm:h-28 sm:w-28 landscape:h-auto landscape:w-full xl:aspect-auto xl:h-full xl:w-full"
            raisedHand={raisedHands.has(p.identity)}
            onLowerHand={
              amITeacher || isLocalAdminPresenting
                ? () => forceLowerHand(p.identity)
                : undefined
            }
            lowerHandLabel={t("classroom.lowerHand")}
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
