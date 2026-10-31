import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { SessionPrerecordedControl } from "@/components/classroom/session-prerecorded-control";
import type { Id } from "@/convex/_generated/dataModel";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/dynamic", () => ({
  default:
    () =>
    ({
      scheduleId,
      onOpenChange,
    }: {
      scheduleId: string;
      onOpenChange: (open: boolean) => void;
    }) => (
      <div role="dialog">
        {scheduleId}
        <button onClick={() => onOpenChange(false)}>close</button>
      </div>
    ),
}));
afterEach(cleanup);
const scheduleId = "first" as Id<"classSchedule">;

test("unauthorized viewers have no upload controls or hidden management dialogs", () => {
  render(
    <SessionPrerecordedControl scheduleId={scheduleId} canManage={false} />,
  );
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("the shared icon action opens only the selected session and releases its dialog on close or session change", () => {
  const view = render(
    <SessionPrerecordedControl scheduleId={scheduleId} canManage iconOnly />,
  );
  const button = screen.getByRole("button", { name: "upload" });
  expect(button.textContent).toBe("");
  expect(button.getAttribute("data-variant")).toBe("ghost");
  expect(button.classList.contains("bg-transparent")).toBe(true);
  expect(button.classList.contains("text-warning")).toBe(true);
  expect(button.querySelector("svg")?.classList.contains("size-6")).toBe(true);
  expect(button.querySelector("svg")?.getAttribute("stroke-width")).toBe(
    "2.25",
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(button);
  expect(screen.getByRole("dialog").textContent).toContain("first");
  view.rerender(
    <SessionPrerecordedControl
      scheduleId={"second" as Id<"classSchedule">}
      canManage
      iconOnly
      hasPrerecorded
    />,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "manage" }));
  expect(screen.getByRole("dialog").textContent).toContain("second");
  fireEvent.click(screen.getByRole("button", { name: "close" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("a stable external owner receives the session without mounting another dialog", () => {
  const onOpen = vi.fn();
  const view = render(
    <SessionPrerecordedControl
      scheduleId={scheduleId}
      canManage
      onOpen={onOpen}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "upload" }));
  expect(onOpen).toHaveBeenCalledExactlyOnceWith(scheduleId);
  expect(screen.queryByRole("dialog")).toBeNull();
  view.rerender(
    <SessionPrerecordedControl
      scheduleId={scheduleId}
      canManage={false}
      onOpen={onOpen}
    />,
  );
  expect(screen.queryByRole("button")).toBeNull();
  expect(onOpen).toHaveBeenCalledOnce();
});

test("the calendar action matches date rows without a boxed button", () => {
  render(<SessionPrerecordedControl scheduleId={scheduleId} canManage />);
  const button = screen.getByRole("button", { name: "upload" });
  expect(button.getAttribute("data-variant")).toBe("ghost");
  for (const className of [
    "bg-transparent",
    "shadow-none",
    "justify-start",
    "font-semibold",
    "px-0",
    "has-[>svg]:px-0",
    "py-3",
  ])
    expect(button.classList.contains(className)).toBe(true);
  expect(button.classList.contains("has-[>svg]:px-3")).toBe(false);
  const icon = button.querySelector("svg");
  expect(icon?.classList.contains("text-primary")).toBe(true);
  expect(icon?.classList.contains("size-5")).toBe(true);
});
