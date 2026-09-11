"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Id } from "@/convex/_generated/dataModel";
import { Participant } from "livekit-client";
import { useMemo, useState } from "react";
import { createClassroomPreviewParticipants } from "./classroom-participant";
import { ClassroomParticipantTile } from "./classroom-participant-tile";
import { ClassroomPresenterContent } from "./classroom-presenter-content";
import { ClassroomRecordingView } from "./classroom-recording-view";
import {
  ClassroomScreenShareContent,
  ClassroomWhiteboardContent,
} from "./classroom-stage";
import { ClassroomPipSurface } from "./draggable-classroom-pip";
import { ClassroomWhiteboardPreview } from "./shared-whiteboard";

type PreviewScene = "presenter" | "screen-share" | "whiteboard";

const PREVIEW_COURSE_ID = "preview-course" as Id<"classes">;

function PreviewVideo({ name }: { name: string }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-primary/90 via-primary to-info text-primary-foreground">
      <div className="absolute inset-6 rounded-[40%] border border-primary-foreground/20" />
      <span className="px-3 text-center text-sm font-bold">{name}</span>
    </div>
  );
}

function PreviewScreenShare() {
  return (
    <div className="grid h-full w-full grid-cols-[12rem_1fr] bg-background text-foreground">
      <div className="space-y-3 border-r border-border bg-card p-5">
        <div className="h-8 rounded bg-primary" />
        <div className="h-4 rounded bg-muted" />
        <div className="h-4 rounded bg-muted" />
        <div className="h-4 rounded bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-5 p-8">
        <div className="col-span-2 h-16 rounded-xl bg-primary/10" />
        <div className="rounded-xl border border-border bg-card shadow-sm" />
        <div className="rounded-xl border border-border bg-card shadow-sm" />
      </div>
    </div>
  );
}

interface ClassroomRecordingPreviewProps {
  initialScene?: PreviewScene;
  initialStudentCount?: number;
  initialTeacherVideoOn?: boolean;
}

export function ClassroomRecordingPreview({
  initialScene = "presenter",
  initialStudentCount = 4,
  initialTeacherVideoOn = true,
}: ClassroomRecordingPreviewProps) {
  const [scene, setScene] = useState<PreviewScene>(initialScene);
  const [studentCount, setStudentCount] = useState(initialStudentCount);
  const [isTeacherVideoOn, setIsTeacherVideoOn] = useState(
    initialTeacherVideoOn,
  );
  const teacher = useMemo(
    () =>
      new Participant(
        "preview-teacher-sid",
        "preview-teacher",
        "Mariela Betancourt",
        JSON.stringify({ role: "teacher" }),
      ),
    [],
  );
  const students = useMemo(
    () => createClassroomPreviewParticipants().slice(0, studentCount),
    [studentCount],
  );
  const raisedHands = useMemo(
    () => new Set(students[0] ? [students[0].identity] : []),
    [students],
  );
  const teacherVideo = isTeacherVideoOn ? (
    <PreviewVideo name="Mariela Betancourt" />
  ) : undefined;
  const hasPresentedContent = scene !== "presenter";

  return (
    <main className="min-h-screen bg-muted p-6 text-foreground">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="min-w-44 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Scene
            </label>
            <Select
              value={scene}
              onValueChange={(value) => setScene(value as PreviewScene)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="presenter">Teacher</SelectItem>
                <SelectItem value="screen-share">Screen share</SelectItem>
                <SelectItem value="whiteboard">Whiteboard</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-44 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Students
            </label>
            <Select
              value={String(studentCount)}
              onValueChange={(value) => setStudentCount(Number(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0, 1, 4, 8, 10].map((count) => (
                  <SelectItem key={count} value={String(count)}>
                    {count}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => setIsTeacherVideoOn((current) => !current)}
          >
            Camera {isTeacherVideoOn ? "on" : "off"}
          </Button>

          <p className="ml-auto text-xs text-muted-foreground">
            Same 1280 × 720 composition used by LiveKit Egress
          </p>
        </div>

        <div className="aspect-video w-full overflow-hidden border border-border bg-background shadow-2xl">
          <ClassroomRecordingView
            courseId={PREVIEW_COURSE_ID}
            title="Algebra I"
            curriculumIconKey="math"
            isActive
            includeRoomAudio={false}
            presenter={
              <ClassroomPresenterContent
                participant={teacher}
                isVideoOn={isTeacherVideoOn}
                isAudioOn
                roleBadge="Teacher"
                cameraOffLabel="Camera off"
                audioOnlyLabel="Audio only"
                microphoneOffLabel="Microphone off"
                waitingLabel="Waiting for teacher"
                videoContent={teacherVideo}
              />
            }
            screenShare={
              scene === "screen-share" ? (
                <ClassroomScreenShareContent
                  previewContent={<PreviewScreenShare />}
                  zoom={1}
                  pan={{ x: 0, y: 0 }}
                  isPhoneLandscape={false}
                  stageControlsVisible
                  onRevealControls={() => undefined}
                  onStartPan={() => undefined}
                  onZoom={() => undefined}
                  loadingLabel="Loading screen share"
                  showControls={false}
                />
              ) : undefined
            }
            whiteboard={
              scene === "whiteboard" ? (
                <ClassroomWhiteboardContent
                  roomName="preview-room"
                  followViewport
                  presentationMode
                  previewContent={<ClassroomWhiteboardPreview />}
                />
              ) : undefined
            }
            presenterPip={
              hasPresentedContent && isTeacherVideoOn ? (
                <ClassroomPipSurface className="absolute bottom-3 left-3 z-50 h-36 w-48">
                  <ClassroomParticipantTile
                    participant={teacher}
                    className="h-full w-full"
                    videoContent={teacherVideo}
                  />
                </ClassroomPipSurface>
              ) : undefined
            }
            students={students}
            raisedHands={raisedHands}
            studentTiles={students.map((student, index) => (
              <ClassroomParticipantTile
                key={student.identity}
                participant={student}
                className="h-full w-full"
                raisedHand={raisedHands.has(student.identity)}
                audioMuted={index % 3 === 0}
                videoContent={
                  index % 2 === 0 ? (
                    <PreviewVideo name={student.name ?? student.identity} />
                  ) : undefined
                }
              />
            ))}
          />
        </div>
      </div>
    </main>
  );
}
