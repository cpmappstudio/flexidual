import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import CalendarEventActions from "@/components/calendar/header/actions/calendar-event-actions";

const state = vi.hoisted(() => ({
  create: vi.fn(async () => "created-event"),
  push: vi.fn(),
  conflicts: [] as Array<{ className: string }>,
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}: ${Object.values(values).join(", ")}` : key,
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "school-a" }),
  useRouter: () => ({ push: state.push }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("convex/react", () => ({
  useQuery: (query: FunctionReference<"query">) => {
    if (getFunctionName(query) === getFunctionName(api.grades.list))
      return [{ code: "01", name: "1st Grade" }];
    return getFunctionName(query) ===
      getFunctionName(api.events.listTeacherOptions)
      ? [
          {
            _id: "teacher-id",
            fullName: "Teacher",
            email: "teacher@example.com",
            role: "teacher",
          },
          {
            _id: "principal-id",
            fullName: "Principal",
            email: "principal@example.com",
            role: "principal",
          },
        ]
      : [];
  },
  useMutation: (mutation: FunctionReference<"mutation">) =>
    getFunctionName(mutation) === getFunctionName(api.events.create)
      ? state.create
      : vi.fn(),
}));
vi.mock("@/hooks/use-event-class-conflicts", () => ({
  useEventClassConflicts: ({ start, end }: { start: string; end: string }) =>
    start && end ? state.conflicts : undefined,
}));

function setSingleSchedule() {
  fireEvent.change(screen.getByLabelText("start"), {
    target: { value: "2030-10-24T09:00" },
  });
  fireEvent.change(screen.getByLabelText("end"), {
    target: { value: "2030-10-24T10:00" },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 9, 24, 12));
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  props.onViewEvents.mockReset();
  props.onCreated.mockReset();
  state.create.mockClear();
  state.push.mockClear();
  state.conflicts = [];
});

const props = {
  schoolId: "school-id" as Id<"schools">,
  schoolTimeZone: "America/Bogota",
  selectedDate: "2026-10-25",
  canCreateInstitution: true,
  onViewEvents: vi.fn(),
  onCreated: vi.fn(),
};

test("read-only users can open the event explorer", () => {
  render(<CalendarEventActions {...props} canCreate={false} />);
  fireEvent.click(screen.getByRole("button", { name: "viewAll" }));
  expect(props.onViewEvents).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "name" })).toBeNull();
});

test("managers can view events or open the event form from one menu", async () => {
  render(<CalendarEventActions {...props} canCreate />);
  const trigger = screen.getByRole("button", { name: "name" });
  fireEvent.keyDown(trigger, { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name: "viewAll" }));
  expect(props.onViewEvents).toHaveBeenCalledOnce();
  fireEvent.keyDown(trigger, { key: "Enter" });
  fireEvent.click(screen.getByRole("menuitem", { name: "create" }));
  const dialog = await screen.findByRole("dialog", { name: "create" });
  await waitFor(() =>
    expect(dialog.contains(document.activeElement)).toBe(true),
  );
});

test("the overlap warning appears only for detected classes and stays concise", async () => {
  render(<CalendarEventActions {...props} canCreate />);
  fireEvent.keyDown(screen.getByRole("button", { name: "name" }), {
    key: "Enter",
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: "create" }));
  expect(screen.queryByRole("status")).toBeNull();

  cleanup();
  state.conflicts = [{ className: "Math" }, { className: "History" }];
  render(<CalendarEventActions {...props} canCreate />);
  fireEvent.keyDown(screen.getByRole("button", { name: "name" }), {
    key: "Enter",
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: "create" }));
  expect(screen.queryByRole("status")).toBeNull();
  setSingleSchedule();
  expect(screen.getByRole("status").textContent).toContain("overlapTitle: 2");
  expect(screen.getByRole("status").textContent).toContain(
    "overlapDescription",
  );
  expect(screen.queryByText("Math")).toBeNull();
});

test("creating from the calendar opens the created event in its explorer", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  render(<CalendarEventActions {...props} canCreate />);
  fireEvent.keyDown(screen.getByRole("button", { name: "name" }), {
    key: "Enter",
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: "create" }));
  fireEvent.change(screen.getByLabelText("title"), {
    target: { value: "Flag ceremony" },
  });
  fireEvent.click(screen.getByText("selectResponsible"));
  fireEvent.click(await screen.findByRole("option", { name: /Teacher/ }));
  setSingleSchedule();
  fireEvent.click(screen.getByRole("button", { name: "create" }));
  await waitFor(() => {
    expect(props.onCreated).toHaveBeenCalledWith("created-event");
  });
  expect(state.push).not.toHaveBeenCalled();
});

test("event staff can be found by email and assigned without administrators", async () => {
  render(<CalendarEventActions {...props} canCreate />);
  fireEvent.keyDown(screen.getByRole("button", { name: "name" }), {
    key: "Enter",
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: "create" }));
  fireEvent.change(screen.getByLabelText("title"), {
    target: { value: "Assembly" },
  });
  fireEvent.click(screen.getByRole("combobox", { name: "responsible" }));
  fireEvent.change(
    screen.getByPlaceholderText("classDialog.placeholders.searchTeacher"),
    { target: { value: "principal@example.com" } },
  );
  fireEvent.click(screen.getByRole("option", { name: /Principal/ }));
  fireEvent.click(screen.getByRole("combobox", { name: "otherTeachers" }));
  fireEvent.click(screen.getByRole("option", { name: /Teacher/ }));
  setSingleSchedule();
  fireEvent.click(screen.getByRole("button", { name: "create" }));
  await waitFor(() =>
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({
        responsibleId: "principal-id",
        teacherIds: ["teacher-id"],
      }),
    ),
  );
});

test("the audience choice makes all grades explicit and requires a specific grade", async () => {
  render(<CalendarEventActions {...props} canCreate />);
  fireEvent.keyDown(screen.getByRole("button", { name: "name" }), {
    key: "Enter",
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: "create" }));
  fireEvent.change(screen.getByLabelText("title"), {
    target: { value: "Flag ceremony" },
  });
  fireEvent.click(screen.getByText("selectResponsible"));
  fireEvent.click(await screen.findByRole("option", { name: /Teacher/ }));

  expect(
    screen
      .getByRole("radio", { name: "allGradesInScope" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  expect(screen.queryByRole("checkbox", { name: "1st Grade" })).toBeNull();

  fireEvent.click(screen.getByRole("radio", { name: "specificGrades" }));
  expect(
    screen.getByRole("button", { name: "create" }).hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: "1st Grade" }));
  setSingleSchedule();
  fireEvent.click(screen.getByRole("button", { name: "create" }));
  await waitFor(() =>
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({ gradeCodes: ["01"] }),
    ),
  );
});

test("weekly hours apply to selected days within the date range", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  render(
    <CalendarEventActions {...props} selectedDate="2026-10-26" canCreate />,
  );
  fireEvent.keyDown(screen.getByRole("button", { name: "name" }), {
    key: "Enter",
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: "create" }));
  fireEvent.change(screen.getByLabelText("title"), {
    target: { value: "Devotional" },
  });
  fireEvent.click(screen.getByText("selectResponsible"));
  fireEvent.click(await screen.findByRole("option", { name: /Teacher/ }));
  fireEvent.click(screen.getByRole("combobox", { name: "schedule" }));
  fireEvent.click(await screen.findByRole("option", { name: "weekly" }));

  for (const name of ["title", "repeatOn", "lastDate"]) {
    expect(
      screen
        .getByText(name)
        .closest("label")
        ?.querySelector('[data-slot="required-field-mark"]'),
    ).toBeTruthy();
  }

  expect((screen.getByLabelText("firstDate") as HTMLInputElement).value).toBe(
    "",
  );
  expect((screen.getByLabelText("lastDate") as HTMLInputElement).value).toBe(
    "",
  );
  expect((screen.getByLabelText("startTime") as HTMLInputElement).value).toBe(
    "",
  );
  expect((screen.getByLabelText("endTime") as HTMLInputElement).value).toBe("");
  expect(screen.getByText("repeatRangeHelp")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("startTime"), {
    target: { value: "19:33" },
  });
  fireEvent.change(screen.getByLabelText("endTime"), {
    target: { value: "18:33" },
  });
  expect(screen.getByText("endTimeMustFollowStart")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("startTime"), {
    target: { value: "09:00" },
  });
  fireEvent.change(screen.getByLabelText("endTime"), {
    target: { value: "10:30" },
  });
  expect(screen.queryByText("endTimeMustFollowStart")).toBeNull();
  fireEvent.change(screen.getByLabelText("firstDate"), {
    target: { value: "2026-10-26" },
  });
  fireEvent.click(screen.getByRole("button", { name: "day1" }));
  fireEvent.click(screen.getByRole("button", { name: "day3" }));
  fireEvent.click(screen.getByRole("button", { name: "day4" }));
  expect(screen.queryByText(/firstWeeklySession/)).toBeNull();
  expect((screen.getByLabelText("firstDate") as HTMLInputElement).value).toBe(
    "2026-10-26",
  );

  fireEvent.change(screen.getByLabelText("lastDate"), {
    target: { value: "2026-10-26" },
  });
  expect(screen.getByRole("alert").textContent).toBe("noWeeklySessionsInRange");
  expect(
    screen.getByRole("button", { name: "create" }).hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("lastDate"), {
    target: { value: "2026-10-30" },
  });
  fireEvent.click(screen.getByRole("button", { name: "create" }));
  await waitFor(() =>
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({
        schedule: {
          kind: "weekly",
          startDate: "2026-10-26",
          endDate: "2026-10-30",
          slots: [
            { dayOfWeek: 3, startMinutes: 540, durationMinutes: 90 },
            { dayOfWeek: 4, startMinutes: 540, durationMinutes: 90 },
          ],
        },
      }),
    ),
  );
});
