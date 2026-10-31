import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import CalendarProvider from "@/components/calendar/calendar-provider";
import { useCalendarContext } from "@/components/calendar/calendar-context";
import type { CalendarEvent } from "@/components/calendar/calendar-types";
import type { Id } from "@/convex/_generated/dataModel";

afterEach(cleanup);

test("the selected event retains its latest remote snapshot when it leaves the visible range", () => {
  const original = {
    id: "event",
    scheduleId: "schedule" as Id<"classSchedule">,
    title: "Original",
    start: new Date("2026-10-20T12:00Z"),
    end: new Date("2026-10-20T13:00Z"),
  } as CalendarEvent;
  function Selection() {
    const { selectedEvent, setSelectedEvent } = useCalendarContext();
    return (
      <>
        <button onClick={() => setSelectedEvent(original)}>Select</button>
        <p>{selectedEvent?.title}</p>
      </>
    );
  }
  function View({ events }: { events: CalendarEvent[] }) {
    return (
      <CalendarProvider
        events={events}
        mode="month"
        setMode={vi.fn()}
        date={original.start}
        setDate={vi.fn()}
        displayTimeZone="America/Bogota"
        schedulingTimeZone="America/Bogota"
        isUsingLocalTime={false}
      >
        <Selection />
      </CalendarProvider>
    );
  }
  const view = render(<View events={[original]} />);
  fireEvent.click(screen.getByRole("button", { name: "Select" }));
  expect(screen.getByText("Original")).toBeTruthy();
  const updated = { ...original, title: "Updated remotely" };
  view.rerender(<View events={[updated]} />);
  expect(screen.getByText("Updated remotely")).toBeTruthy();
  view.rerender(<View events={[]} />);
  expect(screen.getByText("Updated remotely")).toBeTruthy();
  expect(screen.queryByText("Original")).toBeNull();
});
