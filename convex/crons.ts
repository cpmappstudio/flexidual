import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "Reconcile active LiveKit sessions",
  { minutes: 5 },
  internal.livekit.reconcileActiveSessions,
);

crons.interval(
  "Publish upcoming class notifications",
  { minutes: 1 },
  internal.systemNotifications.publishUpcomingClasses,
  {},
);

export default crons;
