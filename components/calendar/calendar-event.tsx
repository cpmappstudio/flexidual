import { CalendarEvent as CalendarEventType } from "@/components/calendar/calendar-types";
import { useCalendarContext } from "@/components/calendar/calendar-context";
import { format } from "date-fns";
import { tz } from "@date-fns/tz";
import { cn } from "@/lib/utils";
import { Video, PlayCircle } from "lucide-react";
import { getCalendarEventAppearanceClasses } from "@/components/calendar/calendar-tailwind-classes";
import {
  CalendarTimeScale,
  getTimeScaleUnitsAt,
} from "@/components/calendar/calendar-time-scale";
import {
  getCalendarEventDisplay,
  getCalendarEventIndicators,
  isCalendarEventPast,
} from "@/components/calendar/calendar-event-display";
import { CalendarProviderMark } from "@/components/calendar/calendar-provider-mark";
import { CalendarProviderBadge } from "@/components/calendar/calendar-provider-badge";
import type { CalendarEventColumnLayout } from "@/components/calendar/calendar-event-layout";
import { useTranslations } from "next-intl";

interface EventPosition {
  left: string;
  width: string;
  top: string;
  height: string;
}

function isSameCalendarDay(first: Date, second: Date) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function calculateEventPosition(
  event: CalendarEventType,
  columnLayout: CalendarEventColumnLayout | undefined,
  scheduleStartMinutes: number,
  scheduleEndMinutes: number,
  timeScale?: CalendarTimeScale,
): EventPosition {
  const { columnIndex, columnCount } = columnLayout ?? {
    columnIndex: 0,
    columnCount: 1,
  };
  const columnWidth = 100 / columnCount;
  const width = columnCount === 1 ? "100%" : `calc(${columnWidth}% - 2px)`;
  const left =
    columnCount === 1 ? "0%" : `calc(${columnIndex * columnWidth}% + 1px)`;

  const startHour = event.start.getHours();
  const startMinutes = event.start.getMinutes();

  let endHour = event.end.getHours();
  let endMinutes = event.end.getMinutes();

  if (!isSameCalendarDay(event.start, event.end)) {
    endHour = 23;
    endMinutes = 59;
  }

  const eventStartMinutes = startHour * 60 + startMinutes;
  const eventEndMinutes = endHour * 60 + endMinutes;
  const visibleStart = Math.max(eventStartMinutes, scheduleStartMinutes);
  const visibleEnd = Math.min(eventEndMinutes, scheduleEndMinutes);
  const duration = Math.max(0, visibleEnd - visibleStart);
  const topUnits = timeScale
    ? getTimeScaleUnitsAt(timeScale, visibleStart)
    : (visibleStart - scheduleStartMinutes) / 60;
  const heightUnits = timeScale
    ? getTimeScaleUnitsAt(timeScale, visibleEnd) - topUnits
    : duration / 60;

  return {
    left,
    width,
    top: `calc(var(--calendar-hour-height) * ${topUnits})`,
    height: `calc(var(--calendar-hour-height) * ${heightUnits})`,
  };
}

export default function CalendarEvent({
  event,
  month = false,
  className,
  timeScale,
  compact = false,
  floatingTime = false,
  responsiveCompact = false,
  hideResponsiveTime = false,
  contentClassName,
  columnLayout,
}: {
  event: CalendarEventType;
  month?: boolean;
  className?: string;
  timeScale?: CalendarTimeScale;
  compact?: boolean;
  floatingTime?: boolean;
  responsiveCompact?: boolean;
  hideResponsiveTime?: boolean;
  contentClassName?: string;
  columnLayout?: CalendarEventColumnLayout;
}) {
  const t = useTranslations();
  const {
    setSelectedEvent,
    setManageEventDialogOpen,
    scheduleStartMinutes,
    scheduleEndMinutes,
    displayTimeZone,
    isStudent,
    mode,
  } = useCalendarContext();

  const style = month
    ? {}
    : calculateEventPosition(
        event,
        columnLayout,
        scheduleStartMinutes,
        scheduleEndMinutes,
        timeScale,
      );

  const dateContext = { in: tz(displayTimeZone) };
  const isPast = isCalendarEventPast(event);
  const { showRecording: showRecordingIndicator, showProviderIdentity } =
    getCalendarEventIndicators(event, isPast);
  const canExpandProviderIdentity =
    showProviderIdentity && !month && (mode === "day" || mode === "week");
  const showCornerIndicators =
    !month && (showProviderIdentity || showRecordingIndicator);

  const statusClasses = getCalendarEventAppearanceClasses({
    color: event.color,
    sessionType: event.sessionType,
    status: event.status,
    isPast,
  });

  const showGrade = !isStudent;
  const { primaryLabel, secondaryLabel, gradeLabel } = getCalendarEventDisplay(
    event,
    {
      showGrade,
      includeGradeInPrimary: month,
    },
  );
  const timeLabel = `${format(event.start, "h:mm a", dateContext)} - ${format(event.end, "h:mm a", dateContext)}`;
  const compactTimeLabel = `${format(event.start, "h:mm", dateContext)}-${format(event.end, "h:mm a", dateContext)}`;
  const desktopDailyLabel =
    mode === "day" && gradeLabel
      ? `${primaryLabel} (${gradeLabel})`
      : primaryLabel;
  const tooltipText = month
    ? `${primaryLabel}${secondaryLabel ? ` - ${secondaryLabel}` : ""} - ${format(event.start, "h:mm a", dateContext)} · ${displayTimeZone}`
    : `${primaryLabel}\n${timeLabel}${secondaryLabel ? `\n${secondaryLabel}` : ""} · ${displayTimeZone}`;

  return (
    <div
      title={tooltipText}
      data-calendar-mode={month ? undefined : mode}
      className={cn(
        "cursor-pointer truncate rounded-md border px-2 py-1 transition-all duration-300",
        !month && "calendar-event-card",
        compact && "px-1.5 py-1",
        responsiveCompact && "px-1.5 py-1 lg:px-2",
        statusClasses.event,
        !month && "absolute",
        className,
      )}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        setSelectedEvent(event);
        setManageEventDialogOpen(true);
      }}
    >
      <div
        className={cn(
          "relative flex h-full w-full flex-col",
          statusClasses.text,
          month && "flex-row items-center justify-between gap-2",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 flex-col gap-0.5 overflow-hidden",
            compact && "gap-0",
            responsiveCompact && "gap-0 lg:gap-0.5",
            month && "flex-row items-center gap-1 flex-1 min-w-0",
            showCornerIndicators && "pr-6",
            contentClassName,
          )}
        >
          <div
            className={cn(
              "calendar-event-title flex min-w-0 items-start gap-1",
              month && "flex-1 items-center",
              floatingTime && !hideResponsiveTime && "pr-16",
            )}
          >
            <p
              className={cn(
                "min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight",
                compact &&
                  "line-clamp-2 whitespace-normal text-[10px] leading-[1.05]",
                responsiveCompact &&
                  "line-clamp-2 whitespace-normal text-[10px] leading-[1.05] lg:line-clamp-1 lg:whitespace-nowrap lg:text-[13px] lg:leading-tight",
                month && "text-[10px]",
              )}
            >
              {mode === "day" && gradeLabel ? (
                <>
                  <span className="lg:hidden">{primaryLabel}</span>
                  <span className="hidden lg:inline">{desktopDailyLabel}</span>
                </>
              ) : (
                primaryLabel
              )}
            </p>
            {month && showProviderIdentity && (
              <CalendarProviderMark
                sessionType={event.sessionType}
                isPast={isPast}
                className="size-2.5"
              />
            )}
          </div>

          {!month && secondaryLabel && (
            <>
              {gradeLabel && (
                <p
                  className={cn(
                    "truncate text-[10px] font-semibold uppercase leading-tight text-muted-foreground",
                    compact && "text-[8px] leading-[1.05]",
                    responsiveCompact &&
                      "text-[8px] leading-[1.05] lg:text-[10px] lg:leading-tight",
                    mode === "day" && "lg:hidden",
                  )}
                >
                  {gradeLabel}
                </p>
              )}
              <p
                className={cn(
                  "truncate text-[11px] font-medium leading-tight opacity-80",
                  compact && "text-[9px] leading-[1.05]",
                  responsiveCompact &&
                    "text-[9px] leading-[1.05] lg:text-[11px] lg:leading-tight",
                )}
              >
                {secondaryLabel}
              </p>
            </>
          )}

          {!month && !secondaryLabel && gradeLabel && (
            <p
              className={cn(
                "truncate text-[10px] font-semibold uppercase leading-tight text-muted-foreground",
                compact && "text-[8px] leading-[1.05]",
                responsiveCompact &&
                  "text-[8px] leading-[1.05] lg:text-[10px] lg:leading-tight",
                mode === "day" && "lg:hidden",
              )}
            >
              {gradeLabel}
            </p>
          )}

          {!month && (!floatingTime || responsiveCompact) && (
            <p
              className={cn(
                "truncate text-[10px] font-normal leading-tight opacity-70",
                compact && "text-[8px] leading-[1.05]",
                hideResponsiveTime && "hidden lg:block",
              )}
            >
              {timeLabel}
            </p>
          )}

          {event.isLive && (
            <div className="mt-0.5 flex items-center gap-1 text-[10px] font-medium leading-tight">
              <Video className="h-3 w-3" />
              <span>Live Now</span>
            </div>
          )}
        </div>

        {month && showRecordingIndicator && (
          <span
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary/10 p-0.5 text-primary"
            title={t("recordings.watchRecording")}
            aria-label={t("recordings.watchRecording")}
          >
            <PlayCircle className="size-3.5" />
          </span>
        )}

        {!month &&
          !hideResponsiveTime &&
          (floatingTime || responsiveCompact) && (
            <span
              className={cn(
                "absolute right-0 top-0 whitespace-nowrap text-right text-[8px] font-medium leading-none opacity-70",
                responsiveCompact && "lg:hidden",
              )}
            >
              {compactTimeLabel}
            </span>
          )}

        {showCornerIndicators && (
          <div className="absolute right-0 top-0 flex items-center gap-1">
            {canExpandProviderIdentity && (
              <CalendarProviderBadge
                sessionType={event.sessionType}
                isPast={isPast}
                className="calendar-event-provider-badge h-5 max-w-24 gap-0.5 px-1 text-[8px] sm:h-6 sm:max-w-32 sm:gap-1 sm:px-2 sm:text-[11px]"
                markClassName="size-2.5 sm:size-4"
                labelClassName="truncate"
              />
            )}
            {showProviderIdentity && (
              <CalendarProviderMark
                sessionType={event.sessionType}
                isPast={isPast}
                className={cn(
                  "size-3",
                  canExpandProviderIdentity && "calendar-event-provider-mark",
                  (compact || responsiveCompact) && "size-2.5 lg:size-3",
                )}
              />
            )}
            {showRecordingIndicator && (
              <span
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary/15 p-0.5 text-primary shadow-sm ring-1 ring-primary/20"
                title={t("recordings.watchRecording")}
                aria-label={t("recordings.watchRecording")}
              >
                <PlayCircle
                  className={cn(
                    "size-4",
                    (compact || responsiveCompact) && "size-3.5 lg:size-4",
                  )}
                />
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
