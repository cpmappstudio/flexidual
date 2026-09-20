import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/classroom/session-record", () => ({
  useSessionRecord: (scheduleId: string) => ({
    state: "completed",
    scheduleId,
    staffDetails: null,
  }),
  getSessionRecordings: () => [],
  SessionRecordView: ({ record }: { record: { scheduleId: string } }) => (
    <div>selected:{record.scheduleId}</div>
  ),
}));

vi.mock("@/components/classroom/session-closeout-dialog", () => ({
  SessionCloseoutDialog: () => null,
}));

vi.mock("@/components/recording-player-modal", () => ({
  RecordingPlayerModal: () => null,
}));

vi.mock("@/components/calendar/calendar-provider-badge", () => ({
  CalendarProviderBadge: () => null,
}));

vi.mock("@/components/calendar/calendar-provider-mark", () => ({
  CalendarProviderMark: () => null,
}));

import {
  type PastClassItem,
  PastClassesPanel,
} from "@/components/teaching/classes/past-classes-panel";

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
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

const session = (scheduleId: string, start: number): PastClassItem => ({
  scheduleId: scheduleId as PastClassItem["scheduleId"],
  title: scheduleId,
  start,
  end: start + 30 * 60 * 1000,
  timeZone: "UTC",
  roomName: scheduleId,
  sessionType: "live",
  recordState: "completed",
});

test("orders past classes from oldest to newest and initially selects the newest", () => {
  render(
    <PastClassesPanel
      sessions={[
        session("newest", Date.UTC(2026, 8, 18, 12, 30)),
        session("oldest", Date.UTC(2026, 8, 16, 10)),
        session("middle", Date.UTC(2026, 8, 17, 13, 10)),
      ]}
    />,
  );

  const sessionButtons = screen
    .getAllByRole("button")
    .filter((button) => button.hasAttribute("aria-pressed"));

  expect(sessionButtons).toHaveLength(3);
  expect(sessionButtons[0].textContent).toContain("Wed, Sep 16");
  expect(sessionButtons[1].textContent).toContain("Thu, Sep 17");
  expect(sessionButtons[2].textContent).toContain("Fri, Sep 18");
  expect(sessionButtons[2].getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("selected:newest")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "class.olderClasses" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "class.newerClasses" }),
  ).toBeTruthy();
});

test("keeps the class heading and shows provider access for external sessions", () => {
  const externalSession = session(
    "abeka-session",
    Date.UTC(2026, 8, 17, 13, 10),
  );

  render(
    <PastClassesPanel
      sessions={[
        {
          ...externalSession,
          title: "External geometry",
          sessionType: "abeka",
          recordState: "notApplicable",
        },
      ]}
    />,
  );

  expect(screen.getByText("External geometry")).toBeTruthy();
  expect(screen.getByText("class.externalClassManaged")).toBeTruthy();
  const providerLink = screen.getByRole("link", {
    name: "classroom.goToPlatform",
  });
  expect(providerLink.getAttribute("target")).toBe("_blank");
  expect(screen.queryByText("selected:abeka-session")).toBeNull();
});
