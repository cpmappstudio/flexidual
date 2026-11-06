import { defineApp } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import presence from "@convex-dev/presence/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import aggregate from "@convex-dev/aggregate/convex.config";

const app = defineApp();
app.use(rateLimiter);
app.use(presence);
app.use(workflow);
app.use(aggregate, { name: "dashboardAggregate" });
export default app;
