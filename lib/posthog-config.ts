import type { PostHogConfig } from "posthog-js";

// SDK-owned survey metadata and responses only; never pass automatic page data.
const surveyProperties = new Set([
  "$survey_id",
  "$survey_name",
  "$survey_response",
  "$survey_iteration",
  "$survey_iteration_start_date",
  "$survey_partially_completed",
  "$survey_submission_id",
  "$survey_questions",
  "$survey_completed",
  "$survey_last_seen_date",
  "$survey_language",
]);
const surveyEvents = new Set([
  "survey shown",
  "survey dismissed",
  "survey sent",
  "survey abandoned",
]);

export const posthogConfig: Partial<PostHogConfig> = {
  defaults: "2026-05-30",
  persistence: "memory",
  // No anonymous history exists here: avoid merging a fresh ID on every reload.
  reuseAnonymousId: true,
  person_profiles: "identified_only",
  autocapture: false,
  capture_pageview: false,
  capture_pageleave: false,
  capture_exceptions: false,
  capture_performance: false,
  capture_heatmaps: false,
  capture_dead_clicks: false,
  disable_session_recording: true,
  disable_surveys: true,
  disable_surveys_automatic_display: true,
  disable_external_dependency_loading: true,
  advanced_disable_flags: true,
  opt_out_capturing_by_default: true,
  ip: false,
  save_referrer: false,
  save_campaign_params: false,
  // Identification only unless a specific survey is explicitly enabled.
  // Rebuild properties to exclude URLs, referrers and automatic person metadata.
  before_send: (event) => {
    if (!event || event.event !== "$identify") return null;
    const role = event.$set?.role ?? event.properties.$set?.role;
    return {
      ...event,
      $set: { role },
      $set_once: undefined,
      properties: {
        // Preserve SDK transport/person-processing fields. Dropping the project
        // token makes the SDK reject the event before it reaches PostHog.
        token: event.properties.token,
        distinct_id: event.properties.distinct_id,
        $anon_distinct_id: event.properties.$anon_distinct_id,
        $process_person_profile: event.properties.$process_person_profile,
        $set: { role },
      },
    };
  },
};

export function getPosthogSurveyConfig(
  surveyId: string,
): Partial<PostHogConfig> {
  const identifyFilter = posthogConfig.before_send;
  return {
    disable_surveys: false,
    // Only the selected inline survey may render; don't auto-show other campaigns.
    disable_surveys_automatic_display: true,
    disable_external_dependency_loading: false,
    advanced_disable_flags: false,
    advanced_only_evaluate_survey_feature_flags: true,
    before_send: (event) => {
      if (
        event?.event === "$identify" &&
        typeof identifyFilter === "function"
      ) {
        return identifyFilter(event);
      }
      if (
        !event ||
        !surveyEvents.has(event.event) ||
        event.properties.$survey_id !== surveyId
      ) {
        return null;
      }
      const properties = Object.fromEntries(
        Object.entries(event.properties).filter(
          ([key]) =>
            surveyProperties.has(key) || key.startsWith("$survey_response_"),
        ),
      );
      const personProperties = Object.fromEntries(
        Object.entries({ ...event.properties.$set, ...event.$set }).filter(
          ([key]) =>
            key === "$survey_last_seen_date" ||
            key.startsWith(`$survey_responded/${surveyId}`) ||
            key.startsWith(`$survey_dismissed/${surveyId}`),
        ),
      );
      return {
        ...event,
        $set: personProperties,
        $set_once: undefined,
        properties: {
          ...properties,
          token: event.properties.token,
          distinct_id: event.properties.distinct_id,
          $process_person_profile: event.properties.$process_person_profile,
          environment:
            process.env.NODE_ENV === "production"
              ? "production"
              : "development",
        },
      };
    },
  };
}
