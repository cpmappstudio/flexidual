import { afterEach, expect, test, vi } from "vitest";
import type { PostHog, Survey } from "posthog-js";
import {
  compactSurvey,
  getLocalSurveyId,
  observePosthogSurvey,
} from "@/lib/posthog-survey";
import { getPosthogSurveyConfig } from "@/lib/posthog-config";

afterEach(() => vi.unstubAllEnvs());

test("compact presentation preserves server metadata and doesn't guess branched navigation", () => {
  const survey = {
    id: "presentation-test",
    name: "Feedback",
    type: "popover",
    questions: [
      {
        id: "rating",
        type: "rating",
        question: "Rating",
        scale: 5,
        display: "emoji",
        skipSubmitButton: true,
      },
      {
        id: "feedback",
        type: "open",
        question: "Feedback",
        translations: { es: { question: "Opinión", buttonText: "Original" } },
      },
    ],
  } as Survey;
  const original = structuredClone(survey);
  const presentation = compactSurvey(survey, "es");
  expect(survey).toEqual(original);
  expect(presentation.questions[0]).toMatchObject({
    buttonText: "→",
    skipSubmitButton: false,
  });
  expect(presentation.questions[1]).toMatchObject({
    buttonText: "Enviar",
    translations: { es: { question: "Opinión", buttonText: "Enviar" } },
  });
  expect(compactSurvey(survey, "en").questions[1].buttonText).toBe("Submit");
  survey.questions[0].branching = { type: "end" };
  expect(compactSurvey(survey, "en").questions).toEqual(survey.questions);
});

test("local survey access fails closed for production, missing config and other roles", () => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_TEST_SURVEY_ID", "survey-test");
  for (const role of ["teacher", "principal"]) {
    expect(getLocalSurveyId(role, "/en/cpca-main/catalog")).toBe("survey-test");
    expect(
      getLocalSurveyId(role, "/en/cpca-main/classroom/live"),
    ).toBeUndefined();
  }
  for (const role of ["student", "admin", "superadmin", "tutor", undefined]) {
    expect(getLocalSurveyId(role, "/en/cpca-main/catalog")).toBeUndefined();
  }
  vi.stubEnv("NODE_ENV", "production");
  expect(getLocalSurveyId("teacher", "/en/cpca-main/catalog")).toBeUndefined();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_TEST_SURVEY_ID", "");
  expect(getLocalSurveyId("teacher", "/en/cpca-main/catalog")).toBeUndefined();
});

test("shows only the selected survey through SDK conditions and ignores stale callbacks", () => {
  let flagsReady = () => {};
  let surveysReady = () => {};
  const unsubscribe = vi.fn();
  const client = {
    onFeatureFlags: vi.fn((callback: () => void) => {
      flagsReady = callback;
      return unsubscribe;
    }),
    onSurveysLoaded: vi.fn((callback: () => void) => {
      surveysReady = callback;
      return unsubscribe;
    }),
    on: vi.fn(() => unsubscribe),
    getSurveys: vi.fn((callback) =>
      callback([{ id: "survey-test", questions: [] }]),
    ),
    surveys: {
      canRenderSurvey: vi.fn(() => ({ visible: true })),
      renderSurvey: vi.fn(),
    },
    cancelPendingSurvey: vi.fn(),
  };
  const stop = observePosthogSurvey(
    client as unknown as PostHog,
    "survey-test",
    "#survey-container",
    "test-panel",
    vi.fn(),
  );
  flagsReady();
  surveysReady();
  expect(client.surveys.renderSurvey.mock.calls).toEqual([
    [
      expect.objectContaining({
        id: "survey-test",
        appearance: expect.objectContaining({
          whiteLabel: true,
          allowGoBack: true,
        }),
      }),
      "#survey-container",
    ],
  ]);
  stop();
  flagsReady();
  surveysReady();
  expect(client.surveys.renderSurvey).toHaveBeenCalledTimes(1);
  expect(unsubscribe).toHaveBeenCalledTimes(3);
  expect(client.cancelPendingSurvey).toHaveBeenCalledWith("survey-test");
});

test("survey filter preserves answers, completion and transport but strips private metadata", () => {
  const filter = getPosthogSurveyConfig("survey-test").before_send;
  if (typeof filter !== "function") throw new Error("Expected a filter");
  const event = {
    uuid: "test-event",
    event: "survey sent",
    $set: {
      "$survey_responded/survey-test": true,
      email: "private@example.com",
    },
    $set_once: { $initial_current_url: "private-url" },
    properties: {
      token: "phc_test",
      distinct_id: "teacher-test",
      $process_person_profile: true,
      $survey_id: "survey-test",
      $survey_response_question1: 5,
      $survey_completed: true,
      $survey_submission_id: "submission-test",
      $current_url: "private-url",
      sessionRecordingUrl: "private-replay",
      $referrer: "private-referrer",
    },
  };
  const result = filter(event);
  expect(result?.properties).toEqual({
    token: "phc_test",
    distinct_id: "teacher-test",
    $process_person_profile: true,
    $survey_id: "survey-test",
    $survey_response_question1: 5,
    $survey_completed: true,
    $survey_submission_id: "submission-test",
    environment: "development",
  });
  expect(result?.$set).toEqual({ "$survey_responded/survey-test": true });
  expect(result?.$set_once).toBeUndefined();
  expect(
    filter({
      ...event,
      properties: { ...event.properties, $survey_id: "other" },
    }),
  ).toBeNull();
  expect(filter({ ...event, event: "$pageview" })).toBeNull();
});
