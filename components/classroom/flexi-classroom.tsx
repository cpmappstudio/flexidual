"use client";

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { LiveKitRoom } from "@livekit/components-react";
import { DisconnectReason } from "livekit-client";
import { api } from "@/convex/_generated/api";
import { ActiveClassroomUI } from "./active-classroom-ui";
import { StudentClassroomUI } from "./student-classroom-ui";
import {
  Loader2,
  CalendarClock,
  School,
  LogOut,
  AlertCircle,
  PlayCircle,
  RotateCcw,
} from "lucide-react";
import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { Button } from "@/components/ui/button";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRetainedQueryResult } from "@/hooks/use-retained-query-result";
import { useSidebar } from "@/components/ui/sidebar";
import { CompanionClassroomUI } from "./companion-classroom-ui";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { ClassroomRocketLoader } from "@/components/student/rocket-transition";
import { ClassroomCountdown } from "./classroom-countdown";
import { useClassroomClock } from "./use-classroom-clock";
import { useClassroomToken } from "@/hooks/use-classroom-token";
import { SessionCloseoutDialog } from "./session-closeout-dialog";
import { useClassroomPresentation } from "./classroom-presentation";
import { toast } from "sonner";
import { SessionClosureProgress } from "./session-closure-progress";
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

interface FlexiClassroomProps {
  roomName: string;
  className?: string;
  isStudentView?: boolean;
  isCompanion?: boolean;
  onLeave?: () => void;
}

interface ClassroomConnectionErrorProps {
  className?: string;
  isOverlay?: boolean;
  message: string;
  retryLabel: string;
  leaveLabel: string;
  onRetry: () => void;
  onLeave?: () => void;
}

function ClassroomConnectionError({
  className,
  isOverlay = false,
  message,
  retryLabel,
  leaveLabel,
  onRetry,
  onLeave,
}: ClassroomConnectionErrorProps) {
  return (
    <div
      className={`${
        isOverlay
          ? "absolute inset-0 z-50 bg-background/75 backdrop-blur-sm"
          : "h-full w-full bg-destructive/5 rounded-lg"
      } flex items-center justify-center ${className ?? ""}`}
    >
      <div className="text-center p-6 bg-card border border-destructive/20 rounded-xl shadow-sm">
        <div className="text-destructive font-bold mb-2">{message}</div>
        <div className="flex gap-2 justify-center mt-4">
          <Button variant="outline" onClick={onRetry}>
            {retryLabel}
          </Button>
          {onLeave && (
            <Button
              variant="ghost"
              onClick={onLeave}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              {leaveLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function SidebarAutoCollapser({ active = true }: { active?: boolean }) {
  const { setOpen } = useSidebar();
  const activeRef = useRef(active);
  activeRef.current = active;

  // 1. Keep a stable reference to the latest setOpen function
  const setOpenRef = useRef(setOpen);

  useEffect(() => {
    setOpenRef.current = setOpen;
  }, [setOpen]);

  useEffect(() => {
    const mqTablet = window.matchMedia("(max-width: 1023px)");
    const mqPortrait = window.matchMedia("(orientation: portrait)");

    const handleLayoutChange = () => {
      if (!activeRef.current) return;
      // If we cross into tablet or portrait territory, collapse it automatically
      if (mqTablet.matches || mqPortrait.matches) {
        // 2. Call it via the ref so we don't trigger re-runs
        setOpenRef.current(false);
      }
    };

    // Apply on initial component mount
    handleLayoutChange();

    // Listen ONLY for actual breakpoint/orientation crosses
    mqTablet.addEventListener("change", handleLayoutChange);
    mqPortrait.addEventListener("change", handleLayoutChange);

    return () => {
      mqTablet.removeEventListener("change", handleLayoutChange);
      mqPortrait.removeEventListener("change", handleLayoutChange);
    };
  }, []); // 3. <-- EMPTY DEPENDENCY ARRAY. This is the magic key.

  return null;
}

export default function FlexiClassroom({
  roomName,
  className,
  isStudentView = false,
  isCompanion = false,
  onLeave,
}: FlexiClassroomProps) {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const presentation = useClassroomPresentation();
  const leaveSession = presentation?.leaveSession;
  const containerRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, isSupported, toggleFullscreen } = useFullscreen();
  const handleToggleFullscreen = () => toggleFullscreen(containerRef.current);
  const canFullscreen =
    isSupported &&
    presentation?.mode !== "compact" &&
    !presentation?.nativeVideoActive;

  const now = useClassroomClock();

  const params = useParams();
  const orgSlug = (params.orgSlug as string) || "system";

  const {
    user: currentUserResult,
    isLoading: isCurrentUserLoading,
    isAuthenticated: isCurrentUserAuthenticated,
  } = useCurrentUser();
  const currentUserQueryResult =
    !isCurrentUserLoading && !isCurrentUserAuthenticated
      ? null
      : currentUserResult;
  const convexUser = useRetainedQueryResult(currentUserQueryResult, roomName);

  const logPresence = useMutation(api.schedule.logStudentPresence);
  const markLive = useMutation(api.schedule.markLive);
  const reopenLiveSession = useMutation(api.schedule.reopenLiveSession);
  const endSession = useAction(api.livekit.endSession);
  const [closeoutScope, setCloseoutScope] = useState<string | null>(null);
  const [activationDialogMode, setActivationDialogMode] = useState<
    "start" | "reopen" | null
  >(null);
  const [isActivating, setIsActivating] = useState(false);

  const sessionStatusResult = useQuery(api.schedule.getSessionStatus, {
    sessionId: roomName,
    now: Math.floor(now / 60_000) * 60_000,
  });
  const sessionStatus = useRetainedQueryResult(sessionStatusResult, roomName);

  const scheduleDetailsResult = useQuery(
    api.schedule.getWithDetails,
    sessionStatus?.scheduleId ? { id: sessionStatus.scheduleId } : "skip",
  );
  const scheduleDetailsScope = `${roomName}:${sessionStatus?.scheduleId ?? "pending"}`;
  const scheduleDetails = useRetainedQueryResult(
    scheduleDetailsResult,
    scheduleDetailsScope,
  );

  const role = sessionStatus
    ? sessionStatus.isPrimaryTeacher
      ? "teacher"
      : sessionStatus.roomAdmin
        ? "admin"
        : "student"
    : undefined;
  const resolvedIsStudentView = isStudentView || role === "student";
  const uiPreviewEnabled =
    process.env.NODE_ENV !== "production" &&
    (presentation?.uiPreviewEnabled ?? searchParams.get("uiPreview") === "1");
  const isClassLive = sessionStatus?.isLive || false;
  const isSessionClosed =
    sessionStatus?.status === "completed" ||
    sessionStatus?.status === "cancelled";
  const shouldConnect = !isSessionClosed && isClassLive && !!convexUser;

  const {
    token,
    error: tokenError,
    clear: clearToken,
    retry: retryToken,
  } = useClassroomToken({
    roomName,
    userId: convexUser?._id,
    isCompanion,
    shouldRequest: shouldConnect,
    activationStartedAt: sessionStatus?.activationStartedAt,
    activationId: sessionStatus?.activationId,
  });
  const connectionScope = `${roomName}:${convexUser?._id ?? "anonymous"}:${isCompanion ? "companion" : "primary"}:${sessionStatus?.activationId ?? sessionStatus?.activationStartedAt ?? "inactive"}`;
  const currentConnectionScopeRef = useRef(connectionScope);
  currentConnectionScopeRef.current = connectionScope;
  const presenceConnection = useMemo(
    () => ({ id: crypto.randomUUID(), scope: connectionScope }),
    [connectionScope],
  );
  const requiresCloseout =
    !isCompanion &&
    !resolvedIsStudentView &&
    !!convexUser &&
    scheduleDetails?.sessionLeaderId === convexUser._id &&
    sessionStatus?.status === "completed" &&
    scheduleDetails?.sessionClosureStatus === "pending" &&
    !sessionStatus.canReopen;
  const isCloseoutOpen =
    !!convexUser && (closeoutScope === connectionScope || requiresCloseout);
  const canPersist = Boolean(
    convexUser && sessionStatus && scheduleDetails && token && !isSessionClosed,
  );
  const reportPersistence = presentation?.reportPersistence;
  useEffect(() => {
    reportPersistence?.({ canPersist, needsFullView: isCloseoutOpen });
  }, [reportPersistence, canPersist, isCloseoutOpen]);

  useEffect(() => {
    if (requiresCloseout) setCloseoutScope(connectionScope);
    else if (
      isSessionClosed &&
      scheduleDetails?.sessionClosureStatus === "completed"
    ) {
      setCloseoutScope((current) =>
        current === connectionScope ? null : current,
      );
    }
  }, [
    connectionScope,
    requiresCloseout,
    isSessionClosed,
    scheduleDetails?.sessionClosureStatus,
  ]);

  useEffect(() => {
    if (isCloseoutOpen && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
  }, [isCloseoutOpen]);
  const [roomErrorState, setRoomErrorState] = useState<{
    scopeKey: string;
    message: string;
  } | null>(null);
  const roomError =
    roomErrorState?.scopeKey === connectionScope ? roomErrorState.message : "";
  const error =
    roomError ||
    (tokenError === "not-started"
      ? t("classroom.hasntStarted")
      : tokenError === "connection"
        ? t("classroom.connectionError")
        : "");

  const loggedScheduleRef = useRef<string | null>(null);
  const nextRoomRef = useRef<string | null>(null);
  const currentRoomRef = useRef(roomName);
  const sessionClosedRef = useRef(isSessionClosed);
  currentRoomRef.current = roomName;
  sessionClosedRef.current = isSessionClosed;

  useEffect(() => {
    loggedScheduleRef.current = null;
  }, [connectionScope]);

  useEffect(() => {
    if (!isCompanion && !resolvedIsStudentView && sessionStatus?.canStart) {
      setActivationDialogMode("start");
    }
  }, [isCompanion, resolvedIsStudentView, roomName, sessionStatus?.canStart]);

  const handleCompleteSession = async () => {
    if (!sessionClosedRef.current)
      await endSession({
        roomName,
        expectedActivationId: sessionStatus?.activationId,
      });
    setCloseoutScope((current) =>
      current === connectionScope ? null : current,
    );
  };

  const handleActivateSession = async (mode: "start" | "reopen") => {
    if (isActivating) return;
    setIsActivating(true);
    try {
      if (mode === "reopen") await reopenLiveSession({ roomName });
      else await markLive({ roomName, isLive: true });
      clearToken();
      setActivationDialogMode(null);
    } catch (activationError) {
      console.error(`Failed to ${mode} class:`, activationError);
      toast.error(
        t(
          mode === "reopen"
            ? "classroom.reopenClassError"
            : "classroom.startClassError",
        ),
      );
    } finally {
      setIsActivating(false);
    }
  };

  const handleConnected = useCallback(async () => {
    setRoomErrorState((current) =>
      current?.scopeKey === connectionScope ? null : current,
    );

    if (
      !resolvedIsStudentView ||
      !sessionStatus?.scheduleId ||
      !sessionStatus.activationId ||
      currentConnectionScopeRef.current !== connectionScope ||
      loggedScheduleRef.current === connectionScope
    ) {
      return;
    }

    loggedScheduleRef.current = connectionScope;
    try {
      await logPresence({
        scheduleId: sessionStatus.scheduleId,
        action: "join",
        activationId: sessionStatus.activationId,
        connectionId: presenceConnection.id,
      });
    } catch (err) {
      if (currentConnectionScopeRef.current === connectionScope)
        loggedScheduleRef.current = null;
      console.error("Failed to log presence:", err);
    }
  }, [
    connectionScope,
    logPresence,
    resolvedIsStudentView,
    sessionStatus?.scheduleId,
    sessionStatus?.activationId,
    presenceConnection,
  ]);

  const exitClassroom = useCallback(() => {
    leaveSession?.();
    if (resolvedIsStudentView && onLeave) {
      onLeave();
      return;
    }
    router.push(`/${params.locale}/${orgSlug}`);
  }, [
    onLeave,
    orgSlug,
    params.locale,
    resolvedIsStudentView,
    router,
    leaveSession,
  ]);

  const handleRoomError = useCallback(
    (roomError: Error) => {
      console.error("LiveKit connection error:", roomError);
      setRoomErrorState({
        scopeKey: connectionScope,
        message: t("classroom.connectionError"),
      });
    },
    [connectionScope, t],
  );

  const handleDisconnect = useCallback(
    async (reason?: DisconnectReason) => {
      if (
        currentRoomRef.current !== roomName ||
        sessionClosedRef.current ||
        currentConnectionScopeRef.current !== connectionScope
      ) {
        return;
      }

      const isClientInitiated = reason === DisconnectReason.CLIENT_INITIATED;
      if (!isClientInitiated) {
        setRoomErrorState({
          scopeKey: connectionScope,
          message:
            reason === DisconnectReason.DUPLICATE_IDENTITY
              ? t("classroom.duplicateSession")
              : t("classroom.connectionError"),
        });
      }

      if (
        resolvedIsStudentView &&
        sessionStatus?.scheduleId &&
        sessionStatus.activationId &&
        loggedScheduleRef.current === connectionScope
      ) {
        try {
          await logPresence({
            scheduleId: sessionStatus.scheduleId,
            action: "leave",
            activationId: sessionStatus.activationId,
            connectionId: presenceConnection.id,
          });
        } catch (e) {
          console.error("Error logging leave:", e);
        }
      }

      loggedScheduleRef.current = null;

      if (!isClientInitiated) return;

      clearToken();
      const nextRoom = nextRoomRef.current;
      if (nextRoom) {
        leaveSession?.();
        nextRoomRef.current = null;
        router.push(`/${params.locale}/${orgSlug}/classroom/${nextRoom}`);
        return;
      }
      exitClassroom();
    },
    [
      clearToken,
      connectionScope,
      exitClassroom,
      logPresence,
      orgSlug,
      params.locale,
      resolvedIsStudentView,
      router,
      roomName,
      leaveSession,
      sessionStatus?.scheduleId,
      sessionStatus?.activationId,
      presenceConnection,
      t,
    ],
  );

  const handleRetry = useCallback(() => {
    setRoomErrorState((current) =>
      current?.scopeKey === connectionScope ? null : current,
    );
    retryToken();
  }, [connectionScope, retryToken]);

  const handleSwitchClassroom = useCallback((nextRoomName: string) => {
    nextRoomRef.current = nextRoomName;
  }, []);

  // Helper to format countdown
  const getCountdown = (targetTime: number) => {
    const diff = targetTime - now;
    if (diff <= 0) return "00:00:00";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return `${hours > 0 ? `${hours}:` : ""}${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const renderClassroom = () => {
    // Loading State
    if (!convexUser || sessionStatus === undefined) {
      if (resolvedIsStudentView) {
        return <ClassroomRocketLoader label={t("classroom.checkingStatus")} />;
      }

      return (
        <div
          className={`flex h-full w-full items-center justify-center bg-background/90 backdrop-blur-md rounded-lg ${className}`}
        >
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm font-medium text-muted-foreground animate-pulse">
              {t("classroom.checkingStatus")}
            </p>
          </div>
        </div>
      );
    }

    // Room Not Found
    if (!sessionStatus || scheduleDetails === null) {
      return (
        <div
          className={`flex h-full w-full items-center justify-center bg-background/90 backdrop-blur-md rounded-lg ${className}`}
        >
          <div className="text-center p-8 max-w-md">
            <School className="w-16 h-16 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-foreground">
              {t("classroom.notFound")}
            </h3>
            <p className="text-muted-foreground mt-2">
              {t("classroom.notFoundDescription")}
            </p>

            {resolvedIsStudentView ? (
              <Button
                variant="outline"
                className="mt-6 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={exitClassroom}
              >
                <LogOut className="w-4 h-4 mr-2" />
                {t("classroom.leave")}
              </Button>
            ) : (
              <Button
                variant="outline"
                className="mt-6"
                onClick={exitClassroom}
              >
                {t("common.back")}
              </Button>
            )}
          </div>
        </div>
      );
    }

    if (isSessionClosed) {
      const endedTime = sessionStatus.endedAt
        ? format(
            new TZDate(sessionStatus.endedAt, sessionStatus.timeZone),
            "h:mm a",
          )
        : null;
      return (
        <div
          className={`flex h-full w-full items-center justify-center rounded-lg bg-muted/30 ${className}`}
        >
          <div className="max-w-md p-8 text-center">
            <CalendarClock className="mx-auto mb-4 size-16 text-muted-foreground/40" />
            <h3 className="text-xl font-bold text-foreground">
              {sessionStatus.status === "completed"
                ? t("classroom.classEnded")
                : t("classroom.notActive")}
            </h3>
            {!resolvedIsStudentView && endedTime && (
              <p className="mt-2 text-sm text-muted-foreground">
                {sessionStatus.endedByName
                  ? t("classroom.endedBy", {
                      name: sessionStatus.endedByName,
                      time: endedTime,
                    })
                  : t("classroom.automaticClosure", { time: endedTime })}
              </p>
            )}
            {!resolvedIsStudentView && (
              <SessionClosureProgress
                closing={sessionStatus.sessionClosing}
                retrying={sessionStatus.sessionCloseRetrying}
              />
            )}
            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
              {!isCompanion &&
                !resolvedIsStudentView &&
                sessionStatus.canReopen && (
                  <Button onClick={() => setActivationDialogMode("reopen")}>
                    <RotateCcw className="mr-2 size-4" />
                    {t("classroom.reopenClass")}
                  </Button>
                )}
              <Button variant="outline" onClick={exitClassroom}>
                {t("common.back")}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (!resolvedIsStudentView && !isClassLive) {
      const canLeadSession = sessionStatus.leadershipRole !== null;
      const startTime = format(
        new TZDate(sessionStatus.startAvailableAt, sessionStatus.timeZone),
        "h:mm a",
      );
      const isTooEarly = now < sessionStatus.startAvailableAt;
      return (
        <div
          className={`flex h-full w-full items-center justify-center rounded-lg bg-muted/30 ${className}`}
        >
          <div className="max-w-md p-8 text-center">
            <CalendarClock className="mx-auto mb-4 size-16 text-muted-foreground/40" />
            <h3 className="text-xl font-bold text-foreground">
              {sessionStatus.canStart
                ? t("classroom.readyToStart")
                : t("classroom.hasntStarted")}
            </h3>
            {canLeadSession && isTooEarly && (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("classroom.startAvailableAt", {
                  time: startTime,
                  timeZone: sessionStatus.timeZone,
                })}
              </p>
            )}
            <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
              {!isCompanion && sessionStatus.canStart && (
                <Button onClick={() => setActivationDialogMode("start")}>
                  <PlayCircle className="mr-2 size-4" />
                  {t("classroom.startClass")}
                </Button>
              )}
              <Button variant="outline" onClick={exitClassroom}>
                {t("common.back")}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Waiting Room
    if (!shouldConnect && !token) {
      const timeDiff = sessionStatus.start - now;
      const isUrgent = timeDiff > 0 && timeDiff <= 15 * 60 * 1000;
      const isLate = timeDiff <= 0;

      return (
        <div
          className={`flex h-full w-full items-center justify-center bg-muted/30 rounded-lg ${className}`}
        >
          <div className="text-center p-8 max-w-md bg-card shadow-xl rounded-2xl border-4 border-primary/20 animate-in fade-in zoom-in duration-500">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
                isLate
                  ? "bg-destructive/10 animate-pulse"
                  : "bg-primary/10 animate-bounce"
              }`}
            >
              {isLate ? (
                <AlertCircle className="w-10 h-10 text-destructive" />
              ) : (
                <CalendarClock className="w-10 h-10 text-primary" />
              )}
            </div>

            <h2 className="text-2xl font-bold text-card-foreground mb-2">
              {isLate
                ? t("classroom.waitingForTeacher")
                : t("classroom.waitingTitle")}
            </h2>

            <div className="space-y-4 my-6">
              <div
                className={`p-4 rounded-lg border flex flex-col items-center justify-center ${
                  isUrgent
                    ? "bg-accent border-accent-foreground/20"
                    : "bg-muted border-border"
                }`}
              >
                {isLate ? (
                  <>
                    <p className="text-xs font-bold text-destructive uppercase tracking-wider mb-1">
                      {t("classroom.shouldHaveStarted")}
                    </p>
                    <p className="text-2xl font-mono font-bold text-destructive">
                      {format(
                        new TZDate(sessionStatus.start, sessionStatus.timeZone),
                        "h:mm a",
                      )}{" "}
                      · {sessionStatus.timeZone}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                      {isUrgent
                        ? t("classroom.startsIn")
                        : t("classroom.scheduledStart")}
                    </p>
                    <p
                      className={`text-3xl font-mono font-bold ${
                        isUrgent ? "text-accent-foreground" : "text-foreground"
                      }`}
                    >
                      {isUrgent
                        ? getCountdown(sessionStatus.start)
                        : `${format(new TZDate(sessionStatus.start, sessionStatus.timeZone), "h:mm a")} · ${sessionStatus.timeZone}`}
                    </p>
                    {!isUrgent && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {format(
                          new TZDate(
                            sessionStatus.start,
                            sessionStatus.timeZone,
                          ),
                          "EEEE, MMMM do",
                        )}
                      </p>
                    )}
                  </>
                )}
              </div>

              <p className="text-muted-foreground text-sm leading-relaxed">
                {isLate
                  ? t("classroom.teacherRunningLate")
                  : t("classroom.waitingMessage")}
              </p>
            </div>

            {resolvedIsStudentView && (
              <Button
                variant="outline"
                onClick={exitClassroom}
                className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="w-4 h-4 mr-2" />
                {t("classroom.leave")}
              </Button>
            )}

            {!resolvedIsStudentView && (
              <Button
                variant="outline"
                onClick={() => router.back()}
                className="w-full"
              >
                {t("classroom.backToDashboard")}
              </Button>
            )}
          </div>
        </div>
      );
    }

    // Error State
    if (error && (!token || !scheduleDetails)) {
      return (
        <ClassroomConnectionError
          className={className}
          message={error}
          retryLabel={t("classroom.tryAgain")}
          leaveLabel={t("classroom.leave")}
          onRetry={handleRetry}
          onLeave={resolvedIsStudentView ? exitClassroom : undefined}
        />
      );
    }

    // Connecting
    if (!token || !scheduleDetails) {
      if (resolvedIsStudentView) {
        return <ClassroomRocketLoader label={t("classroom.entering")} />;
      }

      return (
        <div
          className={`flex h-full w-full items-center justify-center bg-background/90 backdrop-blur-sm rounded-lg ${className}`}
        >
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-foreground font-medium">
              {t("classroom.entering")}
            </p>
          </div>
        </div>
      );
    }

    const countdown = isClassLive ? (
      <ClassroomCountdown
        now={now}
        end={sessionStatus.end}
        extensionEndsAt={sessionStatus.liveExtensionEndsAt}
      />
    ) : null;

    // Active Classroom
    return (
      <div
        ref={containerRef}
        className={`relative h-full w-full overflow-hidden ${className}`}
      >
        {!resolvedIsStudentView && (
          <SidebarAutoCollapser active={presentation?.mode !== "compact"} />
        )}
        <LiveKitRoom
          key={connectionScope}
          video={false}
          audio={false}
          token={token}
          serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
          data-lk-theme="default"
          style={{ height: "100%", width: "100%" }}
          onConnected={handleConnected}
          onDisconnected={handleDisconnect}
          onError={handleRoomError}
        >
          {isCompanion ? (
            <CompanionClassroomUI
              countdown={countdown}
              roomName={roomName}
              isFullscreen={isFullscreen}
              onToggleFullscreen={
                canFullscreen ? handleToggleFullscreen : undefined
              }
            />
          ) : resolvedIsStudentView ? (
            <StudentClassroomUI
              countdown={countdown}
              courseId={scheduleDetails.class._id}
              scheduleId={sessionStatus.scheduleId}
              roomName={roomName}
              sessionNow={now}
              className={scheduleDetails?.class?.name}
              curriculumIconKey={scheduleDetails.class.curriculumIconKey}
              onSwitchClassroom={handleSwitchClassroom}
              isFullscreen={isFullscreen}
              onToggleFullscreen={
                canFullscreen ? handleToggleFullscreen : undefined
              }
              uiPreviewEnabled={uiPreviewEnabled}
            />
          ) : (
            <ActiveClassroomUI
              countdown={countdown}
              courseId={scheduleDetails.class._id}
              scheduleId={sessionStatus.scheduleId}
              currentUserRole={role}
              activationId={sessionStatus.activationId}
              canLeadSession={sessionStatus?.leadershipRole != null}
              roomName={roomName}
              sessionNow={now}
              className={scheduleDetails?.class?.name}
              curriculumIconKey={scheduleDetails.class.curriculumIconKey}
              sessionIsLive={isClassLive}
              sessionTimeZone={sessionStatus.timeZone}
              isCloseoutOpen={isCloseoutOpen}
              onRequestCloseout={() => setCloseoutScope(connectionScope)}
              isFullscreen={isFullscreen}
              onToggleFullscreen={
                canFullscreen ? handleToggleFullscreen : undefined
              }
              uiPreviewEnabled={uiPreviewEnabled}
            />
          )}
        </LiveKitRoom>
        {error && (
          <ClassroomConnectionError
            isOverlay
            message={error}
            retryLabel={t("classroom.tryAgain")}
            leaveLabel={t("classroom.leave")}
            onRetry={handleRetry}
            onLeave={resolvedIsStudentView ? exitClassroom : undefined}
          />
        )}
      </div>
    );
  };

  return (
    <>
      {renderClassroom()}
      <SessionCloseoutDialog
        key={connectionScope}
        open={isCloseoutOpen}
        roomName={roomName}
        sessionNow={now}
        required
        alreadyEnded={isSessionClosed}
        onOpenChange={(open) => {
          if (open) setCloseoutScope(connectionScope);
        }}
        onComplete={handleCompleteSession}
      />
      <AlertDialog
        open={activationDialogMode !== null}
        onOpenChange={(open) => {
          if (!open && !isActivating) setActivationDialogMode(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {activationDialogMode === "reopen"
                ? t("classroom.reopenClassTitle")
                : t(
                    sessionStatus?.isPrimaryTeacher
                      ? "classroom.startClassTitle"
                      : "classroom.startClassAsLeaderTitle",
                  )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {activationDialogMode === "reopen"
                ? t("classroom.reopenClassDescription")
                : t(
                    sessionStatus?.isPrimaryTeacher
                      ? "classroom.startClassDescription"
                      : "classroom.startClassAsLeaderDescription",
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {activationDialogMode === "start" &&
            !sessionStatus?.isPrimaryTeacher && (
              <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">
                {t("classroom.startClassAsLeaderDisclosure")}
              </p>
            )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isActivating}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!activationDialogMode || isActivating}
              onClick={(event) => {
                event.preventDefault();
                if (activationDialogMode) {
                  void handleActivateSession(activationDialogMode);
                }
              }}
            >
              {isActivating && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t(
                activationDialogMode === "reopen"
                  ? "classroom.confirmReopenClass"
                  : sessionStatus?.isPrimaryTeacher
                    ? "classroom.confirmStartClass"
                    : "classroom.confirmStartClassAsLeader",
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
