import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import type { Doc } from "@/convex/_generated/dataModel";
import type { api } from "@/convex/_generated/api";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import es from "@/messages/es.json";
import en from "@/messages/en.json";
import pt from "@/messages/pt-BR.json";

type Data = FunctionReturnType<typeof api.courseQuizzes.get>;
const NOW = Date.UTC(2026, 10, 19, 12);
const MINUTE = 60_000;
const state = vi.hoisted(() => ({
  data: undefined as Data | undefined,
  userId: "student",
  connected: true,
  connectionCount: 1,
  serverNow: 0,
  start: vi.fn(),
  save: vi.fn(),
  submit: vi.fn(),
  query: vi.fn(),
  queryArgs: [] as unknown[],
  questionsReady: true,
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: state.userId }) }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useConvexConnectionState: () => ({
      isWebSocketConnected: state.connected,
      connectionCount: state.connectionCount,
    }),
    useConvex: () => ({ query: state.query }),
    useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
      if (args === "skip") return undefined;
      if (getFunctionName(ref) === "courseQuizzes:getQuestions")
        return state.questionsReady ? state.data?.questions : undefined;
      if (getFunctionName(ref) !== "courseQuizzes:getAttempt")
        throw new Error("Unexpected query");
      state.queryArgs.push(args);
      return state.data;
    },
    useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
      switch (getFunctionName(ref)) {
        case "courseQuizzes:start":
          return state.start;
        case "courseQuizzes:saveAnswers":
          return state.save;
        case "courseQuizzes:submit":
          return state.submit;
        default:
          throw new Error("Unexpected mutation");
      }
    },
  };
});
vi.mock("@/components/teaching/classes/course-task-grade", () => ({
  CourseTaskGrade: () => <p>publishedGrade</p>,
}));
import { CourseQuizStudent } from "@/components/teaching/classes/course-quiz-student";

const task = {
  _id: "quiz-id",
  _creationTime: NOW,
  classId: "class-id",
  createdBy: "teacher-id",
  kind: "quiz",
  title: "Quiz",
  releasedAt: NOW,
  updatedAt: NOW,
  dueAt: NOW + 60 * MINUTE,
  quiz: { durationMinutes: 10 },
  grading: { maxPoints: 10, scaleMax: 100, decimalPlaces: 2 },
  allowLateSubmissions: false,
} as Doc<"courseTasks">;
const questions: Data["questions"] = [
  {
    _id: "choice-question",
    order: 0,
    kind: "single_choice",
    prompt: "Elige un número",
    maxPoints: 2,
    options: [
      { id: "a", label: "Uno" },
      { id: "b", label: "Dos" },
    ],
  },
  {
    _id: "text-question",
    order: 1,
    kind: "text",
    prompt: "Explica tu respuesta",
    maxPoints: 8,
  },
] as Data["questions"];
const timing = () => ({
  startedAt: NOW,
  timeLimitAt: NOW + 10 * MINUTE,
  endsAt: NOW + 10 * MINUTE,
  submittedAt: undefined as number | undefined,
});
const initialData = (): Data => ({
  durationMinutes: 10,
  dueAt: task.dueAt!,
  canManage: false,
  canStart: true,
  canAnswer: false,
  attempt: null,
  questions: [],
  answers: [],
});
function activeData(): Data {
  return {
    ...initialData(),
    canStart: false,
    canAnswer: true,
    attempt: timing(),
    questions,
  };
}
function setup(currentTask = task) {
  const component = (value = currentTask) => (
    <NextIntlClientProvider locale="es" messages={es} timeZone="UTC">
      <CourseQuizStudent task={value} timeZone="UTC" />
    </NextIntlClientProvider>
  );
  return { ...render(component()), component };
}
function navigateQuestion(number: number) {
  fireEvent.click(
    screen.getByRole("button", { name: es.courseQuizzes.questionNavigator }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: new RegExp(`^Pregunta ${number}:`) }),
  );
}
function textAnswer() {
  if (!screen.queryByLabelText("Explica tu respuesta")) navigateQuestion(2);
  return screen.getByLabelText<HTMLTextAreaElement>("Explica tu respuesta");
}
async function flush() {
  await act(async () => {});
}
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "Date",
      "performance",
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
    ],
  });
  vi.setSystemTime(NOW);
  window.sessionStorage.clear();
  state.data = initialData();
  state.userId = "student";
  state.connected = true;
  state.connectionCount = 1;
  state.serverNow = NOW;
  state.queryArgs = [];
  state.questionsReady = true;
  state.start.mockReset().mockImplementation(async () => {
    const existing = state.data?.attempt ?? timing();
    state.data = {
      ...state.data!,
      attempt: existing,
      questions: state.data?.questions.length
        ? state.data.questions
        : questions,
    };
    return { ...existing, serverNow: state.serverNow };
  });
  state.save
    .mockReset()
    .mockImplementation(
      async ({
        answers,
      }: {
        answers: { questionId: string; expectedVersion: number }[];
      }) =>
        answers.map((answer) => ({
          questionId: answer.questionId,
          version: answer.expectedVersion + 1,
        })),
    );
  state.submit.mockReset().mockResolvedValue({ submittedAt: NOW + MINUTE });
  state.query.mockReset().mockImplementation(async () => state.data);
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("does not start or expose questions until the student explicitly begins", async () => {
  setup();
  expect(screen.getByText(es.courseQuizzes.startRules)).toBeTruthy();
  expect(screen.queryByText("Elige un número")).toBeNull();
  expect(state.start).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: es.courseQuizzes.startQuiz }),
  );
  await flush();
  expect(state.start).toHaveBeenCalledOnce();
  expect(screen.getByRole("timer").textContent).toBe("10:00");
  expect(textAnswer()).toBeTruthy();
});

test("resumes a saved attempt with the server clock and saved answers", async () => {
  state.data = {
    ...activeData(),
    answers: [
      {
        questionId: questions[1]._id,
        version: 2,
        answer: { kind: "text", text: "Trabajo guardado" },
      },
    ],
  };
  state.serverNow = NOW + 4 * MINUTE;
  setup();
  await flush();
  expect(screen.getByRole("timer").textContent).toBe("06:00");
  expect((textAnswer() as HTMLTextAreaElement).value).toBe("Trabajo guardado");
  expect(state.start).toHaveBeenCalledOnce();
});

test("multiple selections count as one answer, autosave together, and can be cleared", async () => {
  const multiple = {
    _id: "multiple-question",
    order: 0,
    kind: "multiple_choice",
    prompt: "Animales domésticos",
    maxPoints: 2,
    options: [
      { id: "cat", label: "Gato" },
      { id: "lion", label: "León" },
      { id: "dog", label: "Perro" },
    ],
  } as Data["questions"][number];
  state.data = { ...activeData(), questions: [multiple] };
  setup();
  await flush();
  expect(
    screen.getByText(es.courseQuizzes.multipleChoiceAnswerHint),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "Perro" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Gato" }));
  expect(screen.getByText("1 de 1 preguntas respondidas")).toBeTruthy();
  await tick(500);
  expect(state.save.mock.calls[0][0].answers).toEqual([
    {
      questionId: multiple._id,
      expectedVersion: 0,
      answer: { kind: "multiple_choice", optionIds: ["dog", "cat"] },
    },
  ]);
  fireEvent.click(
    screen.getByRole("button", { name: es.courseQuizzes.clearAnswer }),
  );
  expect(screen.getByText("0 de 1 preguntas respondidas")).toBeTruthy();
  expect(
    screen
      .getAllByRole("checkbox")
      .every((box) => box.getAttribute("aria-checked") === "false"),
  ).toBe(true);
  await tick(500);
  expect(state.save.mock.calls[1][0].answers[0]).toMatchObject({
    expectedVersion: 1,
    answer: { kind: "multiple_choice", optionIds: [] },
  });
});

test("waits for the separate questions query before exposing answer controls", async () => {
  state.data = activeData();
  state.questionsReady = false;
  const s = setup();
  await flush();
  expect(screen.queryByLabelText("Explica tu respuesta")).toBeNull();
  state.questionsReady = true;
  s.rerender(s.component());
  await flush();
  expect(textAnswer()).toBeTruthy();
  expect(state.start).toHaveBeenCalledTimes(1);
});

test("separate query refreshes preserve pending answers and the focused input", async () => {
  state.data = activeData();
  const s = setup();
  await flush();
  const input = textAnswer() as HTMLTextAreaElement;
  input.focus();
  fireEvent.change(input, { target: { value: "Borrador local" } });
  state.questionsReady = false;
  s.rerender(s.component());
  expect(textAnswer()).toBe(input);
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe("Borrador local");
  await tick(500);
  expect(state.save).toHaveBeenCalledOnce();
});

test("a bad device clock cannot change the attempt countdown or cause per-second backend reads", async () => {
  state.data = activeData();
  setup();
  await flush();
  vi.setSystemTime(NOW + 24 * 60 * MINUTE);
  await tick(2_000);
  expect(screen.getByRole("timer").textContent).toBe("09:58");
  expect(screen.getByRole("timer").getAttribute("aria-live")).toBe("off");
  expect(
    state.queryArgs.every(
      (args) =>
        JSON.stringify(args) ===
        JSON.stringify({ taskId: task._id, now: task.updatedAt }),
    ),
  ).toBe(true);
  expect(state.start).toHaveBeenCalledOnce();
});

test("losing connectivity keeps local edits but never marks them saved or pauses time", async () => {
  state.data = activeData();
  const s = setup();
  await flush();
  state.connected = false;
  s.rerender(s.component());
  fireEvent.change(textAnswer(), {
    target: { value: "Sin conexión" },
  });
  await tick(3_000);
  expect(screen.getByRole("timer").textContent).toBe("09:57");
  expect(screen.getByText(es.courseQuizzes.offlineHint)).toBeTruthy();
  expect(screen.getByText(es.courseQuizzes.unsavedAnswers)).toBeTruthy();
  expect(state.save).not.toHaveBeenCalled();
  state.connected = true;
  state.connectionCount++;
  state.serverNow = NOW + 3_000;
  s.rerender(s.component());
  await flush();
  await tick(500);
  expect(state.save).toHaveBeenCalledOnce();
  expect(screen.getByText(es.courseQuizzes.answersSaved)).toBeTruthy();
});

test("the browser offline event blocks writes before the WebSocket notices the disconnection", async () => {
  state.data = activeData();
  setup();
  await flush();
  const online = vi
    .spyOn(window.navigator, "onLine", "get")
    .mockReturnValue(false);
  fireEvent(window, new Event("offline"));
  fireEvent.change(textAnswer(), {
    target: { value: "Pending offline" },
  });
  await tick(1_000);
  expect(screen.getByText(es.courseQuizzes.offlineHint)).toBeTruthy();
  expect(state.save).not.toHaveBeenCalled();
  online.mockReturnValue(true);
  state.serverNow = NOW + 1_000;
  fireEvent(window, new Event("online"));
  await flush();
  await tick(500);
  expect(state.save).toHaveBeenCalledOnce();
  expect(state.start).toHaveBeenCalledTimes(2);
});

test("an offline device waking with an uncertain clock must synchronize before answering again", async () => {
  state.data = activeData();
  const s = setup();
  await flush();
  state.connected = false;
  s.rerender(s.component());
  vi.setSystemTime(NOW + 5 * MINUTE);
  await tick(1_000);
  expect(screen.getByRole("timer").textContent).toBe("—");
  expect(screen.getByText(es.courseQuizzes.clockSyncError)).toBeTruthy();
  expect(textAnswer().closest("fieldset")?.disabled).toBe(true);
  state.connected = true;
  state.serverNow = NOW + 5 * MINUTE;
  s.rerender(s.component());
  await flush();
  expect(screen.getByRole("timer").textContent).toBe("05:00");
  expect(textAnswer().closest("fieldset")?.disabled).toBe(false);
});

test("changes to closing time affect the current display without resetting the personal limit", async () => {
  state.data = activeData();
  const s = setup();
  await flush();
  state.data = { ...state.data, dueAt: NOW + 2 * MINUTE };
  s.rerender(s.component({ ...task, dueAt: state.data.dueAt }));
  expect(screen.getByRole("timer").textContent).toBe("02:00");
  state.data = { ...state.data, dueAt: NOW + 60 * MINUTE };
  s.rerender(s.component());
  expect(screen.getByRole("timer").textContent).toBe("10:00");
  expect(state.start).toHaveBeenCalledOnce();
});

test("a closing-date subscription refresh preserves the focused answer and applies the latest deadline", async () => {
  state.data = activeData();
  const s = setup();
  await flush();
  const input = textAnswer();
  fireEvent.change(input, { target: { value: "Sigo escribiendo" } });
  input.focus();
  state.data = undefined;
  s.rerender(
    s.component({ ...task, dueAt: NOW + 2 * MINUTE, updatedAt: NOW + 1_000 }),
  );
  expect(textAnswer()).toBe(input);
  expect(document.activeElement).toBe(input);
  expect((input as HTMLTextAreaElement).value).toBe("Sigo escribiendo");
  expect(screen.getByRole("timer").textContent).toBe("02:00");
});

test("expiry disables answers and waits for authoritative automatic submission without sending late drafts", async () => {
  state.data = { ...activeData(), dueAt: NOW + 1_000 };
  const s = setup({ ...task, dueAt: NOW + 1_000 });
  await flush();
  fireEvent.change(textAnswer(), {
    target: { value: "Pendiente" },
  });
  await tick(1_000);
  expect(screen.getByRole("timer").textContent).toBe("00:00");
  expect(screen.getByText(es.courseQuizzes.timeExpiredHint)).toBeTruthy();
  expect(textAnswer().closest("fieldset")?.disabled).toBe(true);
  expect(
    screen.queryByRole("button", { name: es.courseQuizzes.submitQuiz }),
  ).toBeNull();
  expect(state.submit).not.toHaveBeenCalled();
  state.data = {
    ...state.data,
    attempt: { ...timing(), submittedAt: NOW + 1_000 },
  };
  s.rerender(s.component());
  expect(screen.getByText(es.courseQuizzes.attemptSubmitted)).toBeTruthy();
  expect(screen.getByText("publishedGrade")).toBeTruthy();
});

test("the materialized global close immediately locks inputs even with clock delivery latency", async () => {
  state.data = activeData();
  const s = setup();
  await flush();
  s.rerender(
    s.component({ ...task, quiz: { durationMinutes: 10, closedAt: NOW } }),
  );
  expect(screen.getByRole("timer").textContent).toBe("00:00");
  expect(textAnswer().closest("fieldset")?.disabled).toBe(true);
});

test("manual submission confirms unanswered questions and includes unflushed final answers", async () => {
  state.data = activeData();
  setup();
  await flush();
  fireEvent.click(screen.getByRole("radio", { name: "Dos" }));
  fireEvent.click(
    screen.getByRole("button", { name: es.courseQuizzes.submitQuiz }),
  );
  expect(screen.getByRole("alertdialog").textContent).toContain(
    "Has respondido 1 de 2 preguntas",
  );
  expect(state.submit).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: es.courseQuizzes.confirmSubmit }),
  );
  await flush();
  expect(state.submit.mock.calls[0][0].answers).toEqual([
    {
      questionId: questions[0]._id,
      answer: { kind: "single_choice", optionId: "b" },
      expectedVersion: 0,
    },
  ]);
  expect(screen.getByText(es.courseQuizzes.attemptSubmitted)).toBeTruthy();
  expect(screen.queryByRole("radio")).toBeNull();
  expect(screen.queryByText("Correcta")).toBeNull();
});

test("a failed manual delivery closes the confirmation and keeps the answer available for retry", async () => {
  state.data = activeData();
  state.submit.mockRejectedValueOnce(new Error("Temporary failure"));
  setup();
  await flush();
  fireEvent.change(textAnswer(), {
    target: { value: "Conservar respuesta" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: es.courseQuizzes.submitQuiz }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: es.courseQuizzes.confirmSubmit }),
  );
  await flush();
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain(
    es.courseQuizzes.answerSaveError,
  );
  expect((textAnswer() as HTMLTextAreaElement).value).toBe(
    "Conservar respuesta",
  );
});

test("a conflict preserves the student's draft until explicitly loading server answers", async () => {
  state.data = activeData();
  state.save.mockRejectedValueOnce(new ConvexError("QUIZ_ANSWER_CHANGED"));
  setup();
  await flush();
  fireEvent.change(textAnswer(), {
    target: { value: "Borrador local" },
  });
  await tick(500);
  expect(screen.getByRole("alert").textContent).toContain(
    es.courseQuizzes.answerConflict,
  );
  state.query.mockResolvedValue({
    ...state.data,
    answers: [
      {
        questionId: questions[1]._id,
        answer: { kind: "text", text: "Desde otra pestaña" },
        version: 2,
      },
    ],
  });
  fireEvent.click(
    screen.getByRole("button", { name: es.courseQuizzes.loadSavedAnswers }),
  );
  await flush();
  expect((textAnswer() as HTMLTextAreaElement).value).toBe(
    "Desde otra pestaña",
  );
});

test("focus resynchronizes an existing attempt without changing its start or duration", async () => {
  state.data = activeData();
  setup();
  await flush();
  state.serverNow = NOW + 5 * MINUTE;
  fireEvent.focus(window);
  await flush();
  expect(screen.getByRole("timer").textContent).toBe("05:00");
  expect(state.start).toHaveBeenCalledTimes(2);
});

test("responses held during a long disconnection are replaced by a fresh clock sample", async () => {
  state.data = activeData();
  let resolve!: (value: object) => void;
  state.start.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  setup();
  await flush();
  await tick(6_000);
  state.serverNow = NOW + 6_000;
  await act(async () => resolve({ ...timing(), serverNow: NOW }));
  expect(state.start).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("timer").textContent).toBe("09:54");
});

test("a delayed clock sample does not show the response transit time as extra time", async () => {
  state.data = activeData();
  let resolve!: (value: object) => void;
  state.start.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  setup();
  await flush();
  await tick(4_000);
  await act(async () => resolve({ ...timing(), serverNow: NOW }));
  expect(state.start).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("timer").textContent).toBe("09:56");
  await tick(2_000);
  expect(screen.getByRole("timer").textContent).toBe("09:54");
});

test("a closed quiz cannot start and confirmed submissions cannot start a second attempt", async () => {
  const s = setup({ ...task, quiz: { durationMinutes: 10, closedAt: NOW } });
  expect(screen.getByText(es.courseQuizzes.quizClosed)).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: es.courseQuizzes.startQuiz }),
  ).toBeNull();
  state.data = { ...activeData(), attempt: { ...timing(), submittedAt: NOW } };
  s.rerender(s.component(task));
  await flush();
  expect(screen.getByText(es.courseQuizzes.attemptSubmitted)).toBeTruthy();
  expect(state.start).not.toHaveBeenCalled();
});

test("identity changes cannot carry another student's pending answer or pending autosave", async () => {
  state.data = activeData();
  const s = setup();
  await flush();
  fireEvent.change(textAnswer(), {
    target: { value: "Respuesta privada" },
  });
  state.userId = "other-student";
  s.rerender(s.component());
  await flush();
  expect((textAnswer() as HTMLTextAreaElement).value).toBe("");
  await tick(500);
  expect(state.save).not.toHaveBeenCalled();
});

test.each([
  ["en", en],
  ["pt-BR", pt],
] as const)(
  "student instructions and actions have complete %s translations",
  (locale, messages) => {
    render(
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone="UTC"
      >
        <CourseQuizStudent task={task} timeZone="UTC" />
      </NextIntlClientProvider>,
    );
    expect(
      screen.getByRole("button", { name: messages.courseQuizzes.startQuiz }),
    ).toBeTruthy();
    expect(screen.getByText(messages.courseQuizzes.startRules)).toBeTruthy();
  },
);

test("server question order drives numbering while drafts remain bound to their question IDs", async () => {
  state.data = {
    ...activeData(),
    questions: [...questions].reverse(),
    answers: [
      {
        questionId: questions[1]._id,
        version: 1,
        answer: { kind: "text", text: "Respuesta guardada" },
      },
    ],
  };
  setup();
  await flush();
  const fieldsets = document.querySelectorAll("fieldset");
  expect(fieldsets[0].textContent).toContain("Pregunta 1");
  expect(fieldsets[0].textContent).toContain("Explica tu respuesta");
  expect(fieldsets).toHaveLength(1);
  const text = textAnswer();
  expect(text.value).toBe("Respuesta guardada");
  fireEvent.change(text, { target: { value: "Respuesta editada" } });
  await flush();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(state.save.mock.calls.at(-1)?.[0].answers).toEqual([
    {
      questionId: questions[1]._id,
      expectedVersion: 1,
      answer: { kind: "text", text: "Respuesta editada" },
    },
  ]);
});

test("quiz content is not selectable while written responses remain editable", async () => {
  state.data = activeData();
  setup();
  await flush();
  const fieldset = textAnswer().closest("fieldset")!;
  expect(fieldset.parentElement!.classList.contains("select-none")).toBe(true);
  const input = textAnswer();
  expect(input.classList.contains("select-text")).toBe(true);
});

test("active answering stays focused without a course-exit action while the timer and autosave continue", async () => {
  state.data = activeData();
  setup();
  await flush();
  const region = screen.getByRole("region", {
    name: es.courseQuizzes.studentQuiz,
  });
  expect(region.getAttribute("data-quiz-active")).toBe("true");
  expect(document.activeElement).toBe(region.querySelector("fieldset"));
  expect(
    screen.queryByRole("button", { name: /Volver al curso|Continuar quiz/ }),
  ).toBeNull();
  fireEvent.change(textAnswer(), { target: { value: "Sigue guardándose" } });
  await tick(2_000);
  expect(state.save).toHaveBeenCalledOnce();
  expect(screen.getByRole("timer").textContent).toBe("09:58");
  expect(textAnswer().value).toBe("Sigue guardándose");
  expect(region.getAttribute("data-quiz-active")).toBe("true");
  expect(state.start).toHaveBeenCalledOnce();
});

test("paging preserves unsaved answers by ID, allows skipping, and never restarts or submits", async () => {
  state.data = activeData();
  setup();
  await flush();
  expect(document.querySelectorAll("fieldset")).toHaveLength(1);
  expect(
    screen
      .getByRole("button", { name: es.courseQuizzes.previousQuestion })
      .hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: es.courseQuizzes.nextQuestion }),
  );
  expect(screen.getByText("Pregunta 2 de 2")).toBeTruthy();
  fireEvent.change(textAnswer(), {
    target: { value: "Sin esperar al autoguardado" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: es.courseQuizzes.previousQuestion }),
  );
  fireEvent.click(screen.getByRole("radio", { name: "Uno" }));
  fireEvent.click(
    screen.getByRole("button", { name: es.courseQuizzes.nextQuestion }),
  );
  expect(textAnswer().value).toBe("Sin esperar al autoguardado");
  expect(screen.getByText("2 de 2 preguntas respondidas")).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: es.courseQuizzes.nextQuestion })
      .hasAttribute("disabled"),
  ).toBe(true);
  await tick(500);
  expect(state.save).toHaveBeenCalledOnce();
  expect(state.save.mock.calls[0][0].answers).toHaveLength(2);
  expect(state.start).toHaveBeenCalledOnce();
  expect(state.submit).not.toHaveBeenCalled();
});

test("restores the current question in the same tab without changing a server shuffled order", async () => {
  state.data = activeData();
  const first = setup();
  await flush();
  navigateQuestion(2);
  first.unmount();
  setup();
  await flush();
  expect(screen.getByText("Pregunta 2 de 2")).toBeTruthy();
  expect(textAnswer().value).toBe("");
  expect(document.activeElement).toBe(document.querySelector("fieldset"));
});

test("invalid or outdated stored question IDs safely fall back to the first question", async () => {
  sessionStorage.setItem(
    `flexidual:quiz-position:v1:student:${task._id}`,
    JSON.stringify("deleted-question"),
  );
  state.data = activeData();
  setup();
  await flush();
  expect(screen.getByText("Pregunta 1 de 2")).toBeTruthy();
  expect(screen.getByRole("radio", { name: "Uno" })).toBeTruthy();
});

test("submission summary links to unanswered questions, closes the dialog and focuses the selected question", async () => {
  state.data = activeData();
  setup();
  await flush();
  fireEvent.click(screen.getByRole("radio", { name: "Uno" }));
  fireEvent.click(
    screen.getByRole("button", { name: es.courseQuizzes.submitQuiz }),
  );
  expect(
    screen.getByRole("navigation", { name: es.courseQuizzes.pendingQuestions })
      .textContent,
  ).toBe("2");
  fireEvent.click(screen.getByRole("button", { name: /^Pregunta 2:/ }));
  await flush();
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(document.activeElement).toBe(textAnswer().closest("fieldset"));
  expect(state.submit).not.toHaveBeenCalled();
});

test("50-question navigation is bounded to one rendered answer and reports response status without correctness", async () => {
  state.data = {
    ...activeData(),
    questions: Array.from({ length: 50 }, (_, index) => ({
      ...questions[1],
      _id: `text-${index}`,
      prompt: `Ejercicio ${index + 1}`,
    })) as Data["questions"],
  };
  setup();
  await flush();
  navigateQuestion(50);
  expect(screen.getByText("Pregunta 50 de 50")).toBeTruthy();
  expect(document.querySelectorAll("fieldset")).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("Ejercicio 50"), {
    target: { value: "Mi respuesta" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: es.courseQuizzes.questionNavigator }),
  );
  const last = screen.getByRole("button", { name: "Pregunta 50: Respondida" });
  expect(last.getAttribute("aria-current")).toBe("step");
  expect(screen.getByRole("button", { name: /^Pregunta 1:/ }).textContent).toBe(
    "1",
  );
  expect(screen.queryByText(es.courseQuizzes.correct)).toBeNull();
  fireEvent.click(last);
  expect(document.activeElement).toBe(document.querySelector("fieldset"));
});

test("navigation stays disabled while an active attempt is waiting for its question list", async () => {
  state.data = { ...activeData(), questions: [] };
  state.start.mockResolvedValue({ ...timing(), serverNow: NOW });
  setup();
  await flush();
  for (const name of [
    es.courseQuizzes.previousQuestion,
    es.courseQuizzes.nextQuestion,
    es.courseQuizzes.submitQuiz,
  ])
    expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(
      true,
    );
  expect(screen.getByText("Pregunta 0 de 0")).toBeTruthy();
});

test.each([
  ["en", en],
  ["pt-BR", pt],
] as const)(
  "active question navigation and instructions have complete %s translations",
  async (locale, messages) => {
    state.data = activeData();
    render(
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone="UTC"
      >
        <CourseQuizStudent task={task} timeZone="UTC" />
      </NextIntlClientProvider>,
    );
    await flush();
    for (const name of [
      messages.courseQuizzes.previousQuestion,
      messages.courseQuizzes.nextQuestion,
      messages.courseQuizzes.questionNavigator,
    ])
      expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(
      screen.getByText(messages.courseQuizzes.singleChoiceAnswerHint),
    ).toBeTruthy();
  },
);
