import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
const update = vi.hoisted(() => vi.fn());
vi.mock("convex/react", () => ({ useMutation: () => update }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { GradingSettings } from "@/components/settings/grading-settings";
const props = {
  schoolId: "school-1" as Id<"schools">,
  policy: { scaleMax: 100, decimalPlaces: 2, defaultMaxPoints: 20 },
  readOnly: false,
};
beforeEach(() => {
  update.mockReset().mockResolvedValue(null);
});
afterEach(cleanup);
test("institutional policy changes are explicit and validated", async () => {
  render(<GradingSettings {...props} />);
  fireEvent.change(screen.getByLabelText("scaleMax"), {
    target: { value: "10" },
  });
  expect(update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "saveSettings" }));
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith({
      schoolId: "school-1",
      policy: { scaleMax: 10, decimalPlaces: 2, defaultMaxPoints: 20 },
    }),
  );
});
test("read-only institutional settings cannot submit grades policy", () => {
  render(<GradingSettings {...props} readOnly />);
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByLabelText("scaleMax").closest("fieldset")?.disabled).toBe(
    true,
  );
  fireEvent.submit(screen.getByLabelText("scaleMax").closest("form")!);
  expect(update).not.toHaveBeenCalled();
});
test("fractional points must respect the configured precision", () => {
  render(<GradingSettings {...props} />);
  fireEvent.change(screen.getByLabelText("decimalPlaces"), {
    target: { value: "0" },
  });
  fireEvent.change(screen.getByLabelText("defaultMaxPoints"), {
    target: { value: "2.5" },
  });
  fireEvent.submit(screen.getByLabelText("scaleMax").closest("form")!);
  expect(update).not.toHaveBeenCalled();
});

test.each([
  { initial: undefined, input: "0", expected: { passingPercentage: 0 } },
  { initial: 70, input: "", expected: {} },
])("an institution can set or clear just the passing percentage ($input)", async ({
  initial,
  input,
  expected,
}) => {
  render(
    <GradingSettings
      {...props}
      policy={{ ...props.policy, passingPercentage: initial }}
    />,
  );
  const threshold = screen.getByLabelText<HTMLInputElement>("passingPercentage");
  expect(threshold.value).toBe(initial?.toString() ?? "");
  fireEvent.change(threshold, { target: { value: input } });
  fireEvent.click(screen.getByRole("button", { name: "saveSettings" }));
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith({
      schoolId: props.schoolId,
      policy: { ...props.policy, ...expected },
    }),
  );
  expect(
    Object.hasOwn(update.mock.calls[0][0].policy, "passingPercentage"),
  ).toBe(input !== "");
});
