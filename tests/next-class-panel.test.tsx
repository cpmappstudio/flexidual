import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
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

test("event labels can reuse the panel without changing course defaults", () => {
  const view = render(<NextClassPanel nextClass={lesson} currentTime={now} />);
  expect(screen.getByText("student.nextClass:")).toBeTruthy();
  expect(screen.getByText("class.typeStandardShort")).toBeTruthy();

  view.rerender(
    <NextClassPanel
      nextClass={lesson}
      currentTime={now}
      heading="Next session"
      showProviderBadge={false}
    />,
  );
  expect(screen.getByText("Next session:")).toBeTruthy();
  expect(screen.queryByText("class.typeStandardShort")).toBeNull();
});

test("event previews can open a date while course previews remain plain text", () => {
  const item = {
    id: "date-1",
    title: "Monday, Nov 2",
    meta: "8:00 AM–10:00 AM",
    sessionType: "live" as const,
  };
  const onSelect = vi.fn();
  const view = render(<NextClassPreview label="Upcoming" items={[item]} />);
  expect(screen.queryByRole("button", { name: /Monday, Nov 2/ })).toBeNull();
  expect(screen.getByText("class.typeStandardShort")).toBeTruthy();

  view.rerender(
    <NextClassPreview
      label="Upcoming"
      items={[item]}
      showProviderBadge={false}
      onSelect={onSelect}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Monday, Nov 2/ }));
  expect(onSelect).toHaveBeenCalledWith(item);
  expect(screen.queryByText("class.typeStandardShort")).toBeNull();
});
