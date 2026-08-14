"use client";

import { useEffect, useRef, useState } from "react";
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { enUS, es, ptBR } from "date-fns/locale";
import { PlayCircle, VideoOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { ScheduleRecordingPlayer } from "@/components/recording-player-modal";
import { CalendarProviderBadge } from "@/components/calendar/calendar-provider-badge";
import { CalendarProviderMark } from "@/components/calendar/calendar-provider-mark";
import { getCalendarProviderAppearanceClasses } from "@/components/calendar/calendar-tailwind-classes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  isExternalClassSession,
  type ClassSessionType,
} from "@/lib/class-session";

export type PastClassItem = {
  scheduleId: Id<"classSchedule">;
  lessonIds: Id<"lessons">[];
  title: string | null;
  start: number;
  end: number;
  timeZone: string;
  sessionType: ClassSessionType;
  hasRecording: boolean;
};

const dateLocales = { en: enUS, es, "pt-BR": ptBR } as const;

export function PastClassesPanel({
  sessions,
  lessons,
}: {
  sessions: PastClassItem[] | undefined;
  lessons: Doc<"lessons">[];
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [selectedScheduleId, setSelectedScheduleId] =
    useState<Id<"classSchedule"> | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollEdges, setScrollEdges] = useState({
    canScrollUp: false,
    canScrollDown: false,
  });
  const selectedSession =
    sessions?.find((session) => session.scheduleId === selectedScheduleId) ??
    sessions?.[0] ??
    null;
  const dateLocale = dateLocales[locale as keyof typeof dateLocales] ?? enUS;

  const getSessionTitle = (session: PastClassItem) => {
    const linkedLessons = lessons
      .filter((lesson) => session.lessonIds.includes(lesson._id))
      .sort((first, second) => first.order - second.order);
    if (linkedLessons.length === 1) return linkedLessons[0].title;
    if (linkedLessons.length > 1) {
      return `${linkedLessons[0].title} +${linkedLessons.length - 1}`;
    }
    return session.title ?? t("schedule.sessions");
  };
  const formatSessionDate = (session: PastClassItem) =>
    format(new TZDate(session.start, session.timeZone), "EEE, MMM d · h:mm a", {
      locale: dateLocale,
    });
  const selectedSessionIsExternal = isExternalClassSession(
    selectedSession?.sessionType,
  );

  useEffect(() => {
    const viewport = scrollContainerRef.current?.querySelector<HTMLElement>(
      "[data-slot='scroll-area-viewport']",
    );
    if (!viewport) return;

    const updateScrollEdges = () => {
      const remainingScroll =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      const nextEdges = {
        canScrollUp: viewport.scrollTop > 2,
        canScrollDown: remainingScroll > 2,
      };
      setScrollEdges((currentEdges) =>
        currentEdges.canScrollUp === nextEdges.canScrollUp &&
        currentEdges.canScrollDown === nextEdges.canScrollDown
          ? currentEdges
          : nextEdges,
      );
    };

    const animationFrame = requestAnimationFrame(updateScrollEdges);
    const resizeObserver = new ResizeObserver(updateScrollEdges);
    resizeObserver.observe(viewport);
    viewport.addEventListener("scroll", updateScrollEdges, { passive: true });

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      viewport.removeEventListener("scroll", updateScrollEdges);
    };
  }, [sessions]);

  return (
    <Card className="gap-4 overflow-hidden rounded-[2rem] border-0 py-5 shadow-md ring-1 ring-border/80">
      <CardHeader className="px-5 sm:px-6">
        <CardTitle className="text-xl font-bold">
          {t("class.pastClasses")}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 sm:px-6">
        {sessions === undefined ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Skeleton className="aspect-video w-full rounded-2xl" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full rounded-2xl" />
              ))}
            </div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
            {t("class.noPastClasses")}
          </div>
        ) : (
          <div className="grid gap-5 lg:relative lg:block lg:pr-[340px]">
            <div className="min-w-0">
              {selectedSession &&
                (selectedSessionIsExternal ? (
                  <div
                    className={cn(
                      "flex aspect-video flex-col items-center justify-center gap-4 rounded-2xl border px-6 text-center",
                      getCalendarProviderAppearanceClasses(
                        selectedSession.sessionType,
                      )?.event,
                    )}
                  >
                    <CalendarProviderMark
                      sessionType={selectedSession.sessionType}
                      isPast
                      className="size-20 sm:size-24"
                      sizes="(min-width: 640px) 96px, 80px"
                    />
                    <CalendarProviderBadge
                      sessionType={selectedSession.sessionType}
                      isPast
                      className="h-7 rounded-full px-3 text-xs"
                      markClassName="size-3.5"
                    />
                  </div>
                ) : (
                  <ScheduleRecordingPlayer
                    scheduleId={selectedSession.scheduleId}
                    className="rounded-2xl"
                  />
                ))}
            </div>

            <div
              ref={scrollContainerRef}
              className="relative h-72 min-h-0 overflow-hidden lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-80"
            >
              {scrollEdges.canScrollUp && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-card/75 via-card/25 to-transparent"
                />
              )}
              {scrollEdges.canScrollDown && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t from-card/75 via-card/25 to-transparent"
                />
              )}
              <ScrollArea className="h-full w-full">
                <div className="space-y-2 pr-3">
                  {sessions.map((session) => {
                    const isSelected =
                      session.scheduleId === selectedSession?.scheduleId;
                    return (
                      <button
                        key={session.scheduleId}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() =>
                          setSelectedScheduleId(session.scheduleId)
                        }
                        className={cn(
                          "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors",
                          isSelected
                            ? "bg-secondary text-secondary-foreground"
                            : "bg-sidebar text-foreground hover:bg-muted",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-sm font-bold">
                            {getSessionTitle(session)}
                          </p>
                          <p
                            className={cn(
                              "mt-1 text-xs capitalize",
                              isSelected
                                ? "text-secondary-foreground/75"
                                : "text-muted-foreground",
                            )}
                          >
                            {formatSessionDate(session)}
                          </p>
                        </div>
                        {isExternalClassSession(session.sessionType) ? (
                          <CalendarProviderMark
                            sessionType={session.sessionType}
                            isPast
                            className="size-6"
                          />
                        ) : session.hasRecording ? (
                          <PlayCircle
                            className="size-6 shrink-0"
                            aria-hidden="true"
                          />
                        ) : (
                          <VideoOff
                            className="size-5 shrink-0 opacity-55"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
