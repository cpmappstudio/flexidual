/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as classes from "../classes.js";
import type * as curriculums from "../curriculums.js";
import type * as http from "../http.js";
import type * as lessons from "../lessons.js";
import type * as livekit from "../livekit.js";
import type * as migration from "../migration.js";
import type * as schedule from "../schedule.js";
import type * as seed from "../seed.js";
import type * as student from "../student.js";
import type * as types from "../types.js";
import type * as users from "../users.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  classes: typeof classes;
  curriculums: typeof curriculums;
  http: typeof http;
  lessons: typeof lessons;
  livekit: typeof livekit;
  migration: typeof migration;
  schedule: typeof schedule;
  seed: typeof seed;
  student: typeof student;
  types: typeof types;
  users: typeof users;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
