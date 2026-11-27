import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, test, vi } from "vitest";
import type { Doc } from "@/convex/_generated/dataModel";
import es from "@/messages/es.json";
import { CourseTaskHeader } from "@/components/teaching/classes/course-task-header";
import { CourseTaskSummary } from "@/components/teaching/classes/course-task-summary";

const file = {
  title: "Spelling list #9",
  releasedAt: Date.UTC(2026, 10, 16, 14),
  dueAt: Date.UTC(2026, 10, 20, 13),
  allowLateSubmissions: false,
} as Doc<"courseTasks">;
const quiz = {
  ...file,
  title: "Q5",
  kind: "quiz",
  quiz: { durationMinutes: 10, questionCount: 3 },
  grading: { maxPoints: 2, scaleMax: 100, decimalPlaces: 2 },
} as Doc<"courseTasks">;
function wrap(child: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="es" messages={es} timeZone="America/Bogota">
      {child}
    </NextIntlClientProvider>
  );
}
vi.mock("convex/react", () => ({ useQuery: () => ({ questions: [] }) }));
afterEach(cleanup);

test("assignment and quiz headers use the same layout and preserve their actions", () => {
  const edit = vi.fn();
  const remove = vi.fn();
  const header = (task: Doc<"courseTasks">) =>
    wrap(
      <CourseTaskHeader
        task={task}
        canManage
        submissionsOpen
        onEdit={edit}
        onDelete={remove}
      />,
    );
  const s = render(header(file));
  const original = s.container.querySelector("header")!.className;
  const title = screen.getByRole("heading", { name: file.title }).className;
  const status = screen.getByText(es.courseTasks.visibleStatus).className;
  fireEvent.click(
    screen.getByRole("button", { name: es.courseTasks.editTask }),
  );
  expect(edit).toHaveBeenCalledOnce();
  s.rerender(header(quiz));
  expect(s.container.querySelector("header")!.className).toBe(original);
  expect(screen.getByRole("heading", { name: quiz.title }).className).toBe(
    title,
  );
  expect(screen.getByText(es.courseTasks.visibleStatus).className).toBe(status);
  expect(
    screen
      .getByRole("img", { name: es.courseTasks.quizType })
      .getAttribute("src"),
  ).toContain("quizzes-icon.svg");
  fireEvent.click(
    screen.getByRole("button", { name: es.courseQuizzes.deleteQuiz }),
  );
  expect(remove).toHaveBeenCalledOnce();
});

test.each([file, quiz])(
  "student header hides management information and actions ($title)",
  (task) => {
    render(
      wrap(
        <CourseTaskHeader
          task={task}
          canManage={false}
          submissionsOpen
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />,
      ),
    );
    expect(screen.getByRole("heading", { name: task.title })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(es.courseTasks.visibleStatus)).toBeNull();
  },
);

test("common summary retains course-zone dates and quiz-specific duration and question count", () => {
  const s = render(
    wrap(<CourseTaskSummary task={file} canManage timeZone="America/Bogota" />),
  );
  const layout = s.container.querySelector("dl")!.className;
  expect(screen.getByText(/9:00/)).toBeTruthy();
  expect(screen.getByText(/8:00/)).toBeTruthy();
  expect(screen.getByText(/Entregas tardías/)).toBeTruthy();
  s.rerender(wrap(<CourseTaskSummary task={quiz} timeZone="America/Bogota" />));
  expect(s.container.querySelector("dl")!.className).toBe(layout);
  expect(screen.getByText(es.courseQuizzes.durationLabel)).toBeTruthy();
  expect(
    screen.getByText(es.courseQuizzes.questionCount).nextElementSibling
      ?.textContent,
  ).toBe("3");
  expect(screen.queryByText(/Entregas tardías/)).toBeNull();
});

test.each([
  [file, false],
  [file, true],
  [quiz, false],
  [quiz, true],
] as const)(
  "quiz preview in the shared summary respects task type and management access ($0.title, $1)",
  (task, canManage) => {
    render(
      wrap(
        <CourseTaskSummary
          task={task}
          canManage={canManage}
          timeZone="America/Bogota"
        />,
      ),
    );
    expect(
      Boolean(
        screen.queryByRole("button", { name: es.courseQuizzes.previewQuiz }),
      ),
    ).toBe(task.kind === "quiz" && canManage);
  },
);
