/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as applications from "../applications.js";
import type * as clerk from "../clerk.js";
import type * as documents from "../documents.js";
import type * as fees from "../fees.js";
import type * as files from "../files.js";
import type * as formTemplates from "../formTemplates.js";
import type * as http from "../http.js";
import type * as legacyMigration from "../legacyMigration.js";
import type * as lib_applicationDefaults from "../lib/applicationDefaults.js";
import type * as lib_applicationSnapshots from "../lib/applicationSnapshots.js";
import type * as lib_applicationSummary from "../lib/applicationSummary.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_auth_types from "../lib/auth_types.js";
import type * as lib_defaultDocuments from "../lib/defaultDocuments.js";
import type * as lib_defaultPayments from "../lib/defaultPayments.js";
import type * as lib_feeSummary from "../lib/feeSummary.js";
import type * as lib_formTemplates from "../lib/formTemplates.js";
import type * as lib_paymentDefaultsRuntime from "../lib/paymentDefaultsRuntime.js";
import type * as lib_paymentPlans from "../lib/paymentPlans.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_tenancy from "../lib/tenancy.js";
import type * as lib_validators from "../lib/validators.js";
import type * as members from "../members.js";
import type * as organizations from "../organizations.js";
import type * as paymentSettings from "../paymentSettings.js";
import type * as paymentSummaryMigrations from "../paymentSummaryMigrations.js";
import type * as programDocuments from "../programDocuments.js";
import type * as programPayments from "../programPayments.js";
import type * as programs from "../programs.js";
import type * as square from "../square.js";
import type * as square_webhook from "../square_webhook.js";
import type * as templateDocuments from "../templateDocuments.js";
import type * as templatePayments from "../templatePayments.js";
import type * as transactions from "../transactions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  applications: typeof applications;
  clerk: typeof clerk;
  documents: typeof documents;
  fees: typeof fees;
  files: typeof files;
  formTemplates: typeof formTemplates;
  http: typeof http;
  legacyMigration: typeof legacyMigration;
  "lib/applicationDefaults": typeof lib_applicationDefaults;
  "lib/applicationSnapshots": typeof lib_applicationSnapshots;
  "lib/applicationSummary": typeof lib_applicationSummary;
  "lib/auth": typeof lib_auth;
  "lib/auth_types": typeof lib_auth_types;
  "lib/defaultDocuments": typeof lib_defaultDocuments;
  "lib/defaultPayments": typeof lib_defaultPayments;
  "lib/feeSummary": typeof lib_feeSummary;
  "lib/formTemplates": typeof lib_formTemplates;
  "lib/paymentDefaultsRuntime": typeof lib_paymentDefaultsRuntime;
  "lib/paymentPlans": typeof lib_paymentPlans;
  "lib/permissions": typeof lib_permissions;
  "lib/tenancy": typeof lib_tenancy;
  "lib/validators": typeof lib_validators;
  members: typeof members;
  organizations: typeof organizations;
  paymentSettings: typeof paymentSettings;
  paymentSummaryMigrations: typeof paymentSummaryMigrations;
  programDocuments: typeof programDocuments;
  programPayments: typeof programPayments;
  programs: typeof programs;
  square: typeof square;
  square_webhook: typeof square_webhook;
  templateDocuments: typeof templateDocuments;
  templatePayments: typeof templatePayments;
  transactions: typeof transactions;
  users: typeof users;
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
