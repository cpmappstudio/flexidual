"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useAction, useQuery } from "convex/react";
import { LiveKitRoom } from "@livekit/components-react";
import { api } from "@/convex/_generated/api";
import { ActiveClassroomUI } from "./active-classroom-ui";
import { Loader2, CalendarClock, School } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface FlexiClassroomProps {
  roomName: string;
  className?: string;
}

export default function FlexiClassroom({ roomName, className }: FlexiClassroomProps) {
  const { user } = useUser();
  const router = useRouter();
  const [token, setToken] = useState<string>("");
  const [error, setError] = useState<string>("");
  
  // 1. Fetch User & Session Status (Reactive!)
  const convexUser = useQuery(api.users.getCurrentUser, 
    user?.id ? { clerkId: user.id } : "skip"
  );

  const sessionStatus = useQuery(api.schedule.getSessionStatus, { 
    sessionId: roomName 
  });

  // ADD THIS: Fetch full schedule details
  const scheduleDetails = useQuery(
    api.schedule.getWithDetails,
    sessionStatus?.scheduleId ? { id: sessionStatus.scheduleId } : "skip"
  );


  const getToken = useAction(api.livekit.getToken);

  // 2. Logic: Who allowed to enter?
  // Teachers/Admins can always enter to prepare the room
  const canJoinEarly = ["teacher", "admin", "superadmin", "tutor"].includes(convexUser?.role || "");
  
  // Students can only enter if the session is strictly active
  const isClassLive = sessionStatus?.isActive || false;
  
  // The Trigger: Should we try to connect?
  const shouldConnect = (isClassLive || canJoinEarly) && !!convexUser;

  useEffect(() => {
    // Prevent fetching if we aren't ready or user isn't allowed yet
    if (!user || !roomName || !shouldConnect) return;

    const fetchToken = async () => {
      try {
        const participantName = user.fullName || user.username || "Unknown";
        const jwt = await getToken({
          roomName,
          participantName
        });
        setToken(jwt);
      } catch (err: any) {
        console.error("Error fetching token:", err);
        // Fallback error handling if logic slips through
        if (err.message.includes("not started")) {
           // Should be handled by UI, but just in case
           setError("Class hasn't started yet.");
        } else {
           setError("Could not connect to the classroom.");
        }
      }
    };

    fetchToken();
  }, [user, roomName, getToken, shouldConnect]);

  // --- RENDER STATES ---

  // 1. Loading User/Session Data
  if (!convexUser || sessionStatus === undefined) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-slate-50 rounded-lg ${className}`}>
        <div className="flex flex-col items-center gap-4">
           <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
           <p className="text-sm font-medium text-slate-500 animate-pulse">Checking class status...</p>
        </div>
      </div>
    );
  }

  // 2. Room Not Found
  if (!sessionStatus) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-slate-50 rounded-lg ${className}`}>
        <div className="text-center p-8 max-w-md">
           <School className="w-16 h-16 text-slate-300 mx-auto mb-4" />
           <h3 className="text-xl font-bold text-slate-800">Classroom Not Found</h3>
           <p className="text-slate-500 mt-2">We couldn't find a scheduled class with this ID.</p>
           <Button variant="outline" className="mt-6" onClick={() => router.back()}>Go Back</Button>
        </div>
      </div>
    );
  }

  // 3. Waiting Room (Class not started & User is Student)
  if (!shouldConnect && !token) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-blue-50/50 rounded-lg ${className}`}>
        <div className="text-center p-8 max-w-md bg-white shadow-xl rounded-2xl border border-blue-100 animate-in fade-in zoom-in duration-500">
           <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
              <CalendarClock className="w-10 h-10 text-blue-600" />
           </div>
           
           <h2 className="text-2xl font-bold text-slate-800 mb-2">Class hasn't started yet</h2>
           
           <div className="space-y-4 my-6">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Scheduled Start</p>
                 <p className="text-xl font-mono font-bold text-slate-700">
                    {format(sessionStatus.start, "h:mm a")}
                 </p>
                 <p className="text-sm text-slate-500">{format(sessionStatus.start, "EEEE, MMMM do")}</p>
              </div>
              
              <p className="text-slate-600 text-sm leading-relaxed">
                Sit tight! You will be automatically joined as soon as your teacher opens the classroom.
              </p>
           </div>

           <Button variant="outline" onClick={() => router.back()} className="w-full">
             Back to Dashboard
           </Button>
        </div>
      </div>
    );
  }

  // 4. Token Error State
  if (error) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-red-50 rounded-lg ${className}`}>
        <div className="text-center p-6">
           <div className="text-red-500 font-bold mb-2">Connection Error</div>
           <div className="text-slate-600 text-sm mb-4">{error}</div>
           <Button variant="outline" onClick={() => window.location.reload()}>Try Again</Button>
        </div>
      </div>
    );
  }

  // 5. Connecting State (Should be brief)
  if (!token) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-slate-900/90 backdrop-blur-sm rounded-lg ${className}`}>
        <div className="flex flex-col items-center gap-4">
           <Loader2 className="w-10 h-10 text-white animate-spin" />
           <p className="text-white font-medium">Entering Classroom...</p>
        </div>
      </div>
    );
  }

  // 6. Active Classroom
  return (
    <div className={`w-full h-full overflow-hidden rounded-lg ${className}`}>
      <LiveKitRoom
        video={true}
        audio={true}
        token={token}
        serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
        data-lk-theme="default"
        style={{ height: '100%', width: '100%' }}
        onDisconnected={() => {
           setToken("");
           router.push("/dashboard"); 
        }}
      >
        <ActiveClassroomUI 
           currentUserRole={convexUser.role} 
           roomName={roomName}
           className={scheduleDetails?.class?.name}
           lessonTitle={scheduleDetails?.lesson?.title}
        />
      </LiveKitRoom>
    </div>
  );
}