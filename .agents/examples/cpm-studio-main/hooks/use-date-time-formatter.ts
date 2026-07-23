import { useMemo } from "react";

const DATE_FORMAT_OPTIONS = {
  dateStyle: "medium",
} satisfies Intl.DateTimeFormatOptions;

const DATE_TIME_FORMAT_OPTIONS = {
  dateStyle: "medium",
  timeStyle: "short",
} satisfies Intl.DateTimeFormatOptions;

export function useDateTimeFormatter(
  locale: string,
  style: "date" | "dateTime" = "dateTime",
) {
  return useMemo(
    () =>
      new Intl.DateTimeFormat(
        locale,
        style === "date" ? DATE_FORMAT_OPTIONS : DATE_TIME_FORMAT_OPTIONS,
      ),
    [locale, style],
  );
}
