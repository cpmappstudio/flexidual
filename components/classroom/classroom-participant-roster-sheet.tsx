"use client";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Hand } from "lucide-react";
import type { Participant } from "livekit-client";
import type { ReactNode } from "react";
import { getParticipantImageUrl } from "./classroom-participant";

interface ClassroomParticipantRosterProps {
  participants: Participant[];
  youLabel: string;
  raisedHandLabel: string;
  lowerHandLabel: string;
  hasRaisedHand: (participant: Participant) => boolean;
  onLowerHand?: (identity: string) => void;
  onSelectParticipant?: (index: number) => void;
}

interface ClassroomParticipantRosterSheetProps
  extends ClassroomParticipantRosterProps {
  heading: string;
  triggerLabel: string;
  trigger: ReactNode;
}

export function ClassroomParticipantRoster({
  participants,
  youLabel,
  raisedHandLabel,
  lowerHandLabel,
  hasRaisedHand,
  onLowerHand,
  onSelectParticipant,
}: ClassroomParticipantRosterProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4">
      {participants.map((participant, index) => {
        const participantName = participant.name || participant.identity || "?";
        const fallbackInitial = participantName.charAt(0).toUpperCase();
        const raisedHand = hasRaisedHand(participant);
        const participantSummary = (
          <>
            <Avatar size="lg">
              <AvatarImage
                src={getParticipantImageUrl(participant) ?? undefined}
                alt={participantName}
              />
              <AvatarFallback>{fallbackInitial}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold leading-snug whitespace-normal text-foreground">
                {participantName}
                {participant.isLocal && (
                  <span className="font-normal text-muted-foreground">
                    {` (${youLabel})`}
                  </span>
                )}
              </p>
              {raisedHand && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {raisedHandLabel}
                </p>
              )}
            </div>
          </>
        );

        return (
          <div
            key={participant.identity}
            className="flex min-w-0 items-start gap-3 border-b border-border py-3 last:border-b-0"
          >
            {onSelectParticipant ? (
              <SheetClose asChild>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onSelectParticipant(index)}
                >
                  {participantSummary}
                </button>
              </SheetClose>
            ) : (
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {participantSummary}
              </div>
            )}
            {raisedHand && onLowerHand && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`${lowerHandLabel}: ${participantName}`}
                title={lowerHandLabel}
                onClick={() => onLowerHand(participant.identity)}
              >
                <Hand />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ClassroomParticipantRosterSheet({
  heading,
  triggerLabel,
  trigger,
  participants,
  youLabel,
  raisedHandLabel,
  lowerHandLabel,
  hasRaisedHand,
  onLowerHand,
  onSelectParticipant,
}: ClassroomParticipantRosterSheetProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="right"
        className="w-[min(88vw,24rem)] gap-0 p-0 sm:max-w-sm"
      >
        <SheetHeader className="border-b border-border bg-muted/30 pr-12">
          <SheetTitle>{heading}</SheetTitle>
          <SheetDescription className="sr-only">
            {triggerLabel}
          </SheetDescription>
        </SheetHeader>
        <ClassroomParticipantRoster
          participants={participants}
          youLabel={youLabel}
          raisedHandLabel={raisedHandLabel}
          lowerHandLabel={lowerHandLabel}
          hasRaisedHand={hasRaisedHand}
          onLowerHand={onLowerHand}
          onSelectParticipant={onSelectParticipant}
        />
      </SheetContent>
    </Sheet>
  );
}
