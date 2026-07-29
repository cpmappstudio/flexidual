import { useCalendarContext } from "../../calendar-context";
import CalendarBodyDayContent from "../day/calendar-body-day-content";
import CalendarBodyDayCalendar from "../day/calendar-body-day-calendar";
import CalendarBodyWeekEvents from "./calendar-body-week-events";
import CalendarBodyMarginDayMargin from "../day/calendar-body-margin-day-margin";
import { CalendarWeekTimeGrid } from "./calendar-week-time-grid";
import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { TZDate, tz } from "@date-fns/tz";
import { enUS, es, ptBR } from "date-fns/locale";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { buildCompressedDayTimeScale } from "../../calendar-time-scale";

const localeMap = {
  en: enUS,
  es,
  "pt-BR": ptBR,
} as const;

export default function CalendarBodyWeek() {
  const {
    date,
    events,
    setDate,
    scheduleStartMinutes,
    scheduleEndMinutes,
    displayTimeZone,
    isStudent,
  } = useCalendarContext();
  const locale = useLocale();
  const dateLocale = localeMap[locale as keyof typeof localeMap] || enUS;
  const dateContext = { in: tz(displayTimeZone) };
  const weekStart = startOfWeek(date, {
    weekStartsOn: 1,
    ...dateContext,
  });
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index, dateContext),
  );
  const selectedDayEvents = events.filter((event) =>
    isSameDay(event.start, date, dateContext),
  );
  const responsiveTimeScale = isStudent
    ? buildCompressedDayTimeScale({
        events: selectedDayEvents,
        startMinutes: scheduleStartMinutes,
        endMinutes: scheduleEndMinutes,
      })
    : undefined;

  return (
    <div className="flex h-full divide-x overflow-hidden">
      <CalendarWeekTimeGrid
        className="hidden lg:flex"
        date={date}
        startMinutes={scheduleStartMinutes}
        endMinutes={scheduleEndMinutes}
        displayTimeZone={displayTimeZone}
        renderDayAction={(day) => (
          <CalendarBodyDayContent date={day} compactEvents />
        )}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-sidebar lg:hidden">
        <div className="shrink-0 bg-sidebar">
          <div className="grid grid-cols-7 divide-x border-b">
            {weekDays.map((day) => {
              const isSelected = isSameDay(day, date, dateContext);
              const isCurrentDay = isSameDay(
                day,
                TZDate.tz(displayTimeZone),
                dateContext,
              );
              const dayEvents = events.filter((event) =>
                isSameDay(event.start, day, dateContext),
              );

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  aria-pressed={isSelected}
                  className={cn(
                    "flex min-w-0 flex-col items-center px-1 py-2 text-center transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    isSelected
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/60",
                  )}
                  onClick={() => setDate(day)}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wide">
                    {format(day, "EEE", {
                      locale: dateLocale,
                      ...dateContext,
                    })}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 text-xl font-bold leading-none text-foreground",
                      isSelected && "text-primary",
                    )}
                  >
                    {format(day, "d", {
                      locale: dateLocale,
                      ...dateContext,
                    })}
                  </span>
                  <span
                    className={cn(
                      "mt-1 h-1.5 w-1.5 rounded-full",
                      dayEvents.length
                        ? "bg-primary"
                        : isCurrentDay
                          ? "bg-muted-foreground/40"
                          : "bg-transparent",
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [--calendar-hour-height:4rem] xl:[--calendar-hour-height:5rem] 2xl:[--calendar-hour-height:6rem]">
          <div className="relative flex min-h-full">
            <CalendarBodyMarginDayMargin
              className="pt-3"
              startMinutes={scheduleStartMinutes}
              endMinutes={scheduleEndMinutes}
              timeScale={responsiveTimeScale}
              showHeader={false}
            />
            <CalendarBodyDayContent
              date={date}
              events={selectedDayEvents}
              timeScale={responsiveTimeScale}
              surfaceClassName="pt-3"
              compactEvents
              floatingEventTime
              showHeader={false}
            />
          </div>
        </div>
      </div>
      <div className="hidden w-64 flex-col divide-y overflow-hidden lg:flex">
        <CalendarBodyDayCalendar />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <CalendarBodyWeekEvents />
        </div>
      </div>
    </div>
  );
}
