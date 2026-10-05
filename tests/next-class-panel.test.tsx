import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  NextClassPanel,
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
  const { rerender } = render(<NextClassPanel nextClass={null} currentTime={now} />);
  expect(screen.getByText("student.today.noClasses")).toBeTruthy();
  expect(screen.getByText("student.today.encouragement.recharge")).toBeTruthy();

  random.mockReturnValue(0);
  rerender(<NextClassPanel nextClass={null} currentTime={now + 1000} />);
  expect(screen.getByText("student.today.encouragement.recharge")).toBeTruthy();

  rerender(<NextClassPanel nextClass={lesson} currentTime={now} />);
  expect(screen.getByText(lesson.title)).toBeTruthy();
  expect(screen.queryByText(/student.today.encouragement/)).toBeNull();
  expect(screen.queryByText("student.today.noClasses")).toBeNull();

  rerender(<NextClassPanel nextClass={null} currentTime={now} />);
  expect(screen.getByText("student.today.encouragement.smallSteps")).toBeTruthy();
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
