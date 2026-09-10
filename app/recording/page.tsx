"use client";

import {
  LiveKitRoom,
  useRemoteParticipants,
  useRoomContext,
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
import { isClassroomSessionAuthority } from "@/components/classroom/classroom-capabilities";
import {
  getIsCompanionParticipant,
  getParticipantRole,
} from "@/components/classroom/classroom-participant";
import { ClassroomParticipantTile } from "@/components/classroom/classroom-participant-tile";
import { ClassroomRecordingTrigger } from "@/components/classroom/classroom-recording-trigger";
import {
  ClassroomScreenShareContent,
  ClassroomWhiteboardContent,
} from "@/components/classroom/classroom-stage";
import { ClassroomPresenterContent } from "@/components/classroom/classroom-presenter-content";
import { ClassroomRecordingView } from "@/components/classroom/classroom-recording-view";
import { useClassroomMediaTracks } from "@/components/classroom/use-classroom-media-tracks";
import { ClassroomPipSurface } from "@/components/classroom/draggable-classroom-pip";

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
  const recordingContext = useQuery(
    api.whiteboardSessions.getRecordingContext,
    { roomName: room.name, recordingToken },
  );
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [isWhiteboardActive, setIsWhiteboardActive] = useState(false);
  const [isPresenterVideoReady, setIsPresenterVideoReady] = useState(false);
  const [isScreenShareVideoReady, setIsScreenShareVideoReady] = useState(false);
  const [isWhiteboardReady, setIsWhiteboardReady] = useState(false);

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

  const presenter = recordingContext?.leaderParticipantIdentity
    ? participants.find(
        ({ identity }) =>
          identity === recordingContext.leaderParticipantIdentity,
      )
    : participants.find(
        (participant) => getParticipantRole(participant) === "teacher",
      );
  const students = participants.filter(
    (participant) =>
      getParticipantRole(participant) === "student" &&
      !getIsCompanionParticipant(participant),
  );
  const {
    activeScreenTrack,
    isTeacherVideoOn: presenterVideoOn,
    isTeacherAudioOn: presenterAudioOn,
  } = useClassroomMediaTracks(presenter);
  const presenterPublicationReady = presenter
    ? isTrackReady(presenter, Track.Source.Camera)
    : false;
  const presenterReady =
    presenterPublicationReady && (!presenterVideoOn || isPresenterVideoReady);
  const screenShareReady = activeScreenTrack
    ? activeScreenTrack.publication.isSubscribed &&
      Boolean(activeScreenTrack.publication.track) &&
      isScreenShareVideoReady
    : true;
  const selectedSceneReady = isWhiteboardActive
    ? isWhiteboardReady
    : screenShareReady;
  const isSceneReady = Boolean(
    recordingContext && presenter && presenterReady && selectedSceneReady,
  );
  const presenterCameraTrackSid = presenter?.getTrackPublication(
    Track.Source.Camera,
  )?.trackSid;

  useEffect(() => {
    setIsPresenterVideoReady(false);
  }, [presenter?.identity, presenterCameraTrackSid, presenterVideoOn]);

  useEffect(() => {
    setIsScreenShareVideoReady(false);
  }, [activeScreenTrack?.publication.trackSid]);

  useEffect(() => {
    if (!isWhiteboardActive) setIsWhiteboardReady(false);
  }, [isWhiteboardActive]);

  if (!recordingContext) {
    return <div className="h-screen w-screen bg-inverse" />;
  }

  return (
    <div className="h-screen w-screen">
      <ClassroomRecordingView
        courseId={recordingContext.courseId}
        title={recordingContext.className}
        curriculumIconKey={recordingContext.curriculumIconKey}
        isActive={Boolean(presenter)}
        presenter={
          <ClassroomPresenterContent
            participant={presenter}
            isVideoOn={presenterVideoOn}
            isAudioOn={presenterAudioOn}
            roleBadge="Teacher"
            cameraOffLabel="Camera off"
            audioOnlyLabel="Audio only"
            microphoneOffLabel="Microphone off"
            waitingLabel="Waiting for teacher"
            onVideoReady={() => setIsPresenterVideoReady(true)}
          />
        }
        screenShare={
          activeScreenTrack ? (
            <ClassroomScreenShareContent
              trackRef={activeScreenTrack}
              zoom={1}
              pan={{ x: 0, y: 0 }}
              isPhoneLandscape={false}
              stageControlsVisible
              onRevealControls={() => undefined}
              onStartPan={() => undefined}
              onZoom={() => undefined}
              loadingLabel="Loading screen share"
              showControls={false}
              onVideoReady={() => setIsScreenShareVideoReady(true)}
            />
          ) : undefined
        }
        whiteboard={
          isWhiteboardActive ? (
            <ClassroomWhiteboardContent
              roomName={room.name}
              followViewport
              recordingToken={recordingToken}
              presentationMode
              onReady={() => setIsWhiteboardReady(true)}
            />
          ) : undefined
        }
        presenterPip={
          (isWhiteboardActive || activeScreenTrack) &&
          presenter &&
          presenterVideoOn ? (
            <ClassroomPipSurface className="absolute bottom-3 left-3 z-50 h-36 w-48">
              <ClassroomParticipantTile
                participant={presenter}
                className="h-full w-full"
                raisedHand={false}
                audioMuted={!presenterAudioOn}
                onVideoReady={() => setIsPresenterVideoReady(true)}
              />
            </ClassroomPipSurface>
          ) : undefined
        }
        students={students}
        raisedHands={raisedHands}
        studentTiles={students.map((participant) => (
          <ClassroomParticipantTile
            key={participant.identity}
            participant={participant}
            className="h-full w-full"
            raisedHand={raisedHands.has(participant.identity)}
            audioMuted={!isTrackEnabled(participant, Track.Source.Microphone)}
          />
        ))}
        recordingTrigger={
          <ClassroomRecordingTrigger isSceneReady={isSceneReady} />
        }
      />
    </div>
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
