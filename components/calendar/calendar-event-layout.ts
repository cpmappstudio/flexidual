import { format } from "date-fns";
import { tz } from "@date-fns/tz";

export type CalendarEventInterval = {
  id: string;
  start: Date;
  end: Date;
};

export function getCalendarEventDayKey(date: Date, timeZone: string) {
  return format(date, "yyyy-MM-dd", { in: tz(timeZone) });
}

export function groupCalendarEventsByDay<T extends CalendarEventInterval>(
  events: readonly T[],
  timeZone: string,
) {
  const groups = new Map<string, T[]>();
  for (const event of events) {
    const key = getCalendarEventDayKey(event.start, timeZone);
    const dayEvents = groups.get(key);
    if (dayEvents) dayEvents.push(event);
    else groups.set(key, [event]);
  }
  for (const dayEvents of groups.values()) dayEvents.sort(compareIntervals);
  return groups;
}

export type CalendarEventColumnLayout = {
  columnIndex: number;
  columnCount: number;
};

function compareIntervals(
  first: CalendarEventInterval,
  second: CalendarEventInterval,
) {
  return (
    first.start.getTime() - second.start.getTime() ||
    first.end.getTime() - second.end.getTime() ||
    first.id.localeCompare(second.id)
  );
}

function getCalendarDayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function assignClusterLayouts(
  cluster: CalendarEventInterval[],
  layouts: Map<string, CalendarEventColumnLayout>,
) {
  const columnEnds: number[] = [];
  const columnByEvent = new Map<string, number>();

  for (const event of cluster) {
    const reusableColumn = columnEnds.findIndex(
      (end) => end <= event.start.getTime(),
    );
    const columnIndex =
      reusableColumn === -1 ? columnEnds.length : reusableColumn;

    columnEnds[columnIndex] = event.end.getTime();
    columnByEvent.set(event.id, columnIndex);
  }

  const columnCount = Math.max(columnEnds.length, 1);
  for (const event of cluster) {
    layouts.set(event.id, {
      columnIndex: columnByEvent.get(event.id) ?? 0,
      columnCount,
    });
  }
}

export function getCalendarEventColumnLayouts(events: CalendarEventInterval[]) {
  const eventsByDay = new Map<string, CalendarEventInterval[]>();
  for (const event of events) {
    if (event.end <= event.start) continue;
    const key = getCalendarDayKey(event.start);
    const dayEvents = eventsByDay.get(key);
    if (dayEvents) dayEvents.push(event);
    else eventsByDay.set(key, [event]);
  }

  const layouts = new Map<string, CalendarEventColumnLayout>();
  for (const dayEvents of eventsByDay.values()) {
    dayEvents.sort(compareIntervals);
    let cluster: CalendarEventInterval[] = [];
    let clusterEnd = Number.NEGATIVE_INFINITY;

    for (const event of dayEvents) {
      if (cluster.length > 0 && event.start.getTime() >= clusterEnd) {
        assignClusterLayouts(cluster, layouts);
        cluster = [];
        clusterEnd = Number.NEGATIVE_INFINITY;
      }
      cluster.push(event);
      clusterEnd = Math.max(clusterEnd, event.end.getTime());
    }

    if (cluster.length > 0) assignClusterLayouts(cluster, layouts);
  }

  return layouts;
}

export function getMaxCalendarEventConcurrency(
  events: CalendarEventInterval[],
) {
  let maximum = 0;
  for (const layout of getCalendarEventColumnLayouts(events).values()) {
    maximum = Math.max(maximum, layout.columnCount);
  }
  return maximum;
}
