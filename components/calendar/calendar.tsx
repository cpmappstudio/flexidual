"use client";

import { CalendarProps } from "./calendar-types";
import CalendarHeader from "./header/calendar-header";
import CalendarBody from "./body/calendar-body";
import CalendarHeaderActions from "./header/actions/calendar-header-actions";
import CalendarHeaderDate from "./header/date/calendar-header-date";
import CalendarHeaderActionsMode from "./header/actions/calendar-header-actions-mode";
import CalendarHeaderActionsAdd from "./header/actions/calendar-header-actions-add";

export default function Calendar({}: CalendarProps) {
  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-h-[800px]">
      <CalendarHeader>
        <CalendarHeaderDate />
        <CalendarHeaderActions>
          <CalendarHeaderActionsMode />
          <CalendarHeaderActionsAdd />
        </CalendarHeaderActions>
      </CalendarHeader>
      <div className="flex-1 min-h-0 overflow-hidden">
        <CalendarBody />
      </div>
    </div>
  );
}