import { useCalendarContext } from "../../calendar-context";
import { format, isSameDay } from "date-fns";
import { useTranslations } from "next-intl";
import { getCalendarEventAppearanceClasses } from "../../calendar-tailwind-classes";
import { getCalendarEventDisplay } from "../../calendar-event-display";
import { CalendarProviderMark } from "../../calendar-provider-mark";
import { tz } from "@date-fns/tz";

export default function CalendarBodyDayEvents() {
  const {
    events,
    date,
    displayTimeZone,
    setManageEventDialogOpen,
    setSelectedEvent,
    isStudent,
  } = useCalendarContext();
  const t = useTranslations("calendar");
  const dayEvents = events.filter((event) =>
    isSameDay(event.start, date, { in: tz(displayTimeZone) }),
  );

  return !!dayEvents.length ? (
    <div className="flex flex-col gap-2">
      <p className="font-medium p-2 pb-0 font-heading">{t("eventsToday")}</p>
      <div className="flex flex-col gap-2">
        {dayEvents.map((event) => {
          const { primaryLabel, secondaryLabel } = getCalendarEventDisplay(
            event,
            {
              showGrade: !isStudent,
              includeGradeInPrimary: true,
            },
          );
          const timeLabel = `${format(event.start, "h:mm a", { in: tz(displayTimeZone) })} - ${format(event.end, "h:mm a", { in: tz(displayTimeZone) })}`;
          const isPast = event.end.getTime() < Date.now();
          const appearance = getCalendarEventAppearanceClasses({
            color: event.color,
            sessionType: event.sessionType,
            status: event.status,
            isPast,
          });

          return (
            <div
              key={event.id}
              className="flex items-center gap-2 px-2 cursor-pointer hover:bg-muted/50 rounded-md py-1 transition-colors"
              onClick={() => {
                setSelectedEvent(event);
                setManageEventDialogOpen(true);
              }}
            >
              <div
                className={`size-2 shrink-0 rounded-full ${appearance.dot}`}
              />
              <div className="flex flex-col min-w-0">
                <div className="flex min-w-0 items-center gap-1">
                  <p className="truncate text-xs font-semibold">
                    {primaryLabel}
                  </p>
                  <CalendarProviderMark
                    sessionType={event.sessionType}
                    isPast={isPast}
                    className="size-3"
                  />
                </div>
                {secondaryLabel && (
                  <p className="truncate text-[11px] font-medium text-muted-foreground">
                    {secondaryLabel}
                  </p>
                )}
                <p className="truncate text-[10px] text-muted-foreground/80">
                  {timeLabel}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  ) : (
    <div className="p-2 text-muted-foreground">{t("noEventsToday")}</div>
  );
}
