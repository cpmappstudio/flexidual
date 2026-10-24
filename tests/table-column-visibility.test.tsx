import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import type { CellContext, ColumnDef, Table } from "@tanstack/react-table";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DataTable } from "@/components/table/data-table";
import { createSearchColumn } from "@/components/table/column-helpers";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/ui/responsive-filters", () => ({
  ResponsiveFilters: ({
    filters,
  }: {
    filters: { onChange: (value: string) => void }[];
  }) => <button onClick={() => filters[0].onChange("05")}>Choose grade</button>,
}));

type Person = { name: string; email: string; grade: string };
const columns: ColumnDef<Person>[] = [
  createSearchColumn<Person>(["name", "email"]),
  { accessorKey: "name", header: "Name", enableHiding: false },
  { accessorKey: "email", header: "Email", meta: { label: "Email" } },
  { accessorKey: "grade", header: "Grade", meta: { label: "Grade" } },
];
const data = [{ name: "Ana", email: "ana@example.com", grade: "05" }];
const keyA = "columns:user-a:campus-a:students";
const keyB = "columns:user-b:campus-a:students";
const table = (key: string | undefined = keyA, extra = {}) => (
  <DataTable
    data={data}
    columns={columns}
    columnVisibilityKey={key}
    filterColumn="search"
    filterPlaceholder="Search"
    emptyMessage="No results"
    {...extra}
  />
);
async function menu() {
  fireEvent.keyDown(screen.getByRole("button", { name: "table.columns" }), {
    key: "Enter",
  });
  return screen.findByRole("menu");
}
async function toggle(label: string) {
  const open = screen.queryByRole("menu") ?? (await menu());
  fireEvent.click(within(open).getByRole("menuitemcheckbox", { name: label }));
  await act(async () => fireEvent.keyDown(open, { key: "Escape" }));
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("the native selector keeps existing defaults, hides headers and cells, and never offers internal columns", async () => {
  const saved = vi.spyOn(Storage.prototype, "setItem");
  const rowClick = vi.fn();
  render(<StrictMode>{table(keyA, { onRowClick: rowClick })}</StrictMode>);
  expect(screen.getAllByRole("columnheader")).toHaveLength(3);
  expect(saved).not.toHaveBeenCalled();
  const open = await menu();
  expect(within(open).getAllByRole("menuitemcheckbox")).toHaveLength(2);
  expect(within(open).queryByText("search")).toBeNull();
  expect(within(open).queryByText("Name")).toBeNull();
  await toggle("Email");
  expect(screen.queryByRole("columnheader", { name: "Email" })).toBeNull();
  expect(screen.queryByText("ana@example.com")).toBeNull();
  expect(saved).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("Ana"));
  expect(rowClick).toHaveBeenCalledWith(data[0]);
  fireEvent.change(screen.getByPlaceholderText("Search"), {
    target: { value: "ana@example.com" },
  });
  expect(screen.getByText("Ana")).toBeTruthy();
  expect(saved).toHaveBeenCalledTimes(1);
});

test("the icon-only selector uses the card background beside creation, after the filters", () => {
  render(
    table(keyA, {
      customFilter: <button>All grades</button>,
      createAction: <button>Add New Student</button>,
    }),
  );
  const columns = screen.getByRole("button", { name: "table.columns" });
  const create = screen.getByRole("button", { name: "Add New Student" });
  expect(columns.textContent).toBe("");
  expect(columns.getAttribute("data-size")).toBe("icon");
  expect(columns.classList.contains("bg-card")).toBe(true);
  expect(columns.parentElement).toBe(create.parentElement);
  expect(columns.nextElementSibling).toBe(create);
  expect(
    screen
      .getAllByRole("button")
      .indexOf(screen.getByRole("button", { name: "All grades" })),
  ).toBeLessThan(screen.getAllByRole("button").indexOf(columns));
});

test("preferences survive remounts and stay isolated when the current user or campus changes", async () => {
  const view = render(table());
  await toggle("Email");
  view.unmount();
  const reopened = render(table());
  expect(screen.queryByRole("columnheader", { name: "Email" })).toBeNull();
  reopened.rerender(table(keyB));
  expect(screen.getByRole("columnheader", { name: "Email" })).toBeTruthy();
  expect(localStorage.getItem(keyB)).toBeNull();
  await toggle("Grade");
  reopened.rerender(table("columns:user-a:campus-b:students"));
  expect(screen.getAllByRole("columnheader")).toHaveLength(3);
  reopened.rerender(table(keyA));
  expect(screen.queryByRole("columnheader", { name: "Email" })).toBeNull();
  expect(screen.getByRole("columnheader", { name: "Grade" })).toBeTruthy();
  expect(JSON.parse(localStorage.getItem(keyB)!)).toMatchObject({
    grade: false,
  });
});

test("batched column changes compose and persist together in StrictMode", () => {
  const saved = vi.spyOn(Storage.prototype, "setItem");
  let api!: Table<Person>;
  const capturingColumns = columns.map((column, index) =>
    index === 1
      ? {
          ...column,
          cell: ({ table, getValue }: CellContext<Person, unknown>) => {
            api = table;
            return getValue() as string;
          },
        }
      : column,
  );
  const view = render(
    <StrictMode>{table(keyA, { columns: capturingColumns })}</StrictMode>,
  );
  act(() => {
    api.getColumn("email")!.toggleVisibility(false);
    api.getColumn("grade")!.toggleVisibility(false);
  });
  expect(screen.getAllByRole("columnheader")).toHaveLength(1);
  expect(JSON.parse(localStorage.getItem(keyA)!)).toEqual({
    search: false,
    email: false,
    grade: false,
  });
  expect(saved).toHaveBeenCalledTimes(1);
  view.rerender(<StrictMode>{table(keyB)}</StrictMode>);
  expect(screen.getAllByRole("columnheader")).toHaveLength(3);
  expect(localStorage.getItem(keyB)).toBeNull();
  expect(saved).toHaveBeenCalledTimes(1);
  view.rerender(<StrictMode>{table(keyA)}</StrictMode>);
  expect(screen.getAllByRole("columnheader")).toHaveLength(1);
  expect(saved).toHaveBeenCalledTimes(1);
});

test.each([
  "broken-json",
  "[]",
  "null",
  '{"email":"false","search":true,"name":false,"unknown":false}',
])(
  "invalid or obsolete preferences cannot reveal internal columns or hide protected columns: %s",
  (stored) => {
    localStorage.setItem(keyA, stored);
    render(table());
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "search" })).toBeNull();
  },
);

test("blocked or full storage keeps customization usable in memory", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("Blocked", "SecurityError");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  render(table());
  await toggle("Email");
  expect(screen.queryByRole("columnheader", { name: "Email" })).toBeNull();
  await toggle("Email");
  expect(screen.getByRole("columnheader", { name: "Email" })).toBeTruthy();
});

test("tables without the opt-in keep their existing UI and do not access preference storage", () => {
  const get = vi.spyOn(Storage.prototype, "getItem");
  const set = vi.spyOn(Storage.prototype, "setItem");
  render(table(keyA, { columnVisibilityKey: undefined }));
  expect(screen.queryByRole("button", { name: "table.columns" })).toBeNull();
  expect(get).not.toHaveBeenCalled();
  expect(set).not.toHaveBeenCalled();
});

test("empty results span only the visible columns", () => {
  localStorage.setItem(keyA, JSON.stringify({ email: false, grade: false }));
  render(table(keyA, { data: [] }));
  expect(
    screen.getByRole("cell", { name: "No results" }).getAttribute("colspan"),
  ).toBe("1");
});

test("changing visibility does not change server sorting, filters or the pagination cursor", async () => {
  const server = {
    sorting: [],
    columnFilters: [],
    onSortingChange: vi.fn(),
    onColumnFiltersChange: vi.fn(),
    pageIndex: 3,
    hasNext: true,
    isLoading: false,
    onPrevious: vi.fn(),
    onNext: vi.fn(),
  };
  render(table(keyA, { server }));
  await toggle("Grade");
  expect(server.onColumnFiltersChange).not.toHaveBeenCalled();
  expect(server.onSortingChange).not.toHaveBeenCalled();
  expect(server.onNext).not.toHaveBeenCalled();
  expect(screen.getByText("Ana")).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText("Search"), {
    target: { value: "ana" },
  });
  expect(server.onColumnFiltersChange).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
  expect(server.onNext).toHaveBeenCalledTimes(1);
});

test("SSR and hydration agree before applying this user's browser preference", async () => {
  localStorage.setItem(keyA, JSON.stringify({ email: false }));
  const container = document.createElement("div");
  document.body.appendChild(container);
  container.innerHTML = renderToString(table());
  expect(
    within(container).getByRole("columnheader", { name: "Email" }),
  ).toBeTruthy();
  const errors = vi.fn();
  let root!: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, table(), { onRecoverableError: errors });
  });
  expect(
    within(container).queryByRole("columnheader", { name: "Email" }),
  ).toBeNull();
  expect(errors).not.toHaveBeenCalled();
  act(() => root.unmount());
  container.remove();
});
