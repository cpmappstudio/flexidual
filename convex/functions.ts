import {
  mutation as rawMutation,
  internalMutation as rawInternalMutation,
} from "./_generated/server";
import {
  customCtx,
  customMutation,
} from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";
import type { DataModel } from "./_generated/dataModel";
import { registerDashboardAttendanceTriggers } from "./model/dashboardAggregates";
import { registerCourseProgressTriggers } from "./model/courseProgressSummary";
import { registerCourseSessionWeekTriggers } from "./model/courseSessionWeekRefresh";

// Official transactional trigger wrapper. Only registered source tables have
// derived writes; other domains retain their existing mutation behavior.
const triggers = new Triggers<DataModel>();
registerDashboardAttendanceTriggers(triggers);
registerCourseProgressTriggers(triggers);
registerCourseSessionWeekTriggers(triggers);
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(
  rawInternalMutation,
  customCtx(triggers.wrapDB),
);
