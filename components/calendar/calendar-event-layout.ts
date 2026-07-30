export type CalendarEventInterval = {
  id: string;
  start: Date;
  end: Date;
};

export type CalendarEventColumnLayout = {
  columnIndex: number;
  columnCount: number;
};

function isSameCalendarDay(first: Date, second: Date) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

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

export function getCalendarEventColumnLayout(
  event: CalendarEventInterval,
  allEvents: CalendarEventInterval[],
): CalendarEventColumnLayout {
  const dayEvents = allEvents
    .filter(
      (candidate) =>
        candidate.end > candidate.start &&
        isSameCalendarDay(event.start, candidate.start),
    )
    .sort(compareIntervals);

  let cluster: CalendarEventInterval[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  for (const candidate of dayEvents) {
    if (cluster.length > 0 && candidate.start.getTime() >= clusterEnd) {
      if (cluster.some((item) => item.id === event.id)) break;
      cluster = [];
      clusterEnd = Number.NEGATIVE_INFINITY;
    }

    cluster.push(candidate);
    clusterEnd = Math.max(clusterEnd, candidate.end.getTime());
  }

  if (!cluster.some((item) => item.id === event.id)) {
    return { columnIndex: 0, columnCount: 1 };
  }

  const columnEnds: number[] = [];
  const columnByEvent = new Map<string, number>();

  for (const candidate of cluster) {
    const reusableColumn = columnEnds.findIndex(
      (end) => end <= candidate.start.getTime(),
    );
    const columnIndex =
      reusableColumn === -1 ? columnEnds.length : reusableColumn;

    columnEnds[columnIndex] = candidate.end.getTime();
    columnByEvent.set(candidate.id, columnIndex);
  }

  return {
    columnIndex: columnByEvent.get(event.id) ?? 0,
    columnCount: Math.max(columnEnds.length, 1),
  };
}
