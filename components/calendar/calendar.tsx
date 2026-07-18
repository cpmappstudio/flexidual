"use client";

import { CalendarProps } from "./calendar-types";
import CalendarHeader from "./header/calendar-header";
import CalendarBody from "./body/calendar-body";
import CalendarHeaderActions from "./header/actions/calendar-header-actions";
import CalendarHeaderDate from "./header/date/calendar-header-date";
import CalendarHeaderActionsMode from "./header/actions/calendar-header-actions-mode";
import CalendarHeaderActionsAdd from "./header/actions/calendar-header-actions-add";
import CalendarHeaderCombinedFilter from "./header/filters/calendar-header-combined-filter";

export default function Calendar({}: CalendarProps) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <CalendarHeader>
        <CalendarHeaderDate />
        <CalendarHeaderActions>
          <CalendarHeaderActionsMode />
          <CalendarHeaderCombinedFilter />
          <CalendarHeaderActionsAdd />
        </CalendarHeaderActions>
      </CalendarHeader>
      <div className="mt-2 min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
        <CalendarBody />
      </div>
    </div>
  );
}