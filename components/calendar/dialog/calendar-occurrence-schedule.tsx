import { CalendarDays, Clock3, type LucideIcon } from "lucide-react";

export function CalendarOccurrenceSchedule({
  start,
  end,
  locale,
  timeZone,
  minutesLabel,
  showDuration = true,
  showTimeZone = false,
  details = [],
}: {
  start: number;
  end: number;
  locale: string;
  timeZone: string;
  minutesLabel: string;
  showDuration?: boolean;
  showTimeZone?: boolean;
  details?: { label: string; value: string; icon: LucideIcon }[];
}) {
  const date = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(start);
  const timeFormat = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  const duration = Math.round((end - start) / 60_000);

  return (
    <div className="divide-y divide-border/70 border-y border-border/70 text-sm">
      {details.map(({ label, value, icon: Icon }) => (
        <div key={label} className="flex min-w-0 items-center gap-3 py-3">
          <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 break-words font-semibold text-foreground">
            <span className="sr-only">{label}: </span>
            {value}
          </span>
        </div>
      ))}
      <div className="flex min-w-0 items-center gap-3 py-3">
        <CalendarDays
          className="size-5 shrink-0 text-primary"
          aria-hidden="true"
        />
        <p className="font-semibold text-foreground">{date}</p>
      </div>
      <div className="flex min-w-0 items-center gap-3 py-3">
        <Clock3 className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <p className="font-semibold text-foreground">
          {timeFormat.format(start)} - {timeFormat.format(end)}
          {showDuration && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({duration} {minutesLabel})
            </span>
          )}
          {showTimeZone && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {timeZone}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

export function CalendarCancellationSummary({
  title,
  start,
  end,
  locale,
  timeZone,
}: {
  title: string;
  start: number;
  end: number;
  locale: string;
  timeZone: string;
}) {
  const date = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(start);
  const timeFormat = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });

  return (
    <div className="rounded-md border bg-muted/40 p-3 text-left">
      <p className="font-semibold text-foreground">{title}</p>
      <div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <CalendarDays
            className="size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          <span>{date}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock3 className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            {timeFormat.format(start)} - {timeFormat.format(end)}
          </span>
        </div>
      </div>
    </div>
  );
}
