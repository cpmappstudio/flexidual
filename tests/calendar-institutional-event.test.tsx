import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TZDate } from "@date-fns/tz";
import { afterEach, expect, test, vi } from "vitest";
import CalendarProvider from "@/components/calendar/calendar-provider";
import CalendarEvent from "@/components/calendar/calendar-event";
import { useCalendarContext } from "@/components/calendar/calendar-context";
import type {
  InstitutionalCalendarEvent,
  Mode,
} from "@/components/calendar/calendar-types";
import type { Id } from "@/convex/_generated/dataModel";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/image", () => ({
  default: ({ src }: { src: string }) => <span data-image-src={src} />,
}));
afterEach(cleanup);

const start = Date.parse("2030-10-23T23:30:00-05:00");
const event: InstitutionalCalendarEvent = {
  kind: "event",
  id: "occurrence-1",
  eventId: "event-1" as Id<"events">,
  occurrenceId: "occurrence-1" as Id<"eventOccurrences">,
  schoolId: "school-1" as Id<"schools">,
  title: "Evening assembly",
  start: new TZDate(start, "America/Bogota"),
  end: new TZDate(start + 60 * 60_000, "America/Bogota"),
  actualStart: start,
  actualEnd: start + 60 * 60_000,
  timeZone: "America/Bogota",
  color: "amber",
  status: "scheduled",
  isLive: false,
  sessionType: "live",
  roomName: "event-room",
  teacherIds: [],
  responsibleName: "Professor A",
  canManage: false,
  canEdit: false,
  canCancelOccurrence: false,
};

function WindowProbe() {
  const {
    scheduleStartMinutes,
    scheduleEndMinutes,
    selectedEvent,
    manageEventDialogOpen,
  } = useCalendarContext();
  return (
    <>
      <span data-testid="window">
        {scheduleStartMinutes}-{scheduleEndMinutes}
      </span>
      <span data-testid="selection">
        {manageEventDialogOpen ? selectedEvent?.id : ""}
      </span>
    </>
  );
}

for (const mode of ["day", "week"] as Mode[]) {
  test(`${mode} view keeps an event outside academic hours visible and selectable`, () => {
    const view = render(
      <CalendarProvider
        events={[event]}
        mode={mode}
        setMode={vi.fn()}
        date={event.start}
        setDate={vi.fn()}
        scheduleStartMinutes={8 * 60}
        scheduleEndMinutes={17 * 60}
        schedulingTimeZone="America/Bogota"
        displayTimeZone="America/Bogota"
        isUsingLocalTime={false}
      >
        <WindowProbe />
        <CalendarEvent event={event} />
      </CalendarProvider>,
    );
    expect(screen.getByTestId("window").textContent).toBe("480-1440");
    expect(screen.getByText("Evening assembly")).toBeTruthy();
    expect(
      view.container.querySelector(
        '[data-image-src="/event-calendar-star.svg"]',
      ),
    ).toBeTruthy();
    fireEvent.click(view.container.querySelector(".calendar-event-card")!);
    expect(
      view.container
        .querySelector(".calendar-event-card")
        ?.getAttribute("style"),
    ).toContain("15.5");
    expect(screen.getByTestId("selection").textContent).toBe("occurrence-1");
  });
}
