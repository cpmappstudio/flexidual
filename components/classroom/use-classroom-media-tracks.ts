"use client";

import { useTracks } from "@livekit/components-react";
import { Participant, RemoteTrackPublication, Track } from "livekit-client";
import { useEffect, useMemo } from "react";
import { getParticipantRole } from "./classroom-participant";

const SCREEN_SHARE_OPTIONS = { updateOnlyOn: [], onlySubscribed: false };
const SCREEN_SHARE_SOURCE = [Track.Source.ScreenShare];

export function useClassroomMediaTracks(teacher?: Participant) {
  const screenTracks = useTracks(SCREEN_SHARE_SOURCE, SCREEN_SHARE_OPTIONS);
  const activeScreenTrack = useMemo(() => {
    const sortedTracks = [...screenTracks].sort((first, second) => {
      const firstRole = getParticipantRole(first.participant);
      const secondRole = getParticipantRole(second.participant);
      if (firstRole === "teacher") return -1;
      if (secondRole === "teacher") return 1;
      return 0;
    });
    return sortedTracks[0];
  }, [screenTracks]);

  useEffect(() => {
    if (!activeScreenTrack || activeScreenTrack.participant.isLocal) return;

    const publication = activeScreenTrack.publication;
    if (!publication.isSubscribed && publication.track) {
      (publication as RemoteTrackPublication).setSubscribed(true);
    }
  }, [activeScreenTrack]);

  const teacherCameraTrack = teacher?.getTrackPublication(Track.Source.Camera);
  const teacherAudioTrack = teacher?.getTrackPublication(
    Track.Source.Microphone,
  );

  return {
    screenTracks,
    activeScreenTrack,
    isScreenSharingActive: !!activeScreenTrack,
    isTeacherVideoOn:
      teacherCameraTrack &&
      teacherCameraTrack.isSubscribed &&
      !teacherCameraTrack.isMuted,
    isTeacherAudioOn:
      teacherAudioTrack &&
      teacherAudioTrack.isSubscribed &&
      !teacherAudioTrack.isMuted,
  };
}
