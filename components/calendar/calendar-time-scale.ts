import { CalendarEvent } from "./calendar-types";

export type CalendarTimeScale = {
  segments: {
    startMinutes: number;
    endMinutes: number;
    units: number;
  }[];
  totalUnits: number;
};

const EMPTY_HOUR_UNITS = 0.35;

export function getDateMinutes(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

export function buildCompressedDayTimeScale({
  events,
  startMinutes,
  endMinutes,
}: {
  events: CalendarEvent[];
  startMinutes: number;
  endMinutes: number;
}): CalendarTimeScale {
  const segments: CalendarTimeScale["segments"] = [];
  let current = startMinutes;

  while (current < endMinutes) {
    const nextHour = (Math.floor(current / 60) + 1) * 60;
    const segmentEnd = Math.min(nextHour, endMinutes);
    const hasEvent = events.some((event) => {
      const eventStart = getDateMinutes(event.start);
      const eventEnd = getDateMinutes(event.end);
      return eventStart < segmentEnd && eventEnd > current;
    });

    segments.push({
      startMinutes: current,
      endMinutes: segmentEnd,
      units: hasEvent
        ? (segmentEnd - current) / 60
        : ((segmentEnd - current) / 60) * EMPTY_HOUR_UNITS,
    });
    current = segmentEnd;
  }

  return {
    segments,
    totalUnits: segments.reduce((total, segment) => total + segment.units, 0),
  };
}

export function getTimeScaleUnitsAt(scale: CalendarTimeScale, minute: number) {
  let units = 0;

  for (const segment of scale.segments) {
    if (minute >= segment.endMinutes) {
      units += segment.units;
      continue;
    }

    if (minute <= segment.startMinutes) return units;

    const segmentDuration = segment.endMinutes - segment.startMinutes;
    return (
      units +
      ((minute - segment.startMinutes) / segmentDuration) * segment.units
    );
  }

  return units;
}

export function getTimeScalePercent(scale: CalendarTimeScale, minute: number) {
  if (scale.totalUnits <= 0) return 0;
  return (getTimeScaleUnitsAt(scale, minute) / scale.totalUnits) * 100;
}
