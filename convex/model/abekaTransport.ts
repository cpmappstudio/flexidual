import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { AbekaRequestError } from "../../lib/abeka/errors";
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
      if (permit.stopped)
        throw new AbekaRequestError(
          permit.retryAfter > 0 ? "PROVIDER_BACKOFF" : "RUN_STOPPED",
          { retryAt: Date.now() + permit.retryAfter },
        );
      if (permit.ok) break;
      const delay = Math.max(50, Math.ceil(permit.retryAfter));
      // Do not keep actions alive through provider backoff or prolonged contention.
      // Stop safely, preserving all previously imported data.
      if (Date.now() + delay > deadline)
        throw new AbekaRequestError("REQUEST_LIMIT", {
          retryAt: Date.now() + delay,
        });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    init?.signal?.throwIfAborted();
    const response = await fetch(input, init);
    if (response.status === 429 || response.status === 503) {
      const retryAt = providerRetryAt(
        response.headers.get("Retry-After"),
        Date.now(),
      );
      try {
        await ctx.runMutation(internal.abekaSync.pauseProvider, {
          until: retryAt,
        });
      } finally {
        await response.body?.cancel();
      }
      throw new AbekaRequestError("HTTP_STATUS", {
        httpStatus: response.status,
        retryAt,
      });
    }
    return response;
  };
}
