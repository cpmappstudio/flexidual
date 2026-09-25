export const SURVEY_OPEN_EVENT = "flexidual:open-survey";

export function requestSurveyOpen(surveyId: string) {
  window.dispatchEvent(
    new CustomEvent(SURVEY_OPEN_EVENT, { detail: surveyId }),
  );
}
