/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as devBootstrap from "../devBootstrap.js";
import type * as http from "../http.js";
import type * as lib_academic from "../lib/academic.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_campuses from "../lib/campuses.js";
import type * as lib_capabilities from "../lib/capabilities.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_images from "../lib/images.js";
import type * as lib_invitationTokens from "../lib/invitationTokens.js";
import type * as lib_modules from "../lib/modules.js";
import type * as lib_organizationInvitations from "../lib/organizationInvitations.js";
import type * as lib_organizationPeople from "../lib/organizationPeople.js";
import type * as lib_organizations from "../lib/organizations.js";
import type * as lib_people from "../lib/people.js";
import type * as lib_platformInvitations from "../lib/platformInvitations.js";
import type * as lib_profilePins from "../lib/profilePins.js";
import type * as lib_queryLimits from "../lib/queryLimits.js";
import type * as lib_users from "../lib/users.js";
import type * as lib_validators from "../lib/validators.js";
import type * as migrations from "../migrations.js";
import type * as modules_delete from "../modules/delete.js";
import type * as modules_liveClasses_index from "../modules/liveClasses/index.js";
import type * as modules_liveClasses_lib_access from "../modules/liveClasses/lib/access.js";
import type * as modules_liveClasses_lib_delete from "../modules/liveClasses/lib/delete.js";
import type * as modules_liveClasses_lib_model from "../modules/liveClasses/lib/model.js";
import type * as modules_liveClasses_tables from "../modules/liveClasses/tables.js";
import type * as modules_liveClasses_validators from "../modules/liveClasses/validators.js";
import type * as organizationInvitation_OrganizationInvitationPassword from "../organizationInvitation/OrganizationInvitationPassword.js";
import type * as organizations from "../organizations.js";
import type * as passwordReset_ResendOTPPasswordReset from "../passwordReset/ResendOTPPasswordReset.js";
import type * as platform_academic from "../platform/academic.js";
import type * as platform_academicPeople from "../platform/academicPeople.js";
import type * as platform_academicPeopleActions from "../platform/academicPeopleActions.js";
import type * as platform_academicPeopleValidators from "../platform/academicPeopleValidators.js";
import type * as platform_activity from "../platform/activity.js";
import type * as platform_campuses from "../platform/campuses.js";
import type * as platform_capabilities from "../platform/capabilities.js";
import type * as platform_invitationActions from "../platform/invitationActions.js";
import type * as platform_invitations from "../platform/invitations.js";
import type * as platform_organizationInvitationActions from "../platform/organizationInvitationActions.js";
import type * as platform_organizationInvitations from "../platform/organizationInvitations.js";
import type * as platform_organizationTeam from "../platform/organizationTeam.js";
import type * as platform_people from "../platform/people.js";
import type * as platform_team from "../platform/team.js";
import type * as platform_workspace from "../platform/workspace.js";
import type * as platformInvitation_PlatformInvitationPassword from "../platformInvitation/PlatformInvitationPassword.js";
import type * as users from "../users.js";
import type * as usersActions from "../usersActions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  devBootstrap: typeof devBootstrap;
  http: typeof http;
  "lib/academic": typeof lib_academic;
  "lib/activity": typeof lib_activity;
  "lib/auth": typeof lib_auth;
  "lib/authz": typeof lib_authz;
  "lib/campuses": typeof lib_campuses;
  "lib/capabilities": typeof lib_capabilities;
  "lib/errors": typeof lib_errors;
  "lib/images": typeof lib_images;
  "lib/invitationTokens": typeof lib_invitationTokens;
  "lib/modules": typeof lib_modules;
  "lib/organizationInvitations": typeof lib_organizationInvitations;
  "lib/organizationPeople": typeof lib_organizationPeople;
  "lib/organizations": typeof lib_organizations;
  "lib/people": typeof lib_people;
  "lib/platformInvitations": typeof lib_platformInvitations;
  "lib/profilePins": typeof lib_profilePins;
  "lib/queryLimits": typeof lib_queryLimits;
  "lib/users": typeof lib_users;
  "lib/validators": typeof lib_validators;
  migrations: typeof migrations;
  "modules/delete": typeof modules_delete;
  "modules/liveClasses/index": typeof modules_liveClasses_index;
  "modules/liveClasses/lib/access": typeof modules_liveClasses_lib_access;
  "modules/liveClasses/lib/delete": typeof modules_liveClasses_lib_delete;
  "modules/liveClasses/lib/model": typeof modules_liveClasses_lib_model;
  "modules/liveClasses/tables": typeof modules_liveClasses_tables;
  "modules/liveClasses/validators": typeof modules_liveClasses_validators;
  "organizationInvitation/OrganizationInvitationPassword": typeof organizationInvitation_OrganizationInvitationPassword;
  organizations: typeof organizations;
  "passwordReset/ResendOTPPasswordReset": typeof passwordReset_ResendOTPPasswordReset;
  "platform/academic": typeof platform_academic;
  "platform/academicPeople": typeof platform_academicPeople;
  "platform/academicPeopleActions": typeof platform_academicPeopleActions;
  "platform/academicPeopleValidators": typeof platform_academicPeopleValidators;
  "platform/activity": typeof platform_activity;
  "platform/campuses": typeof platform_campuses;
  "platform/capabilities": typeof platform_capabilities;
  "platform/invitationActions": typeof platform_invitationActions;
  "platform/invitations": typeof platform_invitations;
  "platform/organizationInvitationActions": typeof platform_organizationInvitationActions;
  "platform/organizationInvitations": typeof platform_organizationInvitations;
  "platform/organizationTeam": typeof platform_organizationTeam;
  "platform/people": typeof platform_people;
  "platform/team": typeof platform_team;
  "platform/workspace": typeof platform_workspace;
  "platformInvitation/PlatformInvitationPassword": typeof platformInvitation_PlatformInvitationPassword;
  users: typeof users;
  usersActions: typeof usersActions;
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

export declare const components: {
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
};
