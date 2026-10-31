"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { FunctionReturnType } from "convex/server";
import { Video } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DetailCarousel } from "@/components/detail-carousel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { carouselCardStyles } from "@/components/ui/carousel-card-styles";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type PastSession = FunctionReturnType<
  typeof api.events.listOccurrences
>["page"][number];

export function EventPastSessionsPanel({
  sessions,
  timeZone,
  onWatchRecording,
  canLoadMore,
  onLoadMore,
}: {
  sessions: PastSession[];
  timeZone: string;
  onWatchRecording: (session: PastSession) => void;
  canLoadMore: boolean;
  onLoadMore: () => void;
}) {
  const t = useTranslations("events");
  const recordingsT = useTranslations("recordings");
  const locale = useLocale();
  const [selectedId, setSelectedId] = useState<PastSession["_id"] | null>(null);
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const orderedSessions = useMemo(() => [...sessions].reverse(), [sessions]);
  const selectedSession =
    sessions.find((session) => session._id === selectedId) ??
    sessions[0] ??
    null;
  const selectedIndex = selectedSession
    ? orderedSessions.findIndex(
        (session) => session._id === selectedSession._id,
      )
    : -1;
  const cardDate = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone,
      }),
    [locale, timeZone],
  );

  useEffect(() => {
    if (!carouselApi || selectedIndex < 0) return;
    const scrollToSelected = () => carouselApi.scrollTo(selectedIndex);
    scrollToSelected();
    carouselApi.on("reInit", scrollToSelected);
    return () => {
      carouselApi.off("reInit", scrollToSelected);
    };
  }, [carouselApi, selectedIndex]);

  return (
    <DetailCarousel
      title={t("past")}
      olderLabel={t("olderSessions")}
      newerLabel={t("newerSessions")}
      showNavigation={sessions.length > 1}
      setApi={setCarouselApi}
    >
      {selectedSession ? (
        <div className="space-y-4">
          <CarouselContent className="ml-0 gap-3">
            {orderedSessions.map((session, index) => {
              const isSelected = session._id === selectedSession._id;
              return (
                <CarouselItem
                  key={session._id}
                  className="basis-full pl-0 @xl:basis-[calc((100%-0.75rem)/2)] @4xl:basis-[calc((100%-1.5rem)/3)] @6xl:basis-[calc((100%-2.25rem)/4)]"
                  aria-label={`${index + 1} / ${orderedSessions.length}`}
                >
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedId(session._id)}
                    className={cn(
                      "flex h-20 w-full flex-col items-start justify-center gap-2 px-4 py-3 text-left",
                      carouselCardStyles(isSelected ? "accent" : "default"),
                    )}
                  >
                    <span className="flex w-full min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">
                        {cardDate.format(session.start)}
                      </span>
                      {session.hasRecording && (
                        <Video
                          className="size-4 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    {session.status !== "completed" && (
                      <Badge variant="secondary">{t(session.status)}</Badge>
                    )}
                  </button>
                </CarouselItem>
              );
            })}
          </CarouselContent>
          <Separator />
          <div>
            {selectedSession.hasRecording ? (
              <Button
                variant="outline"
                onClick={() => onWatchRecording(selectedSession)}
              >
                <Video aria-hidden="true" />
                {recordingsT("watch")}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                {selectedSession.recordingFailed
                  ? recordingsT("recordingFailed")
                  : recordingsT("noRecordings")}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">
          {t("noSessions")}
        </p>
      )}
      {canLoadMore && (
        <Button variant="outline" className="mt-5" onClick={onLoadMore}>
          {t("loadMore")}
        </Button>
      )}
    </DetailCarousel>
  );
}
