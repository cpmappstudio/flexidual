"use client";

import { VideoTrack, useIsSpeaking } from "@livekit/components-react";
import { Hand, MicOff } from "lucide-react";
import { Participant, Track, TrackPublication } from "livekit-client";
import { cn } from "@/lib/utils";
import { getParticipantImageUrl } from "./classroom-participant";

type ParticipantTileVariant = "grid" | "stage" | "mini";

interface ClassroomParticipantTileProps {
  participant: Participant;
  className?: string;
  showLabel?: boolean;
  variant?: ParticipantTileVariant;
  raisedHand?: boolean;
  onLowerHand?: () => void;
  lowerHandLabel?: string;
  roleBadge?: string;
  youLabel?: string;
  audioMuted?: boolean;
}

export function ClassroomParticipantTile({
  participant,
  className,
  showLabel = true,
  variant = "grid",
  raisedHand = false,
  onLowerHand,
  lowerHandLabel = "Lower hand",
  roleBadge,
  youLabel,
  audioMuted = false,
}: ClassroomParticipantTileProps) {
  const cameraTrack = participant.getTrackPublication(Track.Source.Camera);
  const isSpeaking = useIsSpeaking(participant);
  const isVideoEnabled =
    cameraTrack && cameraTrack.isSubscribed && !cameraTrack.isMuted;
  const imageUrl = getParticipantImageUrl(participant);

  const avatarSize =
    variant === "stage"
      ? "w-32 h-32 text-6xl"
      : variant === "mini"
        ? "w-8 h-8 text-xs"
        : "w-16 h-16 text-2xl";
  const avatarBorder = variant === "mini" ? "border" : "border-2";
  const fallbackInitial =
    participant.name?.charAt(0).toUpperCase() ||
    participant.identity?.charAt(0).toUpperCase() ||
    "?";

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-muted transition-all duration-300",
        variant === "grid" && "rounded-md border border-border",
        raisedHand && variant === "grid" && "border-warning",
        isSpeaking &&
          "z-20 ring-2 ring-success shadow-[0_0_12px] shadow-success/30",
        className,
      )}
    >
      {isVideoEnabled ? (
        <VideoTrack
          trackRef={{
            participant,
            source: Track.Source.Camera,
            publication: cameraTrack as TrackPublication,
          }}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-secondary">
          <div
            className={`${avatarSize} ${avatarBorder} flex items-center justify-center overflow-hidden rounded-full border-secondary-foreground/10 bg-secondary font-bold text-secondary-foreground shadow-lg`}
          >
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt={participant.name || participant.identity}
                className="w-full h-full object-cover"
              />
            ) : (
              fallbackInitial
            )}
          </div>
        </div>
      )}

      {showLabel && variant === "stage" ? (
        <div className="absolute bottom-3 left-3 flex items-center gap-2 z-10">
          <div className="bg-inverse/70 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center gap-2 border border-inverse-foreground/10 shadow-md">
            {roleBadge && (
              <span className="text-[10px] font-bold text-primary-foreground bg-primary px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0">
                {roleBadge}
              </span>
            )}
            <span className="text-sm font-bold text-inverse-foreground truncate max-w-[200px]">
              {participant.name || participant.identity}
              {participant.isLocal && youLabel && ` (${youLabel})`}
            </span>
          </div>
        </div>
      ) : showLabel ? (
        <div className="absolute bottom-1 left-1 bg-inverse/60 px-2 py-1 rounded text-[10px] text-inverse-foreground font-medium truncate max-w-[90%] backdrop-blur-sm">
          {participant.name || participant.identity}
          {participant.isLocal && youLabel && ` (${youLabel})`}
        </div>
      ) : null}

      {raisedHand &&
        (onLowerHand ? (
          <button
            type="button"
            onClick={onLowerHand}
            aria-label={lowerHandLabel}
            title={lowerHandLabel}
            className="absolute right-1.5 top-1.5 rounded-full border border-inverse-foreground/10 bg-inverse/85 p-1 text-inverse-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-inverse"
          >
            <Hand className="size-3.5" />
          </button>
        ) : (
          <div className="pointer-events-none absolute right-1.5 top-1.5 rounded-full border border-inverse-foreground/10 bg-inverse/85 p-1 text-inverse-foreground shadow-sm backdrop-blur-sm">
            <Hand className="size-3.5" />
          </div>
        ))}

      {audioMuted && (
        <div
          className={`absolute pointer-events-none bg-destructive/80 rounded-full shadow-sm ${
            variant === "stage"
              ? "bottom-3 right-3 p-1.5"
              : "bottom-1 right-1 p-1"
          }`}
        >
          <MicOff
            className={`text-destructive-foreground ${variant === "stage" ? "w-4 h-4" : "w-3 h-3"}`}
          />
        </div>
      )}
    </div>
  );
}
