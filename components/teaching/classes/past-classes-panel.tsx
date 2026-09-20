"use client";

import { useEffect, useMemo, useState } from "react";
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { enUS, es, ptBR } from "date-fns/locale";
import { CheckCircle2, ClipboardClock, ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";
import { RecordingPlayerModal } from "@/components/recording-player-modal";
import { CalendarProviderMark } from "@/components/calendar/calendar-provider-mark";
import { getCalendarProviderAppearanceClasses } from "@/components/calendar/calendar-tailwind-classes";
import {
  getSessionRecordings,
  SessionRecordView,
  useSessionRecord,
} from "@/components/classroom/session-record";
import { SessionCloseoutDialog } from "@/components/classroom/session-closeout-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  getExternalClassPlatform,
  isExternalClassSession,
  type ClassSessionType,
} from "@/lib/class-session";

export type PastClassItem = {
  scheduleId: Id<"classSchedule">;
  title: string | null;
  start: number;
  end: number;
  timeZone: string;
  roomName: string;
  sessionType: ClassSessionType;
  recordState: "completed" | "pending" | "notApplicable";
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
  const [closeoutOpen, setCloseoutOpen] = useState(false);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const orderedSessions = useMemo(
    () => [...(sessions ?? [])].sort((a, b) => a.start - b.start),
    [sessions],
  );
  const mostRecentSession = orderedSessions.at(-1) ?? null;
  const selectedSession =
    orderedSessions.find(
      (session) => session.scheduleId === selectedScheduleId,
    ) ??
    mostRecentSession ??
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
  const selectedExternalPlatform = getExternalClassPlatform(
    selectedSession?.sessionType,
  );
  const sessionRecord = useSessionRecord(
    selectedSession?.scheduleId,
    selectedSession?.end,
    Boolean(selectedSession && !selectedSessionIsExternal),
  );
  const sessionRecordings = getSessionRecordings(sessionRecord);
  const selectedSessionIndex = selectedSession
    ? orderedSessions.findIndex(
        (session) => session.scheduleId === selectedSession.scheduleId,
      )
    : -1;

  useEffect(() => {
    if (!orderedSessions.length || !mostRecentSession) {
      setSelectedScheduleId(null);
      return;
    }

    setSelectedScheduleId((current) =>
      current &&
      orderedSessions.some((session) => session.scheduleId === current)
        ? current
        : mostRecentSession.scheduleId,
    );
  }, [mostRecentSession, orderedSessions]);

  useEffect(() => {
    setRecordingOpen(false);
    setCloseoutOpen(false);
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
        className="flex w-full touch-pan-y flex-col gap-2"
        aria-label={t("class.pastClasses")}
      >
        <CardHeader className="items-center px-5 sm:px-6">
          <CardTitle className="text-xl font-bold">
            {t("class.pastClasses")}
          </CardTitle>
          {sessions && sessions.length > 0 && (
            <CardAction className="flex items-center gap-2 self-center sm:gap-3">
              <div className="flex items-center gap-1.5">
                <span className="hidden text-[10px] leading-none text-muted-foreground sm:block">
                  {t("class.olderClasses")}
                </span>
                <CarouselPrevious
                  className="static size-10 translate-y-0"
                  aria-label={t("class.olderClasses")}
                  title={t("class.olderClasses")}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <CarouselNext
                  className="static size-10 translate-y-0"
                  aria-label={t("class.newerClasses")}
                  title={t("class.newerClasses")}
                />
                <span className="hidden text-[10px] leading-none text-muted-foreground sm:block">
                  {t("class.newerClasses")}
                </span>
              </div>
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
                    className="h-24 min-w-[72%] rounded-2xl sm:min-w-[46%] md:min-w-[34%]"
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
                {orderedSessions.map((session, index) => {
                  const isSelected =
                    session.scheduleId === selectedSession?.scheduleId;
                  return (
                    <CarouselItem
                      key={session.scheduleId}
                      className="basis-[72%] pl-3 sm:basis-[46%] md:basis-[34%] 2xl:basis-1/4"
                      aria-label={`${index + 1} / ${orderedSessions.length}`}
                    >
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() =>
                          setSelectedScheduleId(session.scheduleId)
                        }
                        className={cn(
                          "flex h-24 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-[border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                          isSelected
                            ? "border-secondary/60 bg-sidebar text-foreground shadow-[inset_3px_0_0_var(--secondary)] hover:bg-muted/40"
                            : "border-border bg-sidebar text-foreground hover:bg-muted",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold capitalize">
                            {formatSessionDate(session)}
                          </p>
                          {session.recordState !== "notApplicable" && (
                            <Badge
                              variant="secondary"
                              className={cn(
                                "mt-1.5 gap-1 rounded-full px-2 py-0.5 text-[10px]",
                                session.recordState === "completed"
                                  ? "bg-success/10 text-success"
                                  : "bg-warning/15 text-warning-foreground",
                              )}
                            >
                              {session.recordState === "completed" ? (
                                <CheckCircle2
                                  className="size-3"
                                  aria-hidden="true"
                                />
                              ) : (
                                <ClipboardClock
                                  className="size-3"
                                  aria-hidden="true"
                                />
                              )}
                              {t(
                                session.recordState === "completed"
                                  ? "sessionRecord.completedLabel"
                                  : "sessionRecord.pendingLabel",
                              )}
                            </Badge>
                          )}
                        </div>
                        <CalendarProviderMark
                          sessionType={session.sessionType}
                          isPast={!isSelected}
                          className="size-7"
                          sizes="28px"
                        />
                      </button>
                    </CarouselItem>
                  );
                })}
              </CarouselContent>

              <Separator />

              {selectedSession && (
                <div className="min-w-0">
                  <div className="mb-4">
                    <h3 className="text-base font-bold text-foreground">
                      {getSessionTitle(selectedSession)}
                    </h3>
                    <p className="mt-1 text-sm capitalize text-muted-foreground">
                      {formatSessionDate(selectedSession)}
                    </p>
                  </div>
                  {selectedSessionIsExternal && selectedExternalPlatform ? (
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                      <div
                        className={cn(
                          "flex size-16 shrink-0 items-center justify-center rounded-xl border",
                          getCalendarProviderAppearanceClasses(
                            selectedSession.sessionType,
                          )?.badge,
                        )}
                      >
                        <CalendarProviderMark
                          sessionType={selectedSession.sessionType}
                          className="size-10"
                          sizes="40px"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-medium text-foreground">
                          {t("class.externalClassManaged", {
                            platform: selectedExternalPlatform.name,
                          })}
                        </p>
                        <Button
                          asChild
                          className="mt-2 h-10 px-6 font-semibold shadow-sm"
                        >
                          <a
                            href={selectedExternalPlatform.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t("classroom.goToPlatform", {
                              platform: selectedExternalPlatform.name,
                            })}
                            <ExternalLink
                              className="size-4"
                              aria-hidden="true"
                            />
                          </a>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <SessionRecordView
                      record={sessionRecord}
                      onWatchRecording={() => setRecordingOpen(true)}
                      onCompleteReport={() => setCloseoutOpen(true)}
                      variant="panel"
                      showOwnAttendance={false}
                      allowAttendanceEditing
                    />
                  )}
                </div>
              )}
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
      {selectedSession && !selectedSessionIsExternal && (
        <SessionCloseoutDialog
          open={closeoutOpen}
          roomName={selectedSession.roomName}
          sessionNow={selectedSession.end}
          alreadyEnded
          onOpenChange={setCloseoutOpen}
          onComplete={() => {
            setCloseoutOpen(false);
            toast.success(t("classroom.closeout.recoverySaved"));
          }}
        />
      )}
    </Card>
  );
}
