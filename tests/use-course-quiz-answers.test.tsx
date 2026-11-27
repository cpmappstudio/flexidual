import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ConvexError } from "convex/values";
import type { Id } from "@/convex/_generated/dataModel";
import type { QuizAnswer } from "@/hooks/use-course-quiz-answers";

const mutations = vi.hoisted(() => ({ save: vi.fn(), submit: vi.fn() }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: (ref: Parameters<typeof getFunctionName>[0]) =>
      getFunctionName(ref) === "courseQuizzes:saveAnswers"
        ? mutations.save
        : mutations.submit,
  };
});
import { useCourseQuizAnswers } from "@/hooks/use-course-quiz-answers";

const taskId = "quiz-id" as Id<"courseTasks">;
const questionId = "question-id" as Id<"courseQuizQuestions">;
const answer = (text: string) => ({ kind: "text" as const, text });
const props = () => ({
  taskId,
  storageKey: "quiz-draft-test",
  answers: [] as QuizAnswer[],
  enabled: true,
  connected: true,
  completed: false,
});
function setup(initial = props()) {
  return renderHook((value) => useCourseQuizAnswers(value), {
    initialProps: initial,
  });
}
async function tick(ms = 500) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}

beforeEach(() => {
  vi.useFakeTimers();
  window.sessionStorage.clear();
  mutations.save
    .mockReset()
    .mockImplementation(
      async ({
        answers,
      }: {
        answers: { questionId: string; expectedVersion: number }[];
      }) =>
        answers.map((item) => ({
          questionId: item.questionId,
          version: item.expectedVersion + 1,
        })),
    );
  mutations.submit.mockReset().mockResolvedValue({ submittedAt: 123 });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test("debounces edits and treats only acknowledged answers as saved", async () => {
  const { result } = setup();
  act(() => result.current.edit(questionId, answer("A")));
  await tick(300);
  act(() => result.current.edit(questionId, answer("AB")));
  expect(result.current.hasPending).toBe(true);
  expect(mutations.save).not.toHaveBeenCalled();
  await tick();
  expect(mutations.save).toHaveBeenCalledExactlyOnceWith({
    taskId,
    answers: [{ questionId, answer: answer("AB"), expectedVersion: 0 }],
  });
  expect(result.current.hasPending).toBe(false);
  expect(result.current.answerFor(questionId)).toEqual(answer("AB"));
});

test("edits during an in-flight save survive and use the acknowledged version on the next save", async () => {
  const first =
    deferred<{ questionId: typeof questionId; version: number }[]>();
  mutations.save.mockImplementationOnce(() => first.promise);
  const { result } = setup();
  act(() => result.current.edit(questionId, answer("First")));
  await tick();
  act(() => result.current.edit(questionId, answer("Newer")));
  await tick();
  expect(mutations.save).toHaveBeenCalledOnce();
  await act(async () => first.resolve([{ questionId, version: 1 }]));
  expect(result.current.answerFor(questionId)).toEqual(answer("Newer"));
  expect(result.current.hasPending).toBe(true);
  await tick();
  expect(mutations.save.mock.calls[1][0].answers).toEqual([
    { questionId, answer: answer("Newer"), expectedVersion: 1 },
  ]);
  expect(result.current.hasPending).toBe(false);
});

test("an acknowledged version is usable before the subscription echoes it", async () => {
  const { result } = setup();
  act(() => result.current.edit(questionId, answer("One")));
  await tick();
  act(() => result.current.edit(questionId, answer("Two")));
  await tick();
  expect(mutations.save.mock.calls[1][0].answers[0].expectedVersion).toBe(1);
});

test("newer remote answers win for unchanged fields while local pending edits remain visible", async () => {
  const initial = props();
  const { result, rerender } = setup(initial);
  act(() => result.current.edit(questionId, answer("Local")));
  rerender({
    ...initial,
    answers: [{ questionId, answer: answer("Remote"), version: 2 }],
  });
  expect(result.current.answerFor(questionId)).toEqual(answer("Local"));
  mutations.save.mockRejectedValueOnce(new ConvexError("QUIZ_ANSWER_CHANGED"));
  await tick();
  expect(result.current.error).toBe("conflict");
  expect(result.current.answerFor(questionId)).toEqual(answer("Local"));
  await tick(2_000);
  expect(mutations.save).toHaveBeenCalledOnce();
  await act(async () =>
    result.current.loadSaved(async () => [
      { questionId, answer: answer("Remote"), version: 2 },
    ]),
  );
  expect(result.current.answerFor(questionId)).toEqual(answer("Remote"));
  act(() => result.current.edit(questionId, answer("Resolved")));
  await tick();
  expect(mutations.save.mock.calls[1][0].answers[0].expectedVersion).toBe(2);
});

test("a failed save keeps the draft and supports explicit retry", async () => {
  mutations.save.mockRejectedValueOnce(new Error("Network interrupted"));
  const { result } = setup();
  act(() => result.current.edit(questionId, answer("Keep me")));
  await tick();
  expect(result.current.error).toBe("save");
  expect(result.current.hasPending).toBe(true);
  await act(async () => result.current.retry());
  expect(result.current.hasPending).toBe(false);
  expect(result.current.error).toBeNull();
});

test("offline edits are retained without queuing saves and resume saving when reconnected", async () => {
  const initial = { ...props(), connected: false };
  const { result, rerender } = setup(initial);
  act(() => result.current.edit(questionId, answer("Offline work")));
  await tick(2_000);
  expect(mutations.save).not.toHaveBeenCalled();
  expect(result.current.hasPending).toBe(true);
  rerender({ ...initial, connected: true });
  await tick();
  expect(result.current.hasPending).toBe(false);
});

test("manual submission includes final answers before the debounce has elapsed", async () => {
  const { result } = setup();
  act(() => result.current.edit(questionId, answer("Final answer")));
  let receipt;
  await act(async () => {
    receipt = await result.current.submit();
  });
  expect(receipt).toEqual({ submittedAt: 123 });
  expect(mutations.submit).toHaveBeenCalledExactlyOnceWith({
    taskId,
    answers: [
      { questionId, answer: answer("Final answer"), expectedVersion: 0 },
    ],
  });
  expect(mutations.save).not.toHaveBeenCalled();
  expect(result.current.hasPending).toBe(false);
});

test("submission waits for the active save before sending newer pending answers", async () => {
  const first =
    deferred<{ questionId: typeof questionId; version: number }[]>();
  mutations.save.mockImplementationOnce(() => first.promise);
  const { result } = setup();
  act(() => result.current.edit(questionId, answer("First")));
  await tick();
  act(() => result.current.edit(questionId, answer("Last")));
  let submit!: Promise<unknown>;
  act(() => {
    submit = result.current.submit();
  });
  expect(mutations.submit).not.toHaveBeenCalled();
  await act(async () => {
    first.resolve([{ questionId, version: 1 }]);
    await submit;
  });
  expect(mutations.submit.mock.calls[0][0].answers).toEqual([
    { questionId, answer: answer("Last"), expectedVersion: 1 },
  ]);
});

test("a conflicting in-flight save blocks delivery and preserves all pending work", async () => {
  let reject!: (reason: unknown) => void;
  mutations.save.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const { result } = setup();
  act(() => result.current.edit(questionId, answer("Keep")));
  await tick();
  let submit!: Promise<unknown>;
  act(() => {
    submit = result.current.submit();
  });
  await act(async () => {
    reject(new ConvexError("QUIZ_ANSWER_CHANGED"));
    await submit;
  });
  expect(mutations.submit).not.toHaveBeenCalled();
  expect(result.current.answerFor(questionId)).toEqual(answer("Keep"));
  expect(result.current.error).toBe("conflict");
});

test("double submission is blocked while the server response is pending", async () => {
  const pending = deferred<{ submittedAt: number }>();
  mutations.submit.mockReturnValue(pending.promise);
  const { result } = setup();
  act(() => {
    void result.current.submit();
    void result.current.submit();
  });
  expect(mutations.submit).toHaveBeenCalledOnce();
  await act(async () => pending.resolve({ submittedAt: 123 }));
});

test("expiry stops pending autosaves, and completed attempts no longer warn when leaving", async () => {
  const initial = props();
  const { result, rerender } = setup(initial);
  act(() => result.current.edit(questionId, answer("Not confirmed")));
  const pending = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(pending);
  expect(pending.defaultPrevented).toBe(true);
  rerender({ ...initial, enabled: false });
  await tick(1_000);
  expect(mutations.save).not.toHaveBeenCalled();
  rerender({ ...initial, enabled: false, completed: true });
  const done = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(done);
  expect(done.defaultPrevented).toBe(false);
});

test("unmount cancels the debounce so another quiz cannot receive a stale edit", async () => {
  const { result, unmount } = setup();
  act(() => result.current.edit(questionId, answer("Old quiz")));
  unmount();
  await tick(1_000);
  expect(mutations.save).not.toHaveBeenCalled();
});

test("reopening the quiz restores a pending session draft and its original answer version", async () => {
  const first = setup();
  act(() => first.result.current.edit(questionId, answer("Before leaving")));
  first.unmount();
  const reopened = setup();
  expect(reopened.result.current.answerFor(questionId)).toEqual(
    answer("Before leaving"),
  );
  expect(reopened.result.current.hasPending).toBe(true);
  await tick();
  expect(mutations.save.mock.calls[0][0].answers[0].expectedVersion).toBe(0);
  expect(window.sessionStorage.getItem("quiz-draft-test")).toBeNull();
});

test("multiple choice drafts survive reopening and reordered acknowledgements clear the same selection", async () => {
  const first = setup({ ...props(), connected: false });
  act(() =>
    first.result.current.edit(questionId, {
      kind: "multiple_choice",
      optionIds: ["cat", "dog"],
    }),
  );
  first.unmount();
  const reopened = setup();
  expect(reopened.result.current.answerFor(questionId)).toEqual({
    kind: "multiple_choice",
    optionIds: ["cat", "dog"],
  });
  const pending =
    deferred<{ questionId: typeof questionId; version: number }[]>();
  mutations.save.mockImplementationOnce(() => pending.promise);
  await tick();
  act(() =>
    reopened.result.current.edit(questionId, {
      kind: "multiple_choice",
      optionIds: ["dog", "cat"],
    }),
  );
  await act(async () => pending.resolve([{ questionId, version: 1 }]));
  expect(reopened.result.current.hasPending).toBe(false);
  expect(window.sessionStorage.getItem("quiz-draft-test")).toBeNull();
});

test("an old acknowledgement after unmount cannot erase a newer session draft", async () => {
  const pending =
    deferred<{ questionId: typeof questionId; version: number }[]>();
  mutations.save.mockImplementationOnce(() => pending.promise);
  const first = setup();
  act(() => first.result.current.edit(questionId, answer("Old")));
  await tick();
  first.unmount();
  const reopened = setup();
  act(() => reopened.result.current.edit(questionId, answer("Newer")));
  await act(async () => pending.resolve([{ questionId, version: 1 }]));
  expect(reopened.result.current.answerFor(questionId)).toEqual(
    answer("Newer"),
  );
  expect(
    JSON.parse(window.sessionStorage.getItem("quiz-draft-test")!)[0].answer
      .text,
  ).toBe("Newer");
});

test("malformed stored answers are ignored and unavailable browser storage never blocks saving", async () => {
  window.sessionStorage.setItem(
    "quiz-draft-test",
    JSON.stringify([
      { questionId: "__proto__", expectedVersion: 0, answer: answer("Unsafe") },
    ]),
  );
  const store = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("Full");
    });
  const { result } = setup();
  expect(result.current.hasPending).toBe(false);
  act(() => result.current.edit(questionId, answer("Still saved")));
  await tick();
  expect(result.current.hasPending).toBe(false);
  expect(mutations.save).toHaveBeenCalledOnce();
  store.mockRestore();
});

test("completion clears pending session drafts even if a late save acknowledgement arrives", async () => {
  const pending =
    deferred<{ questionId: typeof questionId; version: number }[]>();
  mutations.save.mockImplementationOnce(() => pending.promise);
  const initial = props();
  const { result, rerender } = setup(initial);
  act(() => result.current.edit(questionId, answer("Saved before cutoff")));
  await tick();
  act(() => result.current.edit(questionId, answer("Not included")));
  rerender({ ...initial, enabled: false, completed: true });
  await act(async () => pending.resolve([{ questionId, version: 1 }]));
  expect(window.sessionStorage.getItem("quiz-draft-test")).toBeNull();
});
