/** Coverage is monotonic: union makes retries, repeats and concurrent viewers idempotent. */
export const MAX_VIDEO_DURATION_MS = 12 * 60 * 60 * 1000;
export const VIDEO_PROGRESS_INTERVAL_MS = 60_000;
export const VIDEO_PROGRESS_CELL_MS = 1000;

export function coverageSize(durationMs: number) {
  return Math.ceil(Math.ceil(durationMs / VIDEO_PROGRESS_CELL_MS) / 8);
}

export function fitCoverage(value: Uint8Array, durationMs: number) {
  const result = new Uint8Array(coverageSize(durationMs));
  result.set(value.subarray(0, result.length));
  const used = Math.ceil(durationMs / VIDEO_PROGRESS_CELL_MS) % 8;
  if (used) result[result.length - 1] &= (1 << used) - 1;
  return result;
}

export function validVideoDuration(durationMs: number) {
  return (
    Number.isFinite(durationMs) &&
    durationMs > 0 &&
    durationMs <= MAX_VIDEO_DURATION_MS
  );
}

export function mergeCoverage(left: Uint8Array, right: Uint8Array) {
  const result = new Uint8Array(Math.max(left.length, right.length));
  for (let i = 0; i < result.length; i++)
    result[i] = (left[i] ?? 0) | (right[i] ?? 0);
  return result;
}

export function subtractCoverage(left: Uint8Array, right: Uint8Array) {
  return left.map((value, i) => value & ~(right[i] ?? 0));
}

export function hasCoverage(value: Uint8Array) {
  return value.some((byte) => byte !== 0);
}

/** Resume from confirmed coverage, not percentage × duration (which could skip gaps). */
export function firstUnwatchedMs(coverage: Uint8Array, durationMs: number) {
  const cells = Math.ceil(durationMs / VIDEO_PROGRESS_CELL_MS);
  for (let cell = 0; cell < cells; cell++)
    if (!(coverage[cell >> 3] & (1 << (cell & 7))))
      return cell * VIDEO_PROGRESS_CELL_MS;
  return null;
}

export function addPlayedRange(
  coverage: Uint8Array,
  startMs: number,
  endMs: number,
  durationMs: number,
) {
  // shortcut: round edges inward to whole seconds; sub-second reporting needs finer cells.
  const first = Math.ceil(Math.max(0, startMs) / VIDEO_PROGRESS_CELL_MS);
  const last =
    endMs >= durationMs
      ? Math.ceil(durationMs / VIDEO_PROGRESS_CELL_MS)
      : Math.floor(endMs / VIDEO_PROGRESS_CELL_MS);
  let changed = false;
  for (
    let cell = first;
    cell < Math.min(last, Math.ceil(durationMs / VIDEO_PROGRESS_CELL_MS));
    cell++
  ) {
    const mask = 1 << (cell & 7);
    if (!(coverage[cell >> 3] & mask)) changed = true;
    coverage[cell >> 3] |= mask;
  }
  return changed;
}

export function validCoverage(coverage: Uint8Array, durationMs: number) {
  if (
    !validVideoDuration(durationMs) ||
    coverage.length !== coverageSize(durationMs)
  )
    return false;
  const cells = Math.ceil(durationMs / VIDEO_PROGRESS_CELL_MS);
  const unused = cells % 8;
  return !unused || coverage[coverage.length - 1] >> unused === 0;
}

export function watchedMilliseconds(coverage: Uint8Array, durationMs: number) {
  let total = 0;
  for (
    let cell = 0;
    cell < Math.ceil(durationMs / VIDEO_PROGRESS_CELL_MS);
    cell++
  ) {
    if (coverage[cell >> 3] & (1 << (cell & 7)))
      total += Math.min(
        VIDEO_PROGRESS_CELL_MS,
        durationMs - cell * VIDEO_PROGRESS_CELL_MS,
      );
  }
  return total;
}
