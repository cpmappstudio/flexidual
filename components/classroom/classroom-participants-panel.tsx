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
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Hand,
  MessageCircle,
  Users,
} from "lucide-react";
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
import {
  ClassroomParticipantRoster,
  ClassroomParticipantRosterSheet,
} from "./classroom-participant-roster-sheet";
import {
  ClassroomChatMock,
  type ClassroomChatMockCopy,
} from "./classroom-chat-mock";
import { ClassroomViewSidebar } from "./classroom-view";
import { useClassroomParticipantPagination } from "./use-classroom-participant-pagination";

export type ClassroomPanelTab = "participants" | "chat";

const classroomPanelTabTriggerClassName =
  "relative h-full min-w-0 rounded-none text-xs font-medium text-muted-foreground shadow-none hover:bg-muted/60 hover:text-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-transparent data-[state=active]:after:bg-primary";

interface ClassroomParticipantsPanelProps {
  heading: string;
  compactHeading: string;
  compactOpenLabel: string;
  chatLabel: string;
  chatCopy: ClassroomChatMockCopy;
  isOpen: boolean;
  activeTab: ClassroomPanelTab;
  onTabChange: (tab: ClassroomPanelTab) => void;
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
  compactHeading,
  compactOpenLabel,
  chatLabel,
  chatCopy,
  isOpen,
  activeTab,
  onTabChange,
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
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<ClassroomPanelTab>("participants");
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

  const roster = (
    <ClassroomParticipantRoster
      participants={participants}
      youLabel={youLabel}
      raisedHandLabel={raisedHandLabel}
      lowerHandLabel={lowerHandLabel}
      hasRaisedHand={hasRaisedHand}
      onLowerHand={onLowerHand}
      onSelectParticipant={selectParticipant}
    />
  );

  return (
    <>
      <ClassroomViewSidebar
        id="classroom-interaction-panel"
        className={cn("bg-card", !isOpen && "xl:hidden")}
      >
        <button
          type="button"
          className="flex h-full min-w-0 items-center gap-2 border-b border-primary/20 bg-card px-3 text-left text-primary outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring xl:hidden"
          aria-label={`${compactHeading}. ${compactPanelLabel}`}
          onClick={() => setIsMobileSheetOpen(true)}
        >
          <h3 className="min-w-0 truncate text-xs font-bold uppercase tracking-widest">
            {compactHeading}
          </h3>
          {isEmpty ? (
            <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-semibold">
              {compactOpenLabel}
              <ChevronRight className="size-4" />
            </span>
          ) : (
            <>
              <span className="sm:hidden">{renderAvatarGroup(4)}</span>
              <span className="hidden sm:block">{renderAvatarGroup(6)}</span>
            </>
          )}
          {raisedHandsIndicator && (
            <span className="ml-auto">{raisedHandsIndicator}</span>
          )}
        </button>

        <Tabs
          value={activeTab}
          onValueChange={(value) => onTabChange(value as ClassroomPanelTab)}
          className="hidden h-full min-h-0 gap-0 xl:flex"
        >
          <TabsList className="h-12 w-full shrink-0 rounded-none border-b border-border/70 bg-transparent p-0 text-foreground xl:h-[var(--classroom-header-height)]">
            <TabsTrigger
              value="participants"
              className={classroomPanelTabTriggerClassName}
            >
              <Users className="size-4" />
              <span className="truncate">{heading}</span>
            </TabsTrigger>
            <TabsTrigger
              value="chat"
              className={classroomPanelTabTriggerClassName}
            >
              <MessageCircle className="size-4" />
              <span className="truncate">{chatLabel}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="participants"
            forceMount
            className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
          >
            <div
              ref={gridRef}
              className="grid min-h-0 min-w-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-0 overflow-hidden"
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

            {!isEmpty && (
              <div className="flex min-h-9 shrink-0 items-center gap-1 border-t border-primary/20 bg-card px-2 py-1">
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
                      className="shrink-0 rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {renderAvatarGroup(2, "sm")}
                    </button>
                  }
                />
                {raisedHandsIndicator}
                {showNavigation && (
                  <div className="ml-auto flex items-center gap-0.5">
                    <span
                      aria-live="polite"
                      className="mr-1 text-[10px] font-semibold tabular-nums text-muted-foreground"
                    >
                      {startIndex + 1}&ndash;{visibleEndIndex} /{" "}
                      {participantTiles.length}
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
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="chat"
            forceMount
            className="m-0 min-h-0 flex-1 data-[state=inactive]:hidden"
          >
            <ClassroomChatMock copy={chatCopy} />
          </TabsContent>
        </Tabs>
      </ClassroomViewSidebar>

      <Sheet open={isMobileSheetOpen} onOpenChange={setIsMobileSheetOpen}>
        <SheetContent
          side="right"
          className="w-[min(92vw,24rem)] gap-0 p-0 sm:max-w-sm xl:hidden [&>button]:right-0 [&>button]:top-0 [&>button]:z-10 [&>button]:flex [&>button]:size-12 [&>button]:items-center [&>button]:justify-center"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>
              {mobileTab === "chat" ? chatLabel : heading}
            </SheetTitle>
            <SheetDescription>{compactPanelLabel}</SheetDescription>
          </SheetHeader>
          <Tabs
            value={mobileTab}
            onValueChange={(value) => setMobileTab(value as ClassroomPanelTab)}
            className="h-full min-h-0 gap-0"
          >
            <TabsList className="h-12 w-full shrink-0 rounded-none border-b border-border/70 bg-transparent p-0 pr-12 text-foreground">
              <TabsTrigger
                value="participants"
                className={classroomPanelTabTriggerClassName}
              >
                <Users />
                {heading}
              </TabsTrigger>
              <TabsTrigger
                value="chat"
                className={classroomPanelTabTriggerClassName}
              >
                <MessageCircle />
                {chatLabel}
              </TabsTrigger>
            </TabsList>
            <TabsContent
              value="participants"
              className="m-0 min-h-0 flex-1 overflow-hidden"
            >
              {isEmpty ? (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm italic text-muted-foreground">
                  {emptyContent}
                </div>
              ) : (
                roster
              )}
            </TabsContent>
            <TabsContent
              value="chat"
              className="m-0 min-h-0 flex-1 overflow-hidden"
            >
              <ClassroomChatMock copy={chatCopy} />
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </>
  );
}
