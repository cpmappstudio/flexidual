import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { PostHog } from "posthog-js";
import { PostHogSurveyNotifications } from "@/components/posthog-survey-notifications";

const mocks = vi.hoisted(() => ({
  state: undefined as { enabled: boolean; completed: boolean } | undefined,
  acknowledge: vi.fn(),
  callbacks: {} as { onEligible?: () => void; onComplete?: () => void },
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ orgSlug: "campus" }) }));
vi.mock("convex/react", () => ({ useQuery: () => mocks.state, useMutation: () => mocks.acknowledge }));
vi.mock("@/components/posthog-survey-panel", () => ({
  PostHogSurveyPanel: (props: typeof mocks.callbacks) => {
    mocks.callbacks = props;
    return <div data-testid="survey-panel" />;
  },
}));

beforeEach(() => {
  mocks.state = { enabled: true, completed: false };
  mocks.acknowledge.mockReset().mockResolvedValue(null);
  mocks.callbacks = {};
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const props = { client: {} as PostHog, surveyId: "test", userId: "teacher", locale: "es" };

test("waits for server completion before showing and never invites already-completed users", () => {
  mocks.state = undefined;
  const view = render(<PostHogSurveyNotifications {...props} />);
  expect(view.queryByTestId("survey-panel")).toBeNull();
  mocks.state = { enabled: true, completed: true };
  view.rerender(<PostHogSurveyNotifications {...props} />);
  expect(view.queryByTestId("survey-panel")).toBeNull();
  expect(mocks.acknowledge).not.toHaveBeenCalled();
});

test("enrolls once on SDK eligibility and preserves thank-you after own completion", async () => {
  const view = render(<PostHogSurveyNotifications {...props} />);
  expect(mocks.acknowledge).not.toHaveBeenCalled();
  await act(async () => mocks.callbacks.onEligible?.());
  await act(async () => mocks.callbacks.onEligible?.());
  expect(mocks.acknowledge).toHaveBeenCalledExactlyOnceWith({ surveyId: "test", organizationSlug: "campus", completed: false });
  await act(async () => mocks.callbacks.onComplete?.());
  expect(mocks.acknowledge).toHaveBeenLastCalledWith({ surveyId: "test", organizationSlug: "campus", completed: true });
  mocks.state = { enabled: true, completed: true };
  view.rerender(<PostHogSurveyNotifications {...props} />);
  expect(view.queryByTestId("survey-panel")).not.toBeNull();
});

test("reconciles older browser completion without another invitation", async () => {
  localStorage.setItem("flexidual:survey-panel:teacher:test", "complete");
  render(<PostHogSurveyNotifications {...props} />);
  await waitFor(() => expect(mocks.acknowledge).toHaveBeenCalledExactlyOnceWith({ surveyId: "test", organizationSlug: "campus", completed: true }));
});

test("retry completes an acknowledgement that failed offline", async () => {
  vi.useFakeTimers();
  mocks.acknowledge.mockRejectedValueOnce(new Error("offline"));
  render(<PostHogSurveyNotifications {...props} />);
  await act(async () => mocks.callbacks.onComplete?.());
  await act(async () => { vi.advanceTimersByTime(30_000); });
  expect(mocks.acknowledge).toHaveBeenCalledTimes(2);
  expect(mocks.acknowledge).toHaveBeenLastCalledWith(expect.objectContaining({ completed: true }));
});

test("a disabled campaign neither enrolls nor acknowledges", async () => {
  mocks.state = { enabled: false, completed: false };
  render(<PostHogSurveyNotifications {...props} />);
  await act(async () => { mocks.callbacks.onEligible?.(); mocks.callbacks.onComplete?.(); });
  expect(mocks.acknowledge).not.toHaveBeenCalled();
});
