import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

// Run every 15 minutes to quickly catch ungraceful disconnects and stuck "active" schedules
crons.interval(
  "Cleanup stale LiveKit sessions",
  { minutes: 15 },
  api.schedule.cleanupStaleSessions
);

export default crons;