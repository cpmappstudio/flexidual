import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { AbekaCourseReport } from "@/components/abeka/abeka-course-report";
import messages from "@/messages/en.json";

afterEach(cleanup);

test.each([true, false])(
  "the shared report supports collapsible=%s and retains partial lesson progress",
  (collapsible) => {
    const { container } = render(
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
        <AbekaCourseReport
          collapsible={collapsible}
          timeZone="America/Bogota"
          report={{
            subjectName: "Pre-Algebra",
            syncedAt: Date.parse("2026-09-25T05:29:00Z"),
            lessons: [
              {
                lessonNumber: 9,
                percentage: 54,
                completed: false,
                lastViewed: "2026-09-17",
              },
            ],
          }}
        />
      </NextIntlClientProvider>,
    );
    if (collapsible) expect(container.querySelector("details")).not.toBeNull();
    else {
      expect(container.querySelector("details")).toBeNull();
      expect(
        screen.getByRole("heading", { name: /Pre-Algebra/ }),
      ).toBeDefined();
      expect(container.firstElementChild?.className).not.toContain("border");
    }
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.getByText("Pre-Algebra")).toBeDefined();
    expect(screen.getByText("54%")).toBeDefined();
    expect(screen.getByText("2026-09-17")).toBeDefined();
    expect(screen.getByText(/0 of 1/)).toBeDefined();
    expect(screen.getByText(/12:29/)).toBeDefined();
  },
);
