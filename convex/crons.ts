import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Backstop scheduled reconciliation when a client disconnects ungracefully.
crons.interval(
  "Cleanup stale LiveKit sessions",
  { minutes: 5 },
  internal.livekit.cleanupStaleSessions,
);

export default crons;
