const LAST_CAMPUS_KEY = "flexidual:last-campus";

export function getLastCampusSlug(userId: string) {
  try {
    return localStorage.getItem(`${LAST_CAMPUS_KEY}:${userId}`);
  } catch {
    return null;
  }
}

export function setLastCampusSlug(userId: string, campusSlug: string) {
  try {
    localStorage.setItem(`${LAST_CAMPUS_KEY}:${userId}`, campusSlug);
  } catch {
    // Browser storage is optional; entry still falls back to the first campus.
  }
}

export function getCampusDestination(
  campuses: readonly { slug: string }[],
  lastCampusSlug: string | null,
) {
  return (
    campuses.find((campus) => campus.slug === lastCampusSlug)?.slug ??
    campuses[0]?.slug ??
    null
  );
}
