/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as academicSettings from "../academicSettings.js";
import type * as campuses from "../campuses.js";
import type * as classes from "../classes.js";
import type * as cron from "../cron.js";
import type * as curriculums from "../curriculums.js";
import type * as grades from "../grades.js";
import type * as http from "../http.js";
import type * as lessons from "../lessons.js";
import type * as livekit from "../livekit.js";
import type * as migration from "../migration.js";
import type * as model_enrollments from "../model/enrollments.js";
import type * as model_grades from "../model/grades.js";
import type * as model_liveAccess from "../model/liveAccess.js";
import type * as model_membership from "../model/membership.js";
import type * as model_roles from "../model/roles.js";
import type * as model_scheduleDeletion from "../model/scheduleDeletion.js";
import type * as model_timeZone from "../model/timeZone.js";
import type * as organizations from "../organizations.js";
import type * as permissions from "../permissions.js";
import type * as recordings from "../recordings.js";
import type * as roleAssignments from "../roleAssignments.js";
import type * as schedule from "../schedule.js";
import type * as schools from "../schools.js";
import type * as seed from "../seed.js";
import type * as student from "../student.js";
import type * as types from "../types.js";
import type * as users from "../users.js";
import type * as whiteboardFiles from "../whiteboardFiles.js";
import type * as whiteboardSessions from "../whiteboardSessions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  academicSettings: typeof academicSettings;
  campuses: typeof campuses;
  classes: typeof classes;
  cron: typeof cron;
  curriculums: typeof curriculums;
  grades: typeof grades;
  http: typeof http;
  lessons: typeof lessons;
  livekit: typeof livekit;
  migration: typeof migration;
  "model/enrollments": typeof model_enrollments;
  "model/grades": typeof model_grades;
  "model/liveAccess": typeof model_liveAccess;
  "model/membership": typeof model_membership;
  "model/roles": typeof model_roles;
  "model/scheduleDeletion": typeof model_scheduleDeletion;
  "model/timeZone": typeof model_timeZone;
  organizations: typeof organizations;
  permissions: typeof permissions;
  recordings: typeof recordings;
  roleAssignments: typeof roleAssignments;
  schedule: typeof schedule;
  schools: typeof schools;
  seed: typeof seed;
  student: typeof student;
  types: typeof types;
  users: typeof users;
  whiteboardFiles: typeof whiteboardFiles;
  whiteboardSessions: typeof whiteboardSessions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
