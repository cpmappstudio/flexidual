# Survey notifications (local test only)

## Local validation status — 2026-09-24

- Enabled the local frontend switch in the ignored `.env.local` (the committed example remains disabled).
- Configured the DEV campaign for survey `01a0d5d2-2f5f-0000-c878-21ee6142c8cc` on `dev:dynamic-meerkat-158`, restricted to `http://localhost:3000`. No production activation or code deployment was performed for this configuration step.
- The PostHog DEV survey was active when checked. Ran the campaign refresh on DEV.
- After activation, verified a real DEV participation with its initial `survey_invitation`, zero reminders sent and a next reminder scheduled. No survey answers were submitted by the agent.
- Re-ran all 493 tests successfully (134 unit, 234 component, 125 Convex) and TypeScript with `--noEmit --incremental false`.
- **Manual acceptance still pending:** refresh localhost as an eligible test teacher who has not completed this DEV survey, minimize with X, and open it from the bell. Complete it and check another session of the same account. Safari automation permissions were unavailable, so these real-browser checks have not been claimed as passed.
- Do not clear an existing completion marker to force another invitation; use another eligible test account. Completed users should remain excluded.
- Production rollout is explicitly deferred until the user requests it. At that point review origin/environment guards, PostHog targeting, existing completions and deployment settings; do not just copy the local flag to production.

## Behavior

- Reuses the existing notification bell. Clicking an invitation opens the catalog and expands the selected survey; it never bypasses SDK eligibility.
- Enrolls an authenticated teacher/principal on their first eligible survey visit. This is not an automatic broadcast to staff who have never visited the survey.
- One initial invitation, then at most three reminders, each at least seven days after the previous delivery. Reminders resurface the same notification row.
- Convex stores only completion/delivery state. Answers stay in PostHog. Completion is the authenticated user's SDK completion acknowledgement, **not** an ingestion receipt from PostHog. A local completion marker is retried on reconnect/next visit.
- Completion hides the invitation across devices. A paused/ended PostHog survey suppresses reminders and hides invitations after the hourly refresh. This is not instantaneous synchronization.
- Re-checks active status, campus role, destination and PostHog audience/linked flags before sending. Internal already-seen flags are replaced by our per-user completion state, matching the repeatable local panel. External failures defer delivery.
- Bounded processing: 10 campaigns per cron page, 25 due recipients per campaign per hourly run. Larger bursts drain over subsequent runs. Ineligible recipients are reconsidered the following day without spending a reminder.
- Read notifications disappear from the UI seven days after `readAt`; unread notifications remain. Database records, chat read markers and deduplication keys are not deleted. The open feed refreshes its clock every minute.

## Enable a controlled DEV test

Nothing is activated by checking in these files. The frontend switch defaults to false and there are no campaign seeds.

1. Confirm the Convex target is **dev**, not production. With approval, deploy the backend/schema changes to that development deployment. Do not run `pnpm dev` against an unchecked target (it starts the backend watcher).
2. In that DEV dashboard, run the **internal** `surveyNotifications:configure` function with `surveyId` = the DEV survey ID, `projectToken` = its public PostHog project token, `enabled` = true, `origin` = `http://localhost:3000`. Only this origin is currently accepted. No personal PostHog API key is required.
3. Set `NEXT_PUBLIC_POSTHOG_NOTIFICATIONS_ENABLED=true` in the local environment and restart **only** `pnpm dev:frontend`. Keep `NEXT_PUBLIC_POSTHOG_TEST_SURVEY_ID` pointing to the same DEV survey.
4. Log in as a test teacher/principal in a campus. The SDK must find the survey eligible before creating a participation record. Verify the notification opens the minimized survey with draft answers intact.
5. Complete it and verify another browser/account session for the same user does not receive further invitations. Test another staff account for isolation.
6. Stop the survey in PostHog and run internal `surveyNotifications:refreshCampaign` on DEV (or wait for the hourly refresh): its notification should be hidden. Resume, repeat the refresh and verify no completed user is notified.

To disable notification delivery, configure the campaign with `enabled: false`. Existing invitations become invisible immediately in Convex. Disable the frontend switch if the backend is rolled back.

## Verification and release boundary

Unit tests use `convex-test` and mock every PostHog request; no real invitations or analytics events are sent. Frontend and backend production activation are deliberately not included here. Existing completed responses from browsers without our completion marker are not backfilled from PostHog; reconcile these before a production rollout.

PostHog audience evaluation uses the documented [flags API](https://posthog.com/docs/api/flags).
