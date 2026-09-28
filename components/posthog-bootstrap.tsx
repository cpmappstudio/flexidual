"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { useAuth } from "@clerk/nextjs";
import type { PostHog } from "posthog-js";
import { useStaffAccess } from "@/hooks/use-staff-access";
import { getPosthogSurveyConfig, posthogConfig } from "@/lib/posthog-config";
import { getSurveyId } from "@/lib/posthog-survey";
import { PostHogSurveyPanel } from "@/components/posthog-survey-panel";
import { PostHogSurveyNotifications } from "@/components/posthog-survey-notifications";

// Next.js 15.2 does not support instrumentation-client.ts yet.
export function PostHogBootstrap() {
  const { isLoaded, userId } = useAuth();
  const { access, isLoading } = useStaffAccess();
  const pathname = usePathname();
  const locale = useLocale();
  const role = access?.role;
  const surveyId = getSurveyId(role, pathname);
  const [session, setSession] = useState<{
    client: PostHog;
    userId: string;
    surveyId?: string;
    locale: string;
  }>();
  const eligible =
    isLoaded &&
    !isLoading &&
    Boolean(userId) &&
    (role === "teacher" ||
      role === "principal" ||
      role === "admin" ||
      role === "superadmin");

  useEffect(() => {
    if (!eligible || !userId) return;
    const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    if (!token || !host) {
      if (process.env.NODE_ENV === "development") {
        console.error(
          "PostHog is disabled: configure NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN and NEXT_PUBLIC_POSTHOG_HOST.",
        );
      }
      return;
    }

    let cancelled = false;
    let client: PostHog | undefined;
    void import("posthog-js")
      .then(({ PostHog }) => {
        if (cancelled) return;
        client = new PostHog();
        client.init(token, {
          ...posthogConfig,
          ...(surveyId ? getPosthogSurveyConfig(surveyId) : {}),
          api_host: host,
          override_display_language: locale === "es" ? "es" : "en",
        });
        client.opt_in_capturing({ captureEventName: false });
        client.identify(userId, { role });
        setSession({ client, userId, surveyId, locale });
      })
      .catch(() => {
        console.warn(
          "PostHog could not initialize; the app remains available.",
        );
      });

    return () => {
      cancelled = true;
      // Dispose the native popover too, so it cannot survive an account switch
      // or follow the teacher into the classroom.
      void client?.shutdown();
      client?.opt_out_capturing();
      client?.reset(true);
    };
  }, [eligible, userId, role, surveyId, locale]);

  const SurveyPanel =
    process.env.NEXT_PUBLIC_POSTHOG_NOTIFICATIONS_ENABLED === "true"
      ? PostHogSurveyNotifications
      : PostHogSurveyPanel;
  return eligible &&
    surveyId &&
    session?.userId === userId &&
    session.surveyId === surveyId &&
    session.locale === locale ? (
    <SurveyPanel
      key={`${userId}:${surveyId}:${locale}`}
      client={session.client}
      userId={userId!}
      surveyId={surveyId}
      locale={locale}
    />
  ) : null;
}
