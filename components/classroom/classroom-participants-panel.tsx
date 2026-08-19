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
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Hand } from "lucide-react";
import type { Participant } from "livekit-client";
import {
  Children,
  cloneElement,
  isValidElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { getParticipantImageUrl } from "./classroom-participant";
import { ClassroomParticipantRosterSheet } from "./classroom-participant-roster-sheet";
import { ClassroomViewSidebar } from "./classroom-view";
import { useClassroomParticipantPagination } from "./use-classroom-participant-pagination";

interface ClassroomParticipantsPanelProps {
  heading: string;
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
  const participantTiles = Children.toArray(children);
  const {
    gridRef,
    startIndex,
    endIndex,
    canShowPrevious,
    canShowNext,
    showPrevious,
    showNext,
    showParticipant,
    rowCount,
  } = useClassroomParticipantPagination(participantTiles.length);
  const [highlightedParticipantId, setHighlightedParticipantId] =
    useState<string>();
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showNavigation = canShowPrevious || canShowNext;
  const hasRaisedHand = (participant: Participant) =>
    raisedParticipantIds.has(participant.identity) ||
    (participant.isLocal && localParticipantRaised);
  const raisedHandsCount = participants.filter(hasRaisedHand).length;
  const rosterLabel = `${heading}: ${participants.length}`;
  const compactPanelLabel =
    raisedHandsCount > 0
      ? `${rosterLabel}. ${raisedHandsCountLabel(raisedHandsCount)}`
      : rosterLabel;
  const visibleEndIndex = Math.min(endIndex, participantTiles.length);

  useEffect(
    () => () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    },
    [],
  );

  const selectParticipant = (index: number) => {
    const participant = participants[index];
    if (!participant) return;

    showParticipant(index);
    setHighlightedParticipantId(participant.identity);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = setTimeout(
      () => setHighlightedParticipantId(undefined),
      1800,
    );
  };

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

  const renderAvatarGroup = (
    limit: number,
    size: "default" | "sm" = "default",
  ) => {
    const visibleParticipants = participants.slice(0, limit);
    const remainingCount = Math.max(participants.length - limit, 0);

    return (
      <AvatarGroup aria-hidden="true">
        {visibleParticipants.map((participant) => {
          const participantName =
            participant.name || participant.identity || "?";
          const fallbackInitial = participantName.charAt(0).toUpperCase();

          return (
            <Avatar
              key={participant.identity}
              size={size}
              title={participantName}
            >
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

  const visibleParticipantTiles = participantTiles
    .slice(startIndex, endIndex)
    .map((tile, index) => {
      const participant = participants[startIndex + index];
      if (
        !participant ||
        participant.identity !== highlightedParticipantId ||
        !isValidElement<{ className?: string }>(tile)
      ) {
        return tile;
      }

      return cloneElement(tile, {
        className: cn(
          tile.props.className,
          "z-30 ring-4 ring-inset ring-primary",
        ),
      });
    });

  return (
    <ClassroomViewSidebar className="bg-card">
      <div className="flex h-full min-w-0 items-center gap-3 border-b border-primary/20 bg-card px-3 text-primary xl:hidden">
        <h3 className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-widest">
          {heading}
        </h3>
        {isEmpty ? (
          <div className="truncate text-xs italic text-muted-foreground">
            {emptyContent}
          </div>
        ) : (
          <ClassroomParticipantRosterSheet
            heading={heading}
            triggerLabel={compactPanelLabel}
            participants={participants}
            youLabel={youLabel}
            raisedHandLabel={raisedHandLabel}
            lowerHandLabel={lowerHandLabel}
            hasRaisedHand={hasRaisedHand}
            onLowerHand={onLowerHand}
            trigger={
              <button
                type="button"
                aria-label={compactPanelLabel}
                className="flex items-center gap-2 rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="sm:hidden">{renderAvatarGroup(4)}</div>
                <div className="hidden sm:block">{renderAvatarGroup(6)}</div>
                {raisedHandsIndicator}
              </button>
            }
          />
        )}
      </div>

      <div className="hidden min-h-10 shrink-0 items-center gap-2 border-b border-primary/20 bg-card px-2.5 py-1.5 text-primary xl:flex">
        <h3 className="min-w-0 truncate text-xs font-bold uppercase tracking-widest">
          {heading}
        </h3>
        {!isEmpty && (
          <ClassroomParticipantRosterSheet
            heading={heading}
            triggerLabel={compactPanelLabel}
            participants={participants}
            youLabel={youLabel}
            raisedHandLabel={raisedHandLabel}
            lowerHandLabel={lowerHandLabel}
            hasRaisedHand={hasRaisedHand}
            onLowerHand={onLowerHand}
            onSelectParticipant={selectParticipant}
            trigger={
              <button
                type="button"
                aria-label={compactPanelLabel}
                title={compactPanelLabel}
                className="shrink-0 rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {renderAvatarGroup(2, "sm")}
              </button>
            }
          />
        )}
        {raisedHandsIndicator && (
          <div className="ml-auto">{raisedHandsIndicator}</div>
        )}
      </div>

      <div
        ref={gridRef}
        className="hidden min-h-0 min-w-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-0 overflow-hidden xl:grid"
        style={
          rowCount > 0
            ? {
                gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))`,
              }
            : undefined
        }
      >
        {isEmpty && (
          <div className="col-span-full row-[1/-1] flex h-full w-full items-center justify-center px-2 text-center text-xs italic text-muted-foreground">
            {emptyContent}
          </div>
        )}
        {visibleParticipantTiles}
      </div>

      {showNavigation && (
        <div className="hidden min-h-8 shrink-0 items-center justify-end gap-0.5 border-t border-primary/20 bg-card px-2.5 py-1 xl:flex">
          <span
            aria-live="polite"
            className="mr-1 text-[10px] font-semibold tabular-nums text-muted-foreground"
          >
            {startIndex + 1}&ndash;{visibleEndIndex} / {participantTiles.length}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={previousLabel}
            onClick={showPrevious}
            disabled={!canShowPrevious}
          >
            <ChevronUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={nextLabel}
            onClick={showNext}
            disabled={!canShowNext}
          >
            <ChevronDown />
          </Button>
        </div>
      )}
    </ClassroomViewSidebar>
  );
}
