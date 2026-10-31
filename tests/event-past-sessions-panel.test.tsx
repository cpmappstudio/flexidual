import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { EventPastSessionsPanel } from "@/components/events/event-past-sessions-panel";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Session = ComponentProps<
  typeof EventPastSessionsPanel
>["sessions"][number];

const session = (
  id: string,
  start: number,
  hasRecording: boolean,
  recordingFailed = false,
): Session => ({
  _id: id as Session["_id"],
  eventId: "event-id" as Session["eventId"],
  start,
  end: start + 30 * 60_000,
  status: "completed",
  cancellationReason: undefined,
  roomName: id,
  hasRecording,
  recordingFailed,
});

test("event carousel shows each date once and opens its recording", () => {
  const onWatchRecording = vi.fn();
  const onLoadMore = vi.fn();
  const props = {
    timeZone: "UTC",
    onWatchRecording,
    canLoadMore: true,
    onLoadMore,
  };
  const view = render(
    <EventPastSessionsPanel
      {...props}
      sessions={[
        session("newest", 3_000_000, true),
        session("oldest", 1_000_000, false),
      ]}
    />,
  );

  const cards = screen
    .getAllByRole("button")
    .filter((button) => button.hasAttribute("aria-pressed"));
  expect(cards[0].textContent).toContain("12:16 AM");
  expect(cards[1].textContent).toContain("12:50 AM");
  expect(screen.getAllByText(/12:50 AM/)).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "viewDate" })).toBeNull();
  expect(screen.queryByText("completed")).toBeNull();
  expect(cards[1].getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "watch" }));
  expect(onWatchRecording).toHaveBeenCalledWith(
    expect.objectContaining({ _id: "newest" }),
  );

  fireEvent.click(cards[0]);
  expect(cards[0].getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("noRecordings")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "loadMore" }));
  expect(onLoadMore).toHaveBeenCalledOnce();
  view.rerender(
    <EventPastSessionsPanel
      {...props}
      sessions={[
        session("newest", 3_000_000, true),
        session("oldest", 1_000_000, false),
        session("earlier", 500_000, false),
      ]}
    />,
  );
  expect(
    screen
      .getAllByRole("button")
      .find((button) => button.getAttribute("aria-pressed") === "true")
      ?.textContent,
  ).toContain("12:16 AM");
});

test("a failed event recording is identified instead of appearing unrecorded", () => {
  render(
    <EventPastSessionsPanel
      sessions={[session("failed", 1_000_000, false, true)]}
      timeZone="UTC"
      onWatchRecording={vi.fn()}
      canLoadMore={false}
      onLoadMore={vi.fn()}
    />,
  );

  expect(screen.getByText("recordingFailed")).toBeTruthy();
  expect(screen.queryByText("noRecordings")).toBeNull();
});
