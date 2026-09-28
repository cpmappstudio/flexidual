import { afterEach, expect, test, vi } from "vitest";
import { PostHog, type CaptureResult } from "posthog-js";
import { getPosthogSurveyConfig, posthogConfig } from "@/lib/posthog-config";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test("the real SDK accepts identification after applying the privacy filter", () => {
  vi.useFakeTimers();
  // Intercept the transport, not capture/identify: exercise SDK validation without
  // sending synthetic identities to PostHog or making any network requests.
  vi.spyOn(PostHog.prototype, "_send_request").mockImplementation(() => {});
  vi.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(() => {});
  const client = new PostHog();
  const captured = vi.fn<(event: CaptureResult) => void>();
  client.on("eventCaptured", captured);
  client.init("phc_test", {
    ...posthogConfig,
    api_host: "https://us.i.posthog.com",
    request_batching: false,
  });
  try {
    client.opt_in_capturing({ captureEventName: false });
    client.identify("adult-test", { role: "teacher" });

    const identification = captured.mock.calls
      .map(([event]) => event)
      .find((event) => event?.event === "$identify");
    expect(identification).toBeDefined();
    expect(identification?.properties).toEqual({
      token: "phc_test",
      distinct_id: "adult-test",
      $anon_distinct_id: undefined,
      $process_person_profile: true,
      $set: { role: "teacher" },
    });
    expect(identification?.$set).toEqual({ role: "teacher" });
    expect(identification?.$set_once).toBeUndefined();

    client.set_config({
      before_send: getPosthogSurveyConfig("survey-test").before_send,
    });
    captured.mockClear();
    client.capture("survey sent", {
      $survey_id: "survey-test",
      $survey_response_question1: 5,
      $survey_completed: true,
    });
    expect(captured).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "survey sent",
        properties: expect.objectContaining({
          token: "phc_test",
          distinct_id: "adult-test",
          $process_person_profile: true,
          $survey_response_question1: 5,
          $survey_completed: true,
        }),
      }),
    );

    // Reproduce the original defect: SDK validation must reject an identify
    // event whose privacy filter removed the required project token.
    const filter = posthogConfig.before_send;
    if (typeof filter !== "function")
      throw new Error("Expected a privacy filter");
    client.set_config({
      before_send: (event) => {
        const filtered = filter(event);
        if (filtered) delete filtered.properties.token;
        return filtered;
      },
    });
    captured.mockClear();
    client.identify("another-adult-test", { role: "principal" });
    expect(captured).not.toHaveBeenCalled();
  } finally {
    client.opt_out_capturing();
    client.reset(true);
    vi.clearAllTimers();
  }
});
