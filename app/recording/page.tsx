// app/recording/page.tsx
"use client";

import { 
  LiveKitRoom, 
  useParticipants, 
  RoomAudioRenderer,
  useConnectionState
} from "@livekit/components-react";
import { ConnectionState, Participant, Track } from "livekit-client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

function RecordingTrigger() {
  const state = useConnectionState();
  
  useEffect(() => {
    // Wait for the room to be fully connected before telling Egress to start capturing
    if (state === ConnectionState.Connected) {
      console.log("START_RECORDING");
    }
  }, [state]);

  return null;
}

// A simplified tile just for recording
function RecordingTile({ participant }: { participant: Participant }) {
  const cameraTrack = participant.getTrackPublication(Track.Source.Camera);
  const isVideoEnabled = cameraTrack && cameraTrack.isSubscribed && !cameraTrack.isMuted;
  
  // Parse your custom metadata exactly like you do in your main UI
  let imageUrl = null;
  try {
    const data = JSON.parse(participant.metadata || '{}');
    imageUrl = data.imageUrl || null;
  } catch {}

  return (
    <div className="relative w-full h-full bg-secondary flex items-center justify-center border border-border">
      {isVideoEnabled ? (
        <video 
           ref={(el) => { if (el) cameraTrack.track?.attach(el) }} 
           className="w-full h-full object-cover" 
           autoPlay playsInline muted 
        />
      ) : imageUrl ? (
        <img src={imageUrl} alt={participant.name} className="w-32 h-32 rounded-full object-cover" />
      ) : (
        <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-yellow-500 to-orange-500 flex items-center justify-center text-white text-4xl font-bold">
          {participant.name?.charAt(0) || "?"}
        </div>
      )}
      <div className="absolute bottom-2 left-2 bg-black/70 text-white px-2 py-1 text-sm rounded">
        {participant.name}
      </div>
    </div>
  );
}

function RecordingLayout() {
  const participants = useParticipants();
  
  return (
    <div className="w-screen h-screen bg-background grid grid-cols-2 lg:grid-cols-3 gap-2 p-2">
      <RoomAudioRenderer />
      {participants.map(p => (
        <RecordingTile key={p.identity} participant={p} />
      ))}
    </div>
  );
}

function RecordingContent() {
  const searchParams = useSearchParams();
  const url = searchParams.get("url");
  const token = searchParams.get("token");

  if (!url || !token) return null;

  return (
    <LiveKitRoom serverUrl={url} token={token} audio={true} video={true}>
      <RecordingTrigger />
      <RecordingLayout />
    </LiveKitRoom>
  );
}

// 3. Export a Suspense-wrapped version as the default page
export default function RecordingPage() {
  return (
    <Suspense fallback={<div className="w-screen h-screen bg-black" />}>
      <RecordingContent />
    </Suspense>
  );
}