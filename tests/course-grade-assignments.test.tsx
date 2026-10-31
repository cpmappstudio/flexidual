import { useState, type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  CourseGradeAssignmentsFields,
  type CourseGradeAssignmentInput,
} from "@/components/teaching/classes/course-grade-assignments-fields";
import { CourseLiveAccessFields } from "@/components/teaching/classes/course-live-access-fields";
import type { Doc } from "@/convex/_generated/dataModel";
import type { LiveAccess } from "@/convex/model/liveAccess";
import messages from "@/messages/es.json";
import {
  CourseFormFields,
  type CourseFormData,
} from "@/components/teaching/classes/course-form-fields";

const grades = [
  { code: "05", name: "Quinto" },
  { code: "06", name: "Sexto" },
];
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
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

function PrivateGrades() {
  const [value, setValue] = useState<CourseGradeAssignmentInput[]>([
    { gradeCode: "05" },
  ]);
  return (
    <>
      <CourseGradeAssignmentsFields
        gradeCode="05"
        grades={grades}
        teachers={[{ _id: "teacher-2", fullName: "Profe Sexto" }]}
        value={value}
        onChangeAction={setValue}
      />
      <output data-testid="assignments">{JSON.stringify(value)}</output>
    </>
  );
}

function SchoolGrades() {
  const [value, setValue] = useState<LiveAccess>({
    mode: "school",
    allowedGradeCodes: ["05"],
  });
  return (
    <>
      <CourseLiveAccessFields
        courseGradeCode="05"
        grades={
          grades.map((grade, index) => ({
            ...grade,
            _id: `grade-${index}`,
          })) as Doc<"institutionGrades">[]
        }
        value={value}
        onChangeAction={setValue}
      />
      <output data-testid="access">{JSON.stringify(value)}</output>
    </>
  );
}

function PrivateCourseForm({
  teachers = [],
}: {
  teachers?: ComponentProps<typeof CourseFormFields>["teachers"];
}) {
  const [value, setValue] = useState<CourseFormData>({
    name: "Course",
    description: "",
    curriculumId: "curriculum",
    teacherId: "teacher-1",
    gradeCode: "05",
    gradeAssignments: [
      { gradeCode: "05" },
      { gradeCode: "06", teacherId: "teacher-2" },
    ],
    liveAccess: { mode: "private", allowedGradeCodes: [] },
  });
  return (
    <>
      <CourseFormFields
        formData={value}
        setFormDataAction={setValue}
        isAdmin
        curriculums={
          [
            {
              _id: "curriculum",
              title: "Shared Science",
              gradeCodes: ["05", "06"],
            },
          ] as Doc<"curriculums">[]
        }
        teachers={teachers}
        grades={
          [...grades, { code: "07", name: "Séptimo" }].map((grade, index) => ({
            ...grade,
            _id: `grade-${index}`,
          })) as Doc<"institutionGrades">[]
        }
      />
      <output data-testid="form">{JSON.stringify(value)}</output>
    </>
  );
}

test("course teacher selection still searches by email and keeps the role badge", async () => {
  render(
    <NextIntlClientProvider locale="es" timeZone="UTC" messages={messages}>
      <PrivateCourseForm
        teachers={[
          {
            _id: "teacher-1" as Doc<"users">["_id"],
            fullName: "Profesora Uno",
            email: "one@example.com",
            role: "teacher",
          },
          {
            _id: "teacher-2" as Doc<"users">["_id"],
            fullName: "Director Dos",
            email: "principal@example.com",
            role: "principal",
          },
        ]}
      />
    </NextIntlClientProvider>,
  );
  const picker = screen.getByRole("combobox", {
    name: new RegExp(messages.class.assignTeacher),
  });
  expect(picker.textContent).toContain("Profesora Uno");
  fireEvent.click(picker);
  fireEvent.change(
    screen.getByPlaceholderText(
      messages.classDialog.placeholders.searchTeacher,
    ),
    { target: { value: "principal@example.com" } },
  );
  fireEvent.click(await screen.findByRole("option", { name: /Director Dos/ }));
  expect(JSON.parse(screen.getByTestId("form").textContent!).teacherId).toBe(
    "teacher-2",
  );
  expect(picker.getAttribute("aria-expanded")).toBe("false");
  expect(picker.textContent).toContain(messages.class.principalRole);
});

test("changing the primary grade keeps compatible grade teachers and does not offer grades outside the curriculum", async () => {
  render(
    <NextIntlClientProvider locale="es" timeZone="UTC" messages={messages}>
      <PrivateCourseForm />
    </NextIntlClientProvider>,
  );
  expect(screen.queryByRole("checkbox", { name: "Séptimo" })).toBeNull();
  fireEvent.keyDown(screen.getAllByRole("combobox")[0], { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "Sexto" }));
  const value = JSON.parse(screen.getByTestId("form").textContent!);
  expect(value.gradeCode).toBe("06");
  expect(value.curriculumId).toBe("curriculum");
  expect(value.gradeAssignments).toEqual([
    { gradeCode: "06", teacherId: "teacher-2" },
    { gradeCode: "05" },
  ]);
  expect(
    screen.getByRole("checkbox", { name: "Sexto" }).hasAttribute("disabled"),
  ).toBe(true);
});

test("private grades default to the main teacher and allow a different teacher for one grade", async () => {
  render(
    <NextIntlClientProvider locale="es" timeZone="UTC" messages={messages}>
      <PrivateGrades />
    </NextIntlClientProvider>,
  );
  expect(
    screen.getByRole("checkbox", { name: "Quinto" }).hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: "Sexto" }));
  expect(JSON.parse(screen.getByTestId("assignments").textContent!)).toEqual([
    { gradeCode: "05" },
    { gradeCode: "06" },
  ]);
  fireEvent.keyDown(
    screen.getByRole("combobox", { name: "Profesor para Sexto" }),
    { key: "ArrowDown" },
  );
  fireEvent.click(await screen.findByRole("option", { name: "Profe Sexto" }));
  expect(JSON.parse(screen.getByTestId("assignments").textContent!)).toEqual([
    { gradeCode: "05" },
    { gradeCode: "06", teacherId: "teacher-2" },
  ]);
  fireEvent.keyDown(
    screen.getByRole("combobox", { name: "Profesor para Sexto" }),
    { key: "ArrowDown" },
  );
  fireEvent.click(
    await screen.findByRole("option", { name: messages.class.useMainTeacher }),
  );
  expect(JSON.parse(screen.getByTestId("assignments").textContent!)).toEqual([
    { gradeCode: "05" },
    { gradeCode: "06" },
  ]);
  fireEvent.click(screen.getByRole("checkbox", { name: "Sexto" }));
  expect(
    screen.queryByRole("combobox", { name: "Profesor para Sexto" }),
  ).toBeNull();
  expect(JSON.parse(screen.getByTestId("assignments").textContent!)).toEqual([
    { gradeCode: "05" },
  ]);
});

test("changing live visibility preserves grade assignments and their teachers", () => {
  render(
    <NextIntlClientProvider locale="es" timeZone="UTC" messages={messages}>
      <PrivateCourseForm />
    </NextIntlClientProvider>,
  );
  const before = JSON.parse(
    screen.getByTestId("form").textContent!,
  ).gradeAssignments;
  fireEvent.click(
    screen.getByRole("radio", {
      name: new RegExp(
        messages.class.schoolAccessDescription.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        ),
      ),
    }),
  );
  expect(
    JSON.parse(screen.getByTestId("form").textContent!).gradeAssignments,
  ).toEqual(before);
  fireEvent.click(
    screen.getByRole("radio", {
      name: new RegExp(
        messages.class.privateAccessDescription.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        ),
      ),
    }),
  );
  expect(
    JSON.parse(screen.getByTestId("form").textContent!).gradeAssignments,
  ).toEqual(before);
});

test("the shared grade picker preserves institutional live access and its empty-selection validation", () => {
  render(
    <NextIntlClientProvider locale="es" timeZone="UTC" messages={messages}>
      <SchoolGrades />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Sexto" }));
  expect(JSON.parse(screen.getByTestId("access").textContent!)).toEqual({
    mode: "school",
    allowedGradeCodes: ["05", "06"],
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Quinto" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Sexto" }));
  expect(screen.getByText(messages.class.liveAccessGradeRequired)).toBeTruthy();
  expect(JSON.parse(screen.getByTestId("access").textContent!)).toEqual({
    mode: "school",
    allowedGradeCodes: [],
  });
});
