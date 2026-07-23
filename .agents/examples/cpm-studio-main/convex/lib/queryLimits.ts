export const ORGANIZATION_DELETION_BATCH_SIZE = 50;

export const ORGANIZATION_PERSON_DELETION_BATCH_SIZE = 50;

export const MAX_PAGE_SIZE = 50;

export const MAX_USER_MEMBERSHIPS_FOR_DEFAULT_REASSIGN = 50;

export const MAX_ACADEMIC_GRADE_LEVELS_PER_ORGANIZATION = 128;

export const MAX_CAMPUS_GRADE_OFFERINGS_PER_CAMPUS = 128;

// Bounded MVP catalog: enough for long-running programs without allowing
// unbounded campus dashboards or create-flow cap checks.
export const MAX_LIVE_CLASS_SERIES_PER_CAMPUS = 128;

// Convex Auth's `invalidateSessions(ctx, { userId, except })` takes an
// `except` list rather than a target list, so signing out a single session
// requires loading every other session of the user. We cap the load to
// keep the query bounded.
//
// Trade-off when a user exceeds the cap: only the user's older sessions
// outside the bounded page are invalidated as benign cleanup. The current
// session and the explicit target are guaranteed correctly:
//   - the target session is verified via the O(1)
//     `verifySessionOwnershipInternal`, so the cap never produces a false
//     "session not found";
//   - the current session is unconditionally added to `except` by the
//     `signOutSession` action, so the caller is never signed out as a
//     side effect.
export const MAX_USER_SESSIONS_FOR_INVALIDATE_EXCEPT = 200;

export function clampPaginationOpts<T extends { numItems: number }>(
  opts: T,
): T {
  return {
    ...opts,
    numItems: Math.min(opts.numItems, MAX_PAGE_SIZE),
  };
}
