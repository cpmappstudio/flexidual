import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import type { GradingConfiguration } from "@/lib/grading";

const state = vi.hoisted(() => ({
  userId: "teacher-1",
  grade: {
    grading: { maxPoints: 20, scaleMax: 100, decimalPlaces: 2 } as GradingConfiguration,
    version: 0,
    draft: null as null | {
      points: number;
      institutionalPoints?: number;
      comment?: string;
      submissionRevision: number;
      authorId: string;
      updatedAt: number;
    },
    published: null as null | {
      points: number;
      institutionalPoints?: number;
      comment?: string;
      submissionRevision: number;
      authorId: string;
      updatedAt: number;
    },
    needsReview: false,
  },
}));
const saveDraft = vi.hoisted(() => vi.fn());
const publish = vi.hoisted(() => vi.fn());
const history = vi.hoisted(() => vi.fn());
const historyEntries = vi.hoisted(() => [
  { version: 4, points: 18, institutionalPoints: 90, updatedAt: 20, comment: "Latest publication" },
  { version: 2, points: 10, updatedAt: 10, comment: "First publication" },
]);
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: state.userId }) }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({
    number: (n: number) => String(n),
    dateTime: (n: number) => String(n),
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: () => state.grade,
    useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
      getFunctionName(ref).endsWith(":saveDraft") ? saveDraft : publish,
    usePaginatedQuery: (...args: unknown[]) => {
      history(...args);
      return {
        results: historyEntries,
        status: "Exhausted",
        loadMore: vi.fn(),
      };
    },
  };
});
import { CourseTaskGrade } from "@/components/teaching/classes/course-task-grade";

const taskId = "task-1" as Id<"courseTasks">;
const studentId = "student-1" as Id<"users">;
const props = { taskId, studentId, submissionRevision: 0, timeZone: "UTC" };
beforeEach(() => {
  sessionStorage.clear();
  state.userId = "teacher-1";
  state.grade = {
    grading: { maxPoints: 20, scaleMax: 100, decimalPlaces: 2 },
    version: 0,
    draft: null,
    published: null,
    needsReview: false,
  };
  saveDraft.mockReset().mockResolvedValue(1);
  publish.mockReset().mockResolvedValue(2);
  history.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("zero is valid; blur saves it privately without a save button", async () => {
  render(<CourseTaskGrade {...props} />);
  fireEvent.change(screen.getByLabelText("points"), { target: { value: "0" } });
  expect(saveDraft).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
  expect(screen.queryByRole("status")).toBeNull();
  const leaving = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(leaving);
  expect(leaving.defaultPrevented).toBe(true);
  expect(screen.queryByRole("button", { name: "saveDraft" })).toBeNull();
  fireEvent.blur(screen.getByLabelText("points"));
  await waitFor(() => expect(saveDraft).toHaveBeenCalledOnce());
  expect(saveDraft.mock.calls[0][0]).toMatchObject({
    institutionalPoints: 0,
    expectedVersion: 0,
    expectedSubmissionRevision: 0,
    expectedGrading: { maxPoints: 20, scaleMax: 100, decimalPlaces: 2 },
    taskId,
    studentId,
  });
  expect(publish).not.toHaveBeenCalled();
});

test("a burst of edits autosaves only the last value and never publishes", async () => {
  vi.useFakeTimers();
  try {
    render(<CourseTaskGrade {...props} />);
    const input = screen.getByLabelText("points");
    fireEvent.change(input, { target: { value: "8" } });
    await act(async () => vi.advanceTimersByTimeAsync(500));
    fireEvent.change(input, { target: { value: "85" } });
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(saveDraft).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(saveDraft).toHaveBeenCalledOnce();
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({ institutionalPoints: 85 }));
    expect(publish).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

test("students see the published value, never the private draft or editing actions", () => {
  state.grade.published = {
    points: 10,
    comment: "Published comment",
    submissionRevision: 0,
    authorId: "teacher-1",
    updatedAt: 1,
  };
  state.grade.draft = {
    points: 18,
    comment: "Private comment",
    submissionRevision: 0,
    authorId: "teacher-1",
    updatedAt: 2,
  };
  const view = render(<CourseTaskGrade taskId={taskId} timeZone="UTC" />);
  expect(screen.getByText("50 / 100", { exact: true })).toBeTruthy();
  expect(screen.queryByText(/10 \/ 20/)).toBeNull();
  expect(screen.getByText("Published comment")).toBeTruthy();
  expect(screen.queryByText("Private comment")).toBeNull();
  expect(screen.queryByText("passed")).toBeNull();
  expect(screen.queryByText("failed")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
  expect(history).not.toHaveBeenCalled();
  state.grade.published = {
    ...state.grade.published,
    points: 17.034,
    institutionalPoints: 85.17,
  };
  view.rerender(<CourseTaskGrade taskId={taskId} timeZone="UTC" />);
  expect(screen.getByText("85.17 / 100", { exact: true })).toBeTruthy();
});

test("only a published grade determines the outcome, including the exact threshold", () => {
  state.grade.grading.passingPercentage = 70;
  const draft = {
    points: 14,
    submissionRevision: 0,
    authorId: "teacher-1",
    updatedAt: 1,
  };
  state.grade.draft = draft;
  const view = render(<CourseTaskGrade {...props} />);
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByText("privateDraft")).toBeNull();
  expect(screen.queryByText("notPublished")).toBeNull();
  expect(screen.queryByText("passed")).toBeNull();
  expect(screen.queryByText("failed")).toBeNull();

  view.rerender(<CourseTaskGrade taskId={taskId} timeZone="UTC" />);
  expect(screen.queryByRole("region", { name: "title" })).toBeNull();

  state.grade.published = { ...draft, points: 13.99 };
  view.rerender(<CourseTaskGrade {...props} />);
  expect(screen.getByText("failed")).toBeTruthy();
  expect(screen.queryByText("passed")).toBeNull();

  state.grade.published = draft;
  view.rerender(<CourseTaskGrade taskId={taskId} timeZone="UTC" />);
  expect(screen.getByText("passed")).toBeTruthy();
  expect(screen.queryByText("failed")).toBeNull();

  state.grade.published = { ...draft, points: 13.998, institutionalPoints: 69.99 };
  view.rerender(<CourseTaskGrade taskId={taskId} timeZone="UTC" />);
  expect(screen.getByText("failed")).toBeTruthy();
  expect(screen.queryByText("passed")).toBeNull();
});

test("teacher edits on the institutional scale without rewriting the old score when only the comment changes", async () => {
  state.grade.grading.scaleMax = 10;
  state.grade.grading.decimalPlaces = 1;
  state.grade.grading.passingPercentage = 70;
  state.grade.published = {
    points: 13.9,
    submissionRevision: 0,
    authorId: "teacher-1",
    updatedAt: 1,
  };
  render(<CourseTaskGrade {...props} />);
  const input = screen.getByLabelText<HTMLInputElement>("points");
  expect(input.max).toBe("10");
  expect(input.value).toBe("7");
  expect(screen.queryByText("7 / 10")).toBeNull();
  expect(screen.getByText("failed")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("comment"), { target: { value: "Feedback" } });
  await act(async () => fireEvent.submit(screen.getByLabelText("points").closest("form")!));
  expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
    points: 13.9,
    comment: "Feedback",
  }));
  expect(publish).not.toHaveBeenCalled();
});

test("failed saves preserve the operation id for retries and prevent parallel saves", async () => {
  saveDraft.mockRejectedValueOnce(new Error("offline"));
  render(<CourseTaskGrade {...props} />);
  fireEvent.change(screen.getByLabelText("points"), {
    target: { value: "12" },
  });
  fireEvent.submit(screen.getByLabelText("points").closest("form")!);
  await waitFor(() =>
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "retryDraft" }).disabled,
    ).toBe(false),
  );
  const first = saveDraft.mock.calls[0][0];
  let complete: (value: number) => void = () => {};
  saveDraft.mockImplementationOnce(
    () =>
      new Promise<number>((resolve) => {
        complete = resolve;
      }),
  );
  fireEvent.submit(screen.getByLabelText("points").closest("form")!);
  fireEvent.submit(screen.getByLabelText("points").closest("form")!);
  expect(saveDraft).toHaveBeenCalledTimes(2);
  expect(saveDraft.mock.calls[1][0]).toEqual(first);
  complete(1);
  await waitFor(() =>
    expect(
      screen.getByLabelText<HTMLInputElement>("points").readOnly,
    ).toBe(true),
  );
  expect(
    sessionStorage.getItem(`flexidual:task-grade:teacher-1:${taskId}:${studentId}`),
  ).toBeNull();
});

test("a late save preserves a newer draft that can be kept and saved privately", async () => {
  const response = Promise.withResolvers<number>();
  saveDraft.mockReturnValueOnce(response.promise);
  const first = render(<CourseTaskGrade {...props} />);
  fireEvent.change(screen.getByLabelText("points"), { target: { value: "14" } });
  fireEvent.submit(screen.getByLabelText("points").closest("form")!);
  expect(saveDraft).toHaveBeenCalledOnce();
  first.unmount();

  const reopened = render(<CourseTaskGrade {...props} />);
  fireEvent.change(screen.getByLabelText("points"), { target: { value: "16" } });
  await act(async () => response.resolve(1));
  fireEvent.change(screen.getByLabelText("comment"), {
    target: { value: "New private comment" },
  });
  reopened.unmount();

  state.grade.version = 1;
  state.grade.draft = {
    points: 2.8,
    institutionalPoints: 14,
    submissionRevision: 0,
    authorId: "teacher-1",
    updatedAt: 1,
  };
  const recovered = render(<CourseTaskGrade {...props} />);
  expect(screen.getByLabelText<HTMLInputElement>("points").value).toBe("16");
  expect(screen.getByRole("alert").textContent).toBe("staleVersion");
  expect(screen.getByLabelText<HTMLInputElement>("points").readOnly).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "keepLocalDraft" }));
  expect(saveDraft).toHaveBeenCalledOnce();
  expect(publish).not.toHaveBeenCalled();

  recovered.unmount();
  render(<CourseTaskGrade {...props} />);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByLabelText<HTMLInputElement>("points").value).toBe("16");
  expect(screen.getByLabelText<HTMLTextAreaElement>("comment").value).toBe("New private comment");
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "publish" }).disabled).toBe(true);
  await act(async () => fireEvent.submit(screen.getByLabelText("points").closest("form")!));
  expect(saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
    institutionalPoints: 16,
    comment: "New private comment",
    expectedVersion: 1,
    expectedSubmissionRevision: 0,
  }));
  expect(publish).not.toHaveBeenCalled();
});

test("opening another grading view during a save accepts the matching server confirmation", async () => {
  const response = Promise.withResolvers<number>();
  saveDraft.mockReturnValueOnce(response.promise);
  const first = render(<CourseTaskGrade {...props} />);
  const input = screen.getByLabelText("points");
  fireEvent.change(input, { target: { value: "85" } });
  fireEvent.blur(input);
  first.unmount();
  const next = render(<CourseTaskGrade {...props} />);
  state.grade.version = 1;
  state.grade.draft = {
    points: 17,
    institutionalPoints: 85,
    submissionRevision: 0,
    authorId: "teacher-1",
    updatedAt: 1,
  };
  await act(async () => response.resolve(1));
  next.rerender(<CourseTaskGrade {...props} />);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByLabelText<HTMLInputElement>("points").value).toBe("85");
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "publish" }).disabled).toBe(false);
  expect(saveDraft).toHaveBeenCalledOnce();
});

test("remote edits and new submissions cannot silently reuse an unsaved local grade", () => {
  const view = render(<CourseTaskGrade {...props} />);
  fireEvent.change(screen.getByLabelText("points"), {
    target: { value: "12" },
  });
  state.grade.version = 1;
  state.grade.draft = {
    points: 15,
    submissionRevision: 1,
    authorId: "teacher-2",
    updatedAt: 5,
  };
  view.rerender(<CourseTaskGrade {...props} submissionRevision={1} />);
  expect(screen.getByRole("alert").textContent).toBe("stale");
  expect(screen.queryByRole("button", { name: "keepLocalDraft" })).toBeNull();
  expect((screen.getByLabelText("points") as HTMLInputElement).value).toBe(
    "12",
  );
  expect(
    screen.getByLabelText<HTMLInputElement>("points").readOnly,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "loadCurrent" }));
  expect((screen.getByLabelText("points") as HTMLInputElement).value).toBe(
    "75",
  );
  expect(saveDraft).not.toHaveBeenCalled();
});

test("temporary browser storage failure does not prevent cloud saving", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("full", "QuotaExceededError");
  });
  render(<CourseTaskGrade {...props} />);
  fireEvent.change(screen.getByLabelText("points"), {
    target: { value: "14" },
  });
  expect((screen.getByLabelText("points") as HTMLInputElement).value).toBe(
    "14",
  );
  fireEvent.submit(screen.getByLabelText("points").closest("form")!);
  await waitFor(() => expect(saveDraft).toHaveBeenCalledOnce());
});

test.each([{ maxPoints: 100 }, { scaleMax: 20 }, { decimalPlaces: 0 }, { passingPercentage: 70 }])(
  "a grading configuration change cannot reinterpret a local draft: %j",
  (change) => {
    const first = render(<CourseTaskGrade {...props} />);
    fireEvent.change(screen.getByLabelText("points"), {
      target: { value: "10" },
    });
    first.unmount();
    state.grade.grading = { ...state.grade.grading, ...change };
    render(<CourseTaskGrade {...props} />);
    expect((screen.getByLabelText("points") as HTMLInputElement).value).toBe(
      "10",
    );
    expect(screen.getByRole("alert").textContent).toBe("stale");
    expect(screen.queryByRole("button", { name: "keepLocalDraft" })).toBeNull();
    expect(
      screen.getByLabelText<HTMLInputElement>("points").readOnly,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "publish" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(saveDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "loadCurrent" }));
    expect((screen.getByLabelText("points") as HTMLInputElement).value).toBe(
      "",
    );
  },
);

test("legacy drafts without a grading snapshot remain recoverable but require review", () => {
  sessionStorage.setItem(
    `flexidual:task-grade:teacher-1:${taskId}:${studentId}`,
    JSON.stringify({
      points: "10",
      comment: "Unsaved feedback",
      version: 0,
      submissionRevision: 0,
      operationId: "legacy-draft",
    }),
  );
  render(<CourseTaskGrade {...props} />);
  expect((screen.getByLabelText("points") as HTMLInputElement).value).toBe(
    "10",
  );
  expect((screen.getByLabelText("comment") as HTMLTextAreaElement).value).toBe(
    "Unsaved feedback",
  );
  expect(screen.getByRole("alert").textContent).toBe("stale");
  expect(screen.queryByRole("button", { name: "keepLocalDraft" })).toBeNull();
  expect(
    screen.getByLabelText<HTMLInputElement>("points").readOnly,
  ).toBe(true);
});

test.each([
  { storedPoints: "17", institutionalScale: undefined, request: { points: 17 } },
  { storedPoints: "85", institutionalScale: true, request: { institutionalPoints: 85 } },
])("reopens a local draft without changing its scale ($storedPoints)", async ({ storedPoints, institutionalScale, request }) => {
  sessionStorage.setItem(
    `flexidual:task-grade:teacher-1:${taskId}:${studentId}`,
    JSON.stringify({
      points: storedPoints,
      institutionalScale,
      comment: "Earlier draft",
      version: 0,
      submissionRevision: 0,
      operationId: "earlier-draft",
      grading: state.grade.grading,
    }),
  );
  render(<CourseTaskGrade {...props} />);
  expect(screen.getByLabelText<HTMLInputElement>("points").value).toBe("85");
  await act(async () => fireEvent.submit(screen.getByLabelText("points").closest("form")!));
  expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
    ...request,
    operationId: "earlier-draft",
  }));
});

test("reopening restores unsaved input but does not mix students or accounts", () => {
  state.grade.grading.passingPercentage = 70;
  const first = render(<CourseTaskGrade {...props} />);
  fireEvent.change(screen.getByLabelText("points"), {
    target: { value: "11" },
  });
  first.unmount();
  const second = render(<CourseTaskGrade {...props} />);
  expect((screen.getByLabelText("points") as HTMLInputElement).value).toBe(
    "11",
  );
  expect(screen.queryByRole("alert")).toBeNull();
  second.rerender(
    <CourseTaskGrade {...props} studentId={"student-2" as Id<"users">} />,
  );
  expect((screen.getByLabelText("points") as HTMLInputElement).value).toBe("");
  state.userId = "teacher-2";
  second.rerender(<CourseTaskGrade {...props} />);
  expect((screen.getByLabelText("points") as HTMLInputElement).value).toBe("");
});

test("history is fetched only when expanded and publishing requires a saved, current draft", async () => {
  const consoleError = vi.spyOn(console, "error");
  state.grade.version = 1;
  state.grade.draft = {
    points: 16,
    submissionRevision: 0,
    authorId: "teacher-1",
    updatedAt: 1,
  };
  render(<CourseTaskGrade {...props} />);
  expect(history).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "history" }));
  expect(history).toHaveBeenCalled();
  expect(screen.getByText("90 / 100", { exact: true })).toBeTruthy();
  expect(screen.getByText("50 / 100", { exact: true })).toBeTruthy();
  expect(screen.getByLabelText<HTMLInputElement>("points").max).toBe("100");
  expect(screen.getByText("Latest publication")).toBeTruthy();
  expect(screen.getByText("First publication")).toBeTruthy();
  expect(consoleError).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "publish" }));
  await waitFor(() => expect(publish).toHaveBeenCalledOnce());
  expect(publish.mock.calls[0][0]).toMatchObject({
    expectedVersion: 1,
    expectedSubmissionRevision: 0,
    expectedGrading: { maxPoints: 20, scaleMax: 100, decimalPlaces: 2 },
  });
  expect(saveDraft).not.toHaveBeenCalled();
});

test("out-of-range and excessive-precision grades cannot be saved", () => {
  render(<CourseTaskGrade {...props} />);
  for (const value of ["-1", "101", "1.234", ""]) {
    fireEvent.change(screen.getByLabelText("points"), { target: { value } });
    fireEvent.blur(screen.getByLabelText("points"));
    fireEvent.submit(screen.getByLabelText("points").closest("form")!);
  }
  expect(saveDraft).not.toHaveBeenCalled();
});
