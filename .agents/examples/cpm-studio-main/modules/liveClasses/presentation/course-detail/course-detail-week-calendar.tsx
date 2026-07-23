import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  FlexidualCourse,
  FlexidualCourseWeekday,
} from "@/modules/liveClasses/lib/flexidual-course-types";

const WEEKDAY_ORDER: readonly FlexidualCourseWeekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
];

type CourseDetailWeekCalendarProps = {
  sessions: FlexidualCourse["sessions"]["weeklySchedule"];
  getDayLabel: (weekday: FlexidualCourseWeekday) => string;
  emptyLabel: string;
};

function parseTimeLabel(timeLabel: string) {
  const [startRaw] = timeLabel.split(" - ");
  const [hours, minutes] = startRaw.split(":").map(Number);

  return hours * 60 + minutes;
}

export function FlexidualCourseDetailWeekCalendar({
  sessions,
  getDayLabel,
  emptyLabel,
}: CourseDetailWeekCalendarProps) {
  const sessionsByDay = WEEKDAY_ORDER.map((weekday) => ({
    weekday,
    sessions: sessions
      .filter((session) => session.weekday === weekday)
      .toSorted((left, right) => {
        return parseTimeLabel(left.timeLabel) - parseTimeLabel(right.timeLabel);
      }),
  }));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[56rem]">
        <div className="grid grid-cols-5 gap-3">
          {sessionsByDay.map((day) => (
            <section
              key={day.weekday}
              aria-labelledby={`week-calendar-${day.weekday}`}
              className="min-w-0 rounded-[1.25rem] border border-border/60 bg-background/88"
            >
              <header className="border-b border-border/60 px-3 py-3">
                <h3
                  id={`week-calendar-${day.weekday}`}
                  className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-muted-foreground"
                >
                  {getDayLabel(day.weekday)}
                </h3>
              </header>

              <div className="flex min-h-56 flex-col gap-3 p-3">
                {day.sessions.length > 0 ? (
                  day.sessions.map((session) => (
                    <article
                      key={session.id}
                      className={cn(
                        "overflow-hidden rounded-[1rem] border px-3 py-3 shadow-sm",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{session.sessionType}</Badge>
                        <span className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                          {session.timeLabel}
                        </span>
                      </div>
                      <h4 className="mt-3 text-sm font-semibold tracking-tight text-balance text-foreground">
                        {session.title}
                      </h4>
                      <p className="mt-2 text-sm leading-5 text-muted-foreground">
                        {session.lessonLabel}
                      </p>
                    </article>
                  ))
                ) : (
                  <div className="rounded-[1rem] border border-dashed border-border/70 bg-background/55 px-3 py-5 text-sm text-muted-foreground">
                    {emptyLabel}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
