import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const auth = vi.hoisted(() => ({ userId: "teacher-a" }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => auth }));
import { useTaskFeedbackDraft } from "@/hooks/use-task-feedback-draft";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  auth.userId = "teacher-a";
  vi.restoreAllMocks();
});

test("drafts stay isolated by teacher, assignment and student", () => {
  const { result, rerender } = renderHook(
    ({ task, student }) => useTaskFeedbackDraft(task, student),
    { initialProps: { task: "task-a", student: "student-a" } },
  );
  act(() => result.current.setDraft({ text: "Comentario", revision: 3 }));
  rerender({ task: "task-b", student: "student-a" });
  expect(result.current.draft).toBeUndefined();
  rerender({ task: "task-a", student: "student-b" });
  expect(result.current.draft).toBeUndefined();
  auth.userId = "teacher-b";
  rerender({ task: "task-a", student: "student-a" });
  expect(result.current.draft).toBeUndefined();
  auth.userId = "teacher-a";
  rerender({ task: "task-a", student: "student-a" });
  expect(result.current.draft).toEqual({ text: "Comentario", revision: 3 });
});

test("blocked browser storage preserves the text in the mounted review", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage blocked", "SecurityError");
  });
  const { result } = renderHook(() => useTaskFeedbackDraft("task", "student"));
  act(() => result.current.setDraft({ text: "No perder", revision: 1 }));
  expect(result.current.draft?.text).toBe("No perder");
});

test("a damaged saved draft does not break the submission review", () => {
  window.sessionStorage.setItem(
    "flexidual:task-feedback:teacher-a:task:student",
    "{invalid",
  );
  const { result } = renderHook(() => useTaskFeedbackDraft("task", "student"));
  expect(result.current.draft).toBeUndefined();
  act(() => result.current.setDraft({ text: "Nuevo comentario", revision: 2 }));
  expect(
    JSON.parse(
      sessionStorage.getItem("flexidual:task-feedback:teacher-a:task:student")!,
    ),
  ).toEqual({ text: "Nuevo comentario", revision: 2 });
});
