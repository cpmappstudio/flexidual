import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PostHogBootstrap } from "@/components/posthog-bootstrap";
import { posthogConfig } from "@/lib/posthog-config";

const mocks = vi.hoisted(() => ({
  auth: { isLoaded: true, userId: "adult-1" as string | null },
  staff: { access: { role: "teacher" }, isLoading: false },
  pathname: "/en/cpca-main/catalog",
  locale: "en",
  sdk: {
    init: vi.fn(),
    identify: vi.fn(),
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    reset: vi.fn(),
    shutdown: vi.fn(),
    displaySurvey: vi.fn(),
    on: vi.fn(() => vi.fn()),
    cancelPendingSurvey: vi.fn(),
    onFeatureFlags: vi.fn(() => vi.fn()),
    onSurveysLoaded: vi.fn(() => vi.fn()),
  },
}));

vi.mock("@clerk/nextjs", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/hooks/use-staff-access", () => ({
  useStaffAccess: () => mocks.staff,
}));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("next-intl", () => ({ useLocale: () => mocks.locale }));
vi.mock("posthog-js", () => ({
  PostHog: class {
    constructor() {
      return mocks.sdk;
    }
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_TEST_SURVEY_ID", "");
  mocks.pathname = "/en/cpca-main/catalog";
  mocks.locale = "en";
  mocks.auth = { isLoaded: true, userId: "adult-1" };
  mocks.staff = { access: { role: "teacher" }, isLoading: false };
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

test.each(["teacher", "principal", "admin", "superadmin"])(
  "identifies %s using only stable ID and role",
  async (role) => {
    mocks.staff.access.role = role;
    render(<PostHogBootstrap />);
    await waitFor(() =>
      expect(mocks.sdk.identify).toHaveBeenCalledWith("adult-1", { role }),
    );
    expect(mocks.sdk.init).toHaveBeenCalledOnce();
    expect(mocks.sdk.init).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        api_host: "https://us.i.posthog.com",
        disable_surveys: true,
        disable_session_recording: true,
        capture_exceptions: false,
        autocapture: false,
      }),
    );
  },
);

test.each(["student", "tutor", "unknown"])(
  "does not initialize for %s",
  async (role) => {
    mocks.staff.access.role = role;
    render(<PostHogBootstrap />);
    await act(async () => {});
    expect(mocks.sdk.init).not.toHaveBeenCalled();
  },
);

test("waits for verified access and tolerates missing configuration", async () => {
  mocks.staff.isLoading = true;
  const view = render(<PostHogBootstrap />);
  await act(async () => {});
  expect(mocks.sdk.init).not.toHaveBeenCalled();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");
  mocks.staff.isLoading = false;
  view.rerender(<PostHogBootstrap />);
  await act(async () => {});
  expect(mocks.sdk.init).not.toHaveBeenCalled();
});

test("disables and resets on logout, and never identifies the next student", async () => {
  const view = render(<PostHogBootstrap />);
  await waitFor(() => expect(mocks.sdk.identify).toHaveBeenCalledOnce());
  mocks.auth.userId = null;
  view.rerender(<PostHogBootstrap />);
  expect(mocks.sdk.opt_out_capturing).toHaveBeenCalledOnce();
  expect(mocks.sdk.reset).toHaveBeenCalledWith(true);
  mocks.auth.userId = "student-2";
  mocks.staff.access.role = "student";
  view.rerender(<PostHogBootstrap />);
  await act(async () => {});
  expect(mocks.sdk.identify).toHaveBeenCalledOnce();
});

test("disposes the previous SDK before switching adults", async () => {
  const view = render(<PostHogBootstrap />);
  await waitFor(() => expect(mocks.sdk.identify).toHaveBeenCalledOnce());
  mocks.auth.userId = "adult-2";
  view.rerender(<PostHogBootstrap />);
  await waitFor(() =>
    expect(mocks.sdk.identify).toHaveBeenCalledWith("adult-2", {
      role: "teacher",
    }),
  );
  expect(mocks.sdk.reset).toHaveBeenCalledOnce();
  expect(mocks.sdk.shutdown).toHaveBeenCalledOnce();
  expect(mocks.sdk.init).toHaveBeenCalledTimes(2);
});

test("enables only the configured local survey and disposes it on entering a classroom", async () => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_TEST_SURVEY_ID", "test-survey");
  const view = render(<PostHogBootstrap />);
  await waitFor(() => expect(mocks.sdk.onSurveysLoaded).toHaveBeenCalledOnce());
  expect(mocks.sdk.init).toHaveBeenCalledWith(
    "phc_test",
    expect.objectContaining({
      disable_surveys: false,
      disable_surveys_automatic_display: true,
      override_display_language: "en",
    }),
  );
  mocks.pathname = "/en/cpca-main/classroom/test";
  view.rerender(<PostHogBootstrap />);
  await waitFor(() => expect(mocks.sdk.init).toHaveBeenCalledTimes(2));
  expect(mocks.sdk.cancelPendingSurvey).toHaveBeenCalledWith("test-survey");
  expect(mocks.sdk.shutdown).toHaveBeenCalledOnce();
  expect(mocks.sdk.init).toHaveBeenLastCalledWith(
    "phc_test",
    expect.objectContaining({ disable_surveys: true }),
  );
});

test("does not initialize when unmounted before the SDK loads", async () => {
  const view = render(<PostHogBootstrap />);
  view.unmount();
  await act(async () => {});
  expect(mocks.sdk.init).not.toHaveBeenCalled();
});

test("the bootstrap filter excludes automatic metadata and unapproved events", () => {
  const filter = posthogConfig.before_send;
  if (typeof filter !== "function")
    throw new Error("Expected a privacy filter");
  const event = {
    uuid: "event-id",
    event: "$identify",
    $set: { role: "teacher", email: "private@example.com" },
    $set_once: { $initial_current_url: "https://example.com/private" },
    properties: {
      token: "phc_test",
      distinct_id: "adult-1",
      $anon_distinct_id: "anon-1",
      $process_person_profile: true,
      $current_url: "https://example.com/private?token=secret",
      $referrer: "https://example.com/student",
    },
  };
  const result = filter(event);
  expect(result?.properties).toEqual({
    token: "phc_test",
    distinct_id: "adult-1",
    $anon_distinct_id: "anon-1",
    $process_person_profile: true,
    $set: { role: "teacher" },
  });
  expect(result?.$set).toEqual({ role: "teacher" });
  expect(result?.$set_once).toBeUndefined();
  expect(filter({ ...event, event: "$pageview" })).toBeNull();
  expect(filter({ ...event, event: "$exception" })).toBeNull();
  expect(filter(null)).toBeNull();
});
