"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useAction, useQuery } from "convex/react";
import { LiveKitRoom } from "@livekit/components-react";
import { api } from "@/convex/_generated/api";
import { ActiveClassroomUI } from "./active-classroom-ui";
import { Loader2 } from "lucide-react";

interface FlexiClassroomProps {
  roomName: string;
  className?: string; // Allow custom styling from parent
}

export default function FlexiClassroom({ roomName, className }: FlexiClassroomProps) {
  const { user } = useUser();
  const [token, setToken] = useState<string>("");
  const [error, setError] = useState<string>("");
  
  const convexUser = useQuery(api.users.getCurrentUser, 
    user?.id ? { clerkId: user.id } : "skip"
  );

  const getToken = useAction(api.livekit.getToken);

  useEffect(() => {
    if (!user || !roomName) return;

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
        setError("Could not connect to the classroom.");
      }
    };

    fetchToken();
  }, [user, roomName, getToken]);

  if (error) return (
    <div className="flex h-full items-center justify-center bg-gray-100 rounded-lg border-2 border-dashed border-red-200">
      <div className="text-red-500 font-medium">{error}</div>
    </div>
  );
  
  if (!token || !convexUser) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-900/5 backdrop-blur-sm rounded-lg">
        <div className="flex flex-col items-center gap-4">
           <Loader2 className="w-8 h-8 text-brand-blue animate-spin" />
           <p className="text-sm font-medium text-brand-blue animate-pulse">Connecting to Class...</p>
        </div>
      </div>
    );
  }

  return (
    // CHANGED: Removed fixed 100dvh, added className prop, and w-full/h-full
    <div className={`w-full h-full overflow-hidden rounded-lg ${className}`}>
      <LiveKitRoom
        video={true}
        audio={true}
        token={token}
        serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
        data-lk-theme="default"
        style={{ height: '100%', width: '100%' }} // Fill the container
        onDisconnected={() => setToken("")}
      >
        <ActiveClassroomUI 
           currentUserRole={convexUser.role} 
           roomName={roomName}
        />
      </LiveKitRoom>
    </div>
  );
}