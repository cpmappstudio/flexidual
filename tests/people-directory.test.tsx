import {
  act,
  cleanup,
  fireEvent,
  render as renderReact,
  screen,
} from "@testing-library/react";
import { type ReactNode, StrictMode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { ConvexProvider, type ConvexReactClient } from "convex/react";
import { UsersTable } from "@/components/admin/users/users-table";

const state = vi.hoisted(() => ({
  calls: vi.fn(),
  ready: true,
  prepare: vi.fn().mockResolvedValue(null),
  sparse: false,
  totalRows: 26,
  hiddenBefore: 25,
  reveal: false,
  pendingCursor: "",
  listeners: new Set<() => void>(),
  cache: new Map<string, unknown>(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "campus" }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { current: number }) =>
    values ? `${key}:${values.current}` : key,
}));
vi.mock("@/components/admin/users/user-dialog", () => ({
  UserDialog: () => <button>Create user</button>,
}));
vi.mock("@/lib/error-tracking", () => ({ reportRuntimeError: vi.fn() }));
vi.mock("@/components/ui/responsive-filters", () => ({
  ResponsiveFilters: ({
    filters,
  }: {
    filters: { onChange: (value: string) => void }[];
  }) => <button onClick={() => filters[0].onChange("05")}>Choose grade</button>,
}));
vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useMutation: () => state.prepare,
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(ref);
    state.calls(name, args);
    if (args === "skip") return undefined;
    if (name === "organizations:resolveSlug")
      return { type: "campus", _id: "campus-a" };
    if (name === "campuses:get") return { schoolId: "school" };
    if (name === "grades:list") return [{ code: "05", name: "Fifth" }];
    if (name === "people:isReady") return state.ready;
    if (name === "users:getUsers") return [];
    return undefined;
  },
}));

// Real SDK paginator with a simulated reactive transport, not a mocked pagination hook.
const client = {
  logger: { warn: vi.fn() },
  watchQuery: (
    ref: Parameters<typeof getFunctionName>[0],
    args: {
      search?: string;
      paginationOpts: {
        numItems: number;
        cursor: string | null;
        endCursor?: string;
      };
    },
  ) => ({
    onUpdate: (callback: () => void) => {
      state.listeners.add(callback);
      return () => state.listeners.delete(callback);
    },
    journal: () => undefined,
    localQueryResult: () => {
      state.calls(getFunctionName(ref), args);
      if (args.paginationOpts.cursor === state.pendingCursor) return undefined;
      const key = JSON.stringify(args);
      if (!state.cache.has(key)) {
        const rows = Array.from({ length: state.totalRows }, (_, i) => ({
          _id: `person-${i}`,
          fullName:
            i === 0
              ? "Zulu server order"
              : i === 1
                ? "Alpha server order"
                : i === 25
                  ? "Second page"
                  : `Person ${i}`,
          isActive: true,
          avatarUrl: null,
          grade: "05",
        }));
        const source = args.search
          ? [{ ...rows[0], _id: "found", fullName: "Found outside first page" }]
          : rows;
        const start = Number(args.paginationOpts.cursor ?? 0);
        const end = args.paginationOpts.endCursor
          ? Number(args.paginationOpts.endCursor)
          : Math.min(source.length, start + args.paginationOpts.numItems);
        const page = source
          .slice(start, end)
          .filter(
            (_, i) =>
              !state.sparse || state.reveal || start + i >= state.hiddenBefore,
          );
        state.cache.set(key, {
          page,
          isDone: end >= source.length,
          continueCursor: String(end),
        });
      }
      return state.cache.get(key);
    },
  }),
} as unknown as ConvexReactClient;
function render(children: ReactNode) {
  return renderReact(
    <ConvexProvider client={client}>{children}</ConvexProvider>,
  );
}
const table = (props = {}) => (
  <UsersTable
    roleFilter="student"
    scope={{ orgType: "campus", orgId: "campus-a" }}
    readOnly
    {...props}
  />
);
const listCalls = () =>
  state.calls.mock.calls
    .filter(([name, args]) => name === "people:list" && args !== "skip")
    .map(([, args]) => args);
beforeEach(() => {
  vi.useFakeTimers();
  state.calls.mockClear();
  state.prepare.mockClear();
  state.cache.clear();
  state.ready = true;
  state.sparse = false;
  state.totalRows = 26;
  state.hiddenBefore = 25;
  state.reveal = false;
  state.pendingCursor = "";
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  state.listeners.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("native pagination preserves server order, editing permissions, search and filters", async () => {
  const click = vi.fn(),
    count = vi.fn();
  render(table({ onRowClick: click, onFilteredRowCountChange: count }));
  expect(listCalls()[0]).toMatchObject({
    sortBy: "fullName",
    paginationOpts: { numItems: 25, cursor: null },
  });
  expect(
    state.calls.mock.calls.filter(
      ([name, args]) => name === "users:getUsers" && args !== "skip",
    ),
  ).toHaveLength(0);
  expect(count).not.toHaveBeenCalled();
  expect(screen.queryByText("Create user")).toBeNull();
  fireEvent.click(screen.getByText("Zulu server order"));
  expect(click).toHaveBeenCalledWith(
    expect.objectContaining({ _id: "person-0" }),
  );
  expect(screen.getAllByRole("row")[1].textContent).toContain("Zulu");
  fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
  expect(screen.getByText("Second page")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Go to previous page" }));
  expect(screen.getByText("Zulu server order")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
  fireEvent.click(screen.getByRole("button", { name: "teacher.email" }));
  expect(listCalls().at(-1)).toMatchObject({
    sortBy: "email",
    paginationOpts: { cursor: null },
  });
  fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose grade" }));
  expect(listCalls().at(-1)).toMatchObject({
    grade: "05",
    sortBy: "email",
    paginationOpts: { cursor: null },
  });
  fireEvent.change(screen.getByPlaceholderText("common.searchByName"), {
    target: { value: "Find elsewhere" },
  });
  expect(listCalls().at(-1).search).toBeUndefined();
  await act(async () => vi.advanceTimersByTime(300));
  expect(listCalls().at(-1)).toMatchObject({
    search: "Find elsewhere",
    paginationOpts: { cursor: null },
  });
  expect(screen.getByText("Found outside first page")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "teacher.email" })).toBeNull();
});

test("returning to a previous filter resets to the first page instead of restoring stale cursors", async () => {
  render(table());
  fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
  const input = screen.getByPlaceholderText("common.searchByName");
  fireEvent.change(input, { target: { value: "Find" } });
  await act(async () => vi.advanceTimersByTime(300));
  fireEvent.change(input, { target: { value: "" } });
  await act(async () => vi.advanceTimersByTime(300));
  expect(screen.getByText("Zulu server order")).toBeTruthy();
  expect(screen.getByText("table.pageNumber:1")).toBeTruthy();
});

test("StrictMode retains empty ranges reactively, including new permission matches and removal of the last page", () => {
  state.sparse = true;
  render(<StrictMode>{table()}</StrictMode>);
  expect(screen.queryByText("Second page")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
  expect(screen.getByText("Second page")).toBeTruthy();
  expect(screen.getByText("table.pageNumber:1")).toBeTruthy();
  act(() => {
    state.reveal = true;
    state.cache.clear();
    for (const listener of [...state.listeners]) listener();
  });
  expect(screen.getByText("Zulu server order")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
  expect(screen.getByText("Second page")).toBeTruthy();
  act(() => {
    state.reveal = false;
    state.cache.clear();
    for (const listener of [...state.listeners]) listener();
  });
  expect(screen.getByText("table.pageNumber:1")).toBeTruthy();
  expect(screen.getByText("Second page")).toBeTruthy();
});

test("a sparse 1,001-person campus only reads one source range per explicit request", async () => {
  state.sparse = true;
  state.totalRows = 1_001;
  state.hiddenBefore = 1_000;
  render(table());
  await act(async () => vi.runOnlyPendingTimers());
  expect(
    new Set(listCalls().map((args) => args.paginationOpts.cursor)),
  ).toEqual(new Set([null]));
  fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
  await act(async () => vi.runOnlyPendingTimers());
  expect(
    new Set(listCalls().map((args) => args.paginationOpts.cursor)),
  ).toEqual(new Set([null, "25"]));
  expect(
    screen
      .getByRole("button", { name: "Go to next page" })
      .hasAttribute("disabled"),
  ).toBe(false);
});

test("uninitialized directory prepares once and administrative settings retain legacy mode", () => {
  state.ready = false;
  const view = render(table());
  expect(state.prepare).toHaveBeenCalledExactlyOnceWith({
    campusId: "campus-a",
    role: "student",
  });
  expect(listCalls()).toHaveLength(0);
  view.unmount();
  state.calls.mockClear();
  render(
    <UsersTable
      roleFilter="admin"
      scope={{ orgType: "school", orgId: "school" }}
    />,
  );
  expect(
    state.calls.mock.calls.some(
      ([name, args]) => name === "users:getUsers" && args !== "skip",
    ),
  ).toBe(true);
  expect(screen.getByText("Create user")).toBeTruthy();
});

test("a server-scoped teacher roster opens its only page immediately without extra requests", () => {
  state.totalRows = 1;
  const click = vi.fn();
  render(<StrictMode>{table({ onRowClick: click })}</StrictMode>);
  expect(screen.getByText("Zulu server order")).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Go to next page" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(
    new Set(listCalls().map((args) => args.paginationOpts.cursor)),
  ).toEqual(new Set([null]));
  fireEvent.click(screen.getByText("Zulu server order"));
  expect(click).toHaveBeenCalledWith(
    expect.objectContaining({ _id: "person-0" }),
  );
  expect(screen.queryByText("Create user")).toBeNull();
});

test("reactive removals do not leave an empty visible page when later ranges remain unloaded", () => {
  state.totalRows = 100;
  render(<StrictMode>{table()}</StrictMode>);
  fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
  expect(screen.getByText("Second page")).toBeTruthy();
  act(() => {
    state.sparse = true;
    state.hiddenBefore = 25;
    state.cache.clear();
    for (const listener of [...state.listeners]) listener();
  });
  expect(screen.getByText("Second page")).toBeTruthy();
  expect(screen.getByText("table.pageNumber:1")).toBeTruthy();
  expect(
    new Set(listCalls().map((args) => args.paginationOpts.cursor)),
  ).toEqual(new Set([null, "25"]));
  fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
  expect(screen.getByText("Person 50")).toBeTruthy();
});

test("late pagination responses cannot restore a previous search or lose the editable table", async () => {
  state.totalRows = 100;
  state.pendingCursor = "25";
  render(<StrictMode>{table({ readOnly: false })}</StrictMode>);
  expect(screen.getByText("Create user")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
  expect(screen.getByRole("table").getAttribute("aria-busy")).toBe("true");
  expect(
    screen.getByRole("button", { name: "Go to next page" }),
  ).toHaveProperty("disabled", true);
  const input = screen.getByPlaceholderText("common.searchByName");
  fireEvent.change(input, { target: { value: "Find" } });
  await act(async () => vi.advanceTimersByTime(300));
  expect(screen.getByText("Found outside first page")).toBeTruthy();
  expect(screen.getByText("table.pageNumber:1")).toBeTruthy();
  act(() => {
    state.pendingCursor = "";
    for (const listener of [...state.listeners]) listener();
  });
  expect(screen.queryByText("Second page")).toBeNull();
  expect(screen.getByText("Found outside first page")).toBeTruthy();
  fireEvent.change(input, { target: { value: "" } });
  await act(async () => vi.advanceTimersByTime(300));
  expect(screen.getByText("Zulu server order")).toBeTruthy();
  expect(screen.getByText("table.pageNumber:1")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
  expect(screen.getByText("Second page")).toBeTruthy();
  expect(screen.getByText("Create user")).toBeTruthy();
});
