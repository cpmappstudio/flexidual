"use client";

import { useEffect, useState } from "react";
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { enUS, es, ptBR } from "date-fns/locale";
import { BookOpenCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { RecordingPlayerModal } from "@/components/recording-player-modal";
import { CalendarProviderBadge } from "@/components/calendar/calendar-provider-badge";
import { CalendarProviderMark } from "@/components/calendar/calendar-provider-mark";
import { getCalendarProviderAppearanceClasses } from "@/components/calendar/calendar-tailwind-classes";
import {
  getSessionRecordings,
  SessionRecordView,
  useSessionRecord,
} from "@/components/classroom/session-record";
import {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  isExternalClassSession,
  type ClassSessionType,
} from "@/lib/class-session";

export type PastClassItem = {
  scheduleId: Id<"classSchedule">;
  title: string | null;
  start: number;
  end: number;
  timeZone: string;
  sessionType: ClassSessionType;
};

const dateLocales = { en: enUS, es, "pt-BR": ptBR } as const;

export function PastClassesPanel({
  sessions,
}: {
  sessions: PastClassItem[] | undefined;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [selectedScheduleId, setSelectedScheduleId] =
    useState<Id<"classSchedule"> | null>(null);
  const [recordingOpen, setRecordingOpen] = useState(false);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const selectedSession =
    sessions?.find((session) => session.scheduleId === selectedScheduleId) ??
    sessions?.[0] ??
    null;
  const dateLocale = dateLocales[locale as keyof typeof dateLocales] ?? enUS;

  const getSessionTitle = (session: PastClassItem) =>
    session.title ?? t("schedule.sessions");
  const formatSessionDate = (session: PastClassItem) =>
    format(new TZDate(session.start, session.timeZone), "EEE, MMM d · h:mm a", {
      locale: dateLocale,
    });
  const selectedSessionIsExternal = isExternalClassSession(
    selectedSession?.sessionType,
  );
  const sessionRecord = useSessionRecord(
    selectedSession?.scheduleId,
    Boolean(selectedSession && !selectedSessionIsExternal),
  );
  const sessionRecordings = getSessionRecordings(sessionRecord);
  const selectedSessionIndex = selectedSession
    ? (sessions?.findIndex(
        (session) => session.scheduleId === selectedSession.scheduleId,
      ) ?? -1)
    : -1;

  useEffect(() => {
    setRecordingOpen(false);
  }, [selectedSession?.scheduleId]);

  useEffect(() => {
    if (!carouselApi || selectedSessionIndex < 0) return;

    const scrollToSelectedSession = () => {
      carouselApi.scrollTo(selectedSessionIndex);
    };
    scrollToSelectedSession();
    carouselApi.on("reInit", scrollToSelectedSession);

    return () => {
      carouselApi.off("reInit", scrollToSelectedSession);
    };
  }, [carouselApi, selectedSessionIndex]);

  return (
    <Card className="gap-0 overflow-hidden rounded-[2rem] border-0 py-5 shadow-md ring-1 ring-border/80">
      <Carousel
        opts={{ align: "start", containScroll: "trimSnaps" }}
        setApi={setCarouselApi}
        className="flex w-full touch-pan-y flex-col gap-4"
        aria-label={t("class.pastClasses")}
      >
        <CardHeader className="px-5 sm:px-6">
          <CardTitle className="text-xl font-bold">
            {t("class.pastClasses")}
          </CardTitle>
          {sessions && sessions.length > 0 && (
            <CardAction className="flex gap-2">
              <CarouselPrevious
                className="static size-10 translate-y-0"
                aria-label={`${t("common.previous")}: ${t("class.pastClasses")}`}
              />
              <CarouselNext
                className="static size-10 translate-y-0"
                aria-label={`${t("common.next")}: ${t("class.pastClasses")}`}
              />
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="px-5 sm:px-6">
          {sessions === undefined ? (
            <div className="space-y-5">
              <div className="flex gap-3 overflow-hidden">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton
                    key={index}
                    className="h-16 min-w-[72%] rounded-2xl sm:min-w-[46%] md:min-w-[34%]"
                  />
                ))}
              </div>
              <Skeleton className="h-72 w-full rounded-2xl" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
              {t("class.noPastClasses")}
            </div>
          ) : (
            <div className="space-y-5">
              <CarouselContent className="-ml-3">
                {sessions.map((session, index) => {
                  const isSelected =
                    session.scheduleId === selectedSession?.scheduleId;
                  return (
                    <CarouselItem
                      key={session.scheduleId}
                      className="basis-[72%] pl-3 sm:basis-[46%] md:basis-[34%] 2xl:basis-1/4"
                      aria-label={`${index + 1} / ${sessions.length}`}
                    >
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() =>
                          setSelectedScheduleId(session.scheduleId)
                        }
                        className={cn(
                          "flex min-h-16 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                          isSelected
                            ? "border-secondary/60 bg-secondary/10 text-foreground shadow-[inset_3px_0_0_var(--secondary)] hover:bg-secondary/15"
                            : "border-border bg-sidebar text-foreground hover:bg-muted",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-bold capitalize">
                            {formatSessionDate(session)}
                          </p>
                        </div>
                        {isExternalClassSession(session.sessionType) ? (
                          <CalendarProviderMark
                            sessionType={session.sessionType}
                            isPast
                            className="size-6"
                          />
                        ) : (
                          <BookOpenCheck
                            className="size-5 shrink-0 opacity-60"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </CarouselItem>
                  );
                })}
              </CarouselContent>

              <Separator />

              {selectedSession &&
                (selectedSessionIsExternal ? (
                  <div
                    className={cn(
                      "flex min-h-52 flex-col items-center justify-center gap-4 rounded-2xl border px-6 text-center",
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
                  <div className="min-w-0">
                    <div className="mb-4">
                      <h3 className="text-base font-bold text-foreground">
                        {getSessionTitle(selectedSession)}
                      </h3>
                      <p className="mt-1 text-sm capitalize text-muted-foreground">
                        {formatSessionDate(selectedSession)}
                      </p>
                    </div>
                    <SessionRecordView
                      record={sessionRecord}
                      onWatchRecording={() => setRecordingOpen(true)}
                      variant="panel"
                    />
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Carousel>
      {selectedSession && sessionRecordings.length > 0 && (
        <RecordingPlayerModal
          scheduleId={selectedSession.scheduleId}
          title={getSessionTitle(selectedSession)}
          scheduledStart={selectedSession.start}
          scheduledEnd={selectedSession.end}
          timeZone={selectedSession.timeZone}
          open={recordingOpen}
          onOpenChange={setRecordingOpen}
          recordings={sessionRecordings}
          variant={
            sessionRecord?.state === "completed" &&
            sessionRecord.staffDetails === null
              ? "student"
              : "default"
          }
        />
      )}
    </Card>
  );
}
