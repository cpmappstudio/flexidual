import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { ProbeError } from "../../lib/abeka/progress";
import {
  ABEKA_REQUEST_WAIT_LIMIT_MS,
  providerRetryAt,
} from "../../lib/abeka/request-policy";

// One gate for reports, sign-in, redirects and session renewal. No secrets enter
// registered functions. Each permit is consumed transactionally across schools.
export function abekaFetch(
  ctx: ActionCtx,
  runId?: Id<"abekaSyncRuns">,
): typeof fetch {
  return async (input, init) => {
    const deadline = Date.now() + ABEKA_REQUEST_WAIT_LIMIT_MS;
    for (;;) {
      init?.signal?.throwIfAborted();
      const permit = await ctx.runMutation(internal.abekaSync.requestPermit, {
        runId,
      });
      if (permit.stopped) throw new ProbeError("PROVIDER_UNAVAILABLE");
      if (permit.ok) break;
      const delay = Math.max(50, Math.ceil(permit.retryAfter));
      // Do not keep actions alive through provider backoff or prolonged contention.
      // Stop safely, preserving all previously imported data.
      if (Date.now() + delay > deadline)
        throw new ProbeError("PROVIDER_UNAVAILABLE");
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    init?.signal?.throwIfAborted();
    const response = await fetch(input, init);
    if (response.status === 429 || response.status === 503) {
      try {
        await ctx.runMutation(internal.abekaSync.pauseProvider, {
          until: providerRetryAt(
            response.headers.get("Retry-After"),
            Date.now(),
          ),
        });
      } finally {
        await response.body?.cancel();
      }
      throw new ProbeError("PROVIDER_UNAVAILABLE");
    }
    return response;
  };
}
