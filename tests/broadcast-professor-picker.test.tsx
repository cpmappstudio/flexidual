import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import {
  BroadcastProfessorPicker,
  type BroadcastProfessor,
} from "@/components/chat/broadcast-professor-picker";
import messages from "@/messages/en.json";

const state = vi.hoisted(() => ({
  scope: vi.fn(),
  filters: vi.fn(),
  next: vi.fn(),
  previous: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useQuery: () => [
    { _id: "north", name: "North campus" },
    { _id: "south", name: "South campus" },
  ],
}));
vi.mock("@/hooks/use-people-directory", () => ({
  usePeopleDirectory: (scope: { campusId: string } | undefined) => {
    state.scope(scope);
    return {
      ready: true,
      data: scope
        ? [{ _id: scope.campusId, fullName: `Professor ${scope.campusId}` }]
        : [],
      server: {
        onColumnFiltersChange: state.filters,
        isLoading: false,
        pageIndex: 1,
        hasNext: true,
        onNext: state.next,
        onPrevious: state.previous,
      },
    };
  },
}));
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  vi.unstubAllGlobals();
});

function Harness({ mode = "school" }: { mode?: "private" | "school" }) {
  const [selected, setSelected] = useState<BroadcastProfessor[]>([]);
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <BroadcastProfessorPicker
        schoolId={"school" as Id<"schools">}
        campusId={"north" as Id<"campuses">}
        mode={mode}
        value={selected}
        onChange={setSelected}
      />
    </NextIntlClientProvider>
  );
}

async function choose(name: string) {
  const input = screen.getByRole("combobox", {
    name: "Professors who can write",
  });
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name }));
  fireEvent.keyDown(input, { key: "Escape" });
}

test("the shared multiple combobox keeps selections across campuses and uses the existing server directory", async () => {
  render(<Harness />);
  expect(state.scope).toHaveBeenLastCalledWith(undefined);
  await choose("Professor north");
  fireEvent.click(
    screen.getByRole("combobox", { name: "Search professors in campus" }),
  );
  fireEvent.click(await screen.findByRole("option", { name: "South campus" }));
  await choose("Professor south");
  expect(
    screen.getByRole("button", { name: "Remove Professor north" }),
  ).toBeDefined();
  expect(
    screen.getByRole("button", { name: "Remove Professor south" }),
  ).toBeDefined();
  fireEvent.click(
    screen.getByRole("button", { name: "Remove Professor north" }),
  );
  expect(
    screen.queryByRole("button", { name: "Remove Professor north" }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Remove Professor south" }),
  ).toBeDefined();
  const input = screen.getByRole("combobox", {
    name: "Professors who can write",
  });
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.change(input, { target: { value: "Name outside this page" } });
  await waitFor(() =>
    expect(state.filters).toHaveBeenLastCalledWith([
      { id: "isActive", value: ["active"] },
      { id: "search", value: "Name outside this page" },
    ]),
  );
  expect(state.scope).toHaveBeenLastCalledWith({
    campusId: "south",
    role: "teacher",
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));
  expect(state.next).toHaveBeenCalledOnce();
  expect(state.previous).toHaveBeenCalledOnce();
});

test("private broadcasts do not offer other campuses", async () => {
  render(<Harness mode="private" />);
  expect(
    screen.queryByRole("combobox", { name: "Search professors in campus" }),
  ).toBeNull();
  await choose("Professor north");
  expect(
    state.scope.mock.calls.some(([scope]) => scope?.campusId === "south"),
  ).toBe(false);
});
