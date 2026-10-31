export function getEventScheduleTimeIssue(
  start: string,
  end: string,
  windowStart: number,
  windowEnd: number,
) {
  const localDateTime = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})$/;
  const startMatch = localDateTime.exec(start);
  const endMatch = localDateTime.exec(end);
  if (!startMatch || !endMatch) return "invalidTime";
  if (end <= start) return "endBeforeStart";
  if (start.slice(0, 10) !== end.slice(0, 10)) return "differentDay";

  const startMinutes = Number(startMatch[1]) * 60 + Number(startMatch[2]);
  const endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2]);
  if (startMinutes < windowStart || endMinutes > windowEnd)
    return "outsideWindow";
  return null;
}
