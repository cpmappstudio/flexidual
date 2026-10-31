import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

export const broadcastSendLimiter = new RateLimiter(components.rateLimiter, {
  broadcastMessagesByAuthor: {
    kind: "token bucket",
    rate: 30,
    period: MINUTE,
    capacity: 5,
  },
  broadcastMessagesByChat: {
    kind: "token bucket",
    rate: 60,
    period: MINUTE,
    capacity: 10,
  },
});
