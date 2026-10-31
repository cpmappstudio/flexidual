import type { ComponentProps } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CalendarEventFormDialog } from "@/components/calendar/dialog/calendar-event-form-dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const state = vi.hoisted(() => ({
  activeRoom: false,
  editingQueryNow: 0,
  preview: { removedCount: 2, addedCount: 1 },
  create: vi.fn(async () => "new-event"),
  update: vi.fn(async () => null),
  school: {
    timeZone: "America/Bogota",
    scheduleStartMinutes: 7 * 60,
    scheduleEndMinutes: 18 * 60,
  },
  editingSchedule: {
    futureCount: 2,
    futureFingerprint: "original-dates",
    next: {
      start: Date.parse("2030-10-23T14:00:00Z"),
      end: Date.parse("2030-10-23T15:00:00Z"),
    } as { start: number; end: number } | null,
    weeklySlots: undefined as
      | { dayOfWeek: number; startMinutes: number; durationMinutes: number }[]
      | undefined,
    recurrenceEndDate: undefined as string | undefined,
  },
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}: ${Object.values(values).join(", ")}` : key,
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "school-a" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/hooks/use-event-class-conflicts", () => ({
  useEventClassConflicts: () => [],
}));
vi.mock("@/components/teaching/classes/grade-checkbox-list", () => ({
  GradeCheckboxList: () => null,
}));
vi.mock("convex/react", () => ({
  useQuery: (query: FunctionReference<"query">, args: unknown) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(query);
    if (name === getFunctionName(api.events.hasActiveRoom))
      return state.activeRoom;
    if (name === getFunctionName(api.events.getEditingSchedule)) {
      state.editingQueryNow = (args as { now: number }).now;
      return state.editingSchedule;
    }
    if (name === getFunctionName(api.events.previewScheduleChange))
      return {
        ...state.preview,
        futureCount: state.editingSchedule.futureCount,
        futureFingerprint: state.editingSchedule.futureFingerprint,
      };
    if (name === getFunctionName(api.schools.get)) return state.school;
    if (name === getFunctionName(api.events.listTeacherOptions))
      return [{ _id: "teacher-id", fullName: "Teacher" }];
    return [];
  },
  useMutation: (mutation: FunctionReference<"mutation">) =>
    getFunctionName(mutation) === getFunctionName(api.events.updateDetails)
      ? state.update
      : getFunctionName(mutation) === getFunctionName(api.events.create)
        ? state.create
        : vi.fn(),
}));

type EditableEvent = NonNullable<
  ComponentProps<typeof CalendarEventFormDialog>["event"]
>;

const event = {
  _id: "event-id",
  schoolId: "school-id",
  title: "Flag ceremony",
  description: "",
  gradeCodes: [],
  responsibleId: "teacher-id",
  teacherIds: [],
  timeZone: "America/Bogota",
  canEdit: true,
} as unknown as EditableEvent;

const props = {
  schoolId: "school-id" as Id<"schools">,
  schoolTimeZone: "America/Bogota",
  selectedDate: "2026-10-26",
  canCreateInstitution: true,
  open: true,
  onOpenChange: vi.fn(),
};

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  state.activeRoom = false;
  state.editingQueryNow = 0;
  state.preview.removedCount = 2;
  state.preview.addedCount = 1;
  state.update.mockClear();
  state.create.mockClear();
  vi.mocked(toast.error).mockClear();
  state.school.timeZone = "America/Bogota";
  state.school.scheduleStartMinutes = 7 * 60;
  state.school.scheduleEndMinutes = 18 * 60;
  props.onOpenChange.mockClear();
  state.editingSchedule.futureCount = 2;
  state.editingSchedule.futureFingerprint = "original-dates";
  state.editingSchedule.next = {
    start: Date.parse("2030-10-23T14:00:00Z"),
    end: Date.parse("2030-10-23T15:00:00Z"),
  };
  state.editingSchedule.weeklySlots = undefined;
  state.editingSchedule.recurrenceEndDate = undefined;
});

test("the edit form keeps deletion in the event header", () => {
  render(<CalendarEventFormDialog {...props} event={event} />);
  expect(screen.getByRole("dialog", { name: "editEvent" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "deleteEvent" })).toBeNull();
});

test("the edit preview uses the exact current time", () => {
  const exactNow = Date.UTC(2026, 9, 27, 14, 0, 30);
  const clock = vi.spyOn(Date, "now").mockReturnValue(exactNow);
  try {
    render(<CalendarEventFormDialog {...props} event={event} />);
    expect(state.editingQueryNow).toBe(exactNow);
  } finally {
    clock.mockRestore();
  }
});

test("the create form waits for a selected time before validating the date", () => {
  render(<CalendarEventFormDialog {...props} selectedDate="2020-01-01" />);
  expect((screen.getByLabelText("start") as HTMLInputElement).value).toBe("");
  expect((screen.getByLabelText("end") as HTMLInputElement).value).toBe("");
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.change(screen.getByLabelText("start"), {
    target: { value: "2020-01-01T09:00" },
  });
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.change(screen.getByLabelText("end"), {
    target: { value: "2020-01-01T10:00" },
  });
  expect(screen.getByRole("alert").textContent).toBe("startMustBeFuture");
});

test("single-date creation explains invalid times and accepts the institution boundaries", async () => {
  render(<CalendarEventFormDialog {...props} />);
  fireEvent.change(screen.getByLabelText("title"), {
    target: { value: "Assembly" },
  });
  fireEvent.click(screen.getByText("selectResponsible"));
  fireEvent.click(await screen.findByRole("option", { name: /Teacher/ }));
  const start = screen.getByLabelText("start");
  const end = screen.getByLabelText("end");
  const submit = screen.getByRole("button", { name: "create" });
  expect(submit.hasAttribute("disabled")).toBe(true);
  expect(screen.queryByRole("alert")).toBeNull();

  fireEvent.change(start, { target: { value: "2030-10-24T09:00" } });
  fireEvent.change(end, { target: { value: "2030-10-24T09:00" } });
  expect(screen.getByText("endMustFollowStart")).toBeTruthy();
  expect(submit.hasAttribute("disabled")).toBe(true);
  fireEvent.change(end, { target: { value: "2030-10-24T08:00" } });
  expect(screen.getByText("endMustFollowStart")).toBeTruthy();
  fireEvent.change(end, { target: { value: "2030-10-25T10:00" } });
  expect(screen.getByText("sameDayRequired")).toBeTruthy();
  fireEvent.change(end, { target: { value: "2030-10-24T10:00" } });
  fireEvent.change(start, { target: { value: "2030-10-24T06:59" } });
  expect(screen.getByText(/outsideScheduleWindow/)).toBeTruthy();
  fireEvent.change(start, { target: { value: "2030-10-24T07:00" } });
  fireEvent.change(end, { target: { value: "2030-10-24T18:01" } });
  expect(screen.getByText(/outsideScheduleWindow/)).toBeTruthy();
  fireEvent.change(end, { target: { value: "2030-10-24T18:00" } });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(submit.hasAttribute("disabled")).toBe(false);
  fireEvent.click(submit);
  await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
  expect(state.create).toHaveBeenCalledWith(
    expect.objectContaining({
      schedule: expect.objectContaining({ kind: "single" }),
    }),
  );
});

test("single-date creation and replacement show only the highest-priority time error", () => {
  render(<CalendarEventFormDialog {...props} />);
  fireEvent.change(screen.getByLabelText("start"), {
    target: { value: "2020-01-01T01:30" },
  });
  fireEvent.change(screen.getByLabelText("end"), {
    target: { value: "2020-01-01T07:25" },
  });
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.getByRole("alert").textContent).toContain(
    "outsideScheduleWindow",
  );
  fireEvent.change(screen.getByLabelText("start"), {
    target: { value: "2020-01-01T07:00" },
  });
  expect(screen.getByRole("alert").textContent).toBe("startMustBeFuture");
  fireEvent.change(screen.getByLabelText("end"), {
    target: { value: "2020-01-01T06:00" },
  });
  expect(screen.getByRole("alert").textContent).toBe("endMustFollowStart");
});

test("weekly creation explains missing days, invalid ranges and hours", async () => {
  render(<CalendarEventFormDialog {...props} />);
  fireEvent.click(screen.getByRole("combobox", { name: "schedule" }));
  fireEvent.click(await screen.findByRole("option", { name: "weekly" }));
  const submit = screen.getByRole("button", { name: "create" });
  fireEvent.click(screen.getByRole("button", { name: "day1" }));
  expect(screen.getByText("selectWeeklyDay")).toBeTruthy();
  expect(submit.hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "day4" }));
  fireEvent.change(screen.getByLabelText("startTime"), {
    target: { value: "09:00" },
  });
  fireEvent.change(screen.getByLabelText("endTime"), {
    target: { value: "09:00" },
  });
  expect(screen.getByText("endTimeMustFollowStart")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("endTime"), {
    target: { value: "10:00" },
  });
  fireEvent.change(screen.getByLabelText("startTime"), {
    target: { value: "06:59" },
  });
  expect(screen.getByText(/outsideScheduleWindow/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("startTime"), {
    target: { value: "09:00" },
  });
  fireEvent.change(screen.getByLabelText("endTime"), {
    target: { value: "18:01" },
  });
  expect(screen.getByText(/outsideScheduleWindow/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("endTime"), {
    target: { value: "18:00" },
  });
  fireEvent.change(screen.getByLabelText("firstDate"), {
    target: { value: "2030-10-31" },
  });
  fireEvent.change(screen.getByLabelText("lastDate"), {
    target: { value: "2030-10-24" },
  });
  expect(screen.getByText("repeatUntilBeforeFrom")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("firstDate"), {
    target: { value: "2030-10-23" },
  });
  expect(screen.queryByText("repeatUntilBeforeFrom")).toBeNull();
  fireEvent.change(screen.getByLabelText("lastDate"), {
    target: { value: "2032-01-01" },
  });
  expect(screen.getByText(/weeklyRangeTooLong/)).toBeTruthy();
  expect(submit.hasAttribute("disabled")).toBe(true);
  fireEvent.change(screen.getByLabelText("lastDate"), {
    target: { value: "2030-10-24" },
  });
  expect(screen.queryByText(/weeklyRangeTooLong/)).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.change(screen.getByLabelText("lastDate"), {
    target: { value: "2030-10-23" },
  });
  expect(screen.getByText("noWeeklySessionsInRange")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("firstDate"), {
    target: { value: "2020-10-22" },
  });
  fireEvent.change(screen.getByLabelText("lastDate"), {
    target: { value: "2020-10-22" },
  });
  expect(screen.getByText("noFutureWeeklySessions")).toBeTruthy();
});

test("weekly creation prioritizes time, then range errors, without a premature preview", async () => {
  render(<CalendarEventFormDialog {...props} />);
  fireEvent.click(screen.getByRole("combobox", { name: "schedule" }));
  fireEvent.click(await screen.findByRole("option", { name: "weekly" }));
  fireEvent.change(screen.getByLabelText("firstDate"), {
    target: { value: "2030-10-31" },
  });
  fireEvent.change(screen.getByLabelText("lastDate"), {
    target: { value: "2030-10-24" },
  });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByText(/firstWeeklySession/)).toBeNull();
  fireEvent.change(screen.getByLabelText("startTime"), {
    target: { value: "06:00" },
  });
  fireEvent.change(screen.getByLabelText("endTime"), {
    target: { value: "08:00" },
  });
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.getByRole("alert").textContent).toContain(
    "outsideScheduleWindow",
  );
  fireEvent.change(screen.getByLabelText("startTime"), {
    target: { value: "07:00" },
  });
  expect(screen.getByRole("alert").textContent).toBe("repeatUntilBeforeFrom");
  fireEvent.change(screen.getByLabelText("lastDate"), {
    target: { value: "2030-11-04" },
  });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText(/firstWeeklySession/)).toBeTruthy();
});

test("valid weekly creation sends the selected date range and time slot", async () => {
  render(<CalendarEventFormDialog {...props} />);
  fireEvent.change(screen.getByLabelText("title"), {
    target: { value: "Weekly assembly" },
  });
  fireEvent.click(screen.getByText("selectResponsible"));
  fireEvent.click(await screen.findByRole("option", { name: /Teacher/ }));
  fireEvent.click(screen.getByRole("combobox", { name: "schedule" }));
  fireEvent.click(await screen.findByRole("option", { name: "weekly" }));
  fireEvent.change(screen.getByLabelText("startTime"), {
    target: { value: "07:00" },
  });
  fireEvent.change(screen.getByLabelText("endTime"), {
    target: { value: "18:00" },
  });
  fireEvent.change(screen.getByLabelText("firstDate"), {
    target: { value: "2030-11-04" },
  });
  fireEvent.change(screen.getByLabelText("lastDate"), {
    target: { value: "2030-11-18" },
  });
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "create" }));
  await waitFor(() =>
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({
        schedule: {
          kind: "weekly",
          startDate: "2030-11-04",
          endDate: "2030-11-18",
          slots: [{ dayOfWeek: 1, startMinutes: 420, durationMinutes: 660 }],
        },
      }),
    ),
  );
});

test("creation skips elapsed weekly dates and keeps the next selected day", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 9, 30, 12));
  render(<CalendarEventFormDialog {...props} />);
  fireEvent.click(screen.getByRole("combobox", { name: "schedule" }));
  fireEvent.click(await screen.findByRole("option", { name: "weekly" }));
  fireEvent.click(screen.getByRole("button", { name: "day1" }));
  fireEvent.click(screen.getByRole("button", { name: "day4" }));
  fireEvent.change(screen.getByLabelText("startTime"), {
    target: { value: "09:00" },
  });
  fireEvent.change(screen.getByLabelText("endTime"), {
    target: { value: "10:00" },
  });
  fireEvent.change(screen.getByLabelText("firstDate"), {
    target: { value: "2026-10-29" },
  });
  fireEvent.change(screen.getByLabelText("lastDate"), {
    target: { value: "2026-11-05" },
  });
  expect(
    screen.getByText(/pastWeeklyDatesSkipped firstWeeklySession/),
  ).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("editing future dates validates replacements while keeping unchanged dates editable", () => {
  render(<CalendarEventFormDialog {...props} event={event} />);
  fireEvent.click(screen.getByRole("radio", { name: "editSchedule" }));
  const start = screen.getByLabelText("start");
  const end = screen.getByLabelText("end");
  fireEvent.change(start, { target: { value: "2030-10-24T09:00" } });
  fireEvent.change(end, { target: { value: "2030-10-24T08:00" } });
  expect(screen.getByText("endMustFollowStart")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "save" }).hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.change(end, { target: { value: "2030-10-24T19:00" } });
  expect(screen.getByText(/outsideScheduleWindow/)).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "keepSchedule" }));
  expect(screen.queryByText(/outsideScheduleWindow/)).toBeNull();
  expect(
    screen.getByRole("button", { name: "save" }).hasAttribute("disabled"),
  ).toBe(false);
});

test("invalid one-date replacements hide the impact preview and prioritize window over past", () => {
  render(<CalendarEventFormDialog {...props} event={event} />);
  fireEvent.click(screen.getByRole("radio", { name: "editSchedule" }));
  fireEvent.change(screen.getByLabelText("start"), {
    target: { value: "2020-01-01T01:30" },
  });
  fireEvent.change(screen.getByLabelText("end"), {
    target: { value: "2020-01-01T07:25" },
  });
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.getByRole("alert").textContent).toContain(
    "outsideScheduleWindow",
  );
  expect(screen.queryByText(/replaceFutureNotice/)).toBeNull();
  fireEvent.change(screen.getByLabelText("start"), {
    target: { value: "2020-01-01T07:00" },
  });
  expect(screen.getByRole("alert").textContent).toBe("startMustBeFuture");
});

test("editing a weekly range rejects past dates and adds dates without a cancellation reason", async () => {
  state.preview.removedCount = 0;
  state.preview.addedCount = 1;
  state.editingSchedule.weeklySlots = [
    { dayOfWeek: 3, startMinutes: 9 * 60, durationMinutes: 60 },
  ];
  state.editingSchedule.recurrenceEndDate = "2030-11-13";
  render(
    <CalendarEventFormDialog
      {...props}
      event={{ ...event, isRecurring: true }}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "editSchedule" }));
  fireEvent.change(screen.getByLabelText("firstDate"), {
    target: { value: "2020-10-23" },
  });
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(screen.getByRole("alert").textContent).toContain("weeklyRangeTooLong");
  expect(screen.queryByText(/replaceFutureNotice/)).toBeNull();
  fireEvent.change(screen.getByLabelText("lastDate"), {
    target: { value: "2020-11-13" },
  });
  expect(screen.getByText("replacementDatesMustBeFuture")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "save" }).hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("firstDate"), {
    target: { value: "2030-10-23" },
  });
  fireEvent.change(screen.getByLabelText("lastDate"), {
    target: { value: "2030-11-20" },
  });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText(/newDatesNotice/)).toBeTruthy();
  expect(screen.queryByLabelText("scheduleChangeReason")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /saveScheduleChanges/ }));
  await waitFor(() =>
    expect(state.update).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleEdit: expect.objectContaining({
          reason: "",
          schedule: {
            kind: "weekly",
            startDate: "2030-10-23",
            endDate: "2030-11-20",
            slots: [{ dayOfWeek: 3, startMinutes: 540, durationMinutes: 60 }],
          },
        }),
      }),
    ),
  );
});

test("a nonexistent daylight-saving time receives a specific error", async () => {
  state.school.timeZone = "America/New_York";
  state.school.scheduleStartMinutes = 0;
  state.school.scheduleEndMinutes = 1440;
  render(<CalendarEventFormDialog {...props} />);
  fireEvent.change(screen.getByLabelText("title"), {
    target: { value: "Assembly" },
  });
  fireEvent.click(screen.getByText("selectResponsible"));
  fireEvent.click(await screen.findByRole("option", { name: /Teacher/ }));
  fireEvent.change(screen.getByLabelText("start"), {
    target: { value: "2030-03-10T02:30" },
  });
  fireEvent.change(screen.getByLabelText("end"), {
    target: { value: "2030-03-10T03:30" },
  });
  expect(screen.getByRole("alert").textContent).toBe("invalidLocalDateTime");
  expect(
    screen.getByRole("button", { name: "create" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(state.create).not.toHaveBeenCalled();
});

test("a schedule window changed during submission has a specific server error", async () => {
  state.create.mockRejectedValueOnce(
    new ConvexError("OUTSIDE_SCHEDULE_WINDOW"),
  );
  render(<CalendarEventFormDialog {...props} />);
  fireEvent.change(screen.getByLabelText("title"), {
    target: { value: "Assembly" },
  });
  fireEvent.click(screen.getByText("selectResponsible"));
  fireEvent.click(await screen.findByRole("option", { name: /Teacher/ }));
  fireEvent.change(screen.getByLabelText("start"), {
    target: { value: "2030-10-24T09:00" },
  });
  fireEvent.change(screen.getByLabelText("end"), {
    target: { value: "2030-10-24T10:00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "create" }));
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("outsideScheduleWindow"),
    ),
  );
});

test("a weekly daylight-saving gap rejected by the server has a specific message", async () => {
  state.school.timeZone = "America/New_York";
  state.school.scheduleStartMinutes = 0;
  state.school.scheduleEndMinutes = 1440;
  state.create.mockRejectedValueOnce(new Error("INVALID_LOCAL_DATE_TIME"));
  render(<CalendarEventFormDialog {...props} selectedDate="2030-03-10" />);
  fireEvent.change(screen.getByLabelText("title"), {
    target: { value: "Assembly" },
  });
  fireEvent.click(screen.getByText("selectResponsible"));
  fireEvent.click(await screen.findByRole("option", { name: /Teacher/ }));
  fireEvent.click(screen.getByRole("combobox", { name: "schedule" }));
  fireEvent.click(await screen.findByRole("option", { name: "weekly" }));
  fireEvent.change(screen.getByLabelText("startTime"), {
    target: { value: "01:30" },
  });
  fireEvent.change(screen.getByLabelText("endTime"), {
    target: { value: "02:30" },
  });
  fireEvent.change(screen.getByLabelText("firstDate"), {
    target: { value: "2030-03-10" },
  });
  fireEvent.change(screen.getByLabelText("lastDate"), {
    target: { value: "2030-03-10" },
  });
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "create" }));
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith("invalidLocalDateTime"),
  );
});

test("an active room blocks saving edits", () => {
  state.activeRoom = true;
  render(<CalendarEventFormDialog {...props} event={event} />);
  expect(
    screen.getByRole("button", { name: "save" }).hasAttribute("disabled"),
  ).toBe(true);
});

test("editing an event can change specific grades to all grades", async () => {
  render(
    <CalendarEventFormDialog
      {...props}
      event={{ ...event, gradeCodes: ["01"] }}
    />,
  );
  expect(
    screen
      .getByRole("radio", { name: "specificGrades" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("radio", { name: "allGradesInScope" }));
  fireEvent.click(screen.getByRole("button", { name: "save" }));
  await waitFor(() =>
    expect(state.update).toHaveBeenCalledWith(
      expect.objectContaining({ gradeCodes: undefined }),
    ),
  );
});

test("editing the schedule shows the global replacement notice and requires a reason", async () => {
  render(<CalendarEventFormDialog {...props} event={event} />);
  expect(screen.queryByRole("button", { name: "addDates" })).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "editSchedule" }));
  fireEvent.change(screen.getByLabelText("start"), {
    target: { value: "2030-10-24T09:00" },
  });
  fireEvent.change(screen.getByLabelText("end"), {
    target: { value: "2030-10-24T10:00" },
  });
  expect(screen.getByText(/replaceFutureNotice/)).toBeTruthy();
  expect(
    screen.getByRole("button", { name: /saveScheduleChanges/ }),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: /saveScheduleChanges/ })
      .hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("scheduleChangeReason"), {
    target: { value: "Changed by organizer" },
  });
  fireEvent.click(screen.getByRole("button", { name: /saveScheduleChanges/ }));
  await waitFor(() =>
    expect(state.update).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleEdit: expect.objectContaining({
          mode: "replace",
          expectedFutureCount: 2,
          expectedFutureFingerprint: "original-dates",
          reason: "Changed by organizer",
          schedule: expect.objectContaining({ kind: "single" }),
        }),
      }),
    ),
  );
});

test("switching back to the current dates preserves a draft schedule", () => {
  render(<CalendarEventFormDialog {...props} event={event} />);
  fireEvent.click(screen.getByRole("radio", { name: "editSchedule" }));
  fireEvent.change(screen.getByLabelText("start"), {
    target: { value: "2030-10-24T09:00" },
  });
  fireEvent.click(screen.getByRole("radio", { name: "keepSchedule" }));
  expect(screen.queryByLabelText("start")).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "editSchedule" }));
  expect((screen.getByLabelText("start") as HTMLInputElement).value).toBe(
    "2030-10-24T09:00",
  );
});

test("a live event update does not replace the open schedule draft", async () => {
  const { rerender } = render(
    <CalendarEventFormDialog {...props} event={event} />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "editSchedule" }));
  fireEvent.change(screen.getByLabelText("start"), {
    target: { value: "2030-10-24T09:00" },
  });
  fireEvent.change(screen.getByLabelText("end"), {
    target: { value: "2030-10-24T10:00" },
  });
  state.editingSchedule.futureFingerprint = "new-dates";
  rerender(
    <CalendarEventFormDialog
      {...props}
      event={{ ...event, title: "Changed elsewhere" }}
    />,
  );
  expect((screen.getByLabelText("start") as HTMLInputElement).value).toBe(
    "2030-10-24T09:00",
  );
  expect(screen.getByRole("alert").textContent).toBe(
    "scheduleChangedElsewhere",
  );
  expect(
    screen.getByRole("button", { name: "save" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(state.update).not.toHaveBeenCalled();
});

test("a stale schedule shows a specific message", async () => {
  state.update.mockRejectedValueOnce(new ConvexError("EVENT_SCHEDULE_CHANGED"));
  render(<CalendarEventFormDialog {...props} event={event} />);
  fireEvent.click(screen.getByRole("radio", { name: "editSchedule" }));
  fireEvent.change(screen.getByLabelText("start"), {
    target: { value: "2030-10-24T09:00" },
  });
  fireEvent.change(screen.getByLabelText("end"), {
    target: { value: "2030-10-24T10:00" },
  });
  fireEvent.change(screen.getByLabelText("scheduleChangeReason"), {
    target: { value: "Change" },
  });
  fireEvent.click(screen.getByRole("button", { name: /saveScheduleChanges/ }));
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith("scheduleChangedElsewhere"),
  );
});

test("a weekly event keeps weekly editing", () => {
  state.editingSchedule.weeklySlots = [
    { dayOfWeek: 3, startMinutes: 9 * 60, durationMinutes: 60 },
  ];
  state.editingSchedule.recurrenceEndDate = "2030-11-13";
  render(
    <CalendarEventFormDialog
      {...props}
      event={{ ...event, isRecurring: true }}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "editSchedule" }));
  expect(screen.getByText("weekly")).toBeTruthy();
  expect(screen.queryByRole("combobox", { name: "schedule" })).toBeNull();
  expect((screen.getByLabelText("firstDate") as HTMLInputElement).value).toBe(
    "2030-10-23",
  );
  expect((screen.getByLabelText("lastDate") as HTMLInputElement).value).toBe(
    "2030-11-13",
  );
  expect((screen.getByLabelText("startTime") as HTMLInputElement).value).toBe(
    "09:00",
  );
  expect((screen.getByLabelText("endTime") as HTMLInputElement).value).toBe(
    "10:00",
  );
  expect(screen.queryByText(/replaceFutureNotice/)).toBeNull();
});

test("moving a weekly range before its first Friday does not warn about cancellations", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 9, 30, 12));
  state.editingSchedule.next = {
    start: Date.parse("2026-11-06T20:00:00Z"),
    end: Date.parse("2026-11-06T21:00:00Z"),
  };
  state.editingSchedule.weeklySlots = [
    { dayOfWeek: 5, startMinutes: 15 * 60, durationMinutes: 60 },
  ];
  state.editingSchedule.recurrenceEndDate = "2026-11-16";
  state.preview.removedCount = 0;
  state.preview.addedCount = 0;
  render(
    <CalendarEventFormDialog
      {...props}
      event={{ ...event, isRecurring: true }}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "editSchedule" }));
  fireEvent.change(screen.getByLabelText("firstDate"), {
    target: { value: "2026-11-02" },
  });
  expect(screen.queryByText(/replaceFutureNotice/)).toBeNull();
  expect(screen.queryByText(/newDatesNotice/)).toBeNull();
  expect(screen.queryByLabelText("scheduleChangeReason")).toBeNull();
  const submit = screen.getByRole("button", { name: "saveScheduleChanges" });
  expect(submit.hasAttribute("disabled")).toBe(false);
  fireEvent.click(submit);
  await waitFor(() =>
    expect(state.update).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleEdit: expect.objectContaining({
          reason: "",
          schedule: expect.objectContaining({
            kind: "weekly",
            startDate: "2026-11-02",
          }),
        }),
      }),
    ),
  );
});

test("converting one date to weekly keeps its start and end times", () => {
  state.editingSchedule.next = {
    start: Date.parse("2030-10-23T16:00:00Z"),
    end: Date.parse("2030-10-23T17:00:00Z"),
  };
  render(<CalendarEventFormDialog {...props} event={event} />);
  fireEvent.click(screen.getByRole("radio", { name: "editSchedule" }));
  fireEvent.keyDown(screen.getByRole("combobox", { name: "schedule" }), {
    key: "ArrowDown",
  });
  fireEvent.click(screen.getByRole("option", { name: "weekly" }));
  expect((screen.getByLabelText("startTime") as HTMLInputElement).value).toBe(
    "11:00",
  );
  expect((screen.getByLabelText("endTime") as HTMLInputElement).value).toBe(
    "12:00",
  );
});

test("a one-date event without future sessions can schedule another date", async () => {
  state.editingSchedule.futureCount = 0;
  state.editingSchedule.next = null;
  state.preview.removedCount = 0;
  state.preview.addedCount = 1;
  render(<CalendarEventFormDialog {...props} event={event} />);
  expect(screen.queryByRole("radio", { name: "editSchedule" })).toBeNull();
  expect(screen.queryByText("createNewEventForDate")).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "scheduleAnotherDate" }));
  expect(screen.getByLabelText("start")).toBeTruthy();
  expect(screen.getByText(/newDatesNotice/)).toBeTruthy();
  expect(screen.queryByLabelText("scheduleChangeReason")).toBeNull();
  const submit = screen.getByRole("button", { name: /scheduleDatesAction/ });
  expect(submit.hasAttribute("disabled")).toBe(false);
  fireEvent.click(submit);
  await waitFor(() =>
    expect(state.update).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-id",
        scheduleEdit: expect.objectContaining({
          expectedFutureCount: 0,
          expectedFutureFingerprint: "original-dates",
          reason: "",
          schedule: expect.objectContaining({ kind: "single" }),
        }),
      }),
    ),
  );
});

test("a weekly event without future sessions cannot add isolated dates", () => {
  state.editingSchedule.futureCount = 0;
  state.editingSchedule.next = null;
  render(
    <CalendarEventFormDialog
      {...props}
      event={{ ...event, isRecurring: true }}
    />,
  );
  expect(
    screen.queryByRole("radio", { name: "scheduleAnotherDate" }),
  ).toBeNull();
  expect(screen.getByText("createNewEventForDate")).toBeTruthy();
});
