import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import {
  SessionRecordView,
  type SessionRecordData,
} from "@/components/classroom/session-record";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

afterEach(cleanup);

const recording = {
  _id: "recording-1" as Id<"recordings">,
  url: "https://recordings.example/class.mp4",
  durationMs: 1_200_000,
  startedAt: Date.UTC(2026, 8, 11, 14, 20),
};

const staffRecord: SessionRecordData = {
  state: "completed",
  scheduleId: "schedule-1" as Id<"classSchedule">,
  lessons: [
    {
      lessonId: "lesson-1" as Id<"lessons">,
      title: "Latitude and longitude",
      order: 19,
    },
  ],
  recordings: [recording],
  staffDetails: {
    notes: "Reviewed map coordinates.",
    attendance: {
      summary: { present: 1, partial: 0, absent: 0, excused: 1 },
      students: [
        {
          studentId: "student-1" as Id<"users">,
          fullName: "Ana Martínez",
          imageUrl: null,
          status: "present",
          excuseReason: null,
        },
        {
          studentId: "student-2" as Id<"users">,
          fullName: "Diego Ruiz",
          imageUrl: null,
          status: "excused",
          excuseReason: "Medical appointment",
        },
      ],
    },
  },
};

test("staff can switch between the shared lesson and attendance tabs", () => {
  const onWatchRecording = vi.fn();
  render(
    <SessionRecordView
      record={staffRecord}
      onWatchRecording={onWatchRecording}
    />,
  );

  expect(screen.getByRole("tab", { name: "lessonsTab" })).toBeTruthy();
  expect(screen.getByText("Latitude and longitude")).toBeTruthy();
  expect(screen.getByText("Reviewed map coordinates.")).toBeTruthy();

  fireEvent.mouseDown(screen.getByRole("tab", { name: "attendanceTab" }), {
    button: 0,
    ctrlKey: false,
  });
  expect(screen.getByText("Ana Martínez")).toBeTruthy();
  expect(screen.getByText("Diego Ruiz")).toBeTruthy();
  expect(screen.getAllByText("excused")).toHaveLength(2);

  fireEvent.click(screen.getByRole("button", { name: "watchRecording" }));
  expect(onWatchRecording).toHaveBeenCalledWith([recording]);
});

test("student-safe records render lessons and recording without staff data", () => {
  render(
    <SessionRecordView
      record={{ ...staffRecord, staffDetails: null }}
      onWatchRecording={vi.fn()}
    />,
  );

  expect(screen.getByText("Latitude and longitude")).toBeTruthy();
  expect(screen.getByRole("button", { name: "watchRecording" })).toBeTruthy();
  expect(screen.queryByRole("tab")).toBeNull();
  expect(screen.queryByText("Reviewed map coordinates.")).toBeNull();
  expect(screen.queryByText("Ana Martínez")).toBeNull();
});

test("panel records omit headings already represented by their tabs", () => {
  render(
    <SessionRecordView
      record={staffRecord}
      onWatchRecording={vi.fn()}
      variant="panel"
    />,
  );

  expect(screen.getByRole("tab", { name: "lessonsTab" })).toBeTruthy();
  expect(screen.getByText("Latitude and longitude")).toBeTruthy();
  expect(screen.queryByText("lessonsTitle")).toBeNull();
  expect(screen.queryByText("lessonsDescription")).toBeNull();
});

test.each(["default", "panel"] as const)(
  "students see only their own attendance in the %s view",
  (variant) => {
    const record: SessionRecordData = {
      ...staffRecord,
      staffDetails: null,
      ownAttendance: { status: "partial", excuseReason: null },
    };
    const { rerender } = render(
      <SessionRecordView
        record={record}
        variant={variant}
        onWatchRecording={vi.fn()}
      />,
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "yourAttendance" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByText("partial")).toBeTruthy();
    expect(screen.queryByText("present")).toBeNull();
    expect(screen.queryByText("Ana Martínez")).toBeNull();
    expect(screen.queryByText("Diego Ruiz")).toBeNull();
    expect(screen.queryByText("Reviewed map coordinates.")).toBeNull();
    rerender(
      <SessionRecordView
        record={{ ...record, ownAttendance: null }}
        variant={variant}
        onWatchRecording={vi.fn()}
      />,
    );
    expect(screen.getByText("noOwnAttendance")).toBeTruthy();
    expect(screen.queryByText("absent")).toBeNull();
  },
);

test("only authorized pending records expose the completion action", () => {
  const pendingRecord: SessionRecordData = {
    state: "pending",
    scheduleId: "schedule-1" as Id<"classSchedule">,
    recordings: [],
    canCompleteReport: false,
  };
  const onCompleteReport = vi.fn();
  const view = render(
    <SessionRecordView
      record={pendingRecord}
      onWatchRecording={vi.fn()}
      onCompleteReport={onCompleteReport}
    />,
  );
  expect(screen.queryByRole("button", { name: "completeReport" })).toBeNull();

  view.rerender(
    <SessionRecordView
      record={{ ...pendingRecord, canCompleteReport: true }}
      onWatchRecording={vi.fn()}
      onCompleteReport={onCompleteReport}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "completeReport" }));
  expect(onCompleteReport).toHaveBeenCalledTimes(1);
});
