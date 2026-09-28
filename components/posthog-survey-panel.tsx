"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PostHog } from "posthog-js";
import { ClipboardList, X } from "lucide-react";
import {
  observePosthogSurvey,
  surveyPanelStorage,
  type SurveyPanelState,
} from "@/lib/posthog-survey";
import styles from "./posthog-survey-panel.module.css";
import { SURVEY_OPEN_EVENT } from "@/lib/survey-navigation";

export function PostHogSurveyPanel({
  client,
  surveyId,
  userId,
  locale,
  onEligible,
  onComplete,
}: {
  client: PostHog;
  surveyId: string;
  userId: string;
  locale: string;
  onEligible?: () => void;
  onComplete?: () => void;
}) {
  const id = `survey-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const launcher = useRef<HTMLButtonElement>(null);
  const storageKey = `flexidual:survey-panel:${userId}:${surveyId}`;
  const [state, setState] = useState<SurveyPanelState>("hidden");
  const spanish = locale === "es";
  const callbacks = useRef({ onEligible, onComplete });
  callbacks.current = { onEligible, onComplete };
  const label = spanish ? "Completar encuesta" : "Complete survey";

  useEffect(
    () =>
      observePosthogSurvey(
        client,
        surveyId,
        `#${id}`,
        storageKey,
        (next) => {
          const requested =
            new URL(window.location.href).searchParams.get("survey") ===
            surveyId;
          setState(next === "minimized" && requested ? "open" : next);
        },
        locale,
        {
          onEligible: () => callbacks.current.onEligible?.(),
          onComplete: () => callbacks.current.onComplete?.(),
        },
      ),
    [client, surveyId, id, storageKey, locale],
  );
  useEffect(() => {
    const open = (event: Event) => {
      if ((event as CustomEvent<unknown>).detail !== surveyId) return;
      setState((current) => (current === "minimized" ? "open" : current));
    };
    window.addEventListener(SURVEY_OPEN_EVENT, open);
    return () => window.removeEventListener(SURVEY_OPEN_EVENT, open);
  }, [surveyId]);
  useEffect(() => {
    if (state === "minimized") launcher.current?.focus();
  }, [state]);

  function minimize() {
    if (state === "complete") {
      setState("hidden");
    } else {
      surveyPanelStorage(storageKey, "minimized");
      setState("minimized");
    }
  }

  return (
    <aside
      className={styles.panel}
      data-minimized={state === "minimized"}
      hidden={state === "hidden"}
      aria-label={label}
    >
      {state === "minimized" && (
        <button
          ref={launcher}
          type="button"
          className={styles.launcher}
          aria-expanded={false}
          aria-label={label}
          title={label}
          aria-controls={id}
          onClick={() => setState("open")}
        >
          <ClipboardList size={24} aria-hidden="true" />
        </button>
      )}
      {/* Keep the SDK mounted: hiding must not discard typed answers or send a dismissal. */}
      <div hidden={state === "minimized"}>
        <button
          type="button"
          className={styles.close}
          onClick={minimize}
          aria-label={
            state === "complete"
              ? spanish
                ? "Cerrar"
                : "Close"
              : spanish
                ? "Minimizar encuesta"
                : "Minimize survey"
          }
        >
          <X size={20} aria-hidden="true" />
        </button>
        <div id={id} className={styles.form} />
      </div>
    </aside>
  );
}
