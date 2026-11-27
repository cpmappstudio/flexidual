import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import es from "@/messages/es.json";
import en from "@/messages/en.json";
import pt from "@/messages/pt-BR.json";

const state = vi.hoisted(() => ({
  task: undefined as Doc<"courseTasks"> | undefined,
  questions: [] as Doc<"courseQuizQuestions">[],
  snapshotLoading: false,
  policy: { scaleMax: 100, decimalPlaces: 2, defaultMaxPoints: 100 } as
    | { scaleMax: number; decimalPlaces: number; defaultMaxPoints: number }
    | undefined,
  create: vi.fn(),
  update: vi.fn(),
  queryCalls: [] as { name: string; args: unknown }[],
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
      const name = getFunctionName(ref);
      state.queryCalls.push({ name, args });
      if (args === "skip") return undefined;
      if (name === "academicSettings:getGradingForCourse") return state.policy;
      if (name === "courseQuizzes:getForEditing")
        return state.task && !state.snapshotLoading
          ? {
              task: state.task,
              questions:
                state.task.releasedAt === undefined &&
                state.task.quiz?.firstStartedAt === undefined &&
                state.task.quiz?.closedAt === undefined
                  ? state.questions
                  : null,
            }
          : undefined;
      if (name === "courseQuizzes:get")
        return {
          questions: [
            {
              _id: "question-id",
              kind: "single_choice",
              prompt: "Teacher-only question",
              maxPoints: 2,
              options: [
                { id: "a", label: "First option" },
                { id: "b", label: "Second option" },
              ],
              correctOptionId: "b",
            },
          ],
        };
      throw new Error(`Unexpected query ${name}`);
    },
    useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(ref);
      if (name === "courseQuizzes:create") return state.create;
      if (name === "courseTasks:update") return state.update;
      throw new Error(`Unexpected mutation ${name}`);
    },
  };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

import { CourseQuizEditor } from "@/components/teaching/classes/course-quiz-editor";
import { CourseQuizDefinition } from "@/components/teaching/classes/course-quiz-definition";

beforeEach(() => {
  state.task = undefined;
  state.snapshotLoading = false;
  state.questions = [
    {
      _id: "question-id" as Id<"courseQuizQuestions">,
      _creationTime: 1,
      taskId: "quiz-id" as Id<"courseTasks">,
      order: 0,
      kind: "single_choice",
      prompt: "Teacher-only question",
      maxPoints: 2,
      options: [
        { id: "a", label: "First option" },
        { id: "b", label: "Second option" },
      ],
      correctOptionId: "b",
    },
  ];
  state.policy = { scaleMax: 100, decimalPlaces: 2, defaultMaxPoints: 100 };
  state.queryCalls = [];
  state.create.mockReset().mockResolvedValue("created-quiz");
  state.update.mockReset().mockResolvedValue(null);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const classId = "class-id" as Id<"classes">;
function renderEditor(task?: Doc<"courseTasks">, timeZone = "America/Bogota") {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  state.task = task;
  const component = () => (
    <NextIntlClientProvider locale="es" messages={es} timeZone={timeZone}>
      <CourseQuizEditor
        classId={classId}
        task={task}
        timeZone={timeZone}
        onSaved={onSaved}
        onClose={onClose}
      />
    </NextIntlClientProvider>
  );
  return { ...render(component()), component, onSaved, onClose };
}
function addQuestion(
  kind: "singleChoice" | "multipleChoice" | "text",
  messages: { courseQuizzes: typeof es.courseQuizzes } = es,
) {
  fireEvent.keyDown(
    screen.getByRole("button", { name: messages.courseQuizzes.addQuestion }),
    { key: "Enter" },
  );
  fireEvent.click(
    screen.getByRole("menuitem", {
      name: messages.courseQuizzes[kind],
    }),
  );
}
function fillChoice() {
  addQuestion("singleChoice");
  fireEvent.change(screen.getByLabelText(/Título/), {
    target: { value: "Quiz de fracciones" },
  });
  fireEvent.change(
    screen.getByLabelText(es.courseQuizzes.dueAt, { exact: false }),
    {
      target: { value: "2099-01-01T10:00" },
    },
  );
  fireEvent.change(
    screen.getByLabelText(es.courseQuizzes.prompt, { exact: false }),
    {
      target: { value: "¿Cuánto es 1 + 1?" },
    },
  );
  fireEvent.change(screen.getByLabelText("Opción 1 de pregunta 1"), {
    target: { value: "Uno" },
  });
  fireEvent.change(screen.getByLabelText("Opción 2 de pregunta 1"), {
    target: { value: "Dos" },
  });
  fireEvent.click(
    screen.getByRole("radio", {
      name: "Marcar opción 2 como correcta en pregunta 1",
    }),
  );
}
function submit() {
  fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
}
function publishedTask(overrides: Partial<Doc<"courseTasks">> = {}) {
  return {
    _id: "quiz-id",
    _creationTime: 1,
    classId,
    createdBy: "teacher-id",
    kind: "quiz",
    title: "Quiz publicado",
    releasedAt: Date.UTC(2020, 0, 1),
    dueAt: Date.UTC(2099, 0, 1, 15),
    quiz: { durationMinutes: 10 },
    grading: { maxPoints: 2, scaleMax: 100, decimalPlaces: 2 },
    allowLateSubmissions: false,
    updatedAt: 1,
    ...overrides,
  } as Doc<"courseTasks">;
}

function scheduledTask() {
  return publishedTask({
    releasedAt: undefined,
    availableAt: Date.UTC(2099, 0, 1, 14),
  });
}

test("editing waits for one coherent server snapshot instead of mixing old task props with new questions", async () => {
  state.snapshotLoading = true;
  const task = scheduledTask();
  const s = renderEditor(task);
  expect(screen.queryByLabelText(/Título/)).toBeNull();
  expect(
    screen.getByRole("status", { name: es.courseQuizzes.loadingEditor }),
  ).toBeTruthy();
  expect(
    (
      screen.getByRole("button", {
        name: es.courseQuizzes.save,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  submit();
  expect(state.update).not.toHaveBeenCalled();
  state.task = { ...task, title: "Latest server title", updatedAt: 2 };
  state.questions = [
    { ...state.questions[0], prompt: "Latest server question" },
  ];
  state.snapshotLoading = false;
  s.rerender(s.component());
  expect((screen.getByLabelText(/Título/) as HTMLInputElement).value).toBe(
    "Latest server title",
  );
  expect(document.activeElement).toBe(screen.getByLabelText(/Título/));
  const prompt = screen.getByLabelText(es.courseQuizzes.prompt, {
    exact: false,
  });
  expect((prompt as HTMLTextAreaElement).value).toBe("Latest server question");
  fireEvent.change(prompt, { target: { value: "Corrected after loading" } });
  submit();
  await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
  expect(state.update.mock.calls[0][0]).toMatchObject({
    expectedUpdatedAt: 2,
    questions: [{ _id: "question-id", prompt: "Corrected after loading" }],
  });
  expect(state.update.mock.calls[0][0]).not.toHaveProperty("title");
});

test("scheduled editing loads the canonical questions, saves corrected keys and weights with stable IDs", async () => {
  const task = scheduledTask();
  const s = renderEditor(task);
  const prompt = screen.getByLabelText(es.courseQuizzes.prompt, {
    exact: false,
  });
  expect((prompt as HTMLTextAreaElement).value).toBe("Teacher-only question");
  expect(
    screen.getByText(es.courseQuizzes.editScheduledDescription),
  ).toBeTruthy();
  fireEvent.change(prompt, { target: { value: "Corrected question" } });
  fireEvent.change(
    screen.getByLabelText(es.courseQuizzes.questionWeight, { exact: false }),
    { target: { value: "3.5" } },
  );
  fireEvent.click(
    screen.getByRole("radio", {
      name: "Marcar opción 1 como correcta en pregunta 1",
    }),
  );
  submit();
  await waitFor(() => expect(s.onSaved).toHaveBeenCalledOnce());
  expect(state.update).toHaveBeenCalledWith({
    taskId: task._id,
    expectedUpdatedAt: task.updatedAt,
    questions: [
      {
        _id: "question-id",
        kind: "single_choice",
        prompt: "Corrected question",
        maxPoints: 3.5,
        options:
          state.questions[0].kind === "single_choice"
            ? state.questions[0].options
            : [],
        correctOptionId: "a",
      },
    ],
  });
  expect(state.update.mock.calls[0][0]).not.toHaveProperty("grading");
  expect(state.create).not.toHaveBeenCalled();
});

test("scheduled metadata edits and unchanged saves do not resend the definition", async () => {
  renderEditor(scheduledTask());
  submit();
  expect(state.update).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(/Título/), {
    target: { value: "New title" },
  });
  submit();
  await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
  expect(state.update.mock.calls[0][0]).not.toHaveProperty("questions");
});

test("published editing groups attempt settings and removes unrelated creation help and question counters", () => {
  renderEditor(
    publishedTask({ quiz: { durationMinutes: 10, questionCount: 2 } }),
  );
  const availability = screen.getByRole("region", {
    name: es.courseQuizzes.availability,
  });
  const attempt = screen.getByRole("region", {
    name: es.courseQuizzes.attemptSettings,
  });
  expect(
    availability.compareDocumentPosition(attempt) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    within(attempt).getByLabelText(es.courseQuizzes.durationLabel, {
      exact: false,
    }),
  ).toBeTruthy();
  expect(
    within(attempt).getByRole("checkbox", {
      name: es.courseQuizzes.shuffleQuestions,
    }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("region", { name: es.courseQuizzes.questions }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: es.courseQuizzes.howItWorks }),
  ).toBeNull();
  expect(screen.queryByText("2 preguntas")).toBeNull();
  expect(screen.queryByText(es.courseTasks.releasedStartHint)).toBeNull();
  const due = within(availability).getByLabelText(es.courseQuizzes.dueAt, {
    exact: false,
  });
  expect(due.getAttribute("aria-describedby")).toBe("task-due-hint");
  expect(
    within(availability).getByText(es.courseQuizzes.closingChangeHint),
  ).toBeTruthy();
  expect(
    within(availability).getByText("Zona horaria del curso: America/Bogota"),
  ).toBeTruthy();
});

test("scheduled editing keeps questions editable and places duration and shuffle together outside the question list", () => {
  renderEditor(scheduledTask());
  const questions = screen.getByRole("region", {
    name: es.courseQuizzes.questions,
  });
  const attempt = screen.getByRole("region", {
    name: es.courseQuizzes.attemptSettings,
  });
  expect(
    within(questions).getByLabelText(es.courseQuizzes.prompt, { exact: false }),
  ).toBeTruthy();
  expect(
    within(questions).queryByRole("checkbox", {
      name: es.courseQuizzes.shuffleQuestions,
    }),
  ).toBeNull();
  expect(
    within(attempt).getByLabelText(es.courseQuizzes.durationLabel, {
      exact: false,
    }),
  ).toBeTruthy();
  expect(
    within(attempt).getByRole("checkbox", {
      name: es.courseQuizzes.shuffleQuestions,
    }),
  ).toBeTruthy();
});

test("started editing presents fixed settings as readable data with one explanation", () => {
  renderEditor(
    publishedTask({
      quiz: { durationMinutes: 10, firstStartedAt: 1, shuffleQuestions: true },
    }),
  );
  const attempt = screen.getByRole("region", {
    name: es.courseQuizzes.attemptSettings,
  });
  expect(within(attempt).getByText("10 minutos").tagName).toBe("DD");
  expect(
    within(attempt).getByText(es.courseQuizzes.questionOrderRandom).tagName,
  ).toBe("DD");
  expect(
    within(attempt).getAllByText(es.courseQuizzes.attemptSettingsLocked),
  ).toHaveLength(1);
  expect(within(attempt).queryAllByRole("textbox")).toHaveLength(0);
  expect(within(attempt).queryAllByRole("checkbox")).toHaveLength(0);
  expect(
    screen.getByText(es.courseQuizzes.editStartedDescription),
  ).toBeTruthy();
});

test("a closed quiz without attempts retains the existing permission to edit its attempt settings", async () => {
  renderEditor(publishedTask({ quiz: { durationMinutes: 10, closedAt: 1 } }));
  expect(screen.getByText(es.courseQuizzes.editClosedDescription)).toBeTruthy();
  expect(
    screen.queryByLabelText(es.courseQuizzes.dueAt, { exact: false }),
  ).toBeNull();
  const duration = screen.getByLabelText(es.courseQuizzes.durationLabel, {
    exact: false,
  }) as HTMLInputElement;
  expect(duration.disabled).toBe(false);
  fireEvent.change(duration, { target: { value: "15" } });
  submit();
  await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
  expect(state.update.mock.calls[0][0]).toMatchObject({ durationMinutes: 15 });
  expect(state.update.mock.calls[0][0]).not.toHaveProperty("dueAt");
});

test("a publication race explains a rejected start change and reloads only at the teacher's request", async () => {
  const task = scheduledTask();
  const s = renderEditor(task);
  state.update.mockRejectedValueOnce(new ConvexError("TASK_ALREADY_RELEASED"));
  fireEvent.change(screen.getByLabelText(es.courseTasks.availableAt), {
    target: { value: "2099-01-01T08:30" },
  });
  fireEvent.change(screen.getByLabelText(/Título/), {
    target: { value: "Local title" },
  });
  submit();
  expect((await screen.findByRole("alert")).textContent).toBe(
    es.courseQuizzes.startLocked,
  );
  expect((screen.getByLabelText(/Título/) as HTMLInputElement).value).toBe(
    "Local title",
  );
  expect(s.onSaved).not.toHaveBeenCalled();
  state.task = { ...task, releasedAt: task.availableAt };
  s.rerender(s.component());
  fireEvent.click(screen.getByRole("button", { name: es.grading.loadCurrent }));
  expect(screen.queryByLabelText(es.courseTasks.availableAt)).toBeNull();
  expect((screen.getByLabelText(/Título/) as HTMLInputElement).value).toBe(
    task.title,
  );
});

test.each([
  ["es", es, "1 minuto"],
  ["en", en, "1 minute"],
  ["pt-BR", pt, "1 minuto"],
] as const)(
  "closed edit summaries use readable localized values in %s",
  (locale, messages, minute) => {
    const task = publishedTask({
      quiz: { durationMinutes: 1, firstStartedAt: 1, closedAt: 2 },
    });
    state.task = task;
    render(
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone="America/Bogota"
      >
        <CourseQuizEditor
          classId={classId}
          task={task}
          timeZone="America/Bogota"
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByText(messages.courseQuizzes.editClosedDescription),
    ).toBeTruthy();
    expect(screen.getByText(minute).tagName).toBe("DD");
    expect(screen.getByText(messages.courseQuizzes.dueAt).tagName).toBe("DT");
    expect(
      screen.queryByLabelText(messages.courseQuizzes.durationLabel, {
        exact: false,
      }),
    ).toBeNull();
  },
);

test("scheduled editing supports every existing type, adds questions and preserves their authored order", async () => {
  state.questions.push({
    _id: "multiple-id" as Id<"courseQuizQuestions">,
    _creationTime: 1,
    taskId: "quiz-id" as Id<"courseTasks">,
    order: 1,
    kind: "multiple_choice",
    prompt: "Choose both",
    maxPoints: 4,
    options: [
      { id: "cat", label: "Cat" },
      { id: "dog", label: "Dog" },
    ],
    correctOptionIds: ["cat", "dog"],
  });
  renderEditor(scheduledTask());
  fireEvent.click(screen.getByRole("button", { name: "Subir pregunta 2" }));
  addQuestion("text");
  const prompts = screen.getAllByLabelText(es.courseQuizzes.prompt, {
    exact: false,
  });
  fireEvent.change(prompts[2], { target: { value: "Explain why" } });
  submit();
  await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
  const questions = state.update.mock.calls[0][0].questions;
  expect(questions).toMatchObject([
    {
      _id: "multiple-id",
      kind: "multiple_choice",
      correctOptionIds: ["cat", "dog"],
    },
    { _id: "question-id", kind: "single_choice", correctOptionId: "b" },
    { kind: "text", prompt: "Explain why", maxPoints: 1 },
  ]);
  expect(questions[2]).not.toHaveProperty("_id");
  expect(questions[2]).not.toHaveProperty("options");
});

test("scheduled editing can remove the last question but cannot save an empty quiz", async () => {
  renderEditor(scheduledTask());
  fireEvent.click(screen.getByRole("button", { name: "Eliminar pregunta 1" }));
  expect(
    screen.queryByLabelText(es.courseQuizzes.prompt, { exact: false }),
  ).toBeNull();
  submit();
  expect(screen.getByRole("alert").textContent).toBe(
    es.courseQuizzes.questionsRequired,
  );
  expect(state.update).not.toHaveBeenCalled();
  addQuestion("text");
  fireEvent.change(
    screen.getByLabelText(es.courseQuizzes.prompt, { exact: false }),
    { target: { value: "Replacement" } },
  );
  submit();
  await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
  expect(state.update.mock.calls[0][0].questions).toEqual([
    { kind: "text", prompt: "Replacement", maxPoints: 1 },
  ]);
});

test("publication while editing retains local questions read-only and prevents partial saves", async () => {
  const task = scheduledTask();
  const s = renderEditor(task);
  fireEvent.change(
    screen.getByLabelText(es.courseQuizzes.prompt, { exact: false }),
    { target: { value: "Local correction" } },
  );
  fireEvent.change(screen.getByLabelText(/Título/), {
    target: { value: "Local title" },
  });
  state.task = { ...task, releasedAt: Date.UTC(2099, 0, 1, 14) };
  s.rerender(s.component());
  const prompt = screen.getByLabelText(es.courseQuizzes.prompt, {
    exact: false,
  }) as HTMLTextAreaElement;
  expect(prompt.value).toBe("Local correction");
  expect(prompt.matches(":disabled")).toBe(true);
  expect(
    screen.getByText(es.courseQuizzes.questionsBecameVisible),
  ).toBeTruthy();
  submit();
  expect(screen.getByRole("alert").textContent).toBe(
    es.courseQuizzes.questionsLocked,
  );
  expect(state.update).not.toHaveBeenCalled();
  expect(s.onSaved).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: es.grading.loadCurrent }));
  expect(
    screen.queryByLabelText(es.courseQuizzes.prompt, { exact: false }),
  ).toBeNull();
  expect((screen.getByLabelText(/Título/) as HTMLInputElement).value).toBe(
    task.title,
  );
});

test("a server publication rejection preserves question edits until the teacher loads the current version", async () => {
  const task = scheduledTask();
  const s = renderEditor(task);
  state.update.mockRejectedValueOnce(new ConvexError("QUIZ_QUESTIONS_LOCKED"));
  fireEvent.change(
    screen.getByLabelText(es.courseQuizzes.prompt, { exact: false }),
    { target: { value: "Still here" } },
  );
  submit();
  expect((await screen.findByRole("alert")).textContent).toBe(
    es.courseQuizzes.questionsLocked,
  );
  expect(
    (
      screen.getByLabelText(es.courseQuizzes.prompt, {
        exact: false,
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("Still here");
  expect(s.onSaved).not.toHaveBeenCalled();
  state.task = { ...task, releasedAt: Date.UTC(2099, 0, 1, 14) };
  s.rerender(s.component());
  fireEvent.click(screen.getByRole("button", { name: es.grading.loadCurrent }));
  expect(
    screen.queryByLabelText(es.courseQuizzes.prompt, { exact: false }),
  ).toBeNull();
});

test("a competing scheduled edit preserves local input and explicitly reloads questions together with their version", async () => {
  const task = scheduledTask();
  const s = renderEditor(task);
  fireEvent.change(
    screen.getByLabelText(es.courseQuizzes.prompt, { exact: false }),
    { target: { value: "Local answer" } },
  );
  state.task = { ...task, updatedAt: 2 };
  state.questions = [
    { ...state.questions[0], prompt: "Server answer", maxPoints: 4 },
  ];
  s.rerender(s.component());
  expect(
    (
      screen.getByLabelText(es.courseQuizzes.prompt, {
        exact: false,
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("Local answer");
  submit();
  expect(state.update).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toBe(
    es.courseQuizzes.settingsChanged,
  );
  fireEvent.click(screen.getByRole("button", { name: es.grading.loadCurrent }));
  expect(
    (
      screen.getByLabelText(es.courseQuizzes.prompt, {
        exact: false,
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("Server answer");
  fireEvent.change(screen.getByLabelText(/Título/), {
    target: { value: "Metadata only" },
  });
  submit();
  await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
  expect(state.update).toHaveBeenCalledWith({
    taskId: task._id,
    expectedUpdatedAt: 2,
    title: "Metadata only",
  });
});

test("publishes quiz questions atomically with course time zone, chosen key and computed points", async () => {
  const s = renderEditor();
  fillChoice();
  fireEvent.change(
    screen.getByLabelText(es.courseQuizzes.questionWeight, { exact: false }),
    {
      target: { value: "2.5" },
    },
  );
  submit();
  await waitFor(() => expect(s.onSaved).toHaveBeenCalledWith("created-quiz"));
  const args = state.create.mock.calls[0][0];
  expect(args).toMatchObject({
    classId,
    title: "Quiz de fracciones",
    dueAt: Date.UTC(2099, 0, 1, 15),
    durationMinutes: 10,
  });
  expect(args.questions).toHaveLength(1);
  expect(args.questions[0]).toMatchObject({
    kind: "single_choice",
    maxPoints: 2.5,
    prompt: "¿Cuánto es 1 + 1?",
  });
  expect(args.questions[0].correctOptionId).toBe(
    args.questions[0].options[1].id,
  );
  expect(state.update).not.toHaveBeenCalled();
  expect(screen.queryByText(es.courseTasks.inputMaterials)).toBeNull();
  expect(screen.queryByText(es.courseTasks.allowLate)).toBeNull();
});

test("duration stays as entered while clearing, typing, and rerendering, and saves the chosen minutes", async () => {
  const s = renderEditor();
  fillChoice();
  const duration = screen.getByLabelText(es.courseQuizzes.durationLabel, {
    exact: false,
  }) as HTMLInputElement;
  expect(duration.type).toBe("text");
  expect(duration.inputMode).toBe("numeric");
  fireEvent.change(duration, { target: { value: "" } });
  expect(duration.value).toBe("");
  fireEvent.change(duration, { target: { value: "1" } });
  expect(duration.value).toBe("1");
  fireEvent.change(duration, { target: { value: "15" } });
  s.rerender(s.component());
  expect(duration.value).toBe("15");
  submit();
  await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
  expect(state.create.mock.calls[0][0].durationMinutes).toBe(15);
});

test("the concise help appears first, starts collapsed and preserves title focus and visible errors", async () => {
  renderEditor();
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByLabelText(/Título/)),
  );
  expect(screen.getByText(es.courseQuizzes.publishLockNotice)).toBeTruthy();
  expect(screen.queryByText(es.courseQuizzes.help.time.description)).toBeNull();
  expect(
    screen.queryByText(es.courseQuizzes.help.results.description),
  ).toBeNull();
  const help = screen.getByRole("button", {
    name: es.courseQuizzes.howItWorks,
  });
  expect(help.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(help);
  expect(screen.getByText(es.courseQuizzes.help.time.description)).toBeTruthy();
  expect(
    screen.getByText(es.courseQuizzes.help.grading.description),
  ).toBeTruthy();
  expect(
    screen.getByText(es.courseQuizzes.help.results.description),
  ).toBeTruthy();
  const rules = screen
    .getByText(es.courseQuizzes.help.time.description)
    .closest("ul")!;
  expect(within(rules).getAllByRole("listitem")).toHaveLength(3);
  expect(
    help.compareDocumentPosition(
      screen.getByRole("heading", {
        name: es.courseQuizzes.generalInformation,
      }),
    ) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  fireEvent.click(help);
  fillChoice();
  fireEvent.change(
    screen.getByLabelText(es.courseQuizzes.durationLabel, { exact: false }),
    {
      target: { value: "0" },
    },
  );
  submit();
  expect(screen.getByRole("alert").textContent).toBe(
    es.courseQuizzes.invalidDuration,
  );
  expect(document.activeElement).toBe(screen.getByRole("alert"));
  expect(state.create).not.toHaveBeenCalled();
});

test("adds and reorders mixed questions without changing their selected answer or points", async () => {
  renderEditor();
  fillChoice();
  fireEvent.change(
    screen.getByLabelText(es.courseQuizzes.questionWeight, { exact: false }),
    {
      target: { value: "0.1" },
    },
  );
  addQuestion("text");
  fireEvent.change(
    screen.getAllByLabelText(es.courseQuizzes.prompt, { exact: false })[1],
    {
      target: { value: "Explica tu respuesta" },
    },
  );
  fireEvent.change(
    screen.getAllByLabelText(es.courseQuizzes.questionWeight, {
      exact: false,
    })[1],
    {
      target: { value: "0.2" },
    },
  );
  expect(screen.getByText("2 preguntas")).toBeTruthy();
  expect(screen.getByText(es.courseQuizzes.manualGradingLabel)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Subir pregunta 2" }));
  submit();
  await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
  const questions = state.create.mock.calls[0][0].questions;
  expect(questions.map((question: { kind: string }) => question.kind)).toEqual([
    "text",
    "single_choice",
  ]);
  expect(questions[1].correctOptionId).toBe(questions[1].options[1].id);
});

test("multiple choice authoring requires a key and preserves selected IDs when options and questions move", async () => {
  renderEditor();
  fillChoice();
  addQuestion("multipleChoice");
  fireEvent.change(
    screen.getAllByLabelText(es.courseQuizzes.prompt, { exact: false })[1],
    {
      target: { value: "¿Cuáles son domésticos?" },
    },
  );
  const addOption = screen.getAllByRole("button", {
    name: es.courseQuizzes.addOption,
  })[1];
  fireEvent.click(addOption);
  for (const [index, label] of ["Gato", "León", "Perro"].entries()) {
    fireEvent.change(
      screen.getByLabelText(`Opción ${index + 1} de pregunta 2`),
      { target: { value: label } },
    );
  }
  submit();
  expect(state.create).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toBe(
    `Pregunta 2: ${es.courseQuizzes.correctAnswerRequired}`,
  );
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "Marcar opción 1 como correcta en pregunta 2",
    }),
  );
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "Marcar opción 3 como correcta en pregunta 2",
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Eliminar opción 1 de pregunta 2" }),
  );
  expect(
    screen
      .getByRole("checkbox", {
        name: "Marcar opción 2 como correcta en pregunta 2",
      })
      .getAttribute("aria-checked"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Subir pregunta 2" }));
  expect(screen.getByText(es.courseQuizzes.automaticGradingLabel)).toBeTruthy();
  submit();
  await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
  const [multiple, single] = state.create.mock.calls[0][0].questions;
  expect(multiple).toMatchObject({
    kind: "multiple_choice",
    correctOptionIds: [multiple.options[1].id],
  });
  expect(
    multiple.options.map((option: { label: string }) => option.label),
  ).toEqual(["León", "Perro"]);
  expect(single.kind).toBe("single_choice");
});

test("removing the correct option requires selecting another answer and enforces option bounds", () => {
  renderEditor();
  fillChoice();
  fireEvent.click(
    screen.getByRole("button", { name: es.courseQuizzes.addOption }),
  );
  fireEvent.click(
    screen.getByRole("radio", {
      name: "Marcar opción 3 como correcta en pregunta 1",
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Eliminar opción 3 de pregunta 1" }),
  );
  expect(
    screen
      .getAllByRole("radio")
      .every((radio) => radio.getAttribute("aria-checked") === "false"),
  ).toBe(true);
  submit();
  expect(screen.getByRole("alert").textContent).toBe(
    `Pregunta 1: ${es.courseQuizzes.correctAnswerRequired}`,
  );
  expect(state.create).not.toHaveBeenCalled();
  expect(
    (
      screen.getByRole("button", {
        name: "Eliminar opción 1 de pregunta 1",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  for (let i = 0; i < 8; i++)
    fireEvent.click(
      screen.getByRole("button", { name: es.courseQuizzes.addOption }),
    );
  expect(screen.getAllByRole("radio")).toHaveLength(10);
  expect(
    (
      screen.getByRole("button", {
        name: es.courseQuizzes.addOption,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});

test("schedules in the course time zone and uses a distinct scheduling action", async () => {
  renderEditor();
  fillChoice();
  fireEvent.change(screen.getByLabelText(es.courseTasks.availableAt), {
    target: { value: "2099-01-01T09:00" },
  });
  expect(
    screen.getByRole("button", { name: es.courseQuizzes.scheduleQuiz }),
  ).toBeTruthy();
  submit();
  await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
  expect(state.create.mock.calls[0][0].availableAt).toBe(
    Date.UTC(2099, 0, 1, 14),
  );
});

test.each([
  ["duration", "0", es.courseQuizzes.invalidDuration],
  ["duration", "1.5", es.courseQuizzes.invalidDuration],
  ["due", "", es.courseQuizzes.invalidDates],
])(
  "rejects invalid %s value %s without creating a quiz",
  (field, value, message) => {
    renderEditor();
    fillChoice();
    fireEvent.change(
      screen.getByLabelText(
        field === "duration"
          ? es.courseQuizzes.durationLabel
          : es.courseQuizzes.dueAt,
        { exact: false },
      ),
      { target: { value } },
    );
    submit();
    expect(screen.getByRole("alert").textContent).toBe(message);
    expect(state.create).not.toHaveBeenCalled();
  },
);

test.each([-86_400_000, 86_400_000])(
  "scheduling delegates future-date validation to the server despite device clock offset %s",
  async (offset) => {
    const clock = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.UTC(2099, 0, 1, 14) + offset);
    try {
      const s = renderEditor();
      fillChoice();
      fireEvent.change(screen.getByLabelText(es.courseTasks.availableAt), {
        target: { value: "2099-01-01T09:05" },
      });
      submit();
      await waitFor(() => expect(s.onSaved).toHaveBeenCalledOnce());
      expect(state.create).toHaveBeenCalledWith(
        expect.objectContaining({
          availableAt: Date.UTC(2099, 0, 1, 14, 5),
          dueAt: Date.UTC(2099, 0, 1, 15),
        }),
      );
    } finally {
      clock.mockRestore();
    }
  },
);

test("a past date rejected by the server keeps the entered dates and questions", async () => {
  state.create.mockRejectedValueOnce(new ConvexError("INVALID_TASK_DATES"));
  renderEditor();
  fillChoice();
  fireEvent.change(
    screen.getByLabelText(es.courseQuizzes.dueAt, { exact: false }),
    {
      target: { value: "2020-01-01T10:00" },
    },
  );
  submit();
  expect((await screen.findByRole("alert")).textContent).toBe(
    es.courseQuizzes.invalidDates,
  );
  expect(state.create).toHaveBeenCalledOnce();
  expect(
    (
      screen.getByLabelText(es.courseQuizzes.dueAt, {
        exact: false,
      }) as HTMLInputElement
    ).value,
  ).toBe("2020-01-01T10:00");
  expect(
    (
      screen.getByLabelText(es.courseQuizzes.prompt, {
        exact: false,
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("¿Cuánto es 1 + 1?");
});

test.each([-3_600_000, 3_600_000])(
  "an open quiz closing remains editable despite device clock offset %s",
  async (offset) => {
    const serverNow = Date.UTC(2026, 10, 26, 16);
    const clock = vi.spyOn(Date, "now").mockReturnValue(serverNow + offset);
    try {
      renderEditor(
        publishedTask({
          releasedAt: serverNow - 60_000,
          dueAt: serverNow + 30 * 60_000,
          updatedAt: serverNow,
        }),
        "UTC",
      );
      const closing = screen.getByLabelText(es.courseQuizzes.dueAt, {
        exact: false,
      }) as HTMLInputElement;
      expect(closing.disabled).toBe(false);
      expect(screen.queryByText(es.courseQuizzes.closingLocked)).toBeNull();
      fireEvent.change(closing, { target: { value: "2026-11-26T16:45" } });
      submit();
      await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
      expect(state.update).toHaveBeenCalledWith(
        expect.objectContaining({ dueAt: Date.UTC(2026, 10, 26, 16, 45) }),
      );
    } finally {
      clock.mockRestore();
    }
  },
);

test("keeps entered questions after a server error and permits retry", async () => {
  state.create.mockRejectedValueOnce(new ConvexError("INVALID_TASK_DATES"));
  const s = renderEditor();
  fillChoice();
  submit();
  expect((await screen.findByRole("alert")).textContent).toBe(
    es.courseQuizzes.invalidDates,
  );
  expect(
    (
      screen.getByLabelText(es.courseQuizzes.prompt, {
        exact: false,
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("¿Cuánto es 1 + 1?");
  submit();
  await waitFor(() => expect(s.onSaved).toHaveBeenCalledOnce());
});

test("prevents duplicate publication and closing while the mutation is pending", async () => {
  let resolve!: (value: string) => void;
  state.create.mockImplementation(
    () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  );
  const s = renderEditor();
  fillChoice();
  submit();
  submit();
  expect(state.create).toHaveBeenCalledOnce();
  expect(
    (
      screen.getByRole("button", {
        name: es.courseTasks.cancel,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(s.onClose).not.toHaveBeenCalled();
  await act(async () => resolve("created-quiz"));
});

test("warns before abandoning edited questions and before leaving the page", () => {
  const s = renderEditor();
  fillChoice();
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: es.courseTasks.cancel }));
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: es.courseQuizzes.keepEditing }),
  );
  expect(s.onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: es.courseTasks.cancel }));
  fireEvent.click(
    screen.getByRole("button", { name: es.courseQuizzes.discardChanges }),
  );
  expect(s.onClose).toHaveBeenCalledOnce();
});

test("editing sends only mutable settings and locks duration reactively after a student starts", async () => {
  const task = publishedTask();
  const s = renderEditor(task);
  expect(screen.queryByLabelText(es.courseQuizzes.prompt)).toBeNull();
  fireEvent.change(
    screen.getByLabelText(es.courseQuizzes.durationLabel, { exact: false }),
    {
      target: { value: "15" },
    },
  );
  state.task = {
    ...task,
    quiz: { durationMinutes: 10, firstStartedAt: Date.now() },
  };
  s.rerender(s.component());
  expect(
    screen.queryByLabelText(es.courseQuizzes.durationLabel, { exact: false }),
  ).toBeNull();
  expect(screen.getByText("10 minutos")).toBeTruthy();
  expect(screen.getByText(es.courseQuizzes.attemptSettingsLocked)).toBeTruthy();
  fireEvent.change(
    screen.getByLabelText(es.courseQuizzes.dueAt, { exact: false }),
    {
      target: { value: "2099-01-01T11:00" },
    },
  );
  submit();
  await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
  expect(state.update.mock.calls[0][0]).toMatchObject({
    taskId: task._id,
    dueAt: Date.UTC(2099, 0, 1, 16),
    expectedUpdatedAt: task.updatedAt,
  });
  for (const field of [
    "questions",
    "grading",
    "materialFileIds",
    "allowLateSubmissions",
    "durationMinutes",
  ])
    expect(state.update.mock.calls[0][0]).not.toHaveProperty(field);
});

test("closed quizzes keep closing locked while allowing a title correction", async () => {
  const task = publishedTask({
    dueAt: Date.UTC(2020, 0, 2),
    quiz: {
      durationMinutes: 10,
      firstStartedAt: Date.UTC(2020, 0, 1),
      closedAt: Date.UTC(2020, 0, 2),
    },
  });
  renderEditor(task);
  expect(
    screen.queryByLabelText(es.courseQuizzes.dueAt, { exact: false }),
  ).toBeNull();
  expect(screen.getByText(es.courseQuizzes.dueAt).tagName).toBe("DT");
  fireEvent.change(screen.getByLabelText(/Título/), {
    target: { value: "Título corregido" },
  });
  submit();
  await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
  expect(state.update.mock.calls[0][0]).toMatchObject({
    title: "Título corregido",
  });
  expect(state.update.mock.calls[0][0]).not.toHaveProperty("dueAt");
});

test("the server close marker locks closing even when the device clock is behind", () => {
  const closing = Date.UTC(2099, 0, 1);
  renderEditor(
    publishedTask({
      dueAt: closing,
      quiz: { durationMinutes: 10, closedAt: closing },
    }),
  );
  expect(
    screen.queryByLabelText(es.courseQuizzes.dueAt, { exact: false }),
  ).toBeNull();
  expect(screen.getByText(es.courseQuizzes.dueAt).tagName).toBe("DT");
  expect(screen.getByText(es.courseQuizzes.closingLocked)).toBeTruthy();
});

test("waits for the grading policy before offering publication", () => {
  state.policy = undefined;
  renderEditor();
  expect(
    (
      screen.getByRole("button", {
        name: es.courseQuizzes.publishQuiz,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});

test("a scheduled quiz becoming visible while editing makes its start read-only", async () => {
  const task = publishedTask({
    releasedAt: undefined,
    availableAt: Date.now() - 60_000,
  });
  const s = renderEditor(task);
  expect(screen.getByLabelText(es.courseTasks.availableAt)).toBeTruthy();
  state.task = { ...task, releasedAt: Date.now() };
  s.rerender(s.component());
  expect(screen.queryByLabelText(es.courseTasks.availableAt)).toBeNull();
  fireEvent.change(screen.getByLabelText(/Título/), {
    target: { value: "Título corregido" },
  });
  submit();
  await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
  expect(state.update.mock.calls[0][0].availableAt).toBeUndefined();
});

test("a changed closing time becoming final while editing does not prevent a title correction", async () => {
  const task = publishedTask();
  const s = renderEditor(task);
  fireEvent.change(screen.getByLabelText(/Título/), {
    target: { value: "Título corregido" },
  });
  const closedAt = Date.now() - 60_000;
  state.task = {
    ...task,
    dueAt: closedAt,
    quiz: { durationMinutes: 10, closedAt },
  };
  s.rerender(s.component());
  submit();
  await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
  expect(state.update.mock.calls[0][0]).toMatchObject({
    title: "Título corregido",
  });
  expect(state.update.mock.calls[0][0]).not.toHaveProperty("dueAt");
});

test("title edits do not resend a stale closing time and a conflict can load the current settings", async () => {
  const task = publishedTask();
  const s = renderEditor(task);
  fireEvent.change(screen.getByLabelText(/Título/), {
    target: { value: "Título local" },
  });
  state.update.mockRejectedValueOnce(new ConvexError("QUIZ_SETTINGS_CHANGED"));
  submit();
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe(
      es.courseQuizzes.settingsChanged,
    ),
  );
  expect(state.update).toHaveBeenCalledWith({
    taskId: task._id,
    expectedUpdatedAt: task.updatedAt,
    title: "Título local",
  });
  expect((screen.getByLabelText(/Título/) as HTMLInputElement).value).toBe(
    "Título local",
  );
  state.task = {
    ...task,
    dueAt: task.dueAt! + 20 * 60_000,
    updatedAt: 2,
    quiz: { ...task.quiz!, shuffleQuestions: true },
  };
  s.rerender(s.component());
  const recover = screen.getByRole("button", { name: es.grading.loadCurrent });
  expect(screen.getByRole("alert").parentElement?.contains(recover)).toBe(true);
  fireEvent.click(recover);
  expect(
    screen
      .getByRole("checkbox", { name: es.courseQuizzes.shuffleQuestions })
      .getAttribute("aria-checked"),
  ).toBe("true");
  expect(
    (
      screen.getByLabelText(es.courseQuizzes.dueAt, {
        exact: false,
      }) as HTMLInputElement
    ).value,
  ).toBe("2099-01-01T10:20");
  fireEvent.change(screen.getByLabelText(/Título/), {
    target: { value: "Título corregido" },
  });
  submit();
  await waitFor(() => expect(state.update).toHaveBeenCalledTimes(2));
  expect(state.update).toHaveBeenLastCalledWith({
    taskId: task._id,
    expectedUpdatedAt: 2,
    title: "Título corregido",
  });
});

test("saving unchanged settings skips the mutation", async () => {
  const s = renderEditor(
    publishedTask({ dueAt: Date.UTC(2099, 0, 1, 15, 0, 45) }),
  );
  submit();
  await waitFor(() => expect(s.onSaved).toHaveBeenCalledOnce());
  expect(state.update).not.toHaveBeenCalled();
});

test.each([
  ["en", en],
  ["pt-BR", pt],
] as const)(
  "renders the quiz editor with complete %s translations",
  async (locale, messages) => {
    render(
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone="UTC"
      >
        <CourseQuizEditor
          classId={classId}
          timeZone="UTC"
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole("dialog", { name: messages.courseQuizzes.newQuiz }),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(messages.courseQuizzes.durationLabel, {
        exact: false,
      }),
    ).toBeTruthy();
    const help = screen.getByRole("button", {
      name: messages.courseQuizzes.howItWorks,
    });
    expect(help.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(help);
    for (const rule of Object.values(messages.courseQuizzes.help))
      expect(screen.getByText(rule.description)).toBeTruthy();
    fireEvent.click(help);
    addQuestion("text", messages);
    expect(
      screen.getByText(messages.courseQuizzes.manualGradingLabel),
    ).toBeTruthy();
  },
);

test.each([true, false])(
  "quiz definition keeps the answer key exclusive to managers: %s",
  (canManage) => {
    render(
      <NextIntlClientProvider locale="es" messages={es} timeZone="UTC">
        <CourseQuizDefinition task={publishedTask()} canManage={canManage} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText("Teacher-only question")).toBeNull();
    if (canManage)
      fireEvent.click(
        screen.getByRole("button", { name: es.courseQuizzes.previewQuiz }),
      );
    expect(Boolean(screen.queryByText("Teacher-only question"))).toBe(
      canManage,
    );
    expect(Boolean(screen.queryByText(es.courseQuizzes.correct))).toBe(
      canManage,
    );
    expect(
      state.queryCalls
        .filter((call) => call.name === "courseQuizzes:get")
        .every((call) => canManage || call.args === "skip"),
    ).toBe(true);
    if (canManage)
      expect(
        within(screen.getAllByRole("list")[1]).getByText("Second option"),
      ).toBeTruthy();
  },
);

test.each([false, true])(
  "new quizzes save the chosen shuffle setting (enabled: %s)",
  async (enabled) => {
    renderEditor();
    fillChoice();
    const checkbox = screen.getByRole<HTMLButtonElement>("checkbox", {
      name: es.courseQuizzes.shuffleQuestions,
    });
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
    expect(checkbox.getAttribute("aria-describedby")).toBe("quiz-shuffle-hint");
    if (enabled) fireEvent.click(checkbox);
    submit();
    await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
    expect(state.create.mock.calls[0][0].shuffleQuestions).toBe(enabled);
  },
);

test("shuffle settings use the existing update and become read-only when a student starts", async () => {
  const task = publishedTask();
  const s = renderEditor(task);
  const checkbox = screen.getByRole<HTMLButtonElement>("checkbox", {
    name: es.courseQuizzes.shuffleQuestions,
  });
  fireEvent.click(checkbox);
  submit();
  await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
  expect(state.update.mock.calls[0][0]).toEqual({
    taskId: task._id,
    expectedUpdatedAt: task.updatedAt,
    shuffleQuestions: true,
  });
  state.task = {
    ...task,
    quiz: { durationMinutes: 10, shuffleQuestions: true, firstStartedAt: 1 },
  };
  s.rerender(s.component());
  expect(
    screen.queryByRole("checkbox", { name: es.courseQuizzes.shuffleQuestions }),
  ).toBeNull();
  expect(screen.getByText(es.courseQuizzes.questionOrderRandom)).toBeTruthy();
  expect(screen.getByText(es.courseQuizzes.attemptSettingsLocked)).toBeTruthy();
});

test("a stale local shuffle selection is not sent after the first attempt starts", async () => {
  const task = publishedTask();
  const s = renderEditor(task);
  const checkbox = screen.getByRole<HTMLButtonElement>("checkbox", {
    name: es.courseQuizzes.shuffleQuestions,
  });
  fireEvent.click(checkbox);
  state.task = { ...task, quiz: { durationMinutes: 10, firstStartedAt: 1 } };
  s.rerender(s.component());
  expect(
    screen.queryByRole("checkbox", { name: es.courseQuizzes.shuffleQuestions }),
  ).toBeNull();
  expect(screen.getByText(es.courseQuizzes.questionOrderAuthored)).toBeTruthy();
  fireEvent.change(screen.getByLabelText(/Título/), {
    target: { value: "Título corregido" },
  });
  submit();
  await waitFor(() => expect(state.update).toHaveBeenCalledOnce());
  expect(state.update.mock.calls[0][0]).toEqual({
    taskId: task._id,
    expectedUpdatedAt: task.updatedAt,
    title: "Título corregido",
  });
});

test("server shuffle locking errors remain visible without closing the editor", async () => {
  renderEditor(publishedTask());
  state.update.mockRejectedValueOnce(new ConvexError("QUIZ_SHUFFLE_LOCKED"));
  fireEvent.click(
    screen.getByRole("checkbox", { name: es.courseQuizzes.shuffleQuestions }),
  );
  submit();
  await waitFor(() =>
    expect(screen.getByText(es.courseQuizzes.shuffleLocked)).toBeTruthy(),
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
});

test("quiz content precedes timing and keeps assignment labels out of its form", () => {
  renderEditor();
  const form = screen.getByRole("dialog").querySelector("form")!;
  expect(form.noValidate).toBe(true);
  expect(
    Array.from(form.querySelectorAll("section")).map((section) =>
      section.getAttribute("aria-label"),
    ),
  ).toEqual([
    es.courseQuizzes.generalInformation,
    es.courseQuizzes.questions,
    es.courseQuizzes.timeAndAvailability,
  ]);
  expect(
    screen.getByLabelText(es.courseQuizzes.studentInstructions),
  ).toBeTruthy();
  expect(screen.queryByLabelText(es.courseTasks.description)).toBeNull();
  expect(screen.queryByText(/Puntaje total/)).toBeNull();
  expect(screen.queryByText(es.grading.maxPoints)).toBeNull();
  expect(screen.getByText("0 preguntas")).toBeTruthy();
  expect(screen.getByText(es.courseQuizzes.emptyStartHint)).toBeTruthy();
});

test("collapsed questions retain their key and weight through reordering and submission", async () => {
  renderEditor();
  fillChoice();
  fireEvent.change(
    screen.getByLabelText(es.courseQuizzes.questionWeight, { exact: false }),
    {
      target: { value: "2.5" },
    },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Expandir o contraer pregunta 1" }),
  );
  expect(screen.queryByLabelText(es.courseQuizzes.prompt)).toBeNull();
  expect(screen.getByText("¿Cuánto es 1 + 1?")).toBeTruthy();
  addQuestion("text");
  fireEvent.change(
    screen.getByLabelText(es.courseQuizzes.prompt, { exact: false }),
    {
      target: { value: "Explica" },
    },
  );
  fireEvent.click(screen.getByRole("button", { name: "Subir pregunta 2" }));
  expect(
    screen
      .getByRole("button", { name: "Expandir o contraer pregunta 2" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  submit();
  await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
  const [, single] = state.create.mock.calls[0][0].questions;
  expect(single.maxPoints).toBe(2.5);
  expect(single.correctOptionId).toBe(single.options[1].id);
  expect(screen.getByText("2 preguntas")).toBeTruthy();
});

test("publishing opens an incomplete collapsed question and its error link focuses the field", async () => {
  renderEditor();
  fillChoice();
  addQuestion("text");
  fireEvent.click(
    screen.getByRole("button", { name: "Expandir o contraer pregunta 2" }),
  );
  submit();
  expect(state.create).not.toHaveBeenCalled();
  const prompt = await screen.findAllByLabelText(es.courseQuizzes.prompt, {
    exact: false,
  });
  expect(prompt).toHaveLength(2);
  expect(prompt[1].getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByRole("alert").textContent).toBe(
    `Pregunta 2: ${es.courseQuizzes.invalidPrompt}`,
  );
  // Reopen even if the teacher collapses it again after seeing the error.
  fireEvent.click(
    screen.getByRole("button", { name: "Expandir o contraer pregunta 2" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: es.courseQuizzes.goToError }),
  );
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getAllByLabelText(es.courseQuizzes.prompt, { exact: false })[1],
    ),
  );
  fireEvent.change(
    screen.getAllByLabelText(es.courseQuizzes.prompt, { exact: false })[1],
    {
      target: { value: "Explica tu respuesta" },
    },
  );
  submit();
  await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
});

test("option errors identify the field without discarding a selected key", async () => {
  renderEditor();
  fillChoice();
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByLabelText(es.courseQuizzes.prompt, { exact: false }),
    ),
  );
  const option = screen.getByLabelText("Opción 1 de pregunta 1");
  fireEvent.change(option, { target: { value: "  " } });
  submit();
  expect(option.getAttribute("aria-invalid")).toBe("true");
  expect(
    document.getElementById(option.getAttribute("aria-describedby")!)
      ?.textContent,
  ).toBe(es.courseQuizzes.invalidOption);
  fireEvent.click(
    screen.getByRole("button", { name: es.courseQuizzes.goToError }),
  );
  await waitFor(() => expect(document.activeElement).toBe(option));
  fireEvent.change(option, { target: { value: "Uno" } });
  submit();
  await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
  const [question] = state.create.mock.calls[0][0].questions;
  expect(question.correctOptionId).toBe(question.options[1].id);
});

test("question weight errors preserve institutional precision and do not publish", () => {
  renderEditor();
  fillChoice();
  const weight = screen.getByLabelText(es.courseQuizzes.questionWeight, {
    exact: false,
  });
  fireEvent.change(weight, { target: { value: "1.234" } });
  submit();
  expect(weight.getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByRole("alert").textContent).toContain("Pregunta 1:");
  expect(screen.getByRole("alert").textContent).toContain("2 decimales");
  expect(state.create).not.toHaveBeenCalled();
});

test.each(["1e1", "0x10", "+10"])(
  "duration keeps rejecting a nonnumeric notation %s with custom validation",
  (value) => {
    renderEditor();
    fillChoice();
    fireEvent.change(
      screen.getByLabelText(es.courseQuizzes.durationLabel, { exact: false }),
      {
        target: { value },
      },
    );
    submit();
    expect(screen.getByRole("alert").textContent).toBe(
      es.courseQuizzes.invalidDuration,
    );
    expect(state.create).not.toHaveBeenCalled();
  },
);

test("partially entered optional start dates cannot accidentally publish immediately", () => {
  renderEditor();
  fillChoice();
  const start = screen.getByLabelText(es.courseTasks.availableAt);
  Object.defineProperty(start, "validity", {
    configurable: true,
    value: { badInput: true },
  });
  submit();
  expect(start.getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByRole("alert").textContent).toBe(
    es.courseQuizzes.invalidDates,
  );
  expect(state.create).not.toHaveBeenCalled();
});

test("new quizzes show only the add button in the empty question section", () => {
  renderEditor();
  const section = screen.getByRole("region", {
    name: es.courseQuizzes.questions,
  });
  expect(within(section).getAllByRole("button")).toHaveLength(1);
  expect(
    within(section).getByRole("button", { name: es.courseQuizzes.addQuestion }),
  ).toBeTruthy();
  expect(screen.queryByLabelText(es.courseQuizzes.prompt)).toBeNull();
  expect(screen.queryByText(es.courseQuizzes.weightsHint)).toBeNull();
  expect(
    screen.queryByRole("checkbox", { name: es.courseQuizzes.shuffleQuestions }),
  ).toBeNull();
  expect(screen.queryByText(es.courseQuizzes.automaticGradingLabel)).toBeNull();
  expect(screen.queryByText(es.courseQuizzes.manualGradingLabel)).toBeNull();
});

test.each([
  ["singleChoice", "single_choice"],
  ["multipleChoice", "multiple_choice"],
  ["text", "text"],
] as const)(
  "the first question can be %s without an unwanted default",
  async (label, kind) => {
    renderEditor();
    addQuestion(label);
    fireEvent.change(screen.getByLabelText(/Título/), {
      target: { value: "Elección del profesor" },
    });
    fireEvent.change(
      screen.getByLabelText(es.courseQuizzes.dueAt, { exact: false }),
      {
        target: { value: "2099-01-01T10:00" },
      },
    );
    fireEvent.change(
      screen.getByLabelText(es.courseQuizzes.prompt, { exact: false }),
      {
        target: { value: "Mi pregunta" },
      },
    );
    if (kind !== "text") {
      for (const option of [1, 2])
        fireEvent.change(
          screen.getByLabelText(`Opción ${option} de pregunta 1`),
          { target: { value: `Respuesta ${option}` } },
        );
      fireEvent.click(
        screen.getByRole(kind === "single_choice" ? "radio" : "checkbox", {
          name: "Marcar opción 1 como correcta en pregunta 1",
        }),
      );
    }
    submit();
    await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
    expect(state.create.mock.calls[0][0].questions).toHaveLength(1);
    expect(state.create.mock.calls[0][0].questions[0].kind).toBe(kind);
  },
);

test("removing the last question restores an empty draft and blocks publication until another is added", async () => {
  renderEditor();
  fillChoice();
  const remove = screen.getByRole<HTMLButtonElement>("button", {
    name: "Eliminar pregunta 1",
  });
  expect(remove.disabled).toBe(false);
  fireEvent.click(remove);
  expect(screen.queryByLabelText(es.courseQuizzes.prompt)).toBeNull();
  expect(screen.getByText("0 preguntas")).toBeTruthy();
  const add = screen.getByRole("button", {
    name: es.courseQuizzes.addQuestion,
  });
  await waitFor(() => expect(document.activeElement).toBe(add));
  submit();
  expect(screen.getByRole("alert").textContent).toBe(
    es.courseQuizzes.questionsRequired,
  );
  expect(state.create).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: es.courseQuizzes.goToError }),
  );
  await waitFor(() => expect(document.activeElement).toBe(add));
  addQuestion("text");
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.change(
    screen.getByLabelText(es.courseQuizzes.prompt, { exact: false }),
    {
      target: { value: "Explica tu respuesta" },
    },
  );
  submit();
  await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
  expect(state.create.mock.calls[0][0].questions).toEqual([
    { kind: "text", prompt: "Explica tu respuesta", maxPoints: 1 },
  ]);
});

test("a missing quiz title asks for a quiz title instead of an assignment title", () => {
  renderEditor();
  submit();
  expect(screen.getByRole("alert").textContent).toBe(
    es.courseQuizzes.titleRequired,
  );
  expect(screen.queryByText(es.courseTasks.titleRequired)).toBeNull();
  expect(state.create).not.toHaveBeenCalled();
});

test.each([
  ["INVALID_TASK_DATES", "invalidDates"],
  ["TASK_RELEASE_FAILED", "releaseError"],
  ["COURSE_CLOSED", "courseUnavailable"],
  ["UNEXPECTED_ERROR", "saveError"],
] as const)(
  "the %s error uses the right explanation without discarding the draft",
  async (code, message) => {
    const s = renderEditor();
    fillChoice();
    state.create.mockRejectedValueOnce(new ConvexError(code));
    submit();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        es.courseQuizzes[message],
      ),
    );
    expect(
      (
        screen.getByLabelText(es.courseQuizzes.prompt, {
          exact: false,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("¿Cuánto es 1 + 1?");
    expect(s.onClose).not.toHaveBeenCalled();
    expect(s.onSaved).not.toHaveBeenCalled();
    submit();
    await waitFor(() => expect(s.onSaved).toHaveBeenCalledOnce());
  },
);

test("required quiz fields have the destructive asterisk while optional fields stay unmarked", () => {
  renderEditor();
  addQuestion("multipleChoice");
  const form = screen.getByRole("dialog").querySelector("form")!;
  for (const input of form.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement
  >("input[required], textarea[required]")) {
    const label = form.querySelector(`label[for="${input.id}"]`);
    expect(label?.querySelector("span.text-destructive")?.textContent).toBe(
      "*",
    );
  }
  for (const id of [
    "task-start",
    "task-description",
    "quiz-shuffle-questions",
  ]) {
    expect(
      form.querySelector(`label[for="${id}"] span.text-destructive`),
    ).toBeNull();
  }
  const options = form.querySelector('[role="group"][aria-labelledby]')!;
  expect(
    document
      .getElementById(options.getAttribute("aria-labelledby")!)
      ?.querySelector("span.text-destructive")?.textContent,
  ).toBe("*");
});
