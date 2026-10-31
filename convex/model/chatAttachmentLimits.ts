import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

export const chatAttachmentLimiter = new RateLimiter(components.rateLimiter, {
  chatUploads: { kind: "token bucket", rate: 6, period: MINUTE, capacity: 6 },
  chatUploadBytes: {
    kind: "token bucket",
    rate: 100 * 1024 * 1024,
    period: HOUR,
    capacity: 100 * 1024 * 1024,
  },
  chatDownloadBytes: {
    kind: "token bucket",
    rate: 500 * 1024 * 1024,
    period: HOUR,
    capacity: 500 * 1024 * 1024,
  },
});
