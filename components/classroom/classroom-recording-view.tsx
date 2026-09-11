"use client";

import type { Id } from "@/convex/_generated/dataModel";
import type { Participant } from "livekit-client";
import type { ReactNode } from "react";
import { ClassroomHeader } from "./classroom-header";
import { ClassroomParticipantsPanel } from "./classroom-participants-panel";
import { ClassroomScene } from "./classroom-scene";
import { ClassroomStageSurface } from "./classroom-stage";
import { ClassroomView } from "./classroom-view";

interface ClassroomRecordingViewProps {
  courseId: Id<"classes">;
  title: string;
  curriculumIconKey?: string;
  isActive: boolean;
  presenter: ReactNode;
  screenShare?: ReactNode;
  whiteboard?: ReactNode;
  presenterPip?: ReactNode;
  students: Participant[];
  raisedHands: ReadonlySet<string>;
  studentTiles: ReactNode;
  recordingTrigger?: ReactNode;
  includeRoomAudio?: boolean;
}

const keepParticipantsTabOpen = () => undefined;

export function ClassroomRecordingView({
  courseId,
  title,
  curriculumIconKey,
  isActive,
  presenter,
  screenShare,
  whiteboard,
  presenterPip,
  students,
  raisedHands,
  studentTiles,
  recordingTrigger,
  includeRoomAudio = true,
}: ClassroomRecordingViewProps) {
  return (
    <ClassroomView
      className="h-full w-full"
      isSidebarOpen
      layoutMode="recording"
      includeRoomAudio={includeRoomAudio}
    >
      {recordingTrigger}
      <ClassroomHeader
        title={title}
        curriculumIconKey={curriculumIconKey}
        isActive={isActive}
        activeLabel="Live"
        waitingLabel="Waiting"
        isRecording
        isPhoneLandscape={false}
        isPanelOpen
        openPanelLabel="Open interaction panel"
        closePanelLabel="Close interaction panel"
        onPanelOpenChange={keepParticipantsTabOpen}
        layoutMode="recording"
      />

      <ClassroomStageSurface className="bg-muted">
        <ClassroomScene
          presenter={presenter}
          screenShare={screenShare}
          whiteboard={whiteboard}
        />
      </ClassroomStageSurface>

      <ClassroomParticipantsPanel
        courseId={courseId}
        heading="Classmates"
        compactHeading="Classmates and chat"
        compactOpenLabel="Open"
        chatLabel="Chat"
        isOpen
        activeTab="participants"
        onTabChange={keepParticipantsTabOpen}
        previousLabel="Previous"
        nextLabel="Next"
        isEmpty={students.length === 0}
        emptyContent="Waiting for students to join."
        participants={students}
        raisedParticipantIds={raisedHands}
        youLabel="You"
        raisedHandLabel="Raised hand"
        raisedHandsCountLabel={(count) => `${count} raised hands`}
        lowerHandLabel="Lower hand"
        layoutMode="recording"
      >
        {studentTiles}
      </ClassroomParticipantsPanel>

      {presenterPip}
    </ClassroomView>
  );
}
