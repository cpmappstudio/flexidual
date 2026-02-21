import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

// Run the sweeper every hour to catch ungraceful disconnects
crons.hourly(
  "Cleanup stale LiveKit sessions",
  {
    minuteUTC: 0,
  },
  api.schedule.cleanupStaleSessions
);

export default crons;