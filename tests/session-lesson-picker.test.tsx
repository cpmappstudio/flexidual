import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import {
  SessionLessonPicker,
  type LessonSelectionItem,
} from "@/components/classroom/session-lesson-picker";
import { SessionCloseoutDialog } from "@/components/classroom/session-closeout-dialog";

const mocks = vi.hoisted(() => ({
  dateTime: vi.fn(() => "Oct 20, 2026"),
  context: null as unknown,
  submit: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTranslations:
    () => (key: string, values?: { count: number; date: string }) =>
      values ? `${key} ${values.count} ${values.date}` : key,
  useFormatter: () => ({ dateTime: mocks.dateTime }),
}));
vi.mock("convex/react", () => ({
  useQuery: (_query: unknown, args: unknown) =>
    args === "skip" ? undefined : mocks.context,
  useMutation: () => mocks.submit,
}));

const lessons: LessonSelectionItem[] = [
  {
    lessonId: "one" as Id<"lessons">,
    title: "Introduction",
    order: 1,
    previousSessionCount: 0,
  },
  {
    lessonId: "two" as Id<"lessons">,
    title: "Fractions",
    order: 12,
    previousSessionCount: 2,
    lastRecordedAt: 1792494000000,
  },
  {
    lessonId: "three" as Id<"lessons">,
    title: "Geometry",
    order: 3,
    previousSessionCount: 0,
  },
];

beforeEach(() => {
  mocks.dateTime.mockClear();
  mocks.submit.mockReset();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function ControlledPicker({ disabled = false }: { disabled?: boolean }) {
  const [selected, setSelected] = useState(new Set<Id<"lessons">>());
  return (
    <SessionLessonPicker
      lessons={lessons}
      selectedLessons={selected}
      onSelectedLessonsChange={setSelected}
      disabled={disabled}
    />
  );
}

test("pending is the default; status counts, search by title/order and taught history are preserved", () => {
  render(<ControlledPicker />);
  expect(
    screen
      .getByRole("radio", { name: "filter.pending2" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  expect(screen.queryByText("Fractions")).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "filter.all3" }));
  expect(
    screen.getByText("lessonTaught · previouslyRecordedDetails 2 Oct 20, 2026"),
  ).toBeTruthy();
  expect(mocks.dateTime).toHaveBeenCalledWith(lessons[1].lastRecordedAt, {
    dateStyle: "medium",
  });
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "  FRACTIONS  " },
  });
  expect(screen.getByText("Fractions")).toBeTruthy();
  expect(screen.queryByText("Geometry")).toBeNull();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "12" } });
  expect(screen.getByText("Fractions")).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "filter.pending2" }));
  expect(screen.getByText("noMatchingLessons")).toBeTruthy();
});

test("selection stays controlled and survives filters without mutating the supplied Set", () => {
  const selected = new Set<Id<"lessons">>([lessons[1].lessonId]);
  const onChange = vi.fn();
  render(
    <SessionLessonPicker
      lessons={lessons}
      selectedLessons={selected}
      onSelectedLessonsChange={onChange}
    />,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: /Introduction/ }));
  expect(selected.size).toBe(1);
  expect(onChange.mock.calls[0][0]).toEqual(
    new Set([lessons[1].lessonId, lessons[0].lessonId]),
  );
  fireEvent.click(screen.getByRole("radio", { name: "filter.taught1" }));
  const taught = screen.getByRole("checkbox", { name: /Fractions/ });
  expect(taught.getAttribute("aria-checked")).toBe("true");
  fireEvent.click(taught);
  expect(onChange.mock.calls[1][0]).toEqual(new Set());
});

test("disabled selectors block search, filter and checkbox edits", () => {
  const onChange = vi.fn();
  render(
    <SessionLessonPicker
      lessons={lessons}
      selectedLessons={new Set()}
      onSelectedLessonsChange={onChange}
      disabled
    />,
  );
  expect((screen.getByRole("searchbox") as HTMLInputElement).disabled).toBe(
    true,
  );
  for (const control of screen.getAllByRole("radio"))
    expect((control as HTMLButtonElement).disabled).toBe(true);
  const checkbox = screen.getByRole("checkbox", { name: /Introduction/ });
  expect((checkbox as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(checkbox);
  expect(onChange).not.toHaveBeenCalled();
});

test("loading, empty and remounted picker state are distinct", () => {
  const props = {
    selectedLessons: new Set<Id<"lessons">>(),
    onSelectedLessonsChange: vi.fn(),
  };
  const view = render(<SessionLessonPicker {...props} lessons={undefined} />);
  expect(screen.queryByText("noLessons")).toBeNull();
  view.rerender(<SessionLessonPicker {...props} lessons={[]} />);
  expect(screen.getByText("noLessons")).toBeTruthy();
  view.rerender(<SessionLessonPicker {...props} lessons={lessons} />);
  fireEvent.click(screen.getByRole("radio", { name: "filter.taught1" }));
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Fractions" },
  });
  view.rerender(
    <SessionLessonPicker key="new-session" {...props} lessons={lessons} />,
  );
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
  expect(screen.queryByText("Fractions")).toBeNull();
});

test("closeout preserves its selection and search across steps without refreshing its frozen context", async () => {
  mocks.context = {
    scheduleId: "schedule",
    className: "Course",
    canClose: true,
    closureStatus: "pending",
    lessons: lessons.map((lesson) => ({ ...lesson, selected: false })),
    attendance: [],
    notes: "",
  };
  const props = {
    open: true,
    roomName: "one",
    sessionNow: Date.now(),
    onOpenChange: vi.fn(),
    onComplete: vi.fn(),
  };
  const view = render(<SessionCloseoutDialog {...props} />);
  await waitFor(() => expect(screen.getByText("Introduction")).toBeTruthy());
  fireEvent.click(screen.getByRole("checkbox", { name: /Introduction/ }));
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Introduction" },
  });
  fireEvent.click(screen.getByRole("button", { name: "continueToAttendance" }));
  expect(screen.queryByRole("searchbox", { name: "searchLessons" })).toBeNull();
  mocks.context = { ...(mocks.context as object), lessons: [] };
  view.rerender(
    <SessionCloseoutDialog {...props} sessionNow={props.sessionNow + 60_000} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "backToLessons" }));
  expect(
    (
      screen.getByRole("searchbox", {
        name: "searchLessons",
      }) as HTMLInputElement
    ).value,
  ).toBe("Introduction");
  expect(
    screen
      .getByRole("checkbox", { name: /Introduction/ })
      .getAttribute("aria-checked"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "continueToAttendance" }));
  fireEvent.click(screen.getByRole("button", { name: "submit" }));
  await waitFor(() =>
    expect(mocks.submit).toHaveBeenCalledWith({
      roomName: "one",
      lessonIds: [lessons[0].lessonId],
      notes: undefined,
      attendance: [],
    }),
  );
});
