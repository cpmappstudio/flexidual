import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import {
  GRADING_CATEGORIES,
  type GradingWeightInputs,
  type GradingWeights,
} from "@/lib/grading-weights";

const state = vi.hoisted(() => ({
  weights: null as GradingWeights | null,
  version: 0,
  update: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useQuery: () => ({ weights: state.weights, version: state.version }),
  useMutation: () => state.update,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ number: (value: number) => String(value) }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { GradingWeightsSettings } from "@/components/settings/grading-weights-settings";
import { CourseGradingWeightsFields } from "@/components/settings/grading-weights-fields";

const props = { schoolId: "school-1" as Id<"schools">, readOnly: false };
const weights: GradingWeights = [
  { category: "quiz", weightBps: 2_000 },
  { category: "assignment", weightBps: 8_000 },
];
const quizInput = () =>
  screen.getByLabelText<HTMLInputElement>("categories.quiz (%)");
const assignmentInput = () =>
  screen.getByLabelText<HTMLInputElement>("categories.assignment (%)");

beforeEach(() => {
  state.weights = null;
  state.version = 0;
  state.update.mockReset().mockResolvedValue(1);
});
afterEach(cleanup);

test("institutional weights require explicit valid percentages and wait for reactive confirmation", async () => {
  const view = render(<GradingWeightsSettings {...props} />);
  expect(quizInput().value).toBe("");
  fireEvent.change(quizInput(), { target: { value: "20" } });
  fireEvent.change(assignmentInput(), { target: { value: "79" } });
  fireEvent.submit(quizInput().closest("form")!);
  expect(state.update).not.toHaveBeenCalled();
  fireEvent.change(assignmentInput(), { target: { value: "80" } });
  fireEvent.submit(quizInput().closest("form")!);
  await waitFor(() =>
    expect(state.update).toHaveBeenCalledWith({
      schoolId: props.schoolId,
      weights,
      expectedVersion: 0,
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "save" }).disabled,
    ).toBe(true),
  );
  expect(quizInput().closest("fieldset")?.disabled).toBe(true);
  state.weights = weights;
  state.version = 1;
  view.rerender(<GradingWeightsSettings {...props} />);
  expect(quizInput().closest("fieldset")?.disabled).toBe(false);
  expect(quizInput().value).toBe("20");
  fireEvent.change(quizInput(), { target: { value: "30" } });
  fireEvent.change(assignmentInput(), { target: { value: "70" } });
  fireEvent.submit(quizInput().closest("form")!);
  await waitFor(() =>
    expect(state.update.mock.calls[1][0].expectedVersion).toBe(1),
  );
});

test("read-only institution settings cannot save weighting changes", () => {
  state.weights = weights;
  render(<GradingWeightsSettings {...props} readOnly />);
  expect(quizInput().closest("fieldset")?.disabled).toBe(true);
  expect(screen.queryByRole("button")).toBeNull();
  fireEvent.submit(quizInput().closest("form")!);
  expect(state.update).not.toHaveBeenCalled();
});

test("a concurrent weight edit preserves local input and requires loading the new version", () => {
  state.weights = weights;
  const view = render(<GradingWeightsSettings {...props} />);
  fireEvent.change(quizInput(), { target: { value: "30" } });
  state.weights = [
    { category: "quiz", weightBps: 4_000 },
    { category: "assignment", weightBps: 6_000 },
  ];
  state.version = 1;
  view.rerender(<GradingWeightsSettings {...props} />);
  expect(screen.getByRole("alert").textContent).toBe("stale");
  expect(quizInput().value).toBe("30");
  fireEvent.submit(quizInput().closest("form")!);
  expect(state.update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "reload" }));
  expect(quizInput().value).toBe("40");
  expect(screen.queryByRole("alert")).toBeNull();
});

test("a rejected save keeps the input and can retry without changing its version", async () => {
  state.update.mockRejectedValueOnce(new Error("Unavailable"));
  render(<GradingWeightsSettings {...props} />);
  fireEvent.change(quizInput(), { target: { value: "20" } });
  fireEvent.change(assignmentInput(), { target: { value: "80" } });
  await act(async () => fireEvent.submit(quizInput().closest("form")!));
  expect(quizInput().value).toBe("20");
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "save" }).disabled,
  ).toBe(false);
  await act(async () => fireEvent.submit(quizInput().closest("form")!));
  expect(state.update.mock.calls.map(([args]) => args.expectedVersion)).toEqual(
    [0, 0],
  );
});

function CourseFields({ defaults }: { defaults: GradingWeights | null }) {
  const [value, setValue] = useState<GradingWeightInputs | null>(null);
  return (
    <CourseGradingWeightsFields
      value={value}
      institutionalWeights={defaults}
      onChangeAction={setValue}
    />
  );
}

test.each(["institution", "course"])(
  "%s weights use the shared table with a numeric cell for every category",
  (context) => {
    state.weights = weights;
    render(
      context === "institution" ? (
        <GradingWeightsSettings {...props} />
      ) : (
        <CourseFields defaults={weights} />
      ),
    );
    const table = within(screen.getByRole("table", { name: "title" }));
    expect(table.getAllByRole("row")).toHaveLength(
      GRADING_CATEGORIES.length + 2,
    );
    expect(table.getByRole("columnheader", { name: "category" })).toBeTruthy();
    expect(
      table.getByRole("columnheader", { name: "percentage" }),
    ).toBeTruthy();
    for (const category of GRADING_CATEGORIES) {
      const name = `categories.${category} (%)`;
      expect(table.getByRole("rowheader", { name })).toBeTruthy();
      const input = table.getByRole<HTMLInputElement>("spinbutton", { name });
      expect(input.min).toBe("0");
      expect(input.max).toBe("100");
      expect(input.step).toBe("0.01");
      expect(input.required).toBe(true);
    }
  },
);

test("courses follow live defaults until overridden and can restore inheritance", () => {
  const view = render(<CourseFields defaults={weights} />);
  expect(quizInput().value).toBe("20");
  expect(quizInput().closest("fieldset")?.disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: "override" }));
  fireEvent.change(quizInput(), { target: { value: "70" } });
  const next: GradingWeights = [
    { category: "quiz", weightBps: 4_000 },
    { category: "assignment", weightBps: 6_000 },
  ];
  view.rerender(<CourseFields defaults={next} />);
  expect(quizInput().value).toBe("70");
  fireEvent.click(screen.getByRole("checkbox", { name: "override" }));
  expect(quizInput().value).toBe("40");
  expect(assignmentInput().value).toBe("60");
  expect(quizInput().closest("fieldset")?.disabled).toBe(true);
});

test("a course can configure its weights before the institution sets defaults", () => {
  render(<CourseFields defaults={null} />);
  expect(screen.getByText("notConfigured")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "override" }));
  expect(quizInput().value).toBe("");
  expect(quizInput().closest("fieldset")?.disabled).toBe(false);
});
