"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useAction, useQuery } from "convex/react";
import { LiveKitRoom } from "@livekit/components-react";
import { api } from "@/convex/_generated/api";
import "@livekit/components-styles";
import { ActiveClassroomUI } from "./ActiveClassroomUI";

interface FlexiClassroomProps {
  roomName: string; 
}

export default function FlexiClassroom({ roomName }: FlexiClassroomProps) {
  const { user } = useUser();
  const [token, setToken] = useState<string>("");
  const [error, setError] = useState<string>("");
  
  // 1. Fetch User Profile from Convex (The Source of Truth)
  // We use the Clerk ID to get the Convex User, which contains the REAL role.
  const convexUser = useQuery(api.users.getCurrentUser, 
    user?.id ? { clerkId: user.id } : "skip"
  );

  const getToken = useAction(api.livekit.getToken);

  useEffect(() => {
    if (!user || !roomName) return;

    const fetchToken = async () => {
      try {
        const participantName = user.fullName || user.username || "Unknown";
        
        // We don't need to pass role here anymore, the backend fetches it.
        const jwt = await getToken({
          roomName,
          participantName
        });

        setToken(jwt);
      } catch (err) {
        console.error("Error fetching token:", err);
        setError("Could not connect to the classroom.");
      }
    };

    fetchToken();
  }, [user, roomName, getToken]);

  if (error) return <div className="text-red-500 p-4">{error}</div>;
  
  // Wait for both Token AND User Profile
  if (!token || !convexUser) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-900 text-white">
        <div className="flex flex-col items-center gap-4">
           <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
           <p className="animate-pulse">Entering Classroom...</p>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      video={true}
      audio={true}
      token={token}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
      data-lk-theme="default"
      style={{ height: '100dvh' }}
      onDisconnected={() => setToken("")}
    >
      <ActiveClassroomUI 
         currentUserRole={convexUser.role} 
         currentUserName={convexUser.fullName}
      />
    </LiveKitRoom>
  );
}