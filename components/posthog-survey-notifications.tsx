"use client";

import { useCallback, useEffect, useRef, type ComponentProps } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { surveyPanelStorage } from "@/lib/posthog-survey";
import { PostHogSurveyPanel } from "./posthog-survey-panel";

// Separate bridge: SDK presentation does not depend on Convex hooks.
export function PostHogSurveyNotifications(
  props: ComponentProps<typeof PostHogSurveyPanel>,
) {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const state = useQuery(api.surveyNotifications.getState, {
    surveyId: props.surveyId,
  });
  const acknowledge = useMutation(api.surveyNotifications.acknowledge);
  const eligible = useRef(false);
  const locallyCompleted = useRef(false);
  const syncing = useRef(false);
  const acknowledged = useRef<"eligible" | "complete" | null>(null);
  const storageKey = `flexidual:survey-panel:${props.userId}:${props.surveyId}`;

  const sync = useCallback(async () => {
    const completed =
      locallyCompleted.current || surveyPanelStorage(storageKey) === "complete";
    if (
      !state?.enabled ||
      state.completed ||
      syncing.current ||
      (!eligible.current && !completed)
    )
      return;
    const target = completed ? "complete" : "eligible";
    if (acknowledged.current === target || acknowledged.current === "complete")
      return;
    syncing.current = true;
    try {
      await acknowledge({
        surveyId: props.surveyId,
        organizationSlug: orgSlug,
        completed,
      });
      acknowledged.current = target;
    } catch {
      // Keep the SDK's completed marker and retry while mounted / on the next visit.
      console.warn(
        "Survey notification state will sync when the connection recovers",
      );
    } finally {
      syncing.current = false;
    }
  }, [acknowledge, orgSlug, props.surveyId, state, storageKey]);

  useEffect(() => {
    void sync();
    const timer = window.setInterval(() => void sync(), 30_000);
    return () => window.clearInterval(timer);
  }, [sync]);

  // Wait for account-scoped completion before mounting. Preserve the thank-you
  // screen in the tab that submitted; other tabs/devices remove the invitation.
  if (!state?.enabled || (state.completed && !locallyCompleted.current))
    return null;
  return (
    <PostHogSurveyPanel
      {...props}
      onEligible={() => {
        eligible.current = true;
        void sync();
      }}
      onComplete={() => {
        locallyCompleted.current = true;
        void sync();
      }}
    />
  );
}
