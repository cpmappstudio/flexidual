import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { NextIntlClientProvider } from "next-intl";
import { NewBroadcastDialog } from "@/components/chat/new-broadcast-dialog";
import type { Id } from "@/convex/_generated/dataModel";
import messages from "@/messages/en.json";

const state = vi.hoisted(() => ({
  create: vi.fn().mockResolvedValue("broadcast"),
  push: vi.fn(),
  close: vi.fn(),
  queries: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useMutation: () => state.create,
  useQuery: (query: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(query) === "grades:list"
      ? [{ code: "01", name: "First grade" }]
      : [],
  usePaginatedQuery: (_query: unknown, args: unknown) => {
    state.queries(args);
    return {
      results: [{ _id: "teacher", fullName: "Professor One" }],
      status: "Exhausted",
      loadMore: vi.fn(),
    };
  },
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: state.push }),
}));
vi.mock("@/hooks/use-org-base-path", () => ({
  useOrgBasePath: () => "/campus",
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

test("reuses grade checkboxes, selects teacher writers, creates once and navigates without touching a course", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const { getByRole } = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <NewBroadcastDialog
        scope={{
          schoolId: "school" as Id<"schools">,
          campusId: "campus" as Id<"campuses">,
          canInstitution: false,
        }}
        onClose={state.close}
      />
    </NextIntlClientProvider>,
  );
  expect(
    (getByRole("radio", { name: "Institution" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.change(getByRole("textbox", { name: "Name" }), {
    target: { value: "Campus news" },
  });
  fireEvent.click(getByRole("checkbox", { name: "First grade" }));
  const picker = getByRole("combobox", { name: "Professors who can write" });
  fireEvent.focus(picker);
  fireEvent.keyDown(picker, { key: "ArrowDown" });
  await waitFor(() =>
    expect(getByRole("option", { name: "Professor One" })).toBeDefined(),
  );
  fireEvent.click(getByRole("option", { name: "Professor One" }));
  expect(state.close).not.toHaveBeenCalled();
  fireEvent.keyDown(picker, { key: "Escape" });
  expect(state.close).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(getByRole("button", { name: "Create broadcast" })).toBeDefined(),
  );
  fireEvent.click(getByRole("button", { name: "Create broadcast" }));
  await waitFor(() => expect(state.create).toHaveBeenCalledTimes(1));
  expect(state.create).toHaveBeenCalledWith({
    name: "Campus news",
    schoolId: "school",
    campusId: "campus",
    mode: "private",
    gradeCodes: ["01"],
    teacherIds: ["teacher"],
  });
  await waitFor(() =>
    expect(state.push).toHaveBeenCalledWith(
      "/campus/chats/broadcasts/broadcast",
    ),
  );
  expect(state.close).toHaveBeenCalledOnce();
});
