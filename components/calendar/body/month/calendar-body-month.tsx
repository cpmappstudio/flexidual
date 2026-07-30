import { useCalendarContext } from "../../calendar-context";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
  isWithinInterval,
  type Locale,
} from "date-fns";
import { TZDate, tz } from "@date-fns/tz";
import { enUS, es, ptBR } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import CalendarEvent from "../../calendar-event";
import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import { CalendarEvent as CalendarEventType } from "../../calendar-types";
import { getCalendarEventAppearanceClasses } from "../../calendar-tailwind-classes";
import { getCalendarEventDisplay } from "../../calendar-event-display";
import { CalendarProviderMark } from "../../calendar-provider-mark";

const localeMap = {
  en: enUS,
  es: es,
  "pt-BR": ptBR,
} as const;

export default function CalendarBodyMonth() {
  const {
    date,
    events,
    setDate,
    setMode,
    displayTimeZone,
    setManageEventDialogOpen,
    setSelectedEvent,
    isStudent,
  } = useCalendarContext();
  const locale = useLocale();
  const dateLocale = localeMap[locale as keyof typeof localeMap] || enUS;
  const t = useTranslations("calendar");
  const dateContext = { in: tz(displayTimeZone) };

  const monthStart = startOfMonth(date, dateContext);
  const monthEnd = endOfMonth(date, dateContext);
  const calendarStart = startOfWeek(monthStart, {
    weekStartsOn: 1,
    locale: dateLocale,
    ...dateContext,
  });
  const calendarEnd = endOfWeek(monthEnd, {
    weekStartsOn: 1,
    locale: dateLocale,
    ...dateContext,
  });

  const calendarDays = eachDayOfInterval(
    {
      start: calendarStart,
      end: calendarEnd,
    },
    dateContext,
  );

  const today = TZDate.tz(displayTimeZone);

  const visibleEvents = events.filter(
    (event) =>
      isWithinInterval(
        event.start,
        {
          start: calendarStart,
          end: calendarEnd,
        },
        dateContext,
      ) ||
      isWithinInterval(
        event.end,
        { start: calendarStart, end: calendarEnd },
        dateContext,
      ),
  );

  const weekDays = calendarDays
    .slice(0, 7)
    .map((day) => format(day, "EEE", { locale: dateLocale, ...dateContext }));
  const selectedDayEvents = visibleEvents
    .filter((event) => isSameDay(event.start, date, dateContext))
    .sort((first, second) => first.start.getTime() - second.start.getTime());

  return (
    <div className="flex h-full flex-col overflow-hidden bg-sidebar">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:hidden">
        <div className="shrink-0 border-b bg-sidebar p-2">
          <div className="grid grid-cols-7">
            {weekDays.map((day, index) => (
              <div
                key={index}
                className="pb-1.5 text-center text-[10px] font-semibold uppercase text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const dayEvents = visibleEvents.filter((event) =>
                isSameDay(event.start, day, dateContext),
              );

              return (
                <MobileDayCell
                  key={day.toISOString()}
                  day={day}
                  dayEvents={dayEvents}
                  isSelected={isSameDay(day, date, dateContext)}
                  isToday={isSameDay(day, today, dateContext)}
                  isCurrentMonth={isSameMonth(day, date, dateContext)}
                  dateLocale={dateLocale}
                  displayTimeZone={displayTimeZone}
                  onClick={() => setDate(day)}
                />
              );
            })}
          </div>
        </div>

        <MobileDayAgenda
          date={date}
          events={selectedDayEvents}
          dateLocale={dateLocale}
          displayTimeZone={displayTimeZone}
          isStudent={isStudent}
          emptyLabel={t("noEventsDay")}
          classesLabel={
            selectedDayEvents.length === 1 ? t("event") : t("events")
          }
          onEventClick={(event) => {
            setSelectedEvent(event);
            setManageEventDialogOpen(true);
          }}
        />
      </div>

      <div className="hidden min-h-0 flex-1 flex-col md:flex">
        <div className="sticky top-0 z-10 grid grid-cols-7 border-b bg-sidebar">
          {weekDays.map((day, index) => (
            <div
              key={index}
              className="py-1.5 text-center text-xs font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-[repeat(auto-fit,minmax(0,1fr))] overflow-hidden">
          {calendarDays.map((day) => {
            const dayEvents = visibleEvents.filter((event) =>
              isSameDay(event.start, day, dateContext),
            );
            const isToday = isSameDay(day, today, dateContext);
            const isCurrentMonth = isSameMonth(day, date, dateContext);

            return (
              <DayCell
                key={day.toISOString()}
                day={day}
                dayEvents={dayEvents}
                isToday={isToday}
                isCurrentMonth={isCurrentMonth}
                dateLocale={dateLocale}
                displayTimeZone={displayTimeZone}
                onDayClick={() => {
                  setDate(day);
                  setMode("day");
                }}
                t={t}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MobileDayCell({
  day,
  dayEvents,
  isSelected,
  isToday,
  isCurrentMonth,
  dateLocale,
  displayTimeZone,
  onClick,
}: {
  day: Date;
  dayEvents: CalendarEventType[];
  isSelected: boolean;
  isToday: boolean;
  isCurrentMonth: boolean;
  dateLocale: Locale;
  displayTimeZone: string;
  onClick: () => void;
}) {
  const dateContext = { in: tz(displayTimeZone) };

  return (
    <button
      type="button"
      className={cn(
        "flex min-h-14 min-w-0 flex-col items-center rounded-md border px-1 py-1.5 text-center transition-colors",
        isSelected
          ? "border-primary bg-primary/10 text-primary shadow-sm"
          : "border-transparent bg-card text-foreground hover:bg-muted/70",
        !isCurrentMonth && "opacity-40",
        isToday && !isSelected && "border-primary/40 text-primary",
      )}
      aria-label={format(day, "EEEE, MMMM d, yyyy", {
        locale: dateLocale,
        ...dateContext,
      })}
      aria-pressed={isSelected}
      onClick={onClick}
    >
      <span className="text-sm font-semibold leading-none">
        {format(day, "d", {
          locale: dateLocale,
          ...dateContext,
        })}
      </span>
      <span className="mt-auto flex w-full flex-col gap-0.5" aria-hidden="true">
        {dayEvents.slice(0, 2).map((event) => (
          <span
            key={event.id}
            className={cn(
              "h-1 w-full rounded-full",
              getCalendarEventAppearanceClasses({
                color: event.color,
                sessionType: event.sessionType,
                status: event.status,
                isPast: event.end.getTime() < Date.now(),
              }).dot,
            )}
          />
        ))}
        {dayEvents.length > 2 && (
          <span className="text-[9px] font-semibold leading-none text-muted-foreground">
            +{dayEvents.length - 2}
          </span>
        )}
      </span>
    </button>
  );
}

function MobileDayAgenda({
  date,
  events,
  dateLocale,
  displayTimeZone,
  isStudent,
  emptyLabel,
  classesLabel,
  onEventClick,
}: {
  date: Date;
  events: CalendarEventType[];
  dateLocale: Locale;
  displayTimeZone: string;
  isStudent: boolean | undefined;
  emptyLabel: string;
  classesLabel: string;
  onEventClick: (event: CalendarEventType) => void;
}) {
  const dateContext = { in: tz(displayTimeZone) };

  return (
    <section className="px-3 py-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-lg font-bold capitalize text-foreground">
            {format(date, "EEEE d", {
              locale: dateLocale,
              ...dateContext,
            })}
          </p>
          <p className="text-xs capitalize text-muted-foreground">
            {format(date, "MMMM yyyy", {
              locale: dateLocale,
              ...dateContext,
            })}
          </p>
        </div>
        <p className="shrink-0 text-xs font-medium text-muted-foreground">
          {events.length} {classesLabel}
        </p>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={date.toISOString()}
          className="mt-3 space-y-2"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >
          {events.length ? (
            events.map((event) => {
              const { primaryLabel, secondaryLabel, gradeLabel } =
                getCalendarEventDisplay(event, { showGrade: !isStudent });
              const timeLabel = `${format(event.start, "h:mm a", dateContext)} - ${format(event.end, "h:mm a", dateContext)}`;
              const isPast = event.end.getTime() < Date.now();
              const appearance = getCalendarEventAppearanceClasses({
                color: event.color,
                sessionType: event.sessionType,
                status: event.status,
                isPast,
              });

              return (
                <button
                  key={event.id}
                  type="button"
                  className={cn(
                    "flex w-full min-w-0 flex-col rounded-md border-l-4 px-3 py-2 text-left transition-colors",
                    appearance.event,
                  )}
                  onClick={() => onEventClick(event)}
                >
                  <span className="flex min-w-0 items-start justify-between gap-2">
                    <span className="flex min-w-0 items-start gap-1">
                      <span className="line-clamp-2 min-w-0 text-sm font-semibold leading-tight text-foreground">
                        {primaryLabel}
                      </span>
                      <CalendarProviderMark
                        sessionType={event.sessionType}
                        isPast={isPast}
                        className="mt-0.5 size-3.5"
                      />
                    </span>
                    <span className="shrink-0 text-[10px] leading-tight text-muted-foreground/80">
                      {timeLabel}
                    </span>
                  </span>
                  {gradeLabel && (
                    <span className="mt-1 truncate text-[10px] font-semibold uppercase text-muted-foreground">
                      {gradeLabel}
                    </span>
                  )}
                  {secondaryLabel && (
                    <span className="mt-1 truncate text-xs font-medium text-muted-foreground">
                      {secondaryLabel}
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            <div className="rounded-md border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
              {emptyLabel}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

// Separate component to handle individual day cells with dynamic event display
function DayCell({
  day,
  dayEvents,
  isToday,
  isCurrentMonth,
  dateLocale,
  displayTimeZone,
  onDayClick,
  t,
}: {
  day: Date;
  dayEvents: CalendarEventType[];
  isToday: boolean;
  isCurrentMonth: boolean;
  dateLocale: Locale;
  displayTimeZone: string;
  onDayClick: () => void;
  t: ReturnType<typeof useTranslations<"calendar">>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [maxVisibleEvents, setMaxVisibleEvents] = useState(2);

  useEffect(() => {
    const calculateVisibleEvents = () => {
      if (!containerRef.current) return;

      const containerHeight = containerRef.current.clientHeight;
      const headerHeight = 26; // Date number height (w-6 h-6)
      const eventHeight = 22; // Event item height (px-1.5 py-0.5 + gap)
      const moreTextHeight = 18; // "+X more" text height
      const padding = 8; // mt-1 and gaps

      const availableHeight =
        containerHeight - headerHeight - padding - moreTextHeight;
      const maxEvents = Math.max(1, Math.floor(availableHeight / eventHeight));

      setMaxVisibleEvents(maxEvents);
    };

    calculateVisibleEvents();

    const resizeObserver = new ResizeObserver(calculateVisibleEvents);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  const visibleEvents = dayEvents.slice(0, maxVisibleEvents);
  const hiddenCount = dayEvents.length - maxVisibleEvents;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex min-h-16 cursor-pointer flex-col border-b p-1.5 last:border-b-0 md:min-h-0 md:border-r md:[&:nth-child(7n)]:border-r-0 md:[&:nth-last-child(-n+7)]:border-b-0",
        !isCurrentMonth && "bg-muted/50 hidden md:flex",
      )}
      onClick={(e) => {
        e.stopPropagation();
        onDayClick();
      }}
    >
      <div
        className={cn(
          "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
          isToday && "bg-primary text-primary-foreground",
        )}
      >
        {format(day, "d", {
          locale: dateLocale,
          in: tz(displayTimeZone),
        })}
      </div>
      <AnimatePresence mode="wait">
        <div className="flex flex-col gap-0.5 mt-1 overflow-hidden">
          {visibleEvents.map((event) => (
            <CalendarEvent
              key={event.id}
              event={event}
              className="relative h-auto text-[10px] px-1.5 py-0.5"
              month
            />
          ))}
          {hiddenCount > 0 && (
            <motion.div
              key={`more-${day.toISOString()}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.2,
              }}
              className="text-[10px] text-muted-foreground px-1.5 hover:text-foreground transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onDayClick();
              }}
            >
              {t("moreEvents", { count: hiddenCount })}
            </motion.div>
          )}
        </div>
      </AnimatePresence>
    </div>
  );
}
