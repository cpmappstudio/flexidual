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
import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as campuses from "../campuses.js";
import type * as curriculums from "../curriculums.js";
import type * as http from "../http.js";
import type * as lessons from "../lessons.js";
import type * as progress from "../progress.js";
import type * as seedCampuses from "../seedCampuses.js";
import type * as seedFlexiDual from "../seedFlexiDual.js";
import type * as students from "../students.js";
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
  admin: typeof admin;
  auth: typeof auth;
  campuses: typeof campuses;
  curriculums: typeof curriculums;
  http: typeof http;
  lessons: typeof lessons;
  progress: typeof progress;
  seedCampuses: typeof seedCampuses;
  seedFlexiDual: typeof seedFlexiDual;
  students: typeof students;
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
