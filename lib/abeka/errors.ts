import { ProbeError } from "./progress";

export const abekaFailureStages = [
  "roster",
  "subjects",
  "progress",
  "authentication",
  "renewal",
  "catalog",
] as const;
export const abekaFailureReasons = [
  "TIMEOUT",
  "NETWORK",
  "HTTP_STATUS",
  "PROVIDER_BACKOFF",
  "REQUEST_LIMIT",
  "RUN_STOPPED",
  "SESSION_COOLDOWN",
  "SESSION_NO_PROGRESS",
  "SESSION_IN_FLIGHT",
  "SESSION_EXPIRED",
  "RENEWAL_LIMIT",
  "AUTHENTICATION",
  "RESPONSE_FORMAT",
  "UNKNOWN",
] as const;
export type AbekaFailureStage = (typeof abekaFailureStages)[number];
export type AbekaFailureReason = (typeof abekaFailureReasons)[number];
export type AbekaFailure = {
  stage: AbekaFailureStage;
  reason: AbekaFailureReason;
  httpStatus?: number;
  retryAt?: number;
};

// Only allowlisted metadata survives. Never attach a URL, response body or cause.
export class AbekaRequestError extends ProbeError {
  readonly httpStatus?: number;
  readonly retryAt?: number;
  readonly stage?: AbekaFailureStage;
  constructor(
    readonly reason: AbekaFailureReason,
    details: {
      httpStatus?: number;
      retryAt?: number;
      stage?: AbekaFailureStage;
    } = {},
  ) {
    super("PROVIDER_UNAVAILABLE");
    this.httpStatus = details.httpStatus;
    this.retryAt = details.retryAt;
    this.stage = details.stage;
  }
}

export function requestFailure(error: unknown, signal?: AbortSignal | null) {
  if (error instanceof AbekaRequestError) return error;
  return new AbekaRequestError(
    signal?.aborted ||
    (error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name))
      ? "TIMEOUT"
      : "NETWORK",
  );
}
