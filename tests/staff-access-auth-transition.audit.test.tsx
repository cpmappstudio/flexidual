import { Component, type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useStaffAccess } from "@/hooks/use-staff-access";

const mocks = vi.hoisted(() => ({
  isAuthenticated: true,
  isAuthLoading: false,
  queryError: undefined as Error | undefined,
  useQuery: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: { organizations: { getStaffContext: "getStaffContext" } },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "school" }),
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isAuthenticated: mocks.isAuthenticated,
    isLoading: mocks.isAuthLoading,
  }),
  useQuery: (query: string, args: unknown) => {
    mocks.useQuery(query, args);
    if (args !== "skip" && mocks.queryError) throw mocks.queryError;
    return undefined;
  },
}));

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error?: Error }
> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    return this.state.error ? (
      <div role="alert">{this.state.error.message}</div>
    ) : (
      this.props.children
    );
  }
}

function StaffAccessConsumer() {
  const { isLoading } = useStaffAccess();
  return <div>{isLoading ? "loading" : "ready"}</div>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAuthenticated = true;
  mocks.isAuthLoading = false;
  mocks.queryError = undefined;
});

afterEach(cleanup);

test("a backend auth rejection escapes the optional staff-access hook", () => {
  mocks.queryError = new Error("User not authenticated");
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  render(
    <ErrorBoundary>
      <StaffAccessConsumer />
    </ErrorBoundary>,
  );

  expect(screen.getByRole("alert").textContent).toBe("User not authenticated");
  expect(mocks.useQuery).toHaveBeenCalledWith("getStaffContext", {
    orgSlug: "school",
  });
  consoleError.mockRestore();
});

test("the query is skipped only after Convex auth is already false", () => {
  mocks.isAuthenticated = false;

  render(<StaffAccessConsumer />);

  expect(screen.getByText("ready")).not.toBeNull();
  expect(mocks.useQuery).toHaveBeenCalledWith("getStaffContext", "skip");
});
