import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, test, vi } from "vitest";
import type { Doc } from "@/convex/_generated/dataModel";
import es from "@/messages/es.json";
import { CourseQuizDetail } from "@/components/teaching/classes/course-quiz-detail";

vi.mock("convex/react", () => ({ useQuery: () => ({ questions: [] }) }));
vi.mock("@/components/teaching/classes/course-quiz-student", () => ({
  CourseQuizStudent: () => <p>Student attempt</p>,
}));
afterEach(cleanup);

const task = {
  _id: "quiz",
  kind: "quiz",
  title: "Fracciones",
  releasedAt: 1,
  quiz: { durationMinutes: 15 },
  grading: { maxPoints: 10, scaleMax: 100, decimalPlaces: 2 },
  dueAt: Date.UTC(2026, 10, 21, 15),
} as Doc<"courseTasks">;
function detail(
  canManage: boolean,
  description?: string,
  overrides: Partial<Doc<"courseTasks">> = {},
) {
  return (
    <NextIntlClientProvider
      locale="es"
      messages={es}
      timeZone="America/Tegucigalpa"
    >
      <CourseQuizDetail
        task={{ ...task, description, ...overrides }}
        canManage={canManage}
        submissionsOpen
        timeZone="America/Tegucigalpa"
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      >
        <p>Course submissions</p>
      </CourseQuizDetail>
    </NextIntlClientProvider>
  );
}

test("teacher preview follows the summary and precedes submissions, and empty instructions are omitted", () => {
  render(detail(true));
  const submissions = screen.getByText("Course submissions");
  const preview = screen.getByRole("button", {
    name: es.courseQuizzes.previewQuiz,
  });
  expect(preview.getAttribute("aria-expanded")).toBe("false");
  expect(
    screen
      .getByText(es.courseTasks.datesAndAvailability)
      .compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    preview.compareDocumentPosition(submissions) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.queryByText(es.courseTasks.noDescription)).toBeNull();
  expect(screen.queryByText(es.courseTasks.lateSubmissionsLabel)).toBeNull();
  fireEvent.click(preview);
  expect(preview.getAttribute("aria-expanded")).toBe("true");
});

test("student composition excludes teacher actions, publication labels, and submission lists", () => {
  render(detail(false));
  expect(screen.getByText("Student attempt")).toBeTruthy();
  expect(screen.queryByText("Course submissions")).toBeNull();
  expect(
    screen.queryByRole("button", { name: es.courseQuizzes.editQuiz }),
  ).toBeNull();
  expect(screen.queryByText(es.courseTasks.visibleStatus)).toBeNull();
  expect(
    screen.queryByRole("button", { name: es.courseQuizzes.previewQuiz }),
  ).toBeNull();
});

test("teacher instructions stay available when supplied", () => {
  render(detail(true, "Justifica cada respuesta."));
  expect(screen.queryByText("Justifica cada respuesta.")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: es.courseTasks.instructions }),
  );
  expect(screen.getByText("Justifica cada respuesta.")).toBeTruthy();
});

test("a scheduled quiz retains its opening and closing times in the course time zone", () => {
  render(
    detail(true, undefined, {
      releasedAt: undefined,
      availableAt: Date.UTC(2026, 10, 21, 14, 10),
      dueAt: Date.UTC(2026, 10, 21, 15, 10),
    }),
  );
  expect(screen.getByText(es.courseTasks.availableFrom)).toBeTruthy();
  expect(screen.getByText(/8:10/)).toBeTruthy();
  expect(screen.getByText(/9:10/)).toBeTruthy();
});
