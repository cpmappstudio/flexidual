import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { getFunctionName } from "convex/server";
import { afterEach, expect, test, vi } from "vitest";
import { CourseChatsNav } from "@/components/chat/course-chats-nav";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SidebarWorkspace } from "@/components/sidebar-workspace";
import type { Id } from "@/convex/_generated/dataModel";

const state = vi.hoisted(() => ({
  slug: "campus",
  queries: vi.fn(),
  chats: [
    { _id: "algebra", name: "Algebra I · Teacher", archived: false },
    { _id: "biology", name: "Biology · Teacher", archived: false },
    { _id: "old", name: "Algebra 2025", archived: true },
  ],
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useMutation: () => vi.fn(),
  useQuery: (query: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(query);
    state.queries(name, args);
    return name === "organizations:resolveSlug"
      ? { type: "campus", _id: state.slug }
      : state.chats;
  },
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: state.slug }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/use-unread-course-chats", () => ({
  useUnreadCourseChats: () => new Map(),
}));
vi.mock("@/components/nav-main", () => ({ NavMain: () => null }));
vi.mock("@/hooks/use-org-base-path", () => ({
  useOrgBasePath: () => `/${state.slug}`,
}));
vi.mock("@/hooks/use-staff-access", () => ({
  useStaffAccess: () => ({ access: { canManageCampus: true } }),
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => `/${state.slug}/chats/algebra`,
  Link: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/components/teaching/curriculums/curriculum-icon", () => ({
  CurriculumIcon: () => <span />,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  state.slug = "campus";
  state.queries.mockClear();
});

test("chat sidebar uses the shared ScrollArea without a second native scroll container", () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const { getByRole } = render(
    <SidebarProvider>
      <SidebarWorkspace />
    </SidebarProvider>,
  );
  const panel = getByRole("tabpanel", { name: "chats" });
  expect(panel.classList.contains("overflow-hidden")).toBe(true);
  expect(panel.classList.contains("overflow-y-auto")).toBe(false);
  const viewport = panel.querySelector('[data-slot="scroll-area-viewport"]');
  expect(
    viewport?.contains(getByRole("searchbox", { name: "searchChats" })),
  ).toBe(true);
  expect(
    viewport?.contains(getByRole("link", { name: "Algebra I · Teacher" })),
  ).toBe(true);
});

test("filters active and archived chat names locally, preserving links and unread indicators", () => {
  const view = () => (
    <SidebarProvider>
      <CourseChatsNav
        unreadChats={new Map([["algebra" as Id<"classes">, 2]])}
      />
    </SidebarProvider>
  );
  const { getByRole, queryByRole, queryByText, getByText, rerender } =
    render(view());
  const search = getByRole("searchbox", { name: "searchChats" });
  fireEvent.change(search, { target: { value: "  ALGEBRA  " } });
  expect(
    getByRole("link", { name: "Algebra I · Teacher" }).getAttribute("href"),
  ).toBe("/campus/chats/algebra");
  expect(getByText("unreadMessages")).toBeTruthy();
  expect(getByRole("button", { name: "Algebra 2025" })).toBeTruthy();
  expect(queryByRole("link", { name: "Biology · Teacher" })).toBeNull();
  fireEvent.change(search, { target: { value: "2025" } });
  expect(queryByText("noMatchingChats")).toBeNull();
  expect(getByRole("button", { name: "Algebra 2025" })).toBeTruthy();
  fireEvent.change(search, { target: { value: "missing" } });
  expect(getByText("noMatchingChats")).toBeTruthy();
  expect(queryByText("archivedChats")).toBeNull();
  fireEvent.change(search, { target: { value: "" } });
  expect(getByRole("link", { name: "Biology · Teacher" })).toBeTruthy();
  expect(
    state.queries.mock.calls
      .filter(([name]) => name === "classes:listChatOptions")
      .every(
        ([, args]) =>
          JSON.stringify(args) === JSON.stringify({ campusId: "campus" }),
      ),
  ).toBe(true);
  fireEvent.change(search, { target: { value: "missing" } });
  state.slug = "other-campus";
  rerender(view());
  expect((search as HTMLInputElement).value).toBe("");
});
