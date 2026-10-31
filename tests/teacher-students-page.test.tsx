import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CampusUsersPage } from "@/components/admin/users/campus-users-page";
import { NavMain } from "@/components/nav-main";

const state = vi.hoisted(() => ({
  role: "teacher",
  userId: "teacher-id" as string | null,
  canViewPeople: false,
  canViewStudents: true,
  canManagePeople: false,
  push: vi.fn(),
  replace: vi.fn(),
  table: vi.fn(),
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: state.userId }) }));
vi.mock("@/hooks/use-staff-access", () => ({
  useStaffAccess: () => ({ access: state, isLoading: false }),
}));
vi.mock("@/hooks/use-current-org-role", () => ({
  useCurrentOrgRole: () => ({
    access: state,
    role: state.role,
    isLoaded: true,
  }),
}));
vi.mock("@/hooks/use-org-base-path", () => ({
  useOrgBasePath: () => "/campus",
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "campus" }),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: state.push, replace: state.replace }),
  usePathname: () => "/campus/students",
  Link: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useQuery: () => ({ type: "campus", _id: "campus-id" }),
}));
vi.mock("@/components/admin/users/users-table", () => ({
  UsersTable: (props: { onRowClick: (student: { _id: string }) => void }) => {
    state.table(props);
    return (
      <button onClick={() => props.onRowClick({ _id: "student-id" })}>
        Student
      </button>
    );
  },
}));
vi.mock("@/components/ui/sidebar", () => {
  const wrapper = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return Object.fromEntries(
    [
      "SidebarGroup",
      "SidebarGroupContent",
      "SidebarGroupLabel",
      "SidebarMenu",
      "SidebarMenuButton",
      "SidebarMenuItem",
    ].map((name) => [name, wrapper]),
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.role = "teacher";
  state.userId = "teacher-id";
  state.canViewPeople = false;
  state.canViewStudents = true;
  state.canManagePeople = false;
});

test("teacher gets the student page and profile link without student editing", () => {
  render(<CampusUsersPage type="students" />);
  expect(state.table).toHaveBeenLastCalledWith(
    expect.objectContaining({
      roleFilter: "student",
      allowedRoles: ["student"],
      readOnly: true,
      columnVisibilityKey:
        "flexidual:table-columns:v1:teacher-id:campus-id:students",
      scope: { orgType: "campus", orgId: "campus-id" },
    }),
  );
  fireEvent.click(screen.getByText("Student"));
  expect(state.push).toHaveBeenCalledWith("/campus/students/student-id");
  expect(state.replace).not.toHaveBeenCalled();
});

test("teacher navigation exposes students but not professors", () => {
  render(<NavMain />);
  expect(
    screen
      .getByRole("link", { name: "navigation.students" })
      .getAttribute("href"),
  ).toBe("/campus/students");
  expect(
    screen.queryByRole("link", { name: "navigation.teachers" }),
  ).toBeNull();
});

test("teacher still cannot enter the professor directory", () => {
  render(<CampusUsersPage type="professors" />);
  expect(state.table).not.toHaveBeenCalled();
  expect(state.replace).toHaveBeenCalledWith("/campus");
});

test("administrative student editing is retained", () => {
  state.role = "admin";
  state.canViewPeople = true;
  state.canManagePeople = true;
  render(<CampusUsersPage type="students" />);
  expect(state.table).toHaveBeenLastCalledWith(
    expect.objectContaining({ readOnly: false }),
  );
});

test("student column preferences use the signed-in account, never an anonymous or shared key", () => {
  const view = render(<CampusUsersPage type="students" />);
  state.userId = "second-user";
  view.rerender(<CampusUsersPage type="students" />);
  expect(state.table).toHaveBeenLastCalledWith(
    expect.objectContaining({
      columnVisibilityKey:
        "flexidual:table-columns:v1:second-user:campus-id:students",
    }),
  );
  state.userId = null;
  view.rerender(<CampusUsersPage type="students" />);
  expect(state.table).toHaveBeenLastCalledWith(
    expect.objectContaining({ columnVisibilityKey: undefined }),
  );
});

test("the professor table is unchanged by the student-only visibility opt-in", () => {
  state.canViewPeople = true;
  render(<CampusUsersPage type="professors" />);
  expect(state.table).toHaveBeenLastCalledWith(
    expect.objectContaining({ columnVisibilityKey: undefined }),
  );
});
