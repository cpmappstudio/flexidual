import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import Link from "next/link";
import {
  NextClassPanel,
  NextClassPreview,
  type NextClassPanelItem,
} from "@/components/schedule/next-class-panel";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const now = Date.UTC(2026, 8, 7, 16, 22);
const lesson: NextClassPanelItem = {
  id: "literature-8",
  title: "Literature 8",
  start: Date.UTC(2026, 8, 7, 16),
  end: Date.UTC(2026, 8, 7, 16, 40),
  sessionType: "live",
  status: "scheduled",
  isLive: false,
};

test("empty panels show a stable random encouragement without affecting classes", () => {
  const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
  const { rerender, container } = render(
    <NextClassPanel nextClass={null} currentTime={now} />,
  );
  expect(screen.getByText("student.today.noClasses")).toBeTruthy();
  expect(screen.getByText("student.today.encouragement.recharge")).toBeTruthy();
  expect(container.querySelector('img[src*="reading.png"]')).toBeTruthy();

  random.mockReturnValue(0);
  rerender(<NextClassPanel nextClass={null} currentTime={now + 1000} />);
  expect(screen.getByText("student.today.encouragement.recharge")).toBeTruthy();

  rerender(<NextClassPanel nextClass={lesson} currentTime={now} />);
  expect(screen.getByText(lesson.title)).toBeTruthy();
  expect(screen.queryByText(/student.today.encouragement/)).toBeNull();
  expect(screen.queryByText("student.today.noClasses")).toBeNull();
  expect(container.querySelector('img[src*="reading.png"]')).toBeNull();

  rerender(<NextClassPanel nextClass={null} currentTime={now} />);
  expect(
    screen.getByText("student.today.encouragement.smallSteps"),
  ).toBeTruthy();
});

test("the panel follows broadcast state through start and early closure", () => {
  const { rerender } = render(
    <NextClassPanel nextClass={lesson} currentTime={now} />,
  );
  expect(screen.queryByText("student.liveNow")).toBeNull();
  expect(screen.getByText("classroom.notLive")).toBeTruthy();
  rerender(
    <NextClassPanel
      nextClass={{ ...lesson, status: "active", isLive: true }}
      currentTime={now}
    />,
  );
  expect(screen.getByText("student.liveNow")).toBeTruthy();
  rerender(
    <NextClassPanel
      nextClass={{ ...lesson, status: "completed" }}
      currentTime={now}
    />,
  );
  expect(screen.queryByText("student.liveNow")).toBeNull();
});

test("upcoming sessions keep their own management action and prerecorded marker", () => {
  render(
    <NextClassPanel
      nextClass={lesson}
      currentTime={now}
      headerAction={<button>manage next</button>}
    >
      <NextClassPreview
        label="upcoming"
        items={[
          {
            id: "later",
            title: "Next lesson",
            meta: "Tomorrow",
            sessionType: "live",
            hasPrerecorded: true,
            action: <button>manage later</button>,
          },
          {
            id: "external",
            title: "Abeka lesson",
            meta: "Friday",
            sessionType: "abeka",
          },
        ]}
      />
    </NextClassPanel>,
  );
  expect(screen.getByRole("button", { name: "manage next" })).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "manage next" })
      .parentElement?.classList.contains("col-start-3"),
  ).toBe(true);
  expect(screen.getByRole("button", { name: "manage later" })).toBeTruthy();
  expect(screen.getByLabelText("available")).toBeTruthy();
  expect(screen.getByText("Abeka lesson")).toBeTruthy();
});

test("course previews highlight the date beside the class type without a repeated name", () => {
  render(
    <NextClassPreview
      label="upcoming"
      headerAction={
        <Link href="/campus/calendar?classId=course">Calendar</Link>
      }
      items={[
        {
          id: "later",
          meta: "Tue, Nov 3 at 11:00 AM",
          sessionType: "live",
          action: <button>upload video</button>,
        },
      ]}
    />,
  );
  const date = screen.getByText("Tue, Nov 3 at 11:00 AM");
  expect(date.classList.contains("font-bold")).toBe(true);
  expect(date.classList.contains("text-foreground")).toBe(true);
  expect(date.nextElementSibling?.getAttribute("data-slot")).toBe("badge");
  expect(screen.getAllByText("Tue, Nov 3 at 11:00 AM")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "upload video" })).toBeTruthy();
  const link = screen.getByRole("link", { name: "Calendar" });
  expect(link.parentElement?.textContent).toBe("upcomingCalendar");
});
