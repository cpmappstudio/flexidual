"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useAction } from "convex/react"; // Changed from useMutation
import { LiveKitRoom } from "@livekit/components-react";
import { api } from "@/convex/_generated/api";
import "@livekit/components-styles";
import { ActiveClassroomUI } from "./ActiveClassroomUI";

interface FlexiClassroomProps {
  roomName: string; // Passed from the Drag & Drop selection
}

export default function FlexiClassroom({ roomName }: FlexiClassroomProps) {
  const { user } = useUser();
  const [token, setToken] = useState<string>("");
  const [error, setError] = useState<string>("");
  
  const getToken = useAction(api.livekit.getToken);

  useEffect(() => {
    if (!user || !roomName) return;

    const fetchToken = async () => {
      try {
        const participantName = user.fullName || user.username || "Unknown Student";
        const userRole = (user.publicMetadata?.role as string) || "student";

        const jwt = await getToken({
          roomName,
          participantName,
          userRole,
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
  
  if (!token) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-900 text-white">
        <div className="animate-pulse">Preparing your classroom...</div>
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
      onDisconnected={() => setToken("")} // Handle disconnect cleanly
    >
      {/* We separate the UI into a child component so it can access
        LiveKit contexts (useParticipants, useRoomContext, etc.)
      */}
      <ActiveClassroomUI />
    </LiveKitRoom>
  );
}