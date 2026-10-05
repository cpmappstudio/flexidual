import type { PostHog } from "posthog-js";
import { getErrorTrackingConfig } from "./error-tracking-config";

export type DiagnosticContext = {
  operation: string;
  live_room?: string;
  connection_state?: string;
  readonly?: boolean;
  active?: boolean;
  attempt_id?: string;
  digest?: string;
};

let clientPromise: Promise<PostHog | undefined> | undefined;
let identity: { userId?: string; role?: string; organization?: string } = {};

export function setDiagnosticIdentity(next: typeof identity) {
  // Context only: diagnostic events never create person profiles or survey eligibility.
  identity = next;
}

export function initializeErrorTracking() {
  if (typeof window === "undefined") return Promise.resolve(undefined);
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!token || !host) return Promise.resolve(undefined);
  return (clientPromise ??= import("posthog-js")
    .then(({ PostHog }) => {
      const config = getErrorTrackingConfig();
      const filter = config.before_send;
      const client = new PostHog().init(
        token,
        {
          ...config,
          api_host: host,
          before_send: (event) => {
            if (event) {
              event.properties = {
                ...event.properties,
                role: identity.role,
                organization: identity.organization,
                distinct_id: identity.userId ?? event.properties.distinct_id,
              };
            }
            return typeof filter === "function" ? filter(event) : null;
          },
        },
        "diagnostics",
      );
      client.opt_in_capturing({ captureEventName: false });
      return client;
    })
    .catch(() => {
      // Telemetry must never prevent a class from opening.
      clientPromise = undefined;
      return undefined;
    }));
}

export function reportRuntimeError(error: unknown, context: DiagnosticContext) {
  const owner = identity;
  void initializeErrorTracking().then((client) => {
    if (owner !== identity) return; // Do not attribute buffered errors after an account switch.
    try {
      client?.captureException(error, context);
    } catch {
      /* fail open */
    }
  });
}

export function reportWhiteboardDiagnostic(context: DiagnosticContext) {
  const owner = identity;
  void initializeErrorTracking().then((client) => {
    if (owner !== identity) return;
    try {
      client?.capture("whiteboard_diagnostic", context);
    } catch {
      /* fail open */
    }
  });
}
