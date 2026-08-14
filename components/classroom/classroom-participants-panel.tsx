"use client";

import { Button } from "@/components/ui/button";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ChevronDown, ChevronUp, Hand } from "lucide-react";
import type { Participant } from "livekit-client";
import type { ReactNode, RefObject } from "react";
import { getParticipantImageUrl } from "./classroom-participant";
import { ClassroomViewSidebar } from "./classroom-view";

interface ClassroomParticipantsPanelProps {
  heading: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  canScrollPrevious: boolean;
  canScrollNext: boolean;
  previousLabel: string;
  nextLabel: string;
  isEmpty: boolean;
  emptyContent: ReactNode;
  participants: Participant[];
  raisedParticipantIds: ReadonlySet<string>;
  localParticipantRaised?: boolean;
  youLabel: string;
  raisedHandLabel: string;
  raisedHandsCountLabel: (count: number) => string;
  lowerHandLabel: string;
  onLowerHand?: (identity: string) => void;
  children: ReactNode;
}

export function ClassroomParticipantsPanel({
  heading,
  scrollRef,
  canScrollPrevious,
  canScrollNext,
  previousLabel,
  nextLabel,
  isEmpty,
  emptyContent,
  participants,
  raisedParticipantIds,
  localParticipantRaised = false,
  youLabel,
  raisedHandLabel,
  raisedHandsCountLabel,
  lowerHandLabel,
  onLowerHand,
  children,
}: ClassroomParticipantsPanelProps) {
  const showNavigation = canScrollPrevious || canScrollNext;
  const hasRaisedHand = (participant: Participant) =>
    raisedParticipantIds.has(participant.identity) ||
    (participant.isLocal && localParticipantRaised);
  const raisedHandsCount = participants.filter(hasRaisedHand).length;
  const compactPanelLabel =
    raisedHandsCount > 0
      ? `${heading}. ${raisedHandsCountLabel(raisedHandsCount)}`
      : heading;

  const raisedHandsIndicator = raisedHandsCount > 0 && (
    <Badge
      className="h-7 gap-1.5 rounded-full border border-inverse-foreground/10 bg-inverse px-2 text-inverse-foreground shadow-sm"
      aria-label={raisedHandsCountLabel(raisedHandsCount)}
      title={raisedHandsCountLabel(raisedHandsCount)}
    >
      <Hand className="size-3.5" />
      <span className="tabular-nums">{raisedHandsCount}</span>
    </Badge>
  );

  const renderAvatarGroup = (limit: number) => {
    const visibleParticipants = participants.slice(0, limit);
    const remainingCount = Math.max(participants.length - limit, 0);

    return (
      <AvatarGroup aria-hidden="true">
        {visibleParticipants.map((participant) => {
          const participantName =
            participant.name || participant.identity || "?";
          const fallbackInitial = participantName.charAt(0).toUpperCase();

          return (
            <Avatar key={participant.identity} title={participantName}>
              <AvatarImage
                src={getParticipantImageUrl(participant) ?? undefined}
                alt=""
              />
              <AvatarFallback>{fallbackInitial}</AvatarFallback>
            </Avatar>
          );
        })}
        {remainingCount > 0 && (
          <AvatarGroupCount aria-label={`+${remainingCount}`}>
            +{remainingCount}
          </AvatarGroupCount>
        )}
      </AvatarGroup>
    );
  };

  return (
    <ClassroomViewSidebar>
      <div className="flex h-full min-w-0 items-center gap-3 bg-muted/30 px-3 text-foreground xl:hidden">
        <h3 className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-widest">
          {heading}
        </h3>
        {isEmpty ? (
          <div className="truncate text-xs italic text-muted-foreground">
            {emptyContent}
          </div>
        ) : (
          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label={compactPanelLabel}
                className="flex items-center gap-2 rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="sm:hidden">{renderAvatarGroup(4)}</div>
                <div className="hidden sm:block">{renderAvatarGroup(6)}</div>
                {raisedHandsIndicator}
              </button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[min(88vw,24rem)] gap-0 p-0 sm:max-w-sm xl:hidden"
            >
              <SheetHeader className="border-b border-border bg-muted/30 pr-12">
                <SheetTitle>{heading}</SheetTitle>
                <SheetDescription className="sr-only">
                  {heading}
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-4">
                {participants.map((participant) => {
                  const participantName =
                    participant.name || participant.identity || "?";
                  const fallbackInitial = participantName
                    .charAt(0)
                    .toUpperCase();
                  const raisedHand = hasRaisedHand(participant);

                  return (
                    <div
                      key={participant.identity}
                      className="flex min-w-0 items-center gap-3 border-b border-border py-3 last:border-b-0"
                    >
                      <Avatar size="lg">
                        <AvatarImage
                          src={getParticipantImageUrl(participant) ?? undefined}
                          alt={participantName}
                        />
                        <AvatarFallback>{fallbackInitial}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
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
            </SheetContent>
          </Sheet>
        )}
      </div>

      <div className="hidden min-h-9 shrink-0 items-center gap-1 border-b border-border bg-muted/30 px-2 py-1 text-foreground xl:flex">
        <h3 className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-widest">
          {heading}
        </h3>
        {raisedHandsIndicator}
        {showNavigation && (
          <>
            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={previousLabel}
                onClick={() =>
                  scrollRef.current?.scrollBy({
                    top: -160,
                    behavior: "smooth",
                  })
                }
                disabled={!canScrollPrevious}
              >
                <ChevronUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={nextLabel}
                onClick={() =>
                  scrollRef.current?.scrollBy({
                    top: 160,
                    behavior: "smooth",
                  })
                }
                disabled={!canScrollNext}
              >
                <ChevronDown />
              </Button>
            </div>
          </>
        )}
      </div>

      <div
        ref={scrollRef}
        className="scrollbar-thin hidden min-h-0 min-w-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(96px,1fr))] content-start items-start gap-1.5 overflow-x-hidden overflow-y-auto p-1 xl:grid xl:snap-y"
      >
        {isEmpty && (
          <div className="col-span-full flex h-full w-full items-center justify-center px-2 text-center text-xs italic text-muted-foreground">
            {emptyContent}
          </div>
        )}
        {children}
      </div>
    </ClassroomViewSidebar>
  );
}
