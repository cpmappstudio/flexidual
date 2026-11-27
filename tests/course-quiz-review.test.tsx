import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { FunctionReturnType } from "convex/server";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { api } from "@/convex/_generated/api";
import es from "@/messages/es.json";
import en from "@/messages/en.json";
import pt from "@/messages/pt-BR.json";
import { CourseQuizResults } from "@/components/teaching/classes/course-quiz-results";
import {
  CourseQuizTeacherReview,
  QuizReviewEditor,
} from "@/components/teaching/classes/course-quiz-teacher-review";
import { CourseQuizReviewQuestions } from "@/components/teaching/classes/course-quiz-review-questions";
import { hasLocalQuizReviewDraft } from "@/hooks/use-course-quiz-review-draft";

type Review = FunctionReturnType<typeof api.courseQuizzes.getReview>;
type Grade = FunctionReturnType<typeof api.courseTaskGrades.get>;
const state = vi.hoisted(() => ({
  save: vi.fn(),
  publish: vi.fn(),
  queries: [] as { name: string; args: unknown }[],
  review: undefined as Review | undefined,
  grade: undefined as Grade | undefined,
  submittedAt: 1000 as number | undefined,
  mobile: false,
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: "teacher" }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
      const name = getFunctionName(ref);
      state.queries.push({ name, args });
      if (args === "skip") return undefined;
      if (name === "courseQuizzes:getReview") return state.review;
      if (name === "courseTaskGrades:get") return state.grade;
      if (name === "courseTaskSubmissions:get")
        return { studentName: "Estudiante", submittedAt: state.submittedAt };
      throw new Error(`Unexpected query ${name}`);
    },
    useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
      getFunctionName(ref) === "courseQuizzes:saveReview"
        ? state.save
        : state.publish,
    usePaginatedQuery: () => ({
      results: [],
      status: "Exhausted",
      loadMore: vi.fn(),
    }),
  };
});
const taskId = "quiz" as Id<"courseTasks">;
const studentId = "student" as Id<"users">;
const q1 = "q1" as Id<"courseQuizQuestions">;
const q2 = "q2" as Id<"courseQuizQuestions">;
const q3 = "q3" as Id<"courseQuizQuestions">;
const grading = { maxPoints: 10, scaleMax: 100, decimalPlaces: 2 };
const makeReview = (): Review => ({
  questions: [
    {
      _id: q1,
      order: 0,
      kind: "single_choice",
      prompt: "Escoge el número",
      maxPoints: 2,
      correctOptionId: "b",
      options: [
        { id: "a", label: "Uno" },
        { id: "b", label: "Dos" },
      ],
    },
    {
      _id: q2,
      order: 1,
      kind: "text",
      prompt: "Explica la suma",
      maxPoints: 4,
    },
    {
      _id: q3,
      order: 2,
      kind: "text",
      prompt: "Explica la resta",
      maxPoints: 4,
    },
  ],
  answers: [
    {
      questionId: q1,
      version: 1,
      answer: { kind: "single_choice", optionId: "b" },
    },
    {
      questionId: q2,
      version: 1,
      answer: { kind: "text", text: "Sumo dos unidades" },
    },
    {
      questionId: q3,
      version: 1,
      answer: { kind: "text", text: "Quito dos unidades" },
    },
  ],
  scores: [
    { questionId: q1, points: 2 },
    { questionId: q2, points: null },
    { questionId: q3, points: null },
  ],
  version: 0,
  submissionRevision: 1,
  grading,
  comment: undefined,
});
const makeGrade = (): Grade => ({
  grading,
  version: 0,
  draft: null,
  published: null,
  needsReview: false,
});
const task = {
  _id: taskId,
  dueAt: 5000,
  quiz: { durationMinutes: 10 },
} as Doc<"courseTasks">;
const key = "flexidual:quiz-review:teacher:quiz:student";
function wrap(child: React.ReactNode, locale = "es", messages = es) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {child}
    </NextIntlClientProvider>
  );
}
function editor(review = state.review!, grade = state.grade!) {
  return wrap(
    <QuizReviewEditor
      taskId={taskId}
      studentId={studentId}
      timeZone="UTC"
      review={review}
      grade={grade}
      onBusyChange={vi.fn()}
      onPendingChange={vi.fn()}
    />,
  );
}
const score = (number: number) =>
  screen.getByRole<HTMLInputElement>("spinbutton", {
    name: `Puntaje de la pregunta ${number} (sobre 4)`,
  });
const saveButton = () =>
  screen.getByRole<HTMLButtonElement>("button", {
    name: es.courseQuizzes.saveReview,
  });
const publishButton = () =>
  screen.getByRole<HTMLButtonElement>("button", {
    name: "Publicar calificación",
  });
function localDraft(patch: Record<string, unknown> = {}) {
  return {
    scores: { q1: "2", q2: "3", q3: "" },
    comment: "",
    version: 0,
    submissionRevision: 1,
    grading,
    operationId: "operation",
    ...patch,
  };
}
function savedReview(version = 1, complete = false) {
  const review = makeReview();
  review.version = version;
  review.scores = [
    { questionId: q1, points: 2 },
    { questionId: q2, points: 3 },
    { questionId: q3, points: complete ? 4 : null },
  ];
  const grade = makeGrade();
  grade.version = version;
  grade.draft = {
    points: complete ? 9 : 5,
    submissionRevision: 1,
    updatedAt: 2000,
    authorId: "teacher" as Id<"users">,
  };
  return { review, grade };
}
beforeEach(() => {
  state.review = makeReview();
  state.grade = makeGrade();
  state.queries = [];
  state.save.mockReset().mockResolvedValue(1);
  state.publish.mockReset().mockResolvedValue(2);
  state.submittedAt = 1000;
  state.mobile = false;
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test.each([false, true])(
  "closing a pending review requires confirmation even if browser storage fails (mobile: %s)",
  (mobile) => {
    state.mobile = mobile;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    const onClose = vi.fn();
    render(
      wrap(
        <CourseQuizTeacherReview
          taskId={taskId}
          studentId={studentId}
          timeZone="UTC"
          onClose={onClose}
        />,
      ),
    );
    fireEvent.change(score(2), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: es.courseQuizzes.keepEditing }),
    );
    expect(score(2).value).toBe("3");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(
      screen.getByRole("button", { name: es.courseQuizzes.discardChanges }),
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(state.save).not.toHaveBeenCalled();
  },
);

test("an unchanged review closes without confirmation", () => {
  const onClose = vi.fn();
  render(
    wrap(
      <CourseQuizTeacherReview
        taskId={taskId}
        studentId={studentId}
        timeZone="UTC"
        onClose={onClose}
      />,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

test("shows saved answers and automatic scores, allowing only text grading", () => {
  render(editor());
  expect(screen.getAllByRole("spinbutton")).toHaveLength(2);
  expect(screen.queryByText("Correcta")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Ver pregunta automática 1" }),
  );
  expect(screen.getByText("Puntaje: 2 / 2")).toBeTruthy();
  expect(screen.getByText("Correcta")).toBeTruthy();
  expect(screen.getByText("Seleccionada")).toBeTruthy();
  expect(publishButton().disabled).toBe(true);
});
test("saves a private partial review with null for the remaining question", async () => {
  render(editor());
  fireEvent.change(score(2), { target: { value: "3" } });
  expect(screen.getByText(es.courseQuizzes.partialReviewHint)).toBeTruthy();
  expect(hasLocalQuizReviewDraft("teacher", taskId)).toBe(true);
  fireEvent.click(saveButton());
  await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
  expect(state.save).toHaveBeenCalledWith(
    expect.objectContaining({
      taskId,
      studentId,
      expectedVersion: 0,
      expectedSubmissionRevision: 1,
      expectedGrading: grading,
      scores: [
        { questionId: q2, points: 3 },
        { questionId: q3, points: null },
      ],
    }),
  );
  expect(state.publish).not.toHaveBeenCalled();
  await waitFor(() => expect(sessionStorage.getItem(key)).toBeNull());
});
test("a saved partial review cannot publish", () => {
  const { review, grade } = savedReview();
  render(editor(review, grade));
  expect(publishButton().disabled).toBe(true);
  expect(saveButton().disabled).toBe(true);
  expect(screen.getByText("Borrador privado")).toBeTruthy();
});
test("publishes a complete saved review in one atomic review request", async () => {
  const { review, grade } = savedReview(1, true);
  render(editor(review, grade));
  expect(screen.getByText("90 / 100")).toBeTruthy();
  expect(publishButton().disabled).toBe(false);
  fireEvent.click(publishButton());
  fireEvent.click(publishButton());
  await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
  expect(state.publish).not.toHaveBeenCalled();
  expect(state.save).toHaveBeenCalledWith(
    expect.objectContaining({
      taskId,
      studentId,
      expectedVersion: 1,
      expectedSubmissionRevision: 1,
      expectedGrading: grading,
      publish: true,
    }),
  );
});
test("unsaved changes can publish the current complete review directly", async () => {
  const { review, grade } = savedReview(1, true);
  render(editor(review, grade));
  fireEvent.change(score(2), { target: { value: "2" } });
  expect(publishButton().disabled).toBe(false);
  fireEvent.click(publishButton());
  await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
  expect(state.save.mock.calls[0][0]).toMatchObject({
    publish: true,
    expectedVersion: 1,
    scores: [
      { questionId: q2, points: 2 },
      { questionId: q3, points: 4 },
    ],
  });
});

test.each(["-1", "5", "1.001"])(
  "rejects invalid question score %s",
  (value) => {
    render(editor());
    fireEvent.change(score(2), { target: { value } });
    expect(score(2).getAttribute("aria-invalid")).toBe("true");
    expect(saveButton().disabled).toBe(true);
    expect(publishButton().disabled).toBe(true);
  },
);
test("unanswered text is zero without a grading input", async () => {
  state.review!.answers = state.review!.answers.filter(
    ({ questionId }) => questionId !== q3,
  );
  state.review!.scores[2].points = 0;
  render(editor());
  expect(screen.getAllByRole("spinbutton")).toHaveLength(1);
  fireEvent.change(score(2), { target: { value: "3.25" } });
  fireEvent.click(saveButton());
  await waitFor(() => expect(state.save).toHaveBeenCalled());
  expect(state.save.mock.calls[0][0].scores).toEqual([
    { questionId: q2, points: 3.25 },
    { questionId: q3, points: 0 },
  ]);
});
test("restores local edits when the panel is reopened", () => {
  const view = render(editor());
  fireEvent.change(score(2), { target: { value: "3" } });
  view.unmount();
  render(editor());
  expect(score(2).value).toBe("3");
  expect(publishButton().disabled).toBe(true);
});
test("preserves a failed save and retries the same operation", async () => {
  state.save.mockRejectedValueOnce(new Error("network"));
  render(editor());
  fireEvent.change(score(2), { target: { value: "3" } });
  fireEvent.click(saveButton());
  await screen.findByRole("alert");
  const first = state.save.mock.calls[0][0];
  expect(score(2).value).toBe("3");
  expect(sessionStorage.getItem(key)).not.toBeNull();
  fireEvent.click(saveButton());
  await waitFor(() => expect(state.save).toHaveBeenCalledTimes(2));
  expect(state.save.mock.calls[1][0].operationId).toBe(first.operationId);
});
test("concurrent saved changes preserve local work and require explicit recovery", async () => {
  const view = render(editor());
  fireEvent.change(score(2), { target: { value: "3" } });
  const remote = makeReview();
  remote.version = 1;
  remote.scores[1].points = 1;
  view.rerender(editor(remote, { ...makeGrade(), version: 1 }));
  expect(score(2).value).toBe("3");
  expect(score(2).readOnly).toBe(true);
  expect(saveButton().disabled).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: "Conservar mi borrador" }),
  );
  expect(score(2).readOnly).toBe(false);
  fireEvent.click(saveButton());
  await waitFor(() => expect(state.save).toHaveBeenCalled());
  expect(state.save.mock.calls[0][0].expectedVersion).toBe(1);
});
test("changed grading context cannot rebase a local draft", () => {
  sessionStorage.setItem(key, JSON.stringify(localDraft()));
  const review = makeReview();
  review.grading = { ...grading, scaleMax: 5 };
  render(editor(review));
  expect(
    screen.queryByRole("button", { name: "Conservar mi borrador" }),
  ).toBeNull();
  expect(saveButton().disabled).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: "Cargar versión actual" }),
  );
  expect(score(2).value).toBe("");
  expect(sessionStorage.getItem(key)).toBeNull();
});
test("recovered confirmed save clears the local draft without another mutation", async () => {
  sessionStorage.setItem(key, JSON.stringify(localDraft()));
  const { review, grade } = savedReview();
  render(editor(review, grade));
  await waitFor(() => expect(sessionStorage.getItem(key)).toBeNull());
  expect(screen.queryByRole("alert")).toBeNull();
  expect(state.save).not.toHaveBeenCalled();
});
test("waits for matching reactive grade and review versions before publishing", () => {
  const { review, grade } = savedReview(2, true);
  render(editor(review, { ...grade, version: 1 }));
  expect(publishButton().disabled).toBe(true);
  expect(score(2).readOnly).toBe(true);
});
test("reviewing an unsubmitted deep link does not request grading data", () => {
  state.submittedAt = undefined;
  render(
    wrap(
      <CourseQuizTeacherReview
        taskId={taskId}
        studentId={studentId}
        timeZone="UTC"
        onClose={vi.fn()}
      />,
    ),
  );
  expect(screen.getByText(es.courseQuizzes.reviewAfterSubmission)).toBeTruthy();
  expect(
    state.queries.some(({ name }) => name === "courseQuizzes:getReview"),
  ).toBe(false);
});
test("warns before unloading local unsaved work", () => {
  render(editor());
  fireEvent.change(score(2), { target: { value: "3" } });
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
});
test("published totals stay visible while a new private review is edited", () => {
  const { review, grade } = savedReview(1, true);
  grade.published = { ...grade.draft!, points: 9 };
  grade.draft = null;
  render(editor(review, grade));
  expect(screen.getAllByText("90 / 100")).toHaveLength(2);
  fireEvent.change(score(2), { target: { value: "2" } });
  expect(screen.getByText("90 / 100")).toBeTruthy();
  expect(screen.getByText("80 / 100")).toBeTruthy();
  expect(publishButton().disabled).toBe(false);
});
test("publication retry keeps its operation ID", async () => {
  state.save.mockRejectedValueOnce(new Error("network"));
  const { review, grade } = savedReview(1, true);
  render(editor(review, grade));
  fireEvent.click(publishButton());
  await screen.findByRole("alert");
  fireEvent.click(publishButton());
  await waitFor(() => expect(state.save).toHaveBeenCalledTimes(2));
  expect(state.save.mock.calls[0][0].operationId).toBe(
    state.save.mock.calls[1][0].operationId,
  );
});
test.each([undefined, 4999])(
  "does not request keys until the global closing marker matches: %s",
  (closedAt) => {
    render(
      wrap(
        <CourseQuizResults
          timeZone="UTC"
          task={{ ...task, quiz: { durationMinutes: 10, closedAt } }}
        />,
      ),
    );
    expect(state.queries.every(({ args }) => args === "skip")).toBe(true);
    expect(screen.queryByText(es.courseQuizzes.correctAnswer)).toBeNull();
  },
);
test("global close displays keys and published breakdown without editing controls", () => {
  state.review = savedReview(1, true).review;
  render(
    wrap(
      <CourseQuizResults
        timeZone="UTC"
        task={{ ...task, quiz: { durationMinutes: 10, closedAt: task.dueAt } }}
      />,
    ),
  );
  expect(screen.getByText(es.courseQuizzes.correctAnswer)).toBeTruthy();
  expect(screen.getByText("Puntaje: 3 / 4")).toBeTruthy();
  expect(screen.queryByRole("spinbutton")).toBeNull();
  expect(state.queries.at(-1)?.args).toEqual({ taskId });
});

test("multiple choice review shows every selection and key and never exposes a grading input", () => {
  state.review!.questions[0] = {
    _id: q1,
    order: 0,
    kind: "multiple_choice",
    prompt: "Animales domésticos",
    maxPoints: 2,
    options: [
      { id: "cat", label: "Gato" },
      { id: "lion", label: "León" },
      { id: "dog", label: "Perro" },
    ],
    correctOptionIds: ["cat", "dog"],
  };
  state.review!.answers[0] = {
    questionId: q1,
    version: 1,
    answer: { kind: "multiple_choice", optionIds: ["dog", "cat"] },
  };
  const s = render(editor());
  expect(screen.getAllByRole("spinbutton")).toHaveLength(2);
  expect(screen.queryByText("Gato")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Ver pregunta automática 1" }),
  );
  expect(screen.getAllByText(es.courseQuizzes.selectedAnswer)).toHaveLength(2);
  expect(screen.getAllByText(es.courseQuizzes.correct)).toHaveLength(2);
  s.unmount();
  render(
    wrap(
      <CourseQuizResults
        timeZone="UTC"
        task={{ ...task, quiz: { durationMinutes: 10, closedAt: task.dueAt } }}
      />,
    ),
  );
  expect(
    within(screen.getByText("Animales domésticos").closest("li")!).getAllByText(
      es.courseQuizzes.yourAnswer,
    ),
  ).toHaveLength(2);
  expect(screen.getAllByText(es.courseQuizzes.correctAnswer)).toHaveLength(2);
  expect(screen.queryByRole("spinbutton")).toBeNull();
});
test("at close unpublished manual results show pending scores, never private draft scores", () => {
  state.review!.scores = state.review!.scores.map((score) => ({
    ...score,
    points: null,
  }));
  render(
    wrap(
      <CourseQuizResults
        timeZone="UTC"
        task={{ ...task, quiz: { durationMinutes: 10, closedAt: task.dueAt } }}
      />,
    ),
  );
  expect(screen.getAllByText("Pendiente de calificación")).toHaveLength(3);
  expect(screen.getByText(es.courseQuizzes.correctAnswer)).toBeTruthy();
  expect(screen.queryByText("Puntaje: 2 / 2")).toBeNull();
});
test("loading results do not show stale keys", () => {
  state.review = undefined;
  render(
    wrap(
      <CourseQuizResults
        timeZone="UTC"
        task={{ ...task, quiz: { durationMinutes: 10, closedAt: task.dueAt } }}
      />,
    ),
  );
  expect(screen.queryByText(es.courseQuizzes.correctAnswer)).toBeNull();
});
test.each([
  ["en", en],
  ["pt-BR", pt],
] as const)("review copy renders in %s", (locale, messages) => {
  render(
    wrap(
      <QuizReviewEditor
        taskId={taskId}
        studentId={studentId}
        timeZone="UTC"
        review={state.review!}
        grade={state.grade!}
        onBusyChange={vi.fn()}
        onPendingChange={vi.fn()}
      />,
      locale,
      messages as typeof es,
    ),
  );
  expect(
    screen.getByRole("button", { name: messages.courseQuizzes.saveReview }),
  ).toBeTruthy();
});
test("draft scan is scoped to the signed-in teacher and task", () => {
  sessionStorage.setItem(key, JSON.stringify(localDraft()));
  expect(hasLocalQuizReviewDraft("teacher", "quiz")).toBe(true);
  expect(hasLocalQuizReviewDraft("another", "quiz")).toBe(false);
  expect(hasLocalQuizReviewDraft("teacher", "another")).toBe(false);
});
test.each([
  "invalid-json",
  JSON.stringify(localDraft({ scores: { q2: 3 } })),
  JSON.stringify(localDraft({ grading: { ...grading, decimalPlaces: 5 } })),
])("unreadable or invalid local draft does not block publishing", (raw) => {
  sessionStorage.setItem(key, raw);
  expect(hasLocalQuizReviewDraft("teacher", "quiz")).toBe(false);
});

test("individual review uses the attempt order and saves manual points by question ID", async () => {
  state.review!.questions.reverse();
  render(editor());
  expect(score(1).value).toBe("");
  fireEvent.change(score(1), { target: { value: "1" } });
  fireEvent.change(score(2), { target: { value: "3" } });
  fireEvent.click(saveButton());
  await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
  expect(state.save.mock.calls[0][0].scores).toEqual([
    { questionId: q3, points: 1 },
    { questionId: q2, points: 3 },
  ]);
});

test.each(["teacher", "student"] as const)(
  "review copy protection respects the audience (%s)",
  (audience) => {
    const s = render(
      wrap(
        <CourseQuizReviewQuestions
          review={state.review!}
          audience={audience}
        />,
      ),
    );
    const prompt = screen.getByText("Escoge el número");
    const range = document.createRange();
    range.selectNodeContents(prompt);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(
      s.container.querySelector("ol")!.classList.contains("select-none"),
    ).toBe(audience === "student");
    expect(fireEvent.copy(document)).toBe(audience === "teacher");
    selection.removeAllRanges();
  },
);

test("a complete unsaved review can publish at closing without saving a draft first", async () => {
  const grade = { ...makeGrade(), availableAt: 5000 };
  render(editor(makeReview(), grade));
  fireEvent.change(score(2), { target: { value: "3" } });
  fireEvent.change(score(3), { target: { value: "4" } });
  const publish = screen.getByRole<HTMLButtonElement>("button", {
    name: es.courseQuizzes.publishAtClose,
  });
  expect(publish.disabled).toBe(false);
  expect(screen.getByText(/Al publicar, guardas la revisión/)).toBeTruthy();
  fireEvent.click(publish);
  await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
  expect(state.save.mock.calls[0][0]).toMatchObject({
    publish: true,
    expectedVersion: 0,
    scores: [
      { questionId: q2, points: 3 },
      { questionId: q3, points: 4 },
    ],
  });
  expect(state.publish).not.toHaveBeenCalled();
  await waitFor(() => expect(sessionStorage.getItem(key)).toBeNull());
});

test("prepared grades show a scheduled status until the server releases them", () => {
  const { review, grade } = savedReview(2, true);
  grade.published = grade.draft;
  grade.draft = null;
  grade.availableAt = 5000;
  const view = render(editor(review, grade));
  expect(screen.getByText(es.courseQuizzes.preparedGrade)).toBeTruthy();
  expect(screen.getByText(es.courseQuizzes.gradeScheduled)).toBeTruthy();
  expect(
    screen.getByText(/La nota se mostrará automáticamente al cierre/),
  ).toBeTruthy();
  expect(screen.queryByText(es.courseQuizzes.publishedGrade)).toBeNull();
  expect(
    screen.getByRole<HTMLButtonElement>("button", {
      name: es.courseQuizzes.publishAtClose,
    }).disabled,
  ).toBe(true);
  view.rerender(editor(review, { ...grade, availableAt: undefined }));
  expect(screen.getByText(es.courseQuizzes.publishedGrade)).toBeTruthy();
  expect(screen.getByText(es.courseQuizzes.gradePublished)).toBeTruthy();
  expect(screen.queryByText(es.courseQuizzes.gradeScheduled)).toBeNull();
});
