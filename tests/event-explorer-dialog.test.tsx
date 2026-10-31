import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { EventExplorerDialog } from "@/components/events/event-explorer-dialog";

const state = vi.hoisted(() => ({
  search: "",
  calls: 0,
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/hooks/use-debounced-value", () => ({
  useDebouncedValue: (value: string) => value,
}));
vi.mock("@/hooks/use-event-directory", () => ({
  useEventDirectory: (_orgSlug: string, search: string) => {
    state.calls++;
    state.search = search;
    return {
      context: {},
      org: {},
      results: [
        {
          _id: "first",
          title: "Devotional",
          campusName: "Campus",
          timeZone: "America/Bogota",
          nextOccurrenceStart: null,
        },
        {
          _id: "second",
          title: "Flag ceremony",
          campusName: "Campus",
          timeZone: "America/Bogota",
          nextOccurrenceStart: null,
        },
      ],
      status: "Exhausted",
      loadMore: vi.fn(),
    };
  },
}));
vi.mock("@/components/events/event-detail", () => ({
  EventDetail: ({
    eventId,
    focusRecordings,
    recordingId,
  }: {
    eventId: string;
    focusRecordings: boolean;
    recordingId?: string | null;
  }) => (
    <div>
      <span data-testid="selected-event">
        {eventId}:{focusRecordings ? "recordings" : "sessions"}
      </span>
      <span data-testid="selected-recording">{recordingId}</span>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  state.search = "";
  state.calls = 0;
});

test("calendar dialog shows the list and switches its detail without navigation", () => {
  const onOpenChange = vi.fn();
  const view = render(
    <EventExplorerDialog
      open={false}
      onOpenChange={onOpenChange}
      orgSlug="school-a"
    />,
  );
  expect(state.calls).toBe(0);
  view.rerender(
    <EventExplorerDialog open onOpenChange={onOpenChange} orgSlug="school-a" />,
  );
  expect(screen.getByTestId("selected-event").textContent).toBe(
    "first:sessions",
  );
  expect(
    screen.getByRole("button", { name: /Devotional/ }).className,
  ).toContain("border-l-primary");
  fireEvent.click(screen.getByRole("button", { name: /Flag ceremony/ }));
  expect(screen.getByTestId("selected-event").textContent).toBe(
    "second:sessions",
  );
  expect(
    screen
      .getByRole("button", { name: /Flag ceremony/ })
      .getAttribute("aria-current"),
  ).toBe("true");
  expect(
    screen
      .getByRole("button", { name: /Devotional/ })
      .getAttribute("aria-current"),
  ).toBeNull();
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Devotional" },
  });
  expect(state.search).toBe("Devotional");
  expect(screen.getByTestId("selected-event").textContent).toBe(
    "first:sessions",
  );
  expect(screen.getByRole("dialog").className).toContain("h-dvh");
  expect(screen.queryByRole("button", { name: "restoreExplorer" })).toBeNull();
  expect(screen.queryByRole("button", { name: "expandExplorer" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "closeExplorer" }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("a date can open the dialog with its event selected", () => {
  render(
    <EventExplorerDialog
      open
      onOpenChange={vi.fn()}
      orgSlug="school-a"
      initialEventId={"second" as Id<"events">}
      focusRecordings
      recordingId={"recording-2" as Id<"recordings">}
    />,
  );
  expect(screen.getByTestId("selected-event").textContent).toBe(
    "second:recordings",
  );
  expect(screen.getByTestId("selected-recording").textContent).toBe(
    "recording-2",
  );
  fireEvent.click(screen.getByRole("button", { name: /Devotional/ }));
  expect(screen.getByTestId("selected-event").textContent).toBe(
    "first:sessions",
  );
  expect(screen.getByTestId("selected-recording").textContent).toBe("");
});

test("a new notification link selects its event while the explorer is open", () => {
  const view = render(
    <EventExplorerDialog
      open
      onOpenChange={vi.fn()}
      orgSlug="school-a"
      initialEventId={"first" as Id<"events">}
    />,
  );
  view.rerender(
    <EventExplorerDialog
      open
      onOpenChange={vi.fn()}
      orgSlug="school-a"
      initialEventId={"second" as Id<"events">}
      focusRecordings
    />,
  );
  expect(screen.getByTestId("selected-event").textContent).toBe(
    "second:recordings",
  );
});
