"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Mode, calendarModes } from "../../calendar-types";
import { useCalendarContext } from "../../calendar-context";
import { useTranslations } from "next-intl";

export default function CalendarHeaderActionsMode({
  isStudent = false,
}: {
  isStudent?: boolean;
}) {
  const { mode, setMode } = useCalendarContext();
  const t = useTranslations("calendar.modes");
  const modes = isStudent ? [...calendarModes].reverse() : calendarModes;

  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(value) => {
        if (value) setMode(value as Mode);
      }}
      className="gap-0 overflow-hidden rounded-md border bg-sidebar"
    >
      {modes.map((modeValue) => (
        <ToggleGroupItem
          key={modeValue}
          value={modeValue}
          className="h-9 min-w-16 rounded-none border-r px-3 capitalize last:border-r-0"
        >
          {t(modeValue)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
