import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { ScheduleItem } from "@/components/schedule/schedule-item";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: { platform?: string }) =>
    values?.platform ? `${key}:${values.platform}` : key,
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "campus" }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}));

afterEach(cleanup);

const baseSchedule = {
  scheduleId: "schedule" as Id<"classSchedule">,
  classId: "class" as Id<"classes">,
  title: "Geography",
  start: Date.UTC(2026, 8, 10, 14),
  end: Date.UTC(2026, 8, 10, 15),
  roomName: "geography-room",
  status: "scheduled" as const,
  timeZone: "UTC",
};

test.each([
  ["ignitia", "Ignitia", "centralpointefl.ignitiaschools.com"],
  ["abeka", "Abeka", "login.abeka.com"],
] as const)(
  "%s schedule actions open the provider in a new tab",
  (sessionType, platform, hostname) => {
    render(
      <ScheduleItem
        schedule={{ ...baseSchedule, sessionType }}
        showDate={false}
        showEdit={false}
        variant="classSession"
      />,
    );

    const link = screen.getByRole("link", {
      name: `schedule.openPlatform:${platform}`,
    });
    expect(new URL(link.getAttribute("href")!).hostname).toBe(hostname);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  },
);

test("standard schedule actions keep internal navigation", () => {
  render(
    <ScheduleItem
      schedule={{ ...baseSchedule, sessionType: "live" }}
      showDate={false}
      showEdit={false}
      variant="classSession"
    />,
  );

  const link = screen.getByRole("link", { name: "classroom.prepareRoom" });
  expect(link.getAttribute("href")).toBe("/campus/classroom/geography-room");
  expect(link.getAttribute("target")).toBeNull();
});
