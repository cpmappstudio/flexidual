"use client";

import {
  LiveKitRoom,
  useRemoteParticipants,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { api } from "@/convex/_generated/api";
import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import {
  Participant,
  RemoteParticipant,
  RoomEvent,
  Track,
} from "livekit-client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { isClassroomSessionAuthority } from "@/components/classroom/classroom-capabilities";
import {
  getIsCompanionParticipant,
  getParticipantRole,
} from "@/components/classroom/classroom-participant";
import { ClassroomParticipantTile } from "@/components/classroom/classroom-participant-tile";
import { ClassroomRecordingTrigger } from "@/components/classroom/classroom-recording-trigger";
import {
  ClassroomLayoutSidebar,
  ClassroomLayoutStage,
} from "@/components/classroom/classroom-layout";
import {
  ClassroomScreenShareCanvas,
  ClassroomWhiteboardContent,
} from "@/components/classroom/classroom-stage";
import { ClassroomPresenterContent } from "@/components/classroom/classroom-presenter-content";
import { ClassroomView } from "@/components/classroom/classroom-view";

const convexClient = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function isTrackReady(participant: Participant, source: Track.Source) {
  const publication = participant.getTrackPublication(source);
  return (
    !publication ||
    publication.isMuted ||
    (publication.isSubscribed && Boolean(publication.track))
  );
}

function isTrackEnabled(participant: Participant, source: Track.Source) {
  const publication = participant.getTrackPublication(source);
  return Boolean(publication && !publication.isMuted);
}

function RecordingLayout({ recordingToken }: { recordingToken: string }) {
  const room = useRoomContext();
  const participants = useRemoteParticipants();
  const screenTracks = useTracks([Track.Source.ScreenShare], {
    onlySubscribed: false,
  });
  const recordingContext = useQuery(
    api.whiteboardSessions.getRecordingContext,
    { roomName: room.name, recordingToken },
  );
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);

  useEffect(() => {
    const decoder = new TextDecoder();
    const handleData = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
    ) => {
      try {
        const message = JSON.parse(decoder.decode(payload));
        const role = getParticipantRole(participant);
        const isAuthority = isClassroomSessionAuthority(role);

        if (
          role === "student" &&
          message.type === "RAISE_HAND" &&
          participant
        ) {
          setRaisedHands((current) =>
            new Set(current).add(participant.identity),
          );
        }
        if (
          role === "student" &&
          message.type === "LOWER_HAND" &&
          participant
        ) {
          setRaisedHands((current) => {
            const next = new Set(current);
            next.delete(participant.identity);
            return next;
          });
        }
        if (
          isAuthority &&
          message.type === "FORCE_LOWER_HAND" &&
          typeof message.participantId === "string"
        ) {
          setRaisedHands((current) => {
            const next = new Set(current);
            next.delete(message.participantId);
            return next;
          });
        }
        if (isAuthority && message.type === "WHITEBOARD_STATE") {
          setIsWhiteboardActive(Boolean(message.active));
        }
      } catch {
        return;
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room]);

  const presenter = recordingContext
    ? recordingContext.leaderParticipantIdentity
      ? participants.find(
          ({ identity }) =>
            identity === recordingContext.leaderParticipantIdentity,
        )
      : participants.find(
          (participant) => getParticipantRole(participant) === "teacher",
        )
    : undefined;
  const students = participants.filter(
    (participant) =>
      getParticipantRole(participant) === "student" &&
      !getIsCompanionParticipant(participant),
  );
  const activeScreenTrack = screenTracks.find(
    ({ publication }) => !publication.isMuted,
  );
  const screenShareReady = activeScreenTrack
    ? activeScreenTrack.publication.isSubscribed &&
      Boolean(activeScreenTrack.publication.track)
    : true;
  const presenterReady = presenter
    ? isTrackReady(presenter, Track.Source.Camera)
    : false;
  const isSceneReady = Boolean(
    recordingContext && presenter && presenterReady && screenShareReady,
  );
  const presenterVideoOn = presenter
    ? isTrackEnabled(presenter, Track.Source.Camera)
    : false;
  const presenterAudioOn = presenter
    ? isTrackEnabled(presenter, Track.Source.Microphone)
    : false;

  return (
    <ClassroomView className="h-screen w-screen" isSidebarOpen>
      <ClassroomRecordingTrigger isSceneReady={isSceneReady} />
      <ClassroomLayoutStage className="p-2">
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-border bg-muted shadow-xl">
          <div className="pointer-events-none absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/chalkboard.png')] opacity-10" />
          {activeScreenTrack ? (
            <div className="relative h-full w-full bg-inverse">
              <ClassroomScreenShareCanvas trackRef={activeScreenTrack} />
              {presenter && (
                <div className="absolute bottom-4 left-4 z-50 h-36 w-48 overflow-hidden rounded-xl border-2 border-border shadow-2xl">
                  <ClassroomParticipantTile
                    participant={presenter}
                    roleBadge="Teacher"
                    audioMuted={!presenterAudioOn}
                  />
                </div>
              )}
            </div>
          ) : (
            <ClassroomPresenterContent
              participant={presenter}
              isVideoOn={presenterVideoOn}
              isAudioOn={presenterAudioOn}
              roleBadge="Teacher"
              cameraOffLabel="Camera off"
              audioOnlyLabel="Audio only"
              microphoneOffLabel="Microphone off"
              waitingLabel="Waiting for teacher"
            />
          )}

          <div
            className={cn(
              "absolute inset-0 overflow-hidden bg-whiteboard",
              !isWhiteboardActive && "invisible",
            )}
          >
            <ClassroomWhiteboardContent
              roomName={room.name}
              followViewport
              recordingToken={recordingToken}
            />
            {presenter && (
              <div className="absolute bottom-4 left-4 z-50 h-36 w-48 overflow-hidden rounded-xl border-2 border-border shadow-2xl">
                <ClassroomParticipantTile
                  participant={presenter}
                  roleBadge="Teacher"
                  audioMuted={!presenterAudioOn}
                />
              </div>
            )}
          </div>
        </div>
      </ClassroomLayoutStage>

      <ClassroomLayoutSidebar>
        <div className="border-b border-border bg-primary px-4 py-3 text-primary-foreground shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-widest">
            Classmates ({students.length})
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto bg-muted/30 p-4">
          <div className="grid grid-cols-2 gap-3">
            {students.map((participant) => (
              <ClassroomParticipantTile
                key={participant.identity}
                participant={participant}
                className="aspect-square"
                raisedHand={raisedHands.has(participant.identity)}
                audioMuted={
                  !isTrackEnabled(participant, Track.Source.Microphone)
                }
              />
            ))}
          </div>
          {students.length === 0 && (
            <p className="mt-10 text-center text-sm italic text-muted-foreground">
              No students have joined yet.
            </p>
          )}
        </div>
      </ClassroomLayoutSidebar>
    </ClassroomView>
  );
}

function RecordingContent() {
  const searchParams = useSearchParams();
  const serverUrl = searchParams.get("url");
  const livekitToken = searchParams.get("token");
  const recordingToken = searchParams.get("whiteboardToken");

  if (!serverUrl || !livekitToken || !recordingToken) return null;

  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={livekitToken}
      audio={false}
      video={false}
    >
      <RecordingLayout recordingToken={recordingToken} />
    </LiveKitRoom>
  );
}

export default function RecordingPage() {
  return (
    <ConvexProvider client={convexClient}>
      <Suspense fallback={<div className="h-screen w-screen bg-inverse" />}>
        <RecordingContent />
      </Suspense>
    </ConvexProvider>
  );
}
