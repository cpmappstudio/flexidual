"use client";

import CalendarHeader from "./header/calendar-header";
import CalendarBody from "./body/calendar-body";
import CalendarHeaderActions from "./header/actions/calendar-header-actions";
import CalendarHeaderDate from "./header/date/calendar-header-date";
import CalendarHeaderActionsMode from "./header/actions/calendar-header-actions-mode";
import CalendarHeaderFilters, {
  type CalendarHeaderFiltersProps,
} from "./header/filters/calendar-header-filters";
import type { ReactNode } from "react";
import type { CalendarClosureSummary } from "./calendar-closure-types";

export default function Calendar({
  filters,
  isStudent = false,
  headerAction,
  closures = [],
}: {
  filters: CalendarHeaderFiltersProps;
  isStudent?: boolean;
  headerAction?: ReactNode;
  closures?: CalendarClosureSummary[];
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <CalendarHeader>
        <CalendarHeaderDate />
        <CalendarHeaderActions>
          <CalendarHeaderActionsMode isStudent={isStudent} />
          {headerAction}
        </CalendarHeaderActions>
      </CalendarHeader>
      <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-sidebar">
        <div className="shrink-0 border-b bg-sidebar px-2 py-2 sm:px-3">
          <CalendarHeaderFilters {...filters} />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <CalendarBody closures={closures} />
        </div>
      </div>
    </div>
  );
}
