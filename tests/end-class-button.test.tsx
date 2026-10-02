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
