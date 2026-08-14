"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { CalendarProviderBadge } from "@/components/calendar/calendar-provider-badge";
import type { ClassSessionType } from "@/lib/class-session";
import { cn } from "@/lib/utils";

export type NextClassPanelItem = {
  id: string;
  title: string;
  start: number;
  end: number;
  status?: "scheduled" | "active" | "completed" | "cancelled";
  isLive?: boolean;
  isParticipantActive?: boolean;
  sessionType: ClassSessionType;
};

export type NextClassPreviewItem = {
  id: string;
  title: string;
  meta: string;
  sessionType: ClassSessionType;
};

function formatCountdown(start: number, now: number) {
  const diff = start - now;
  if (diff <= 0) return "0m";

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function NextClassPreview({
  label,
  items,
  className,
}: {
  label: string;
  items: NextClassPreviewItem[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        "mt-3 w-full max-w-md rounded-[1.25rem] bg-card/90 p-3 text-left shadow-sm ring-1 ring-border/20 xl:mt-4 xl:rounded-[1.5rem] xl:p-4",
        className,
      )}
    >
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground xl:mb-3">
        {label}
      </p>
      <div className="space-y-2 xl:space-y-3">
        {items.map((item) => (
          <span key={item.id} className="block min-w-0">
            <span className="flex min-w-0 items-center justify-between gap-2">
              <span className="line-clamp-1 text-sm font-bold text-foreground">
                {item.title}
              </span>
              <CalendarProviderBadge
                sessionType={item.sessionType}
                className="h-5 shrink-0 px-1.5 text-[9px]"
                markClassName="size-2.5"
              />
            </span>
            <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
              {item.meta}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function NextClassPanel({
  nextClass,
  action,
  children,
  footer,
  className,
  currentTime,
  layout = "stacked",
}: {
  nextClass: NextClassPanelItem | null;
  action?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  currentTime?: number;
  layout?: "stacked" | "split";
}) {
  const t = useTranslations();
  const [internalTime, setInternalTime] = useState(Date.now);
  const hasNextClass = Boolean(nextClass);

  useEffect(() => {
    if (!hasNextClass || currentTime !== undefined) return;

    const interval = window.setInterval(
      () => setInternalTime(Date.now()),
      1000,
    );
    return () => window.clearInterval(interval);
  }, [currentTime, hasNextClass]);

  const now = currentTime ?? internalTime;

  const isLive = Boolean(
    nextClass &&
      (nextClass.status === "active" ||
        nextClass.isLive ||
        nextClass.isParticipantActive ||
        (now >= nextClass.start && now <= nextClass.end)),
  );

  return (
    <section
      className={cn(
        "relative min-h-0 overflow-hidden rounded-[2rem] bg-warning p-3 shadow-lg before:absolute before:inset-0 before:bg-[url('/flexidual-bg-pattern.webp')] before:bg-cover before:bg-center before:bg-no-repeat before:opacity-30 sm:p-4 xl:p-5",
        className,
      )}
    >
      <div className="relative z-10 flex h-full min-h-0 flex-col items-center justify-start text-center xl:justify-center">
        <div
          className={cn(
            "flex w-full flex-col items-center",
            layout === "split" &&
              "md:grid md:grid-cols-2 md:items-stretch md:gap-4",
          )}
        >
          <div
            className={cn(
              "w-full max-w-md rounded-[1.5rem] bg-card/95 px-4 py-4 shadow-md ring-1 ring-border/30 sm:px-5 xl:rounded-[1.8rem] xl:px-6 xl:py-6",
              layout === "split" && "md:max-w-none",
            )}
          >
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {t("student.nextClass")}:
            </p>
            {nextClass && (
              <div className="mt-2 flex flex-wrap justify-center gap-2 xl:mt-3">
                {isLive ? (
                  <Badge className="gap-1.5 rounded-full bg-destructive px-2.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white shadow-sm shadow-destructive/20 ring-1 ring-destructive/20 hover:bg-destructive motion-safe:animate-pulse xl:px-3 xl:py-1 xl:text-xs">
                    <span className="relative flex size-1.5 xl:size-2">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-white xl:size-2" />
                    </span>
                    {t("student.liveNow")}
                  </Badge>
                ) : (
                  <Badge className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-0.5 text-xs text-muted-foreground ring-1 ring-border/40 xl:gap-2 xl:px-3 xl:py-1 xl:text-sm">
                    <Clock className="size-3.5 xl:size-4" aria-hidden="true" />
                    <span className="tabular-nums">
                      {formatCountdown(nextClass.start, now)}
                    </span>
                  </Badge>
                )}
                <CalendarProviderBadge
                  sessionType={nextClass.sessionType}
                  className="rounded-full"
                />
              </div>
            )}
            <h3 className="mt-3 text-balance text-lg font-bold leading-tight text-foreground sm:text-xl xl:mt-4 xl:font-normal">
              {nextClass ? nextClass.title : t("student.today.noClasses")}
            </h3>
            {nextClass && action}
          </div>
          {children}
        </div>
        {footer}
      </div>
    </section>
  );
}
