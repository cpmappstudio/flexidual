"use client";

import { createContext, useContext } from "react";
import { CalendarContextType } from "./calendar-types";

export const CalendarContext = createContext<CalendarContextType | undefined>(
  undefined,
);

export function useOptionalCalendarContext() {
  return useContext(CalendarContext);
}

export function useCalendarContext() {
  const context = useOptionalCalendarContext();
  if (!context) {
    throw new Error(
      "useCalendarContext must be used within a CalendarProvider",
    );
  }
  return context;
}
