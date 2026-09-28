import type { PostHog, Survey } from "posthog-js";

export function getLocalSurveyId(role: string | undefined, pathname: string) {
  if (
    process.env.NODE_ENV === "production" ||
    typeof window === "undefined" ||
    window.location.hostname !== "localhost" ||
    (role !== "teacher" && role !== "principal") ||
    pathname.split("/").includes("classroom")
  )
    return undefined;
  return process.env.NEXT_PUBLIC_POSTHOG_TEST_SURVEY_ID || undefined;
}

export type SurveyPanelState = "hidden" | "open" | "minimized" | "complete";

// ponytail: store only panel state, per account/browser. PostHog owns answers.
export function surveyPanelStorage(key: string, value?: string) {
  try {
    if (value !== undefined) localStorage.setItem(key, value);
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// The native eligibility API doesn't check URLs for inline rendering.
function matchesPage(survey: Survey) {
  const condition = survey.conditions;
  if (
    condition?.deviceTypes?.length ||
    condition?.selector ||
    condition?.events ||
    condition?.actions
  )
    return false; // This local campaign is page-based; don't bypass other targeting.
  if (!condition?.url) return true;
  const url = window.location.href;
  switch (condition.urlMatchType ?? "icontains") {
    case "exact":
      return url === condition.url;
    case "icontains":
      return url.toLowerCase().includes(condition.url.toLowerCase());
    case "regex":
      try {
        return new RegExp(condition.url).test(url);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

export function observePosthogSurvey(
  client: PostHog,
  surveyId: string,
  selector: string,
  storageKey: string,
  onState: (state: SurveyPanelState) => void,
  locale = "en",
  callbacks: { onEligible?: () => void; onComplete?: () => void } = {},
) {
  let disposed = false;
  let rendered = false;
  let completed = surveyPanelStorage(storageKey) === "complete";
  const stopEvents = client.on("eventCaptured", (event) => {
    if (disposed || event.properties.$survey_id !== surveyId) return;
    if (
      event.event === "survey sent" &&
      event.properties.$survey_completed === true
    ) {
      completed = true;
      surveyPanelStorage(storageKey, "complete");
      callbacks.onComplete?.();
      onState("complete");
    }
  });
  const show = () => {
    if (disposed || completed || rendered) return;
    client.getSurveys((surveys) => {
      if (disposed || completed || rendered) return;
      const survey = surveys.find((item) => item.id === surveyId);
      if (!survey || !matchesPage(survey)) return;
      // Only recurrence/dismissal is replaced by our completion state. The SDK
      // still checks running status, audience/linked flags and the wait period.
      const eligible = client.surveys?.canRenderSurvey({
        ...survey,
        schedule: "always",
      });
      if (!eligible?.visible) return;
      callbacks.onEligible?.();
      rendered = true;
      onState(
        surveyPanelStorage(storageKey) === "minimized" ? "minimized" : "open",
      );
      // The SDK's inline renderer accepts a presentation copy; displaySurvey
      // only accepts an ID, so it cannot override appearance without mutating its cache.
      client.surveys?.renderSurvey(compactSurvey(survey, locale), selector);
    });
  };
  const removeFlagsListener = client.onFeatureFlags(show);
  const removeSurveysListener = client.onSurveysLoaded(show);
  return () => {
    disposed = true;
    stopEvents();
    removeFlagsListener();
    removeSurveysListener();
    client.cancelPendingSurvey(surveyId);
  };
}

export function compactSurvey(survey: Survey, locale: string): Survey {
  const linear =
    !survey.appearance?.shuffleQuestions &&
    survey.questions.every(
      (question) =>
        !question.branching || question.branching.type === "next_question",
    );
  return {
    ...survey,
    appearance: {
      ...survey.appearance,
      whiteLabel: true,
      allowGoBack: true,
      backButtonText: "←",
      surveyPopupDelaySeconds: 0,
    },
    translations: Object.fromEntries(
      Object.entries(survey.translations ?? {}).map(
        ([language, translation]) => [
          language,
          { ...translation, backButtonText: "←" },
        ],
      ),
    ),
    questions: survey.questions.map((question, index) => {
      if (!linear || question.type === "link") return question;
      const buttonText =
        index === survey.questions.length - 1
          ? locale === "es"
            ? "Enviar"
            : "Submit"
          : "→";
      return {
        ...question,
        ...(question.type === "rating" ? { skipSubmitButton: false } : {}),
        buttonText,
        translations: Object.fromEntries(
          Object.entries(question.translations ?? {}).map(
            ([language, translation]) => [
              language,
              { ...translation, buttonText },
            ],
          ),
        ),
      };
    }),
  };
}
