"use client";

import { useEffect, useState, useRef } from "react"; // Added useRef
import { useUser } from "@clerk/nextjs";
import { useAction, useQuery, useMutation } from "convex/react"; // Added useMutation
import { LiveKitRoom } from "@livekit/components-react";
import { api } from "@/convex/_generated/api";
import { ActiveClassroomUI } from "./active-classroom-ui";
import { StudentClassroomUI } from "./student-classroom-ui";
import { Loader2, CalendarClock, School, LogOut, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface FlexiClassroomProps {
  roomName: string;
  className?: string;
  isStudentView?: boolean;
  onLeave?: () => void;
}

export default function FlexiClassroom({ roomName, className, isStudentView = false, onLeave }: FlexiClassroomProps) {
  const t = useTranslations();
  const { user } = useUser();
  const router = useRouter();
  const [token, setToken] = useState<string>("");
  const [error, setError] = useState<string>("");
  
  // Timer State
  const [now, setNow] = useState(Date.now());

  // 1. IMPORT THE MUTATION
  const logPresence = useMutation(api.schedule.logStudentPresence);

  const convexUser = useQuery(api.users.getCurrentUser, 
    user?.id ? { clerkId: user.id } : "skip"
  );

  const sessionStatus = useQuery(api.schedule.getSessionStatus, { 
    sessionId: roomName 
  });

  const scheduleDetails = useQuery(
    api.schedule.getWithDetails,
    sessionStatus?.scheduleId ? { id: sessionStatus.scheduleId } : "skip"
  );

  const getToken = useAction(api.livekit.getToken);

  const canJoinEarly = ["teacher", "admin", "superadmin", "tutor"].includes(convexUser?.role || "");
  const isClassLive = sessionStatus?.isActive || false;
  const shouldConnect = (isClassLive || canJoinEarly) && !!convexUser;

  // Use a ref to ensure we don't log join multiple times for the same session
  const hasLoggedJoin = useRef(false);

  // Timer Effect
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // 2. LOG JOINING WHEN TOKEN IS RECEIVED
  useEffect(() => {
    if (!token || !sessionStatus?.scheduleId || !isStudentView) return;

    if (!hasLoggedJoin.current) {
        // console.log("📝 Logging student join...");
        logPresence({
            scheduleId: sessionStatus.scheduleId,
            action: "join"
        }).catch(err => console.error("Failed to log presence:", err));
        
        hasLoggedJoin.current = true;
    }
  }, [token, sessionStatus?.scheduleId, isStudentView, logPresence]);


  useEffect(() => {
    if (!user || !roomName || !shouldConnect) return;

    const fetchToken = async () => {
      try {
        const participantName = user.fullName || user.username || "Unknown";
        const jwt = await getToken({
          roomName,
          participantName
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
  }, [user, roomName, getToken, shouldConnect, t]);

  // 3. HELPER TO HANDLE DISCONNECT (LEAVE)
  const handleDisconnect = async () => {
     // console.log("📝 Logging student leave...");
     
     // 1. Log leave to DB
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

     // 2. Clear token & UI state
     setToken("");
     hasLoggedJoin.current = false;

     // 3. Navigation
     if (isStudentView && onLeave) {
       onLeave();
     } else if (!isStudentView) {
       router.push("/dashboard");
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
      <div className={`flex h-full w-full items-center justify-center ${isStudentView ? 'bg-white/90 dark:bg-gray-900/90 backdrop-blur-md' : 'bg-slate-50'} rounded-lg ${className}`}>
        <div className="flex flex-col items-center gap-4">
           <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
           <p className="text-sm font-medium text-gray-600 dark:text-gray-400 animate-pulse">{t('classroom.checkingStatus')}</p>
        </div>
      </div>
    );
  }

  // Room Not Found
  if (!sessionStatus) {
    return (
      <div className={`flex h-full w-full items-center justify-center ${isStudentView ? 'bg-white/90 dark:bg-gray-900/90 backdrop-blur-md' : 'bg-slate-50'} rounded-lg ${className}`}>
        <div className="text-center p-8 max-w-md">
           <School className="w-16 h-16 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
           <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200">{t('classroom.notFound')}</h3>
           <p className="text-gray-500 dark:text-gray-400 mt-2">{t('classroom.notFoundDescription')}</p>
           
           {/* Add Leave Button for Student here too just in case */}
           {isStudentView && onLeave ? (
             <Button variant="outline" className="mt-6 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={onLeave}>
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
    const isUrgent = timeDiff > 0 && timeDiff <= 15 * 60 * 1000; // 15 mins
    const isLate = timeDiff <= 0;

    return (
      <div className={`flex h-full w-full items-center justify-center ${isStudentView ? 'bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-950 dark:to-purple-950' : 'bg-blue-50/50'} rounded-lg ${className}`}>
        <div className="text-center p-8 max-w-md bg-white dark:bg-gray-900 shadow-xl rounded-2xl border-4 border-purple-400 dark:border-purple-600 animate-in fade-in zoom-in duration-500">
           
           {/* Icon Badge */}
           <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
               isLate ? 'bg-orange-100 dark:bg-orange-900 animate-pulse' : 'bg-purple-100 dark:bg-purple-900 animate-bounce'
           }`}>
              {isLate ? (
                <AlertCircle className="w-10 h-10 text-orange-600 dark:text-orange-400" />
              ) : (
                <CalendarClock className="w-10 h-10 text-purple-600 dark:text-purple-400" />
              )}
           </div>
           
           <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2">
               {isLate ? t('classroom.waitingForTeacher') : t('classroom.waitingTitle')}
           </h2>
           
           <div className="space-y-4 my-6">
              {/* Enhanced Time Display */}
              <div className={`p-4 rounded-lg border flex flex-col items-center justify-center ${
                  isUrgent 
                    ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' 
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
              }`}>
                 {isLate ? (
                    <>
                        <p className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-1">
                            {t('classroom.shouldHaveStarted')}
                        </p>
                        <p className="text-2xl font-mono font-bold text-orange-700 dark:text-orange-400">
                             {format(sessionStatus.start, "h:mm a")}
                        </p>
                    </>
                 ) : (
                    <>
                        <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
                            {isUrgent ? t('classroom.startsIn') : t('classroom.scheduledStart')}
                        </p>
                        <p className={`text-3xl font-mono font-bold ${
                            isUrgent ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'
                        }`}>
                            {isUrgent ? getCountdown(sessionStatus.start) : format(sessionStatus.start, "h:mm a")}
                        </p>
                        {!isUrgent && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                {format(sessionStatus.start, "EEEE, MMMM do")}
                            </p>
                        )}
                    </>
                 )}
              </div>
              
              <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                {isLate 
                    ? t('classroom.teacherRunningLate') 
                    : t('classroom.waitingMessage')
                }
              </p>
           </div>

            {/* Leave Button for Students */}
           {isStudentView && onLeave && (
             <Button 
                variant="outline" 
                onClick={onLeave} 
                className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 dark:border-red-900 dark:hover:bg-red-950 dark:text-red-400"
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
      <div className={`flex h-full w-full items-center justify-center ${isStudentView ? 'bg-red-50 dark:bg-red-950/20' : 'bg-red-50'} rounded-lg ${className}`}>
        <div className="text-center p-6">
           <div className="text-red-500 font-bold mb-2">{t('classroom.connectionError')}</div>
           <div className="text-gray-600 dark:text-gray-400 text-sm mb-4">{error}</div>
           
            <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => window.location.reload()}>
                    {t('classroom.tryAgain')}
                </Button>
                {/* Leave Button for Error State */}
                {isStudentView && onLeave && (
                    <Button variant="ghost" onClick={onLeave} className="text-red-600 hover:text-red-700 hover:bg-red-50">
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
      <div className={`flex h-full w-full items-center justify-center ${isStudentView ? 'bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500' : 'bg-slate-900/90'} backdrop-blur-sm rounded-lg ${className}`}>
        <div className="flex flex-col items-center gap-4">
           <Loader2 className="w-10 h-10 text-white animate-spin" />
           <p className="text-white font-medium">{t('classroom.entering')}</p>
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
            currentUserRole={convexUser.role} 
            roomName={roomName}
            className={scheduleDetails?.class?.name}
            lessonTitle={scheduleDetails?.lesson?.title}
            onLeave={handleDisconnect}
          />
        ) : (
          <ActiveClassroomUI 
            currentUserRole={convexUser.role} 
            roomName={roomName}
            className={scheduleDetails?.class?.name}
            lessonTitle={scheduleDetails?.lesson?.title}
          />
        )}
      </LiveKitRoom>
    </div>
  );
}