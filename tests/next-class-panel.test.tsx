import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  NextClassPanel,
  type NextClassPanelItem,
} from "@/components/schedule/next-class-panel";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
afterEach(cleanup);

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
