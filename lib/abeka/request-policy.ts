// Conservative application limits, not limits advertised or approved by Abeka.
export const ABEKA_REQUEST_INTERVAL_MS = 1_000;
export const ABEKA_MANUAL_SYNC_INTERVAL_MS = 15 * 60_000;
export const ABEKA_REQUEST_WAIT_LIMIT_MS = 20_000;
// Per logical update, including continuations across midnight.
export const ABEKA_MAX_AUTOMATIC_RECOVERIES = 3;
export const ABEKA_RECOVERY_DELAY_MS = 60_000;
export const ABEKA_RECOVERY_MAX_DELAY_MS = 24 * 60 * 60_000;

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
