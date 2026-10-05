import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PostHog, type CaptureResult } from "posthog-js";
import {
  createDiagnosticFilter,
  getErrorTrackingConfig,
} from "@/lib/error-tracking-config";
import { ErrorTrackingIdentity } from "@/components/error-tracking-bootstrap";
import {
  initializeErrorTracking,
  reportRuntimeError,
  reportWhiteboardDiagnostic,
} from "@/lib/error-tracking";

const identity = vi.hoisted(() => ({
  userId: "student-1",
  role: "student" as string | null,
  sessionClaims: { metadata: { roles: { campus: "student" } } },
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => identity }));
vi.mock("@/hooks/use-current-org-role", () => ({
  useCurrentOrgRole: () => identity,
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "campus" }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function filter() {
  const result = createDiagnosticFilter();
  if (typeof result !== "function") throw new Error("Expected a filter");
  return result;
}
const exception: CaptureResult = {
  uuid: "test-event",
  event: "$exception",
  $set: { email: "student@example.com" },
  properties: {
    token: "phc_test",
    distinct_id: "student-1",
    operation: "whiteboard.scene_save",
    $current_url: "https://example.com/student?token=secret",
    canvas: { text: "private drawing" },
    $exception_list: [
      {
        type: "Error",
        value:
          "Failed https://example.com?token=secret student@example.com password=secret",
        stacktrace: {
          type: "raw",
          frames: [
            {
              filename:
                "https://example.com/_next/static/chunks/app.js?token=secret",
              lineno: 10,
              colno: 3,
              chunk_id: "debug-id",
              vars: { password: "secret" },
              context_line: "private drawing",
            },
          ],
        },
      },
    ],
  },
};

test("diagnostics preserve stack locations but exclude content, identity properties and credentials", () => {
  const result = filter()(exception);
  expect(result?.properties).toMatchObject({
    token: "phc_test",
    distinct_id: "student-1",
    $process_person_profile: false,
  });
  const serialized = JSON.stringify(result);
  expect(serialized).not.toMatch(
    /secret|student@example|private drawing|password|current_url/,
  );
  expect(serialized).toContain("debug-id");
  expect(serialized).toContain("app.js");
  expect(result?.$set).toBeUndefined();
  expect(filter()({ ...exception, event: "$pageview" })).toBeNull();
  expect(filter()({ ...exception, event: "survey sent" })).toBeNull();
});

test("repeated failures are deduplicated, traffic is bounded and recovers after a minute", () => {
  vi.useFakeTimers();
  const beforeSend = filter();
  expect(beforeSend(exception)).not.toBeNull();
  expect(beforeSend(exception)).toBeNull();
  for (let i = 0; i < 100; i++)
    beforeSend({ ...exception, event: "whiteboard_diagnostic" });
  expect(
    beforeSend({ ...exception, event: "whiteboard_diagnostic" }),
  ).toBeNull();
  vi.advanceTimersByTime(60_000);
  expect(beforeSend(exception)).not.toBeNull();
  expect(getErrorTrackingConfig()).toMatchObject({
    disable_session_recording: true,
    disable_surveys: true,
    autocapture: false,
  });
});

test("real SDK sends diagnostics for every role, clears user context, and never sends survey events", async () => {
  vi.useFakeTimers();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://us.i.posthog.com");
  vi.spyOn(PostHog.prototype, "_send_request").mockImplementation(() => {});
  vi.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(() => {});
  const client = await initializeErrorTracking();
  expect(client?.config.token).toBe("phc_test");
  const captured = vi.fn();
  const unsubscribe = client!.on("eventCaptured", captured);
  const view = render(<ErrorTrackingIdentity />);
  identity.role = null;
  view.rerender(<ErrorTrackingIdentity />);
  await act(async () => reportWhiteboardDiagnostic({ operation: "shell" }));
  expect(captured.mock.lastCall?.[0].properties.role).toBe("student");
  for (const role of [
    "student",
    "teacher",
    "tutor",
    "principal",
    "admin",
    "superadmin",
  ]) {
    identity.role = role;
    identity.userId = `${role}-1`;
    view.rerender(<ErrorTrackingIdentity />);
    await act(async () =>
      reportWhiteboardDiagnostic({
        operation: "whiteboard.state_received",
        live_room: "activation-1",
      }),
    );
    expect(captured).toHaveBeenLastCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({ distinct_id: `${role}-1`, role }),
      }),
    );
  }
  // Account change before an asynchronous SDK call resolves must discard the old event.
  captured.mockClear();
  reportRuntimeError(new Error("old account failure"), { operation: "test" });
  view.unmount();
  await act(async () => {});
  expect(captured).not.toHaveBeenCalled();
  await act(async () => reportWhiteboardDiagnostic({ operation: "anonymous" }));
  expect(captured.mock.lastCall?.[0].properties.distinct_id).not.toBe(
    "superadmin-1",
  );
  captured.mockClear();
  client!.capture("survey sent", { $survey_id: "unexpected" });
  expect(captured).not.toHaveBeenCalled();
  // Native exception parser -> privacy filter -> transport validation.
  await import("posthog-js/dist/exception-autocapture");
  await act(async () =>
    reportRuntimeError(new Error("Safe test failure"), {
      operation: "test.sdk_exception",
    }),
  );
  expect(
    captured.mock.calls.some(([event]) => event.event === "$exception"),
  ).toBe(true);
  unsubscribe();
  await client!.shutdown();
  vi.clearAllTimers();
});
