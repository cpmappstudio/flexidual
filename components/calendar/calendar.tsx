"use client";

import CalendarHeader from "./header/calendar-header";
import CalendarBody from "./body/calendar-body";
import CalendarHeaderActions from "./header/actions/calendar-header-actions";
import CalendarHeaderDate from "./header/date/calendar-header-date";
import CalendarHeaderActionsMode from "./header/actions/calendar-header-actions-mode";
import CalendarHeaderFilters, {
  type CalendarHeaderFiltersProps,
} from "./header/filters/calendar-header-filters";

export default function Calendar({
  filters,
}: {
  filters: CalendarHeaderFiltersProps;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <CalendarHeader>
        <CalendarHeaderDate />
        <CalendarHeaderActions>
          <CalendarHeaderActionsMode />
          <CalendarHeaderFilters {...filters} />
        </CalendarHeaderActions>
      </CalendarHeader>
      <div className="mt-2 min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-sidebar">
        <CalendarBody />
      </div>
    </div>
  );
}
