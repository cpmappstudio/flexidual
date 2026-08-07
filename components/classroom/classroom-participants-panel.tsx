"use client";

import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from "lucide-react";
import type { ReactNode, RefObject } from "react";
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
  children,
}: ClassroomParticipantsPanelProps) {
  const showNavigation = canScrollPrevious || canScrollNext;

  return (
    <ClassroomViewSidebar>
      <div className="flex min-h-9 shrink-0 items-center gap-1 border-b border-border bg-muted/30 px-2 py-1 text-foreground">
        <h3 className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-widest">
          {heading}
        </h3>
        {showNavigation && (
          <>
            <div className="hidden items-center gap-0.5 landscape:flex xl:flex">
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
            <div className="flex items-center gap-0.5 landscape:hidden xl:hidden">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={previousLabel}
                onClick={() =>
                  scrollRef.current?.scrollBy({
                    left: -160,
                    behavior: "smooth",
                  })
                }
                disabled={!canScrollPrevious}
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={nextLabel}
                onClick={() =>
                  scrollRef.current?.scrollBy({
                    left: 160,
                    behavior: "smooth",
                  })
                }
                disabled={!canScrollNext}
              >
                <ChevronRight />
              </Button>
            </div>
          </>
        )}
      </div>

      <div
        ref={scrollRef}
        className="scrollbar-thin flex min-h-0 min-w-0 flex-1 snap-x snap-mandatory flex-row items-start gap-1.5 overflow-x-auto overflow-y-hidden p-1 landscape:grid landscape:auto-rows-max landscape:grid-cols-[repeat(auto-fill,minmax(96px,1fr))] landscape:content-start landscape:items-start landscape:overflow-x-hidden landscape:overflow-y-auto landscape:snap-y xl:grid xl:auto-rows-max xl:grid-cols-[repeat(auto-fill,minmax(96px,1fr))] xl:content-start xl:items-start xl:overflow-x-hidden xl:overflow-y-auto xl:snap-y"
      >
        {isEmpty && (
          <div className="flex h-full w-full items-center justify-center whitespace-nowrap px-2 text-center text-xs italic text-muted-foreground landscape:col-span-full landscape:whitespace-normal xl:col-span-full xl:whitespace-normal">
            {emptyContent}
          </div>
        )}
        {children}
      </div>
    </ClassroomViewSidebar>
  );
}
