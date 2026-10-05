# Error tracking and whiteboard diagnostics

The browser uses the existing PostHog SDK in an independent diagnostic instance.
Surveys keep their original eligibility and filters. No session replay, page views,
canvas contents, chat messages, tokens, or request bodies are intentionally collected.
Exception text is bounded and common secrets, emails and URLs are redacted; do not
put personal data in error messages. Stack frames retain chunk IDs and locations,
but omit local variables and source context. Diagnostic events do not create person profiles.

## Deployment

Existing Vercel variables `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and
`NEXT_PUBLIC_POSTHOG_HOST` enable browser reporting. This works independently of
`NEXT_PUBLIC_POSTHOG_NOTIFICATIONS_ENABLED` and of the survey ID.

For readable production stack traces, add these **private build variables** in Vercel:

- `POSTHOG_PROJECT_ID`: the PostHog project ID (627378 for the current project).
- `POSTHOG_API_KEY`: a personal API key with Error Tracking write permission.
  Never prefix this with `NEXT_PUBLIC_` or commit it.

The official `@posthog/nextjs-config` plugin injects/uploads source maps and deletes
them after upload. Without both private variables, builds continue without generating
public browser source maps. Redeploy after configuring them; confirm symbol sets in
PostHog and verify that a test exception resolves to the original source.

Create an Error Tracking alert in PostHog for new production issues and regressions.
Avoid alerts for every occurrence. Alert configuration and end-to-end ingestion must
be verified in the dashboard; local tests intercept transport and send no real events.

## Investigating a classroom report

Filter by `distinct_id` (Clerk user ID), time, `organization`, `role`, and `live_room`
(LiveKit activation). Browser/OS and release metadata are allowlisted. No full page URL
is sent. IDs are diagnostic context, never authorization inputs.

Whiteboard checkpoints: `share_requested` → `state_published` → `state_received` →
`mount` → `ready`. The first three include a per-click `attempt_id`. Mount/readiness
are correlated by activation and time. Re-announcements from older clients may lack
an attempt ID. Publication success is not proof of receipt or visibility on every client.

Failures include connection-not-ready, publish/restore/late-join, image upload/load,
scene save, classroom token/connection, and a 20-second readiness timeout. No strokes
or viewport updates are logged. Identical exceptions are limited to once per minute
per user/operation/activation/stack; total diagnostics are capped at 60 events/minute
per page. Counts are therefore not exact incident totals. Offline clients, blocked
telemetry, closed tabs and errors before SDK initialization can leave gaps.

## Backend coverage

Next.js server logs remain in Vercel. Browser errors propagated from Convex are
reported, but their production messages may hide the original backend stack.
Scheduled jobs without a browser are not covered by this browser instrumentation.
Convex's native PostHog exception reporting (and optional log streams) requires
Convex Pro; configure it in the production deployment's Integrations settings.
Do not add HTTP calls inside queries/mutations or create a Convex log table as a substitute.

Official references:
- https://posthog.com/docs/error-tracking/installation/nextjs
- https://posthog.com/docs/error-tracking/upload-source-maps/nextjs
- https://docs.convex.dev/production/integrations/exception-reporting
