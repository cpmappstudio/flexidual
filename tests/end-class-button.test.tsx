import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { EndClassButton } from "@/components/classroom/end-class-button";

afterEach(cleanup);

it("keeps leave and end class callbacks separate in the compact chooser", () => {
  const onConfirm = vi.fn();
  const onLeave = vi.fn();
  const view = render(
    <EndClassButton
      appearance="header"
      onConfirm={onConfirm}
      onLeave={onLeave}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "leave" }));
  fireEvent.click(screen.getByRole("button", { name: "leaveWithoutEnding" }));
  expect(onLeave).toHaveBeenCalledOnce();
  expect(onConfirm).not.toHaveBeenCalled();

  view.rerender(
    <EndClassButton
      appearance="header"
      onConfirm={onConfirm}
      onLeave={onLeave}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "leave" }));
  fireEvent.click(screen.getByRole("button", { name: "endClassForEveryone" }));
  expect(onConfirm).toHaveBeenCalledOnce();
  expect(onLeave).toHaveBeenCalledOnce();
});

it("asks before ending an event for everyone", () => {
  const onConfirm = vi.fn();
  render(<EndClassButton isEvent onConfirm={onConfirm} />);

  fireEvent.click(screen.getByRole("button", { name: "endRoom" }));
  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.getByText("endDescription")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "endRoom" }));
  expect(onConfirm).toHaveBeenCalledOnce();
});

it("offers leave and end separately in the event header", () => {
  const onConfirm = vi.fn();
  const onLeave = vi.fn();
  render(
    <EndClassButton
      isEvent
      appearance="header"
      onConfirm={onConfirm}
      onLeave={onLeave}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "leave" }));
  expect(screen.getByText("leaveOrEndTitle")).toBeTruthy();
  expect(screen.getByRole("button", { name: "leaveWithoutEnding" })).toBeTruthy();
  expect(onConfirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "endForEveryone" }));
  expect(onConfirm).toHaveBeenCalledOnce();
  expect(onLeave).not.toHaveBeenCalled();
});
