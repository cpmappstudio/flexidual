// Conservative application limits, not limits advertised or approved by Abeka.
export const ABEKA_REQUEST_INTERVAL_MS = 1_000;
export const ABEKA_MANUAL_SYNC_INTERVAL_MS = 15 * 60_000;
export const ABEKA_REQUEST_WAIT_LIMIT_MS = 20_000;

export function providerRetryAt(value: string | null, now: number): number {
  const seconds =
    value?.trim() && /^\d+$/.test(value.trim()) ? Number(value) : NaN;
  const requested = Number.isFinite(seconds)
    ? now + seconds * 1_000
    : value
      ? Date.parse(value)
      : NaN;
  return Number.isSafeInteger(requested)
    ? Math.max(now + 60_000, requested)
    : now + 60_000;
}
