"use client";

import { useEffect, useState, useRef } from "react";
import { useAction, useQuery, useMutation } from "convex/react";
import { LiveKitRoom } from "@livekit/components-react";
import { api } from "@/convex/_generated/api";
import { ActiveClassroomUI } from "./active-classroom-ui";
import { StudentClassroomUI } from "./student-classroom-ui";
import { Loader2, CalendarClock, School, LogOut, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@clerk/nextjs";
import { getRoleForOrg } from "@/lib/rbac";
import { useCurrentUser } from "@/hooks/use-current-user";

interface FlexiClassroomProps {
  roomName: string;
  className?: string;
  isStudentView?: boolean;
  onLeave?: () => void;
}

export default function FlexiClassroom({ roomName, className, isStudentView = false, onLeave }: FlexiClassroomProps) {
  const t = useTranslations();
  const router = useRouter();
  const [token, setToken] = useState<string>("");
  const [error, setError] = useState<string>("");
  
  // Timer State
  const [now, setNow] = useState(Date.now());

  // 1. Resolve Context-Aware Role via Clerk Claims
  const params = useParams();
  const orgSlug = (params.orgSlug as string) || "system";
  const { sessionClaims } = useAuth();
  const role = getRoleForOrg(sessionClaims, orgSlug) || "student"; // Fallback to student safely

  // 2. Fetch Convex User via our custom hook
  const { user: convexUser } = useCurrentUser();

  // 3. API Hooks
  const logPresence = useMutation(api.schedule.logStudentPresence);

  const sessionStatus = useQuery(api.schedule.getSessionStatus, { 
    sessionId: roomName 
  });

  const scheduleDetails = useQuery(
    api.schedule.getWithDetails,
    sessionStatus?.scheduleId ? { id: sessionStatus.scheduleId } : "skip"
  );

  const getToken = useAction(api.livekit.getToken);

  // 4. Permission & Connection Logic
  const canJoinEarly = ["teacher", "admin", "superadmin", "tutor", "principal"].includes(role);
  const isClassLive = sessionStatus?.isActive || false;
  const shouldConnect = (isClassLive || canJoinEarly) && !!convexUser;

  // Use a ref to ensure we don't log join multiple times for the same session
  const hasLoggedJoin = useRef(false);

  // Format lesson titles for display
  const lessonTitles = scheduleDetails?.lessons && scheduleDetails.lessons.length > 0
    ? scheduleDetails.lessons.length === 1
      ? scheduleDetails.lessons[0].title
      : `${scheduleDetails.lessons.length} Lessons`
    : undefined;

  // Timer Effect
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Log joining when token is received
  useEffect(() => {
    if (!token || !sessionStatus?.scheduleId || !isStudentView) return;

    if (!hasLoggedJoin.current) {
      logPresence({
        scheduleId: sessionStatus.scheduleId,
        action: "join"
      }).catch(err => console.error("Failed to log presence:", err));
      
      hasLoggedJoin.current = true;
    }
  }, [token, sessionStatus?.scheduleId, isStudentView, logPresence]);

  useEffect(() => {
    if (!convexUser || !roomName || !shouldConnect) return;

    const fetchToken = async () => {
      try {
        const participantName = convexUser.fullName || convexUser.firstName || "Unknown";
        const jwt = await getToken({
          roomName,
          participantName,
          role
        });
        setToken(jwt);
      } catch (err) {
        console.error("Error fetching token:", err);
        if ((err as Error).message.includes("not started")) {
          setError(t('classroom.hasntStarted'));
        } else {
          setError(t('classroom.connectionError'));
        }
      }
    };

    fetchToken();
  }, [convexUser, roomName, getToken, shouldConnect, t]);

  // Handle disconnect (leave)
  const handleDisconnect = async () => {
    if (isStudentView && sessionStatus?.scheduleId) {
      try {
        await logPresence({
          scheduleId: sessionStatus.scheduleId,
          action: "leave"
        });
      } catch (e) {
        console.error("Error logging leave:", e);
      }
    }

    setToken("");
    hasLoggedJoin.current = false;

    if (isStudentView && onLeave) {
      onLeave();
    } else if (!isStudentView) {
      router.push(`/${params.locale}/${orgSlug}`);
    }
  };
  
  // Helper to format countdown
  const getCountdown = (targetTime: number) => {
    const diff = targetTime - now;
    if (diff <= 0) return "00:00:00";
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    return `${hours > 0 ? `${hours}:` : ''}${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Loading State
  if (!convexUser || sessionStatus === undefined) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-background/90 backdrop-blur-md rounded-lg ${className}`}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm font-medium text-muted-foreground animate-pulse">{t('classroom.checkingStatus')}</p>
        </div>
      </div>
    );
  }

  // Room Not Found
  if (!sessionStatus) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-background/90 backdrop-blur-md rounded-lg ${className}`}>
        <div className="text-center p-8 max-w-md">
          <School className="w-16 h-16 text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-foreground">{t('classroom.notFound')}</h3>
          <p className="text-muted-foreground mt-2">{t('classroom.notFoundDescription')}</p>
          
          {isStudentView && onLeave ? (
            <Button variant="outline" className="mt-6 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onLeave}>
              <LogOut className="w-4 h-4 mr-2" />
              {t('classroom.leave')}
            </Button>
          ) : (
            !isStudentView && <Button variant="outline" className="mt-6" onClick={() => router.back()}>{t('common.back')}</Button>
          )}
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
      <div className={`flex h-full w-full items-center justify-center bg-muted/30 rounded-lg ${className}`}>
        <div className="text-center p-8 max-w-md bg-card shadow-xl rounded-2xl border-4 border-primary/20 animate-in fade-in zoom-in duration-500">
          
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
            isLate ? 'bg-destructive/10 animate-pulse' : 'bg-primary/10 animate-bounce'
          }`}>
            {isLate ? (
              <AlertCircle className="w-10 h-10 text-destructive" />
            ) : (
              <CalendarClock className="w-10 h-10 text-primary" />
            )}
          </div>
          
          <h2 className="text-2xl font-bold text-card-foreground mb-2">
            {isLate ? t('classroom.waitingForTeacher') : t('classroom.waitingTitle')}
          </h2>
          
          <div className="space-y-4 my-6">
            <div className={`p-4 rounded-lg border flex flex-col items-center justify-center ${
              isUrgent 
                ? 'bg-accent border-accent-foreground/20' 
                : 'bg-muted border-border'
            }`}>
              {isLate ? (
                <>
                  <p className="text-xs font-bold text-destructive uppercase tracking-wider mb-1">
                    {t('classroom.shouldHaveStarted')}
                  </p>
                  <p className="text-2xl font-mono font-bold text-destructive">
                    {format(sessionStatus.start, "h:mm a")}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                    {isUrgent ? t('classroom.startsIn') : t('classroom.scheduledStart')}
                  </p>
                  <p className={`text-3xl font-mono font-bold ${
                    isUrgent ? 'text-accent-foreground' : 'text-foreground'
                  }`}>
                    {isUrgent ? getCountdown(sessionStatus.start) : format(sessionStatus.start, "h:mm a")}
                  </p>
                  {!isUrgent && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {format(sessionStatus.start, "EEEE, MMMM do")}
                    </p>
                  )}
                </>
              )}
            </div>
            
            <p className="text-muted-foreground text-sm leading-relaxed">
              {isLate 
                ? t('classroom.teacherRunningLate') 
                : t('classroom.waitingMessage')
              }
            </p>
          </div>

          {isStudentView && onLeave && (
            <Button 
              variant="outline" 
              onClick={onLeave} 
              className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {t('classroom.leave')}
            </Button>
          )}

          {!isStudentView && (
            <Button variant="outline" onClick={() => router.back()} className="w-full">
              {t('classroom.backToDashboard')}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-destructive/5 rounded-lg ${className}`}>
        <div className="text-center p-6 bg-card border border-destructive/20 rounded-xl shadow-sm">
          <div className="text-destructive font-bold mb-2">{t('classroom.connectionError')}</div>
          <div className="text-muted-foreground text-sm mb-4">{error}</div>
          
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => window.location.reload()}>
              {t('classroom.tryAgain')}
            </Button>
            {isStudentView && onLeave && (
              <Button variant="ghost" onClick={onLeave} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                {t('classroom.leave')}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Connecting
  if (!token) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-background/90 backdrop-blur-sm rounded-lg ${className}`}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-foreground font-medium">{t('classroom.entering')}</p>
        </div>
      </div>
    );
  }

  // Active Classroom
  return (
    <div className={`w-full h-full overflow-hidden rounded-lg ${className}`}>
      <LiveKitRoom
        video={true}
        audio={true}
        token={token}
        serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
        data-lk-theme="default"
        style={{ height: '100%', width: '100%' }}
        onDisconnected={handleDisconnect}
      >
        {isStudentView ? (
          <StudentClassroomUI 
            currentUserRole={role}
            roomName={roomName}
            className={scheduleDetails?.class?.name}
            lessonTitle={lessonTitles}
            onLeave={handleDisconnect}
          />
        ) : (
          <ActiveClassroomUI 
            currentUserRole={role}
            roomName={roomName}
            className={scheduleDetails?.class?.name}
            lessonTitle={lessonTitles}
          />
        )}
      </LiveKitRoom>
    </div>
  );
}