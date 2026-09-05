"use client";

import { Mic, VideoOff } from "lucide-react";
import type { Participant } from "livekit-client";
import { cn } from "@/lib/utils";
import { getParticipantImageUrl } from "./classroom-participant";
import { ClassroomParticipantTile } from "./classroom-participant-tile";

interface ClassroomPresenterContentProps {
  participant?: Participant;
  isVideoOn: boolean | undefined;
  isAudioOn: boolean | undefined;
  isLocalLeader?: boolean;
  className?: string;
  roleBadge: string;
  youLabel?: string;
  youAreLiveLabel?: string;
  cameraOffLabel: string;
  localCameraOffLabel?: string;
  audioOnlyLabel: string;
  microphoneOffLabel: string;
  waitingLabel: string;
}

export function ClassroomPresenterContent({
  participant,
  isVideoOn,
  isAudioOn,
  isLocalLeader = false,
  className,
  roleBadge,
  youLabel,
  youAreLiveLabel,
  cameraOffLabel,
  localCameraOffLabel,
  audioOnlyLabel,
  microphoneOffLabel,
  waitingLabel,
}: ClassroomPresenterContentProps) {
  if (!participant) {
    return (
      <div className="z-10 p-8 text-center">
        <div className="mx-auto mb-4 flex size-32 items-center justify-center rounded-full border-2 border-border bg-background/50 shadow-sm backdrop-blur-sm">
          <span className="text-6xl">T</span>
        </div>
        {className && (
          <h2 className="text-2xl font-bold text-foreground">{className}</h2>
        )}
        <p className="mt-2 font-medium text-muted-foreground">{waitingLabel}</p>
      </div>
    );
  }

  if (isVideoOn) {
    return (
      <ClassroomParticipantTile
        participant={participant}
        variant="stage"
        className="h-full w-full bg-transparent object-contain"
        roleBadge={roleBadge}
        youLabel={youLabel}
        audioMuted={!isAudioOn}
      />
    );
  }

  if (isLocalLeader && youAreLiveLabel) {
    return (
      <div className="z-10 flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-300">
        <div className="mb-6 flex size-28 animate-pulse items-center justify-center rounded-full border-4 border-success bg-success/10 shadow-xl">
          <VideoOff className="size-12 text-success" />
        </div>
        <h2 className="text-3xl font-bold text-foreground">
          {youAreLiveLabel}
        </h2>
        <p className="mt-2 text-lg text-muted-foreground">
          {localCameraOffLabel ?? cameraOffLabel}
        </p>
      </div>
    );
  }

  const imageUrl = getParticipantImageUrl(participant);
  return (
    <div className="z-10 flex flex-col items-center justify-center p-8 text-center">
      <div className="mb-5 flex size-32 items-center justify-center overflow-hidden rounded-full border-2 border-border bg-secondary shadow-lg">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={participant.name || ""}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-5xl font-bold text-secondary-foreground">
            {participant.name?.charAt(0) || "T"}
          </span>
        )}
      </div>
      <h2 className="text-2xl font-bold text-foreground">
        {participant.name || roleBadge}
      </h2>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/80 px-3 py-1.5">
          <VideoOff className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium text-secondary-foreground">
            {cameraOffLabel}
          </span>
        </div>
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1.5",
            isAudioOn
              ? "border-border bg-secondary/80"
              : "border-destructive/20 bg-destructive/10",
          )}
        >
          <Mic
            className={cn(
              "size-4",
              isAudioOn ? "animate-pulse text-success" : "text-destructive",
            )}
          />
          <span className="text-sm font-medium text-secondary-foreground">
            {isAudioOn ? audioOnlyLabel : microphoneOffLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
