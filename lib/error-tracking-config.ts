import type { CaptureResult, PostHogConfig } from "posthog-js";
import { posthogConfig } from "./posthog-config";

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// Never forward URLs with tokens, emails, payloads, or arbitrary object properties.
export function scrubErrorText(value: unknown, limit = 500) {
  if (typeof value !== "string") return undefined;
  return value
    .replace(/https?:\/\/[^\s)]+/gi, "[url]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email]")
    .replace(
      /\b(?:Bearer\s+\S+|(?:token|password|secret|cookie|authorization)\s*[:=]\s*\S+)/gi,
      "[redacted]",
    )
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[jwt]")
    .slice(0, limit);
}

function sourceFile(value: unknown) {
  if (typeof value !== "string") return undefined;
  // Keep compiled chunk paths for source-map resolution, never page URLs.
  const path = value.split(/[?#]/)[0];
  return /\.(?:js|mjs|cjs|tsx?)(?::\d+)?$/.test(path)
    ? path.replace(/\/\/[^/@]+:[^/@]+@/, "//").slice(0, 500)
    : undefined;
}

function cleanException(value: unknown) {
  const exception = object(value);
  const stack = object(exception.stacktrace);
  const mechanism = object(exception.mechanism);
  return {
    type: scrubErrorText(exception.type, 100),
    value: scrubErrorText(exception.value),
    mechanism: {
      type: scrubErrorText(mechanism.type, 60),
      handled:
        typeof mechanism.handled === "boolean" ? mechanism.handled : undefined,
      synthetic:
        typeof mechanism.synthetic === "boolean"
          ? mechanism.synthetic
          : undefined,
    },
    stacktrace: {
      type: "raw",
      frames: Array.isArray(stack.frames)
        ? stack.frames.slice(-40).map((item) => {
            const frame = object(item);
            return {
              platform: "web:javascript",
              filename: sourceFile(frame.filename),
              abs_path: sourceFile(frame.abs_path),
              function: scrubErrorText(frame.function, 150),
              lineno:
                typeof frame.lineno === "number" ? frame.lineno : undefined,
              colno: typeof frame.colno === "number" ? frame.colno : undefined,
              chunk_id: scrubErrorText(frame.chunk_id, 100),
            };
          })
        : [],
    },
  };
}

const contextKeys = [
  "operation",
  "live_room",
  "connection_state",
  "readonly",
  "active",
  "role",
  "organization",
  "attempt_id",
  "digest",
  "$browser",
  "$browser_version",
  "$os",
  "$os_version",
  "$device_type",
] as const;

export function createDiagnosticFilter(): NonNullable<
  PostHogConfig["before_send"]
> {
  let windowStart = Date.now();
  let count = 0;
  const seen = new Set<string>();
  return (event: CaptureResult | null) => {
    if (
      !event ||
      !["$exception", "whiteboard_diagnostic"].includes(event.event)
    )
      return null;
    const properties = event.properties;
    const exceptions = Array.isArray(properties.$exception_list)
      ? properties.$exception_list.slice(0, 3).map(cleanException)
      : [];
    if (event.event === "$exception" && exceptions.length === 0) return null;
    if (Date.now() - windowStart >= 60_000) {
      windowStart = Date.now();
      count = 0;
      seen.clear();
    }
    // ponytail: bounded per-browser noise control, not a logging database.
    const fingerprint = JSON.stringify([
      properties.distinct_id,
      properties.operation,
      properties.live_room,
      exceptions,
    ]);
    if (count >= 60 || (event.event === "$exception" && seen.has(fingerprint)))
      return null;
    count++;
    if (event.event === "$exception") seen.add(fingerprint);
    return {
      ...event,
      $set: undefined,
      $set_once: undefined,
      properties: {
        token: properties.token,
        distinct_id: properties.distinct_id,
        $process_person_profile: false,
        ...(exceptions.length
          ? { $exception_list: exceptions, $exception_level: "error" }
          : {}),
        ...Object.fromEntries(
          contextKeys.flatMap<[string, string | number | boolean | undefined]>(
            (key) => {
              const value = properties[key];
              return typeof value === "string"
                ? [[key, scrubErrorText(value, 150)]]
                : typeof value === "boolean" || typeof value === "number"
                  ? [[key, value]]
                  : [];
            },
          ),
        ),
        environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
        release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
      },
    };
  };
}

export function getErrorTrackingConfig(): Partial<PostHogConfig> {
  return {
    ...posthogConfig,
    person_profiles: "never",
    // Exception parsing uses the SDK's optional extension; replay remains disabled.
    disable_external_dependency_loading: false,
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
    before_send: createDiagnosticFilter(),
  };
}
