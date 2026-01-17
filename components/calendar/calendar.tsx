"use client";

import { CalendarProps } from "./calendar-types";
import CalendarHeader from "./header/calendar-header";
import CalendarBody from "./body/calendar-body";
import CalendarHeaderActions from "./header/actions/calendar-header-actions";
import CalendarHeaderDate from "./header/date/calendar-header-date";
import CalendarHeaderActionsMode from "./header/actions/calendar-header-actions-mode";
import CalendarHeaderActionsAdd from "./header/actions/calendar-header-actions-add";
import CalendarHeaderTeacherFilter from "./header/filters/calendar-header-teacher-filter";

// NOTE: Provider is now handled by the parent Page for better state sharing
export default function Calendar({
  // Props are now essentially unused here as they come from Context, 
  // but kept for compatibility if passed explicitly
}: CalendarProps) {
  return (
    <div className="flex flex-col h-full gap-4">
      <CalendarHeader>
        <CalendarHeaderDate />
        <CalendarHeaderActions>
          <CalendarHeaderTeacherFilter />
          <CalendarHeaderActionsMode />
          <CalendarHeaderActionsAdd />
        </CalendarHeaderActions>
      </CalendarHeader>
      <div className="flex-1 overflow-hidden min-h-0">
         <CalendarBody />
      </div>
    </div>
  );
}