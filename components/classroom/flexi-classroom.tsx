"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useAction, useQuery, useMutation } from "convex/react";
import { LiveKitRoom } from "@livekit/components-react";
import { api } from "@/convex/_generated/api";
import { ActiveClassroomUI } from "./active-classroom-ui";
import { StudentClassroomUI } from "./student-classroom-ui";
import {
  Loader2,
  CalendarClock,
  School,
  LogOut,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { Button } from "@/components/ui/button";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useSidebar } from "@/components/ui/sidebar";
import { CompanionClassroomUI } from "./companion-classroom-ui";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { ClassroomRocketLoader } from "@/components/student/rocket-transition";
import { useClassroomClock } from "./use-classroom-clock";

interface FlexiClassroomProps {
  roomName: string;
  className?: string;
  isStudentView?: boolean;
  isCompanion?: boolean;
  onLeave?: () => void;
}

function SidebarAutoCollapser() {
  const { setOpen } = useSidebar();

  // 1. Keep a stable reference to the latest setOpen function
  const setOpenRef = useRef(setOpen);

  useEffect(() => {
    setOpenRef.current = setOpen;
  }, [setOpen]);

  useEffect(() => {
    const mqTablet = window.matchMedia("(max-width: 1023px)");
    const mqPortrait = window.matchMedia("(orientation: portrait)");

    const handleLayoutChange = () => {
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
  const [token, setToken] = useState<string>("");
  const [error, setError] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, isSupported, toggleFullscreen } = useFullscreen();
  const handleToggleFullscreen = () => toggleFullscreen(containerRef.current);

  const now = useClassroomClock();

  const params = useParams();
  const orgSlug = (params.orgSlug as string) || "system";

  const { user: convexUser } = useCurrentUser();

  const logPresence = useMutation(api.schedule.logStudentPresence);

  const sessionStatus = useQuery(api.schedule.getSessionStatus, {
    sessionId: roomName,
    now: Math.floor(now / 60_000) * 60_000,
  });

  const scheduleDetails = useQuery(
    api.schedule.getWithDetails,
    sessionStatus?.scheduleId ? { id: sessionStatus.scheduleId } : "skip",
  );

  const getToken = useAction(api.livekit.getToken);

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
    searchParams.get("uiPreview") === "1";
  const canJoinEarly = sessionStatus?.roomAdmin === true;
  const isClassLive = sessionStatus?.isLive || false;
  const isSessionClosed =
    sessionStatus?.status === "completed" ||
    sessionStatus?.status === "cancelled";
  const shouldConnect =
    !isSessionClosed && (isClassLive || canJoinEarly) && !!convexUser;

  // Use a ref to ensure we don't log join multiple times for the same session
  const hasLoggedJoin = useRef(false);
  const nextRoomRef = useRef<string | null>(null);

  // Format lesson titles for display
  const lessonTitles =
    scheduleDetails?.lessons && scheduleDetails.lessons.length > 0
      ? scheduleDetails.lessons.length === 1
        ? scheduleDetails.lessons[0].title
        : `${scheduleDetails.lessons.length} Lessons`
      : undefined;

  useEffect(() => {
    if (!convexUser || !roomName || !shouldConnect) return;

    const fetchToken = async () => {
      try {
        const jwt = await getToken({
          roomName,
          isCompanion,
        });
        setToken(jwt);
      } catch (err) {
        console.error("Error fetching token:", err);
        if ((err as Error).message.includes("not started")) {
          setError(t("classroom.hasntStarted"));
        } else {
          setError(t("classroom.connectionError"));
        }
      }
    };

    fetchToken();
  }, [convexUser, roomName, getToken, shouldConnect, isCompanion, t]);

  const handleConnected = useCallback(async () => {
    if (
      !resolvedIsStudentView ||
      !sessionStatus?.scheduleId ||
      hasLoggedJoin.current
    ) {
      return;
    }

    hasLoggedJoin.current = true;
    try {
      await logPresence({
        scheduleId: sessionStatus.scheduleId,
        action: "join",
      });
    } catch (err) {
      hasLoggedJoin.current = false;
      console.error("Failed to log presence:", err);
    }
  }, [logPresence, resolvedIsStudentView, sessionStatus?.scheduleId]);

  const exitClassroom = useCallback(() => {
    if (resolvedIsStudentView && onLeave) {
      onLeave();
      return;
    }
    router.push(`/${params.locale}/${orgSlug}`);
  }, [onLeave, orgSlug, params.locale, resolvedIsStudentView, router]);

  const handleRoomError = useCallback(
    (roomError: Error) => {
      console.error("LiveKit connection error:", roomError);
      setError(t("classroom.connectionError"));
    },
    [t],
  );

  // Handle disconnect (leave)
  const handleDisconnect = useCallback(async () => {
    if (
      resolvedIsStudentView &&
      sessionStatus?.scheduleId &&
      hasLoggedJoin.current
    ) {
      try {
        await logPresence({
          scheduleId: sessionStatus.scheduleId,
          action: "leave",
        });
      } catch (e) {
        console.error("Error logging leave:", e);
      }
    }

    setToken("");
    hasLoggedJoin.current = false;
    const nextRoom = nextRoomRef.current;
    if (nextRoom) {
      nextRoomRef.current = null;
      router.push(`/${params.locale}/${orgSlug}/classroom/${nextRoom}`);
      return;
    }
    exitClassroom();
  }, [
    exitClassroom,
    logPresence,
    orgSlug,
    params.locale,
    resolvedIsStudentView,
    router,
    sessionStatus?.scheduleId,
  ]);

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
  if (!sessionStatus) {
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
            <Button variant="outline" className="mt-6" onClick={exitClassroom}>
              {t("common.back")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (isSessionClosed) {
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
          <Button variant="outline" className="mt-6" onClick={exitClassroom}>
            {t("common.back")}
          </Button>
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
                        new TZDate(sessionStatus.start, sessionStatus.timeZone),
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
  if (error) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-destructive/5 rounded-lg ${className}`}
      >
        <div className="text-center p-6 bg-card border border-destructive/20 rounded-xl shadow-sm">
          <div className="text-destructive font-bold mb-2">
            {t("classroom.connectionError")}
          </div>
          <div className="text-muted-foreground text-sm mb-4">{error}</div>

          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => window.location.reload()}>
              {t("classroom.tryAgain")}
            </Button>
            {resolvedIsStudentView && (
              <Button
                variant="ghost"
                onClick={exitClassroom}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {t("classroom.leave")}
              </Button>
            )}
          </div>
        </div>
      </div>
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

  // Active Classroom
  return (
    <div
      ref={containerRef}
      className={`h-full w-full overflow-hidden ${className}`}
    >
      {!resolvedIsStudentView && <SidebarAutoCollapser />}
      <LiveKitRoom
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
            roomName={roomName}
            isFullscreen={isFullscreen}
            onToggleFullscreen={
              isSupported ? handleToggleFullscreen : undefined
            }
          />
        ) : resolvedIsStudentView ? (
          <StudentClassroomUI
            courseId={scheduleDetails.class._id}
            roomName={roomName}
            sessionNow={now}
            className={scheduleDetails?.class?.name}
            lessonTitle={lessonTitles}
            curriculumIconKey={scheduleDetails.class.curriculumIconKey}
            onSwitchClassroom={handleSwitchClassroom}
            isFullscreen={isFullscreen}
            onToggleFullscreen={
              isSupported ? handleToggleFullscreen : undefined
            }
            uiPreviewEnabled={uiPreviewEnabled}
          />
        ) : (
          <ActiveClassroomUI
            courseId={scheduleDetails.class._id}
            currentUserRole={role}
            roomName={roomName}
            sessionNow={now}
            className={scheduleDetails?.class?.name}
            lessonTitle={lessonTitles}
            curriculumIconKey={scheduleDetails.class.curriculumIconKey}
            sessionIsLive={isClassLive}
            sessionTimeZone={sessionStatus.timeZone}
            isFullscreen={isFullscreen}
            onToggleFullscreen={
              isSupported ? handleToggleFullscreen : undefined
            }
            uiPreviewEnabled={uiPreviewEnabled}
          />
        )}
      </LiveKitRoom>
    </div>
  );
}
