import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, test, vi } from "vitest";
import {
  UserPresenceDot,
  UserPresenceText,
  type UserPresenceStatus,
} from "@/components/presence/user-presence";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Status({ status }: { status?: UserPresenceStatus }) {
  return (
    <NextIntlClientProvider
      locale="es"
      timeZone="UTC"
      messages={{
        presence: {
          online: "En línea",
          unknown: "Sin conexión reciente registrada",
          lastSeen: "Última conexión: {date}",
        },
      }}
    >
      <div className="relative">
        <UserPresenceDot status={status} />
        <UserPresenceText status={status} />
      </div>
    </NextIntlClientProvider>
  );
}

test("only an online user has a green avatar badge", () => {
  const view = render(
    <Status status={{ online: true, lastDisconnected: 0 }} />,
  );
  expect(screen.getByLabelText("En línea").className).toContain("bg-success");
  expect(screen.getByText("En línea")).toBeTruthy();
  view.rerender(<Status status={null} />);
  expect(screen.queryByLabelText("En línea")).toBeNull();
  expect(screen.getByText("Sin conexión reciente registrada")).toBeTruthy();
});

test("loading never invents an offline state or a date", () => {
  const view = render(<Status />);
  expect(view.container.textContent).toBe("");
  expect(view.container.querySelector("[data-slot=avatar-badge]")).toBeNull();
});

test("last connection uses the viewer's timezone, not the provider UTC default", () => {
  const original = Intl.DateTimeFormat.prototype.resolvedOptions;
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(
    function (this: Intl.DateTimeFormat) {
      return { ...original.call(this), timeZone: "America/Bogota" };
    },
  );
  const timestamp = Date.parse("2026-09-15T19:00:00Z");
  render(<Status status={{ online: false, lastDisconnected: timestamp }} />);
  const expected = new Intl.DateTimeFormat("es", {
    timeZone: "America/Bogota",
    dateStyle: "short",
    timeStyle: "short",
  }).format(timestamp);
  expect(screen.getByText(`Última conexión: ${expected}`)).toBeTruthy();
  expect(screen.queryByLabelText("En línea")).toBeNull();
});
